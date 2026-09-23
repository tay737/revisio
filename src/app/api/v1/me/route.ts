import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users, streaks, userSubjects, subjects, userAchievements, achievements } from '@/db/schema';
import { ok, requireUser, route } from '@/services/api';
import { levelForXp } from '@/domain/gamification';
import { totalXpFor } from '@/services/study';
import { todayStats } from '@/services/stats';

// All independent reads run in parallel — this endpoint is on every page load
// and each round trip to Postgres costs ~80ms from the serverless region.
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);

  const [rowRes, subsRes, xpRes, achRes, statsRes] = await Promise.all([
    db.select().from(users).where(eq(users.id, user.id)).limit(1),
    db
      .select({ id: subjects.id, name: subjects.name, slug: subjects.slug })
      .from(userSubjects)
      .innerJoin(subjects, eq(userSubjects.subjectId, subjects.id))
      .where(eq(userSubjects.userId, user.id)),
    totalXpFor(user.id),
    db
      .select({ id: achievements.id, name: achievements.name, icon: achievements.icon, description: achievements.description, unlockedAt: userAchievements.unlockedAt })
      .from(userAchievements)
      .innerJoin(achievements, eq(userAchievements.achievementId, achievements.id))
      .where(eq(userAchievements.userId, user.id)),
    todayStats(user.id),
  ]);

  const [row] = rowRes;
  if (!row) return ok(null, { status: 404 });
  const [streakRow] = await db.select({ current: streaks.current, best: streaks.best }).from(streaks).where(eq(streaks.userId, user.id)).limit(1);
  const totalXp = xpRes;
  const { level, intoLevel, forNext } = levelForXp(totalXp);
  const stats = statsRes;
  const today = { due: stats.dueCount + stats.newCount, reviewed: stats.reviewsToday, correct: stats.reviewsToday };

  return ok({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    totpEnabled: row.totpEnabled,
    leaderboardOptOut: row.leaderboardOptOut,
    prefs: row.prefs,
    subjects: subsRes,
    gamification: { totalXp, level, intoLevel, forNext, streak: streakRow?.current ?? 0, bestStreak: streakRow?.best ?? 0 },
    today,
    achievements: achRes,
  });
});

export const PATCH = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    leaderboardOptOut?: boolean;
    prefs?: { noteDensity?: 'detailed' | 'summary'; reducedMotion?: boolean };
  };
  const update: Record<string, unknown> = {};
  if (typeof body.name === 'string' && body.name.trim()) update.name = body.name.trim();
  if (typeof body.leaderboardOptOut === 'boolean') update.leaderboardOptOut = body.leaderboardOptOut;
  if (body.prefs) update.prefs = body.prefs;
  if (Object.keys(update).length > 0) {
    await db.update(users).set(update).where(eq(users.id, user.id));
  }
  return ok({ updated: true });
});
