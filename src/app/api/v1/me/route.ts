import { NextRequest } from 'next/server';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { users, streaks, reviewLogs, userSubjects, subjects, xpEvents, userAchievements, achievements, userTopicStates } from '@/db/schema';
import { ok, requireUser, route } from '@/services/api';
import { levelForXp } from '@/domain/gamification';
import { totalXpFor } from '@/services/study';
import { todayStats } from '@/services/stats';

export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const [streakRow] = await db.select().from(streaks).where(eq(streaks.userId, user.id)).limit(1);
  const subs = await db
    .select({ id: subjects.id, name: subjects.name, slug: subjects.slug })
    .from(userSubjects)
    .innerJoin(subjects, eq(userSubjects.subjectId, subjects.id))
    .where(eq(userSubjects.userId, user.id));
  const totalXp = await totalXpFor(user.id);
  const { level, intoLevel, forNext } = levelForXp(totalXp);
  const achievementsOwned = await db
    .select({ id: achievements.id, name: achievements.name, icon: achievements.icon, description: achievements.description, unlockedAt: userAchievements.unlockedAt })
    .from(userAchievements)
    .innerJoin(achievements, eq(userAchievements.achievementId, achievements.id))
    .where(eq(userAchievements.userId, user.id));
  const stats = await todayStats(user.id);
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
    subjects: subs,
    gamification: { totalXp, level, intoLevel, forNext, streak: streakRow?.current ?? 0, bestStreak: streakRow?.best ?? 0 },
    today,
    achievements: achievementsOwned,
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
