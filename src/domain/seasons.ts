// ── Seasons ────────────────────────────────────────────────────────────────
// Pure. No database, no React. A season is ninety days of the same ladder the
// lifetime rank uses, run on XP earned *inside the window* rather than on a
// total that never moves. That difference is the whole point: a lifetime rank
// rewards having played before, a seasonal rank rewards having played now.
//
//   • The lifetime rank is the record. It never resets.
//   • The season rank is the competition. It resets every ninety days, and the
//     rank you held when the clock ran out is written down, shown off, and
//     paid.
//
// The window is derived from a fixed epoch rather than stored in a table: every
// server, every client and both phones compute the same boundaries from the
// same two constants, so there is no row to be missing and no clock skew to
// explain. `season_results` records what *happened* in a season, not when it
// began.

import { tierName, type Tier } from './ranked';

/** Days in one season. */
export const SEASON_LENGTH_DAYS = 90;

/** 00:00 UTC, Monday 5 January 2026 — season 1 opens. Everything is an offset
 *  from here, so every client and both phones compute identical boundaries.
 *  Ninety is not a multiple of seven, so season boundaries drift by two days
 *  each season; that is deliberate rather than a bug — a fixed-length season
 *  that nobody can game by resetting a weekly clock is worth more than one that
 *  always opens on a Monday. */
export const SEASON_EPOCH_MS = Date.UTC(2026, 0, 5);

const DAY_MS = 86_400_000;

/** Reviews needed inside a season before a result is recorded at all. Mirrors
 *  the lifetime placement rule so "you have not placed yet" means the same
 *  thing on both ladders. */
export const SEASON_PLACEMENT_REVIEWS = 10;

export type Season = {
  /** 1-based. Season 1 is the first ninety days from the epoch. */
  number: number;
  /** Inclusive, 00:00 UTC. */
  start: Date;
  /** Exclusive — the first instant of the next season. */
  end: Date;
  /** YYYY-MM-DD, the shape `xp_events.occurred_at` is compared against. */
  startIso: string;
  /** Which day of the ninety this is, 1–90. */
  day: number;
  /** Whole days left including today; 1 on the last evening. */
  daysLeft: number;
  /** 0–100 of the season elapsed — drives the season clock. */
  percentElapsed: number;
  /** "Season 4". */
  label: string;
  /** "Mon 29 Sep – Mon 28 Dec". */
  rangeLabel: string;
};

/** The window a given season number covers. `number` is clamped at 1. */
export function seasonWindow(number: number): { start: Date; end: Date } {
  const n = Math.max(1, Math.floor(number));
  const start = new Date(SEASON_EPOCH_MS + (n - 1) * SEASON_LENGTH_DAYS * DAY_MS);
  return { start, end: new Date(start.getTime() + SEASON_LENGTH_DAYS * DAY_MS) };
}

/** Which season a moment falls in, with everything the header needs. */
export function seasonAt(now: Date = new Date()): Season {
  const elapsed = now.getTime() - SEASON_EPOCH_MS;
  // `Math.floor` on a negative elapsed puts a pre-epoch date in season 0, which
  // `seasonWindow` clamps back to 1 — the app simply says "season 1".
  const index = Math.max(0, Math.floor(elapsed / (SEASON_LENGTH_DAYS * DAY_MS)));
  const number = index + 1;
  const { start, end } = seasonWindow(number);
  const daysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY_MS));
  const day = Math.min(SEASON_LENGTH_DAYS, Math.floor((now.getTime() - start.getTime()) / DAY_MS) + 1);
  const percentElapsed = Math.max(0, Math.min(100, Math.round(((day - 1) / SEASON_LENGTH_DAYS) * 100)));

  const fmt = (x: Date, withMonth: boolean) =>
    x.toLocaleDateString('en-GB', {
      timeZone: 'UTC',
      day: 'numeric',
      ...(withMonth ? { month: 'short' } : {}),
    });
  const weekday = (x: Date) => x.toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short' });
  const lastDay = new Date(end.getTime() - DAY_MS);
  const endMonth = end.toLocaleDateString('en-GB', { timeZone: 'UTC', month: 'short' });

  return {
    number,
    start,
    end,
    startIso: start.toISOString().slice(0, 10),
    day,
    daysLeft,
    percentElapsed,
    label: `Season ${number}`,
    rangeLabel: `${weekday(start)} ${fmt(start, true)} – ${weekday(lastDay)} ${fmt(lastDay, false)} ${endMonth}`,
  };
}

