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

export type Me = {
  id: string;
  email: string;
  name: string;
  role: 'student' | 'teacher' | 'developer';
  status: string;
  totpEnabled: boolean;
  leaderboardOptOut: boolean;
  prefs: { noteDensity?: 'detailed' | 'summary'; reducedMotion?: boolean } | null;
  subjects: { id: string; name: string; slug?: string }[];
  gamification: {
    totalXp: number;
    level: number;
    intoLevel: number;
    forNext: number;
    streak: number;
    bestStreak: number;
  };
  today: { due: number; reviewed: number; correct: number };
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
export function learnerSnapshot(me: Me): CompanionSnapshot {
  return {
    name: me.name,
    role: me.role,
    due: me.today.due,
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
