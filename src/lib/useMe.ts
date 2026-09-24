'use client';

import useSWR from 'swr';
import { api, setToken } from '@/lib/api';

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
