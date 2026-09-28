import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { readReplica } from '@/db/replica';
import {
  achievements, profileBadges, reviewLogs, streaks, subjects, userAchievements,
  userProfileBadges, userSubjects, users,
  type ProfileVisibility,
} from '@/db/schema';
import { levelForXp } from '@/domain/gamification';
import { rankFor } from '@/domain/ranked';
import { ApiError, type SessionUser } from '@/services/api';
import { totalXpFor } from '@/services/study';
import { RESERVED_USERNAMES, USERNAME_RE } from '@/lib/username';

// ── The profile boundary ────────────────────────────────────────────────────
// One module decides what a profile shows and to whom. The page and the API
// both read `getPublicProfile`, so the two can never disagree about privacy:
// there is no client-side filter to forget, and "public" is whatever the
// server said, per field.

export const DEFAULT_VISIBILITY: ProfileVisibility = {
  name: true,
  nickname: true,
  bio: true,
  subjects: true,
  stats: true,
  achievements: true,
};

export function validateUsername(raw: string): string {
  const username = raw.trim().toLowerCase();
  if (!USERNAME_RE.test(username)) {
    throw new ApiError(400, 'bad_username', 'Usernames are 3–20 characters: letters, numbers, hyphens or underscores.');
  }
  if (RESERVED_USERNAMES.has(username)) {
    throw new ApiError(400, 'reserved_username', `“${username}” is reserved. Pick another.`);
  }
  return username;
}

/** The profile payload, before visibility is applied. */
export type ProfileRecord = {
  id: string;
  username: string | null;
  email: string | null;
  name: string | null;
  nickname: string | null;
  bio: string | null;
  avatarEmoji: string | null;
  avatarColor: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bannerColor: string;
  role: string;
  /** Developer-granted chips, in grant order. */
  badges: { id: string; label: string; icon: string; color: string }[];
  createdAt: string;
  visibility: ProfileVisibility;
  gamification: { totalXp: number; level: number; rankLabel: string; rankTier: string; rankDivision: number; streak: number } | null;
  subjects: { id: string; name: string }[];
  achievements: { id: string; name: string; description: string; icon: string; unlockedAt: string }[];
  reviewCount: number;
};

/**
 * Resolve a handle to a profile with per-field visibility already applied.
 *
 * A handle is a username first and the user id second, so profiles have a
 * stable address before anyone picks a username. Fields the owner keeps
 * private come back as `null` rather than being stripped — the client can
 * always know the shape, never the value.
 */
export async function getPublicProfile(handle: string, viewer: SessionUser | null): Promise<ProfileRecord | null> {
  const isOwner = viewer ? handle === viewer.id : false;
  const h = handle.toLowerCase();
  // Identity from the primary: a just-picked username must resolve on the very
  // first visit to /u/<name>, and the drain that carries it to the mirror may
  // not have run yet. Stats stay on the replica — briefly stale is fine for
  // numbers, not for "this person does not exist".
  const [row] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.username}) = ${h} or lower(${users.id}::text) = ${h}`)
    .limit(1);
  if (!row) return null;
  return readReplica(async (rdb) => {

    const owner = viewer?.id === row.id;
    const vis = { ...DEFAULT_VISIBILITY, ...(row.profileVisibility ?? {}) };

    const [xp, streakRow, subs, achs, reviews, badgeRows] = await Promise.all([
      totalXpFor(row.id),
      rdb.select({ current: streaks.current }).from(streaks).where(eq(streaks.userId, row.id)).limit(1),
      rdb
        .select({ id: subjects.id, name: subjects.name })
        .from(userSubjects)
        .innerJoin(subjects, eq(userSubjects.subjectId, subjects.id))
        .where(eq(userSubjects.userId, row.id)),
      rdb
        .select({
          id: achievements.id, name: achievements.name, description: achievements.description,
          icon: achievements.icon, unlockedAt: userAchievements.unlockedAt,
        })
        .from(userAchievements)
        .innerJoin(achievements, eq(userAchievements.achievementId, achievements.id))
        .where(eq(userAchievements.userId, row.id))
        .orderBy(desc(userAchievements.unlockedAt))
        .limit(60),
      rdb.select({ n: sql<number>`count(*)::int` }).from(reviewLogs).where(eq(reviewLogs.userId, row.id)),
      // Badges are granted by staff, so they read from the primary — a grant
      // must be visible the moment the admin panel says it happened.
      db
        .select({ id: profileBadges.id, label: profileBadges.label, icon: profileBadges.icon, color: profileBadges.color })
        .from(userProfileBadges)
        .innerJoin(profileBadges, eq(userProfileBadges.badgeId, profileBadges.id))
        .where(eq(userProfileBadges.userId, row.id))
        .orderBy(userProfileBadges.grantedAt),
    ]);

    const rank = rankFor(xp);
    const record: ProfileRecord = {
      id: row.id,
      username: row.username ?? null,
      email: owner ? row.email : null,
      name: vis.name || owner ? row.name : null,
      nickname: vis.nickname || owner ? row.nickname ?? null : null,
      bio: vis.bio || owner ? row.bio ?? null : null,
      avatarEmoji: row.avatarEmoji ?? null,
      avatarColor: row.avatarColor,
      avatarUrl: row.avatarUrl ?? null,
      bannerUrl: row.bannerUrl ?? null,
      bannerColor: row.bannerColor,
      role: row.role,
      badges: badgeRows,
      createdAt: row.createdAt.toISOString(),
      visibility: vis,
      gamification:
        vis.stats || owner
          ? {
              totalXp: xp,
              level: levelForXp(xp).level,
              rankLabel: rank.label,
              rankTier: rank.tier,
              rankDivision: rank.division,
              streak: streakRow[0]?.current ?? 0,
            }
          : null,
      subjects: vis.subjects || owner ? subs : [],
      achievements:
        vis.achievements || owner
          ? achs.map((a) => ({ ...a, unlockedAt: a.unlockedAt.toISOString() }))
          : [],
      reviewCount: vis.stats || owner ? reviews[0]?.n ?? 0 : 0,
    };
    return record;
  });
}

/**
 * Ownership guards: hidden profile fields are only editable by the owner.
 * Used by PATCH /me so a public field can never be set through the settings
 * surface of a different account (it is also enforced by auth — this is the
 * belt to those braces).
 */
export function canEditProfile(viewer: SessionUser, userId: string): boolean {
  return viewer.id === userId;
}

/** Count reviews for a user (profile + admin panel stats). */
export async function reviewCountFor(userId: string): Promise<number> {
  const [row] = await readReplica(async (rdb) =>
    rdb.select({ n: sql<number>`count(*)::int` }).from(reviewLogs).where(and(eq(reviewLogs.userId, userId))),
  );
  return row?.n ?? 0;
}
