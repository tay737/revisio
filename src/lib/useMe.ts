'use client';

import useSWR from 'swr';
import { api, setToken } from '@/lib/api';
import type { CompanionSnapshot } from '@/lib/profile';
import { rankFor } from '@/domain/ranked';

/**
 * The one owner of the signed-in learner's state.
 *
 * `/me` was previously fetched by two different mechanisms (a bespoke
 * `useSession` effect for the shell, and raw `useSWR` on the dashboard), which
 * meant two requests, two loading flags and two chances to disagree about who
 * is signed in. Everything now reads this hook, so SWR's cache is the single
 * source of truth and one response serves the shell, the dashboard and the
 * staff portals alike.
 */

export type Achievement = {
  id: string;
  name: string;
  /** Legacy emoji from the database — resolved to a registry icon for display. */
  icon: string;
  description?: string;
  unlockedAt?: string | null;
};

export type ProfileVisibility = {
  name: boolean;
  nickname: boolean;
  bio: boolean;
  pronouns: boolean;
  subjects: boolean;
  stats: boolean;
  achievements: boolean;
};

export interface ConsentState {
  version: number;
  updatedAt: string;
  choices: Record<string, boolean>;
  summary: string | null;
  hasNonEssential: boolean;
  isMinimal: boolean;
}

export interface Me {
  consent?: { choices: Record<string, boolean>; updatedAt: string; version: number } | null;
  id: string;
  email: string;
  name: string;
  username: string | null;
  nickname: string | null;
  bio: string | null;
  pronouns: string | null;
  avatarEmoji: string | null;
  avatarColor: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bannerColor: string | null;
  profileVisibility: ProfileVisibility;
  role: 'student' | 'teacher' | 'developer';
  status: string;
  totpEnabled: boolean;
  leaderboardOptOut: boolean;
  isUnderAge: boolean;
  prefs: {
    noteDensity?: 'detailed' | 'summary';
    reducedMotion?: boolean;
    streakMastery?: boolean;
    quietMode?: boolean;
    focusMode?: boolean;
    sessionLength?: 5 | 10 | 20;
    breakReminders?: boolean;
    readingPreset?: 'default' | 'relaxed';
  } | null;
  subjects: { id: string; name: string; slug?: string }[];
  gamification: {
    totalXp: number;
    level: number;
    intoLevel: number;
    forNext: number;
    streak: number;
    bestStreak: number;
    /** Earned streak freezes (#12): one is spent automatically per missed day,
     *  earned every 7th consecutive day, capped at 3. */
    streakFreezes: number;
  };
  today: { due: number; dueCount: number; newCount: number; newRemaining: number; reviewed: number; correct: number };
  /** The learner's own 12-level SRS strength distribution (zero-filled), with
   *  the mean rung — the dashboard's strength card renders straight from it. */
  srs: { levels: number[]; avgLevel: number | null; totalCards: number };
  achievements: Achievement[];
};

/**
 * The learner snapshot, assembled once.
 *
 * The companion's voice needs a flat view of the learner, and both the shell and
 * the dashboard need it — so the mapping from the `/me` payload lives here,
 * beside the type it reads, rather than being re-derived at each call site
 * (which is how two surfaces end up disagreeing about the same numbers).
 */
/** The name a profile surfaces first: nickname when there is one. */
export function displayName(me: Pick<Me, 'name' | 'nickname'>): string {
  return me.nickname?.trim() || me.name;
}

/**
 * Cards one review session deals at most — the learner's chosen length.
 * The pref is canonical: the session's localStorage/`?deal=` overrides are
 * per-session experiments that PATCH the same pref on change, so the two
 * can only diverge inside a session that has not saved yet.
 */
export function sessionLength(me: Me): number {
  return me.prefs?.sessionLength ?? 20;
}

/**
 * Today's queue as the learner meets it: the session dose, never the raw
 * backlog. `today.due` is due + new across the whole backlog, which for a
 * long-enrolled account is a four-digit number no surface should headline.
 */
export function sessionCards(me: Me): number {
  return Math.min(me.today.due, sessionLength(me));
}

export function learnerSnapshot(me: Me): CompanionSnapshot {
  return {
    name: displayName(me),
    role: me.role,
    due: sessionCards(me),
    reviewed: me.today.reviewed,
    correct: me.today.correct,
    streak: me.gamification.streak,
    bestStreak: me.gamification.bestStreak,
    level: me.gamification.level,
    subjects: me.subjects.map((s) => s.name),
    totalXp: me.gamification.totalXp,
    rankLabel: rankFor(me.gamification.totalXp).label,
  };
}

export function useMe() {
  const { data, error, isLoading, mutate } = useSWR<Me>('/api/v1/me', api.get, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  return { me: data, error, loading: isLoading, refresh: mutate };
}

/** Clear the in-memory token, drop the server session, then hand back to login. */
export async function signOut(): Promise<void> {
  try {
    await api.post('/api/v1/auth/logout');
  } catch {
    /* the cookie may already be gone — the local clear below is what matters */
  }
  setToken(null);
}
