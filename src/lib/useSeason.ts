'use client';

import useSWR from 'swr';
import { api } from '@/lib/api';
import type { Rank } from '@/domain/ranked';
import type { SeasonReward } from '@/domain/seasons';
import type { Tier } from '@/domain/ranked';

/**
 * The one owner of the season payload, declared here rather than in the panel
 * so the API shape has exactly one description in the client — the same
 * discipline `useRanked` follows for the lifetime ladder.
 */

export type SeasonRow = {
  seasonNumber: number;
  rank: Rank;
  reviews: number;
  reward: SeasonReward;
  rewardClaimedAt: string | null;
  endedAt: string;
};

export type SeasonBoardRow = {
  position: number;
  userId: string;
  name: string;
  xp: number;
  isMe: boolean;
  rank: Rank;
};

export type SeasonResponse = {
  season: {
    number: number;
    label: string;
    rangeLabel: string;
    startIso: string;
    daysLeft: number;
    day: number;
    lengthDays: number;
    percentElapsed: number;
    grandfathered: boolean;
  };
  mine: {
    xp: number;
    reviews: number;
    placed: boolean;
    rank: Rank;
    position: number;
    fieldSize: number;
  };
  /** What each tier pays *this* season, with any configured overrides applied. */
  rewards: { tier: Tier; name: string; reward: SeasonReward }[];
  board: SeasonBoardRow[];
  history: SeasonRow[];
};

export function useSeason() {
  const { data, error, isLoading, mutate } = useSWR<SeasonResponse>(
    '/api/v1/seasons',
    api.get,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  return { season: data, error, loading: isLoading, refresh: mutate };
}