/** The seasons already closed, most recent first. Used to backfill results. */
export function elapsedSeasons(now: Date = new Date()): number[] {
  const current = seasonAt(now).number;
  // Bounded: a season that closed before a learner joined cannot have held a
  // result for them, and walking back further only costs queries.
  const back = Math.min(current - 1, 12);
  return Array.from({ length: back }, (_, i) => current - 1 - i);
}

// ── the reward ladder ───────────────────────────────────────────────────────
//
// A season pays out on the *tier* you finished in — not the division, not the
// number — so the prize is legible at a glance and nobody finishes a season one
// division short of the next tier for nothing. The division still decides the
// order on the season board; the tier decides the reward.
//
// The reward itself is the crest and the title: a permanent record on the
// learner's season showcase. That is a real, durable thing rather than a
// fictional currency, and it is why `season_results` is a table and not a
// computed string — claiming one is an event worth recording.

export type SeasonReward = {
  /** Stable id, stored on the result row. */
  id: string;
  name: string;
  detail: string;
  /** Registry icon name — narrowed to the four the rewards actually use so
   *  `Icon name={…}` stays type-checked from here. */
  icon: 'climb' | 'crown' | 'rank' | 'league';
};

export const SEASON_REWARDS: Record<Tier, SeasonReward> = {
  bronze: { id: 'bronze', name: 'Bronze finisher', detail: 'Your season crest, kept for good.', icon: 'climb' },
  silver: { id: 'silver', name: 'Silver finisher', detail: 'Your season crest and the Silver title.', icon: 'climb' },
  gold: { id: 'gold', name: 'Gold finisher', detail: 'Your season crest and the Gold title.', icon: 'crown' },
  platinum: { id: 'platinum', name: 'Platinum finisher', detail: 'Your season crest and the Platinum title.', icon: 'crown' },
  emerald: { id: 'emerald', name: 'Emerald finisher', detail: 'Your season crest and the Emerald title.', icon: 'crown' },
  sapphire: { id: 'sapphire', name: 'Sapphire finisher', detail: 'Your season crest and the Sapphire title.', icon: 'crown' },
  diamond: { id: 'diamond', name: 'Diamond finisher', detail: 'Your season crest and the Diamond title.', icon: 'rank' },
  ruby: { id: 'ruby', name: 'Ruby finisher', detail: 'Your season crest and the Ruby title.', icon: 'rank' },
  obsidian: { id: 'obsidian', name: 'Obsidian finisher', detail: 'Your season crest and the Obsidian title.', icon: 'rank' },
  legend: { id: 'legend', name: 'Legend of the season', detail: 'The apex reward: the season is on your profile in full.', icon: 'league' },
};

export function rewardFor(tier: Tier): SeasonReward {
  return SEASON_REWARDS[tier] ?? SEASON_REWARDS.bronze;
}

/** Every reward in climb order, for the panel that explains the ladder. */
export function rewardLadder(): { tier: Tier; name: string; reward: SeasonReward }[] {
  return (Object.keys(SEASON_REWARDS) as Tier[]).map((tier) => ({
    tier,
    name: tierName(tier),
    reward: SEASON_REWARDS[tier],
  }));
}

/** The one sentence under the season clock. State policy, not encouragement. */
export function seasonLine({
  daysLeft,
  rankLabel,
  placed,
  isLastDay,
}: {
  daysLeft: number;
  rankLabel: string;
  placed: boolean;
  isLastDay?: boolean;
}): string {
  if (isLastDay) return 'Last day. Whatever you are holding now is what you keep.';
  if (!placed) return 'Ten reviews and you are placed for this season.';
  if (daysLeft <= 7) return `${daysLeft} days left — you are ${rankLabel} going into the final week.`;
  return `${daysLeft} days left. You are ${rankLabel}.`;
}