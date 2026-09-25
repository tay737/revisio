'use client';

import useSWR from 'swr';
import { api } from '@/lib/api';
import type { Placement, Rank, WeekBounds } from '@/domain/ranked';
import type { LobbyData } from '@/components/rank/LobbyTable';

/**
 * The one owner of the ranked payload.
 *
 * The dashboard strip and the Rank page both read this, keyed identically, so
 * SWR serves them from a single request and a single cache entry — they cannot
 * disagree about your rank, and tapping through from the dashboard costs
 * nothing. The response type is declared here rather than in either page, so
 * the API shape has exactly one description in the client.
 */

export type AchievementRow = {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt: string | null;
};

export type BoardRow = { rank: number; name: string; xp: number; isMe: boolean };

export type RankedScope = 'daily' | 'weekly' | 'monthly';

export type RankedResponse = {
  scope: RankedScope;
  board: BoardRow[];
  ranked: {
    rank: Rank;
    placement: Placement;
    week: WeekBounds;
    lobby: LobbyData;
    xpThisWeek: number;
  };
  me: {
    rank: number;
    xpThisWeek: number;
    totalXp: number;
    level: number;
    seatedThisWeek: boolean;
  };
  achievements: AchievementRow[];
};

export function useRanked(scope: RankedScope = 'weekly') {
  const { data, error, isLoading, mutate } = useSWR<RankedResponse>(
    `/api/v1/gamification?scope=${scope}`,
    api.get,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  return { ranked: data, error, loading: isLoading, refresh: mutate };
}
