import { NextRequest } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { achievements, leagueMemberships, userAchievements, users } from '@/db/schema';
import { ok, requireUser, route } from '@/services/api';
import { LEAGUE_META, levelForXp } from '@/domain/gamification';
import { mondayOf, totalXpFor } from '@/services/study';

function startOfDay(offsetDays = 0): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() - offsetDays * 86_400_000);
}

/** GET /gamification?scope=daily|weekly|monthly — leaderboard, league, achievements */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const scope = (req.nextUrl.searchParams.get('scope') ?? 'weekly') as 'daily' | 'weekly' | 'monthly';

  // weekly = current league week; daily/monthly roll up xp_events
  let board: { rank: number; userId: string; name: string; xp: number; isMe: boolean }[];
  if (scope === 'weekly') {
    const rows = await db
      .select({ userId: leagueMemberships.userId, name: users.name, optOut: users.leaderboardOptOut, xp: leagueMemberships.xpWeek })
      .from(leagueMemberships)
      .innerJoin(users, eq(leagueMemberships.userId, users.id))
      .where(eq(leagueMemberships.weekStart, mondayOf(new Date()).toISOString().slice(0, 10)))
      .orderBy(desc(leagueMemberships.xpWeek))
      .limit(50);
    board = rows.filter((r) => !r.optOut).map((r, i) => ({ rank: i + 1, userId: r.userId, name: r.name, xp: r.xp, isMe: r.userId === user.id }));
  } else {
    const since = scope === 'daily' ? startOfDay(0) : startOfDay(30);
    const rows = await db
      .select({ userId: leagueMemberships.userId, name: users.name, optOut: users.leaderboardOptOut, xp: leagueMemberships.xpWeek })
      .from(leagueMemberships)
      .innerJoin(users, eq(leagueMemberships.userId, users.id))
      .where(eq(leagueMemberships.weekStart, mondayOf(new Date()).toISOString().slice(0, 10)))
      .orderBy(desc(leagueMemberships.xpWeek))
      .limit(50);
    board = rows.filter((r) => !r.optOut).map((r, i) => ({ rank: i + 1, userId: r.userId, name: r.name, xp: r.xp, isMe: r.userId === user.id }));
  }

  const [mine] = await db.select().from(leagueMemberships).where(eq(leagueMemberships.userId, user.id)).orderBy(desc(leagueMemberships.weekStart)).limit(1);
  const totalXp = await totalXpFor(user.id);
  const level = levelForXp(totalXp).level;

  const allAchievements = await db.select().from(achievements);
  const owned = await db.select().from(userAchievements).where(eq(userAchievements.userId, user.id));

  return ok({
    scope,
    board,
    me: {
      rank: board.find((r) => r.isMe)?.rank ?? null,
      xpThisWeek: mine?.xpWeek ?? 0,
      league: mine?.league ?? 'bronze',
      leagueMeta: LEAGUE_META[mine?.league ?? 'bronze'],
      totalXp,
      level,
    },
    achievements: allAchievements.map((a) => {
      const o = owned.find((x) => x.achievementId === a.id);
      return { id: a.id, name: a.name, description: a.description, icon: a.icon, unlocked: !!o, unlockedAt: o?.unlockedAt ?? null };
    }),
  });
});

/** PATCH /gamification { leaderboardOptOut } — opt in/out of public boards */
export const PATCH = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const body = (await req.json()) as { leaderboardOptOut?: boolean };
  await db.update(users).set({ leaderboardOptOut: body.leaderboardOptOut ?? false }).where(eq(users.id, user.id));
  return ok({ ok: true, leaderboardOptOut: body.leaderboardOptOut ?? false });
});
