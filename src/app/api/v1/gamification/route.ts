import { NextRequest } from 'next/server';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { readReplica } from '@/db/replica';
import { achievements, leagueMemberships, reviewLogs, userAchievements, users, xpEvents } from '@/db/schema';
import { ok, requireUser, route } from '@/services/api';
import { levelForXp } from '@/domain/gamification';
import {
  placementFor,
  rankFor,
  weekBounds,
  zoneBand,
  zoneFor,
  type LobbyZone,
} from '@/domain/ranked';
import { mondayOf, totalXpFor } from '@/services/study';
import { loadSeasonConfigs } from '@/services/season-config';
import { SEASON_PLACEMENT_REVIEWS, seasonAt } from '@/domain/seasons';

function startOfDay(offsetDays = 0): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() - offsetDays * 86_400_000);
}

/** Seats in a weekly lobby. Fixed, like every league that has ever existed. */
const LOBBY_CAPACITY = 30;

export type LobbyRow = {
  position: number;
  /** The member's id — the handle a profile link needs (/u/<userId> works). */
  userId: string;
  name: string;
  xp: number;
  isMe: boolean;
  /** The member's own rank, so a row can draw the same crest as everything
   *  else rather than a second, row-only badge. */
  rank: ReturnType<typeof rankFor>;
};

