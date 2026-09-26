import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { readReplica } from '@/db/replica';
import { users, streaks, userSubjects, subjects, userAchievements, achievements, type ProfileVisibility } from '@/db/schema';
import { ok, requireUser, route, ApiError } from '@/services/api';
import { levelForXp } from '@/domain/gamification';
import { totalXpFor } from '@/services/study';
import { todayStats } from '@/services/stats';
import { validateUsername, DEFAULT_VISIBILITY } from '@/services/profile';

// The GET is all reads, so when Neon is configured the whole payload comes
// from the replica — as one readReplica block, so a dead mirror fails the
// whole GET over to the primary in one move. PATCH below still writes the
// primary. Auth itself never reads here — the access token is stateless JWT.
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);

  const payload = await readReplica(async (rdb) => {
    const [rowRes, subsRes, xpRes, achRes, statsRes] = await Promise.all([
      rdb.select().from(users).where(eq(users.id, user.id)).limit(1),
      rdb
        .select({ id: subjects.id, name: subjects.name, slug: subjects.slug })
        .from(userSubjects)
        .innerJoin(subjects, eq(userSubjects.subjectId, subjects.id))
        .where(eq(userSubjects.userId, user.id)),
      totalXpFor(user.id),
      rdb
        .select({ id: achievements.id, name: achievements.name, icon: achievements.icon, description: achievements.description, unlockedAt: userAchievements.unlockedAt })
        .from(userAchievements)
        .innerJoin(achievements, eq(userAchievements.achievementId, achievements.id))
        .where(eq(userAchievements.userId, user.id)),
      todayStats(user.id),
    ]);

    const [row] = rowRes;
    if (!row) return null;
    const [streakRow] = await rdb.select({ current: streaks.current, best: streaks.best }).from(streaks).where(eq(streaks.userId, user.id)).limit(1);
    const totalXp = xpRes;
    const { level, intoLevel, forNext } = levelForXp(totalXp);
    const stats = statsRes;
    const today = { due: stats.dueCount + stats.newCount, reviewed: stats.reviewsToday, correct: stats.correctToday };

    return {
      id: row.id,
      email: row.email,
      name: row.name,
      username: row.username,
      nickname: row.nickname,
      bio: row.bio,
      avatarEmoji: row.avatarEmoji,
      avatarColor: row.avatarColor,
      profileVisibility: { ...DEFAULT_VISIBILITY, ...(row.profileVisibility ?? {}) },
      role: row.role,
      status: row.status,
      totpEnabled: row.totpEnabled,
      leaderboardOptOut: row.leaderboardOptOut,
      prefs: row.prefs,
      subjects: subsRes,
      gamification: { totalXp, level, intoLevel, forNext, streak: streakRow?.current ?? 0, bestStreak: streakRow?.best ?? 0 },
      today,
      achievements: achRes,
    };
  });

  return ok(payload, payload ? undefined : { status: 404 });
});

const AVATAR_COLORS = ['ink', 'moss', 'bee', 'dawn', 'sky'] as const;

/** PATCH /me — identity, profile and preference writes, one door. */
export const PATCH = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    nickname?: string;
    username?: string;
    bio?: string;
    avatarEmoji?: string | null;
    avatarColor?: string;
    profileVisibility?: Partial<ProfileVisibility>;
    leaderboardOptOut?: boolean;
    prefs?: { noteDensity?: 'detailed' | 'summary'; reducedMotion?: boolean };
  };
  const update: Record<string, unknown> = {};

  if (typeof body.name === 'string' && body.name.trim()) update.name = body.name.trim().slice(0, 80);
  if (body.nickname !== undefined) update.nickname = body.nickname === null || !body.nickname.trim() ? null : body.nickname.trim().slice(0, 40);
  if (body.bio !== undefined) update.bio = body.bio === null || !body.bio.trim() ? null : body.bio.trim().slice(0, 240);
  if (body.username !== undefined) update.username = body.username === null || !body.username.trim() ? null : validateUsername(body.username);
  if (body.avatarEmoji !== undefined) update.avatarEmoji = body.avatarEmoji === null || !body.avatarEmoji ? null : [...body.avatarEmoji][0]!.slice(0, 4);
  if (body.avatarColor !== undefined) {
    if (!AVATAR_COLORS.includes(body.avatarColor as (typeof AVATAR_COLORS)[number])) {
      throw new ApiError(400, 'bad_avatar_color', 'That colour is not one of ours. Pick from the palette.');
    }
    update.avatarColor = body.avatarColor;
  }
  if (body.profileVisibility !== undefined) {
    // Merge with the stored value: absent keys keep their current setting, so
    // a client updating one toggle cannot silently blank the others.
    const [current] = await db.select({ v: users.profileVisibility }).from(users).where(eq(users.id, user.id)).limit(1);
    update.profileVisibility = { ...DEFAULT_VISIBILITY, ...(current?.v ?? {}), ...body.profileVisibility };
  }
  if (typeof body.leaderboardOptOut === 'boolean') update.leaderboardOptOut = body.leaderboardOptOut;
  if (body.prefs) update.prefs = body.prefs;

  if (Object.keys(update).length > 0) {
    try {
      await db.update(users).set(update).where(eq(users.id, user.id));
    } catch (e) {
      // The unique index on username is the one constraint a user input can
      // hit — turn it into words instead of a 500.
      if (e instanceof Error && /users_username_idx|unique/i.test(e.message)) {
        throw new ApiError(409, 'username_taken', 'That username is taken. Try another.');
      }
      throw e;
    }
  }
  return ok({ updated: true });
});
