import { NextRequest } from 'next/server';
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { readReplica } from '@/db/replica';
import { reviewLogs, seasonResults, users, xpEvents } from '@/db/schema';
import { ok, requireUser, route, ApiError } from '@/services/api';
import { loadSeasonConfigs } from '@/services/season-config';
import { rankFor, type Rank } from '@/domain/ranked';
import {
  SEASON_PLACEMENT_REVIEWS,
  elapsedSeasons,
  rewardFor,
  seasonAt,
  seasonWindow,
} from '@/domain/seasons';

/**
 * GET /api/v1/seasons
 *
 * The seasonal rank. Since the ladder *is* seasonal now (see `domain/ranked`),
 * this is not a parallel system — it is the same pure rank engine reading a
 * different window, and it carries the two things a season adds: the clock, and
 * the record of the seasons you have already finished.
 *
 *   1. **The season clock** — which configured window we are in and how much of
 *      it is gone. Read from the `seasons` table via `domain/seasons`.
 *   2. **Your season** — XP earned inside the window, read from the PRIMARY.
 *   3. **The season board** — who is ahead this season.
 *   4. **The showcase** — every closed season you have a result for.
 *
 * ── Why your own numbers come off the primary ──────────────────────────────
 *
 * The board and the showcase tolerate a seconds-old mirror; your own XP does
 * not. A review that earns XP writes to the primary, and the drain that carries
 * it to Neon runs on a *daily* cron — so reading your own total off the replica
 * made XP appear not to register for up to a day, which is the exact bug this
 * endpoint used to have. Aggregating one user's rows on the primary is a single
 * indexed scan; the board stays on the replica because it *should* tolerate lag.
 *
 * **Backfill, honestly.** A closed season's result is derived from the XP earned
 * inside its window and written to `season_results` the first time anybody looks
 * at it — read off the primary for the same reason. So the record arrives without
 * a cron, at worst a season late, and is written once: the upsert never
 * overwrites a row whose reward is already claimed.
 *
 * PATCH /api/v1/seasons { seasonNumber } — claim a reward on a closed season.
 */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const now = new Date();
  const configs = await loadSeasonConfigs();
  const season = seasonAt(configs, now);

  // ── your own season, from the authoritative primary ──────────────────────
  const [[mine], [mineReviews]] = await Promise.all([
    db
      .select({ xp: sql<number>`coalesce(sum(${xpEvents.amount}), 0)::int` })
      .from(xpEvents)
      .where(and(eq(xpEvents.userId, user.id), gte(xpEvents.occurredAt, season.start))),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(reviewLogs)
      .where(and(eq(reviewLogs.userId, user.id), gte(reviewLogs.reviewedAt, season.start))),
  ]);

  const seasonXp = Number(mine?.xp ?? 0);
  const reviews = Number(mineReviews?.c ?? 0);
  const placed = reviews >= SEASON_PLACEMENT_REVIEWS;
  const rank: Rank = rankFor(seasonXp);

  const payload = await readReplica(async (rdb) => {
    // ── the season board ───────────────────────────────────────────────────
    // One grouped query over the window. Thirty seats is a leaderboard; a list
    // of everybody is a census, and nobody fights for two hundredth place.
    const rows = await rdb
      .select({
        userId: xpEvents.userId,
        name: users.name,
        optOut: users.leaderboardOptOut,
        xp: sql<number>`coalesce(sum(${xpEvents.amount}), 0)::int`,
      })
      .from(xpEvents)
      .innerJoin(users, eq(xpEvents.userId, users.id))
      .where(gte(xpEvents.occurredAt, season.start))
      .groupBy(xpEvents.userId, users.name, users.leaderboardOptOut)
      .orderBy(desc(sql`coalesce(sum(${xpEvents.amount}), 0)`))
      .limit(30);

    const board = rows
      .filter((r) => !r.optOut)
      .map((r, i) => ({
        position: i + 1,
        userId: r.userId,
        name: r.userId === user.id ? 'You' : r.name,
        xp: Number(r.xp),
        isMe: r.userId === user.id,
        rank: rankFor(Number(r.xp)),
      }));

    // Your own row is authoritative even if the board is stale, so the "You"
    // row on a board that has not caught up yet still shows your real XP.
    const meRow = board.find((b) => b.isMe);
    if (meRow) {
      meRow.xp = seasonXp;
      meRow.rank = rank;
    }

    // Position for a learner outside the top thirty. Counting the rows above
    // you beats reading "214th" off a list that stops at thirty.
    const [ahead] = await rdb
      .select({ c: sql<number>`count(*)::int` })
      .from(
        sql`(select user_id, sum(amount) as s from xp_events where occurred_at >= ${season.start} group by user_id) season_totals`,
      )
      .where(sql`season_totals.s > ${seasonXp}`);
    const position = meRow?.position ?? Number(ahead?.c ?? 0) + 1;

    // ── the showcase ───────────────────────────────────────────────────────
    let results = await rdb
      .select()
      .from(seasonResults)
      .where(eq(seasonResults.userId, user.id))
      .orderBy(desc(seasonResults.seasonNumber));

    const known = new Set(results.map((r) => r.seasonNumber));
    const missing = elapsedSeasons(configs, now).filter((n) => !known.has(n));

    if (missing.length > 0) {
      await Promise.all(
        missing.map(async (number) => {
          const { start, end } = seasonWindow(number, configs);
          const config = configs.find((c) => c.number === number) ?? null;
          // Two aggregates, not a join: `xp_events.ref_id` points at the *card*
          // a review graded, not at the review, so there is no row to join on
          // and faking one would silently drop every exam and maths award.
          // Both off the PRIMARY — a final rank computed from a lagging mirror
          // would be written down permanently, which is worse than being late.
          const [agg] = await db
            .select({ xp: sql<number>`coalesce(sum(${xpEvents.amount}), 0)::int` })
            .from(xpEvents)
            .where(and(eq(xpEvents.userId, user.id), gte(xpEvents.occurredAt, start), lt(xpEvents.occurredAt, end)));
          const [reviewsIn] = await db
            .select({ c: sql<number>`count(*)::int` })
            .from(reviewLogs)
            .where(and(eq(reviewLogs.userId, user.id), gte(reviewLogs.reviewedAt, start), lt(reviewLogs.reviewedAt, end)));
          const seasonReviews = Number(reviewsIn?.c ?? 0);
          // An unplaced season has no final rank to show and no reward to pay,
          // so it writes nothing — the same honest empty state as placement.
          if (seasonReviews < SEASON_PLACEMENT_REVIEWS) return;
          const final = rankFor(Number(agg?.xp ?? 0));
          await db
            .insert(seasonResults)
            .values({
              userId: user.id,
              seasonNumber: number,
              finalTier: final.tier,
              finalDivision: final.division,
              finalRankIndex: final.index,
              finalRp: final.points,
              reviews: seasonReviews,
              rewardId: rewardFor(final.tier, config).id,
              endedAt: end,
            })
            .onConflictDoNothing();
        }),
      );

      // Re-read rather than trusting the in-memory rows: another tab, or an
      // earlier request, may have written the same seasons a moment ago.
      results = await db
        .select()
        .from(seasonResults)
        .where(eq(seasonResults.userId, user.id))
        .orderBy(desc(seasonResults.seasonNumber));
    }

    const lengthDays = Math.max(
      1,
      Math.round((season.end.getTime() - season.start.getTime()) / 86_400_000),
    );

    return {
      season: {
        number: season.number,
        label: season.label,
        name: season.name,
        state: season.state,
        rangeLabel: season.rangeLabel,
        startIso: season.startIso,
        daysLeft: season.daysLeft,
        day: season.day,
        lengthDays,
        percentElapsed: season.percentElapsed,
      },
      mine: { xp: seasonXp, reviews, placed, rank, position, fieldSize: board.length },
      board,
      history: results.map((r) => ({
        seasonNumber: r.seasonNumber,
        rank: rankFor(r.finalRp),
        reviews: r.reviews,
        reward: rewardFor(r.finalTier as Rank['tier'], configs.find((c) => c.number === r.seasonNumber) ?? null),
        rewardClaimedAt: r.rewardClaimedAt ? r.rewardClaimedAt.toISOString() : null,
        endedAt: r.endedAt.toISOString(),
      })),
    };
  });

  return ok(payload);
});

/** PATCH /api/v1/seasons { seasonNumber } — claim the reward on a closed season. */
export const PATCH = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const body = (await req.json()) as { seasonNumber?: number };
  const seasonNumber = Number(body.seasonNumber);
  if (!Number.isInteger(seasonNumber) || seasonNumber < 1) {
    throw new ApiError(400, 'bad_request', 'Which season? Send its number.');
  }

  const [row] = await db
    .select()
    .from(seasonResults)
    .where(and(eq(seasonResults.userId, user.id), eq(seasonResults.seasonNumber, seasonNumber)))
    .limit(1);
  if (!row) throw new ApiError(404, 'not_found', 'That season has no result to claim yet.');
  if (row.rewardClaimedAt) {
    return ok({ ok: true, alreadyClaimed: true, rewardId: row.rewardId });
  }

  await db
    .update(seasonResults)
    .set({ rewardClaimedAt: new Date() })
    .where(and(eq(seasonResults.userId, user.id), eq(seasonResults.seasonNumber, seasonNumber)));

  return ok({ ok: true, alreadyClaimed: false, rewardId: row.rewardId });
});