/**
 * GET /gamification?scope=daily|weekly|monthly
 *
 * Returns three things: the learner's **rank**, their **weekly lobby** with
 * promotion and demotion bands, and the XP boards / achievements that were
 * already here.
 *
 * ── The rank is seasonal ───────────────────────────────────────────────────
 *
 * The rank comes from XP earned *inside the current season*, through the same
 * pure `domain/ranked` engine the ladder and the crest use. It used to come
 * from lifetime XP, with a separate season ladder beside it — two
 * implementations of one idea that could disagree. There is now one number and
 * one engine; `/api/v1/seasons` adds the clock, the board and the record of
 * finished seasons, which is all a season adds on top of a rank.
 *
 * Lifetime XP is still read and still returned: it drives the level curve,
 * which is a progression axis rather than a competitive one, and it is what
 * "your record" means once a season resets.
 *
 * The lobby is capped at thirty the way a league should be — a leaderboard of
 * everyone is not a lobby, it is a census, and nobody fights for tenth place in
 * a census. Placement is decided by `zoneFor`, so the client never re-derives
 * what "promotion" means.
 *
 * Leaderboards are the heaviest reads in the app and the most tolerant of a
 * seconds-old mirror — every query runs in one readReplica block, so a dead
 * mirror fails the whole GET over to the primary in one move.
 */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const scope = (req.nextUrl.searchParams.get('scope') ?? 'weekly') as 'daily' | 'weekly' | 'monthly';

  // ── your own rank, off the PRIMARY ───────────────────────────────────────
  //
  // This block is deliberately outside `readReplica`. It is the answer to
  // "did my review count?", and it was being served from a Neon mirror that
  // only drains on a daily cron — so a review that earned XP looked like it had
  // not, for up to a day. Two indexed aggregates per user off the primary is a
  // cost worth paying for a number that is the whole point of the screen.
  const configs = await loadSeasonConfigs();
  const season = seasonAt(configs);
  const [[seasonXpRow], [seasonReviewsRow], totalXp] = await Promise.all([
    db
      .select({ xp: sql<number>`coalesce(sum(${xpEvents.amount}), 0)::int` })
      .from(xpEvents)
      .where(and(eq(xpEvents.userId, user.id), gte(xpEvents.occurredAt, season.start))),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(reviewLogs)
      .where(and(eq(reviewLogs.userId, user.id), gte(reviewLogs.reviewedAt, season.start))),
    totalXpFor(user.id),
  ]);
  const seasonXp = Number(seasonXpRow?.xp ?? 0);
  const seasonReviews = Number(seasonReviewsRow?.c ?? 0);
  const rank = rankFor(seasonXp);
  // Placement is measured in *this season's* reviews, for the same reason the
  // rank is measured in this season's XP: both must answer about the same
  // window, or a learner can be "placed" by reviews from a season that has
  // already been recorded and banked.
  const placement = placementFor(seasonReviews, SEASON_PLACEMENT_REVIEWS);

  const payload = await readReplica(async (rdb) => {
    // weekly = the current league week (league_memberships); daily/monthly roll
    // up xp_events over the matching window.
    let board: { rank: number; userId: string; name: string; xp: number; isMe: boolean }[];
    if (scope === 'weekly') {
      const rows = await rdb
        .select({ userId: leagueMemberships.userId, name: users.name, optOut: users.leaderboardOptOut, xp: leagueMemberships.xpWeek })
        .from(leagueMemberships)
        .innerJoin(users, eq(leagueMemberships.userId, users.id))
        .where(eq(leagueMemberships.weekStart, mondayOf(new Date()).toISOString().slice(0, 10)))
        .orderBy(desc(leagueMemberships.xpWeek))
        .limit(50);
      board = rows
        .filter((r) => !r.optOut)
        .map((r, i) => ({ rank: i + 1, userId: r.userId, name: r.name, xp: r.xp, isMe: r.userId === user.id }));
    } else {
      const since = startOfDay(scope === 'daily' ? 0 : 30);
      const rows = await rdb
        .select({
          userId: xpEvents.userId,
          name: users.name,
          optOut: users.leaderboardOptOut,
          xp: sql<number>`coalesce(sum(${xpEvents.amount}), 0)::int`,
        })
        .from(xpEvents)
        .innerJoin(users, eq(xpEvents.userId, users.id))
        .where(gte(xpEvents.occurredAt, since))
        .groupBy(xpEvents.userId, users.name, users.leaderboardOptOut)
        .orderBy(desc(sql`coalesce(sum(${xpEvents.amount}), 0)`))
        .limit(50);
      board = rows
        .filter((r) => !r.optOut)
        .map((r, i) => ({ rank: i + 1, userId: r.userId, name: r.name, xp: Number(r.xp), isMe: r.userId === user.id }));
    }

    const [mine] = await rdb
      .select()
      .from(leagueMemberships)
      .where(eq(leagueMemberships.userId, user.id))
      .orderBy(desc(leagueMemberships.weekStart))
      .limit(1);

    // ── the weekly lobby ────────────────────────────────────────────────────
    // Thirty seats, ordered by the week's XP. Every member's rank label needs
    // their *lifetime* XP, which is one grouped query rather than thirty.
    const week = weekBounds();
    const lobbyRows = await rdb
      .select({
        userId: leagueMemberships.userId,
        name: users.name,
        optOut: users.leaderboardOptOut,
        xp: leagueMemberships.xpWeek,
      })
      .from(leagueMemberships)
      .innerJoin(users, eq(leagueMemberships.userId, users.id))
      .where(eq(leagueMemberships.weekStart, week.weekStart))
      .orderBy(desc(leagueMemberships.xpWeek))
      .limit(30);

    // The learner is always in their own lobby, even before their first review of
    // the week — being absent from your own league table is a dead end.
    const seated = lobbyRows.some((r) => r.userId === user.id);
    const others = lobbyRows.filter((r) => r.userId !== user.id);

    let lifetime = new Map<string, number>();
    if (others.length > 0) {
      const totals = await rdb
        .select({ userId: xpEvents.userId, total: sql<number>`coalesce(sum(${xpEvents.amount}), 0)::int` })
        .from(xpEvents)
        .where(inArray(xpEvents.userId, others.map((r) => r.userId)))
        .groupBy(xpEvents.userId);
      lifetime = new Map(totals.map((t) => [t.userId, Number(t.total)]));
    }

    const seats = others
      .sort((a, b) => b.xp - a.xp)
      .map((r) => ({
        userId: r.userId,
        name: r.name,
        xp: r.xp,
        lifetimeXp: lifetime.get(r.userId) ?? 0,
      }));
    const myXp = mine?.xpWeek ?? 0;
    const myIndexAmongOthers = seats.filter((s) => s.xp > myXp).length;
    const position = myIndexAmongOthers + 1;

    const lobbySeats = [
      ...seats.slice(0, position - 1),
      { userId: user.id, name: 'You', xp: myXp, lifetimeXp: totalXp },
      ...seats.slice(position - 1),
    ].slice(0, 30);

    // The lobby has a fixed capacity, the way a league always does. Empty seats
    // are shown as unclaimed rather than being hidden — a table of one that
    // claims to be the whole league is a lie the interface should not tell.
    const lobby: {
      position: number;
      size: number;
      filled: number;
      zone: LobbyZone;
      band: number;
      rows: LobbyRow[];
    } = {
      position,
      size: LOBBY_CAPACITY,
      filled: lobbySeats.length,
      band: zoneBand(LOBBY_CAPACITY),
      zone: zoneFor(position, LOBBY_CAPACITY, seasonReviews),
      rows: lobbySeats.map((s, i) => ({
        position: i + 1,
        userId: s.userId,
        name: s.userId === user.id ? 'You' : s.name,
        xp: s.xp,
        isMe: s.userId === user.id,
        rank: rankFor(s.lifetimeXp),
      })),
    };

    const allAchievements = await rdb.select().from(achievements);
    const owned = await rdb.select().from(userAchievements).where(eq(userAchievements.userId, user.id));

    return {
      scope,
      board,
      ranked: {
        rank,
        placement,
        week,
        lobby,
        xpThisWeek: myXp,
        // Everything the strip needs to say "this resets", without a second
        // request. `/api/v1/seasons` remains the source for the board and the
        // finished-season record; the clock rides along here because the rank
        // is meaningless without it.
        season: {
          number: season.number,
          label: season.label,
          rangeLabel: season.rangeLabel,
          daysLeft: season.daysLeft,
          day: season.day,
          lengthDays: Math.max(1, Math.round((season.end.getTime() - season.start.getTime()) / 86_400_000)),
          percentElapsed: season.percentElapsed,
        },
        seasonXp,
        seasonReviews,
        // The record that survives a reset: the same engine, run on lifetime XP.
        lifetimeRank: rankFor(totalXp),
      },
      me: {
        rank: board.find((r) => r.isMe)?.rank ?? lobby.position,
        xpThisWeek: myXp,
        totalXp,
        seasonXp,
        level: levelForXp(totalXp).level,
        seatedThisWeek: seated,
      },
      achievements: allAchievements.map((a) => {
        const o = owned.find((x) => x.achievementId === a.id);
        return {
          id: a.id,
          name: a.name,
          description: a.description,
          icon: a.icon,
          unlocked: !!o,
          unlockedAt: o?.unlockedAt ?? null,
        };
      }),
    };
  });

  return ok(payload);
});

/** PATCH /gamification { leaderboardOptOut } — opt in/out of public boards */
export const PATCH = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const body = (await req.json()) as { leaderboardOptOut?: boolean };
  await db.update(users).set({ leaderboardOptOut: body.leaderboardOptOut ?? false }).where(eq(users.id, user.id));
  return ok({ ok: true, leaderboardOptOut: body.leaderboardOptOut ?? false });
});
