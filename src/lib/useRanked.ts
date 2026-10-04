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

export type BoardRow = { rank: number; userId?: string; name: string; xp: number; isMe: boolean };

export type RankedScope = 'daily' | 'weekly' | 'monthly';

export type RankedResponse = {
  scope: RankedScope;
  board: BoardRow[];
  ranked: {
    /** The seasonal rank — the one number the product is about. */
    rank: Rank;
    placement: Placement;
    week: WeekBounds;
    lobby: LobbyData;
    xpThisWeek: number;
    /** The clock the rank runs on, so the strip can say "this resets" without a
     *  second request. `/api/v1/seasons` owns the board and the finished-season
     *  record. */
    season: {
      number: number;
      label: string;
      rangeLabel: string;
      daysLeft: number;
      day: number;
      lengthDays: number;
      percentElapsed: number;
      /** Season 1: XP from before the window still counts, so this season's rank
       *  is the rank actually earned rather than a fresh Bronze III. */
      grandfathered: boolean;
    };
    seasonXp: number;
    seasonReviews: number;
    /** The same engine on lifetime XP: the record, not the rank. */
    lifetimeRank: Rank;
  };
  me: {
    rank: number;
    xpThisWeek: number;
    /** XP earned inside the current season — what `rank` is computed from. */
    seasonXp: number;
    /** XP earned ever, which drives the level curve. */
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
