// ── Seasons ────────────────────────────────────────────────────────────────
// Pure. No database, no React. A season is a *configured row*, not a piece of
// arithmetic: `seasons` holds the dates, the name and the state, an operator
// edits them from the admin panel, and this module is the one place that turns
// those rows into everything a screen needs.
//
// A season is ninety days of the same ladder the rank uses, run on XP earned
// *inside the window* rather than on a total that never moves. That difference
// is the whole point of the system:
//
//   • The rank is seasonal. It resets every season, and the rank you held when
//     the clock ran out is written down, shown off, and paid.
//   • The season record is permanent. It is the one thing that never resets.
//
// ── Why this is still a pure module ─────────────────────────────────────────
//
// When the windows were derived from `SEASON_EPOCH_MS` every client could
// compute them with no data at all, which was the original argument for
// putting the arithmetic here. Configurable seasons give that up — a date the
// operator typed cannot exist in a constant — so the rows now travel to the
// client in the API payload instead, and both phones read the window off the
// response rather than recomputing it. What this module still owns is the part
// that must not drift: which window is live, how far through it we are, and
// what a reward is. The epoch is kept as a *fallback* for an empty table, so a
// fresh database with no seed still produces a coherent (if unconfigured)
// season rather than an undefined one.

import { PLACEMENT_REVIEWS, tierName, type Tier } from './ranked';

/**
 * Days in one season. Retained as the fallback cadence and as what the admin
 * panel proposes when it offers "a normal ninety days" — but it is no longer
 * how a boundary is decided. Read `lengthDays` off the live window instead.
 */
export const SEASON_LENGTH_DAYS = 90;

/**
 * 00:00 UTC, Monday 5 January 2026 — season 1 opens.
 *
 * **Fallback only.** Every window below comes from the `seasons` table; these
 * two constants are what an empty (or not-yet-migrated) table falls back to,
 * and they are the schedule the table was seeded from. They are deliberately
 * kept so that deploying the migration could not move anyone's rank.
 */
export const SEASON_EPOCH_MS = Date.UTC(2026, 0, 5);

const DAY_MS = 86_400_000;

/**
 * Reviews needed inside a season before a rank is awarded at all.
 *
 * An alias of the ladder's own placement rule rather than a second constant.
 * There is one rank system, so "you have not placed yet" has to mean the same
 * number of reviews whether it is asked against the season window or the whole
 * account — two constants that happened to both be 10 was one unlucky edit away
 * from a learner being placed in one view and unplaced in the other.
 */
export const SEASON_PLACEMENT_REVIEWS = PLACEMENT_REVIEWS;

/** How the seasons table says a season is doing. */
export type SeasonState = 'draft' | 'active' | 'closed';

/**
 * A configured season, as this module consumes it. Deliberately a structural
 * shape rather than the Drizzle row type: the web app, the API and both phones
 * all need to pass one of these, and none of them should have to import the
 * database schema to do it.
 */
export type SeasonConfig = {
  number: number;
  /** Null means the generated default, "Season N". */
  name: string | null;
  startsAt: Date;
  /** Exclusive — the first instant of the next season. */
  endsAt: Date;
  state: SeasonState;
  /**
   * Whether XP earned before this season opened still counts toward it.
   *
   * Season 1 carries it, so a learner's seasonal rank is the rank they have
   * actually earned rather than a fresh Bronze III they did not earn. A later
   * season must not carry it — that is the entire difference between a season
   * and a continuation.
   */
  grandfatherRp?: boolean;
  /** Sparse per-tier reward overrides; empty/absent means the built-in ladder. */
  rewards?: Record<string, { name: string; detail: string; icon: string }> | null;
};

/** Everything a season screen needs, derived from a config row plus the clock. */
export type Season = {
  /** 1-based. Season 1 is the first ninety days from the epoch. */
  number: number;
  /** The operator's name, or "Season N". */
  name: string;
  /** Inclusive, 00:00 UTC. */
  start: Date;
  /** Exclusive — the first instant of the next season. */
  end: Date;
  /** YYYY-MM-DD, the shape `xp_events.occurred_at` is compared against. */
  startIso: string;
  /** Which day of the season this is, 1-based. */
  day: number;
  /** Whole days left including today; 1 on the last evening. */
  daysLeft: number;
  /** 0–100 of the season elapsed — drives the season clock. */
  percentElapsed: number;
  /** "Season 4", or the operator's name when there is one. */
  label: string;
  /** "Mon 29 Sep – Mon 28 Dec". */
  rangeLabel: string;
  state: SeasonState;
  /** Carried through from the config row; see `SeasonConfig.grandfatherRp`. */
  grandfatherRp: boolean;
};

// ── formatting, shared by every derived label ───────────────────────────────

const fmt = (x: Date, withMonth: boolean) =>
  x.toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    ...(withMonth ? { month: 'short' } : {}),
  });
const weekday = (x: Date) => x.toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short' });

function rangeLabel(start: Date, end: Date): string {
  const lastDay = new Date(end.getTime() - DAY_MS);
  const endMonth = end.toLocaleDateString('en-GB', { timeZone: 'UTC', month: 'short' });
  return `${weekday(start)} ${fmt(start, true)} – ${weekday(lastDay)} ${fmt(lastDay, false)} ${endMonth}`;
}

function labelFor(config: Pick<SeasonConfig, 'number' | 'name'>): string {
  const name = config.name?.trim();
  return name ? name : `Season ${config.number}`;
}

/** Fill in a config row's derived fields. Pure; safe to call per row. */
function derive(config: SeasonConfig, now: Date): Season {
  const totalDays = Math.max(1, Math.round((config.endsAt.getTime() - config.startsAt.getTime()) / DAY_MS));
  const daysLeft = Math.max(0, Math.ceil((config.endsAt.getTime() - now.getTime()) / DAY_MS));
  const day = Math.min(totalDays, Math.max(1, Math.floor((now.getTime() - config.startsAt.getTime()) / DAY_MS) + 1));
  const percentElapsed = Math.max(0, Math.min(100, Math.round(((day - 1) / totalDays) * 100)));
  return {
    number: config.number,
    name: labelFor(config),
    start: config.startsAt,
    end: config.endsAt,
    startIso: config.startsAt.toISOString().slice(0, 10),
    day,
    daysLeft,
    percentElapsed,
    label: labelFor(config),
    rangeLabel: rangeLabel(config.startsAt, config.endsAt),
    state: config.state,
    grandfatherRp: config.grandfatherRp ?? false,
  };
}

/**
 * The fallback schedule, for a table that is empty or not yet migrated.
 *
 * This is the old epoch arithmetic verbatim, kept working so that a database
 * without the seed degrades to the behaviour that shipped rather than to an
 * undefined season. It is not consulted once the table has rows.
 */
function fallbackConfigs(): SeasonConfig[] {
  const configs: SeasonConfig[] = [];
  for (let number = 1; number <= 24; number += 1) {
    const start = new Date(SEASON_EPOCH_MS + (number - 1) * SEASON_LENGTH_DAYS * DAY_MS);
    const end = new Date(start.getTime() + SEASON_LENGTH_DAYS * DAY_MS);
    configs.push({
      number,
      name: null,
      startsAt: start,
      endsAt: end,
      state: 'closed',
      // Only the first season grandfathers, exactly as the seeded table does.
      grandfatherRp: number === 1,
    });
  }
  return configs;
}

/**
 * Normalise whatever the table held into a list of configs, falling back to the
 * epoch schedule when there is nothing to read.
 *
 * `asDate` exists because the same rows arrive as `Date` from Drizzle on the
 * server and as an ISO **string** over JSON on the phones. Normalising once, here,
 * is what stops a phone from silently computing `NaN` days-left.
 */
export function seasonConfigs(rows: unknown[] | null | undefined): SeasonConfig[] {
  const usable = (rows ?? []).filter((r): r is Record<string, unknown> => !!r && typeof r === 'object');
  if (usable.length === 0) return fallbackConfigs();

  const configs: SeasonConfig[] = [];
  for (const row of usable) {
    const number = Number(row.number);
    const startsAt = toDate(row.startsAt ?? row.starts_at);
    const endsAt = toDate(row.endsAt ?? row.ends_at);
    if (!Number.isInteger(number) || number < 1 || !startsAt || !endsAt || endsAt <= startsAt) continue;
    const state = row.state === 'active' || row.state === 'closed' || row.state === 'draft' ? row.state : 'draft';
    // Accept both spellings: Drizzle hands over `grandfatherRp`, the phones and
    // any JSON payload hand over `grandfather_rp`.
    const grandfather = row.grandfatherRp ?? row.grandfather_rp;
    configs.push({
      number,
      name: typeof row.name === 'string' ? row.name : null,
      startsAt,
      endsAt,
      state,
      grandfatherRp: grandfather === true || grandfather === 'true',
      rewards: (row.rewards as SeasonConfig['rewards']) ?? null,
    });
  }
  if (configs.length === 0) return fallbackConfigs();
  return configs.sort((a, b) => a.number - b.number);
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** The window a season number covers, straight from the config list. */
export function seasonWindow(number: number, configs: SeasonConfig[]): { start: Date; end: Date } {
  const row = configs.find((c) => c.number === number);
  if (row) return { start: row.startsAt, end: row.endsAt };
  // A season number with no row is still asked for — the backfill walks the
  // numbers it can prove are closed. Fall back to the epoch arithmetic so the
  // caller gets a window rather than a crash.
  const n = Math.max(1, Math.floor(number));
  const start = new Date(SEASON_EPOCH_MS + (n - 1) * SEASON_LENGTH_DAYS * DAY_MS);
  return { start, end: new Date(start.getTime() + SEASON_LENGTH_DAYS * DAY_MS) };
}

/**
 * Which season is live right now.
 *
 * **The dates decide, not the `state` flag.** An operator who forgets to close
 * a season cannot leave the app with two live seasons, and one who forgets to
 * open the next still gets a coherent answer: the row whose window contains
 * `now` wins, and only if no window contains it do we fall back to the flag and
 * then to the newest non-draft row. That ordering matters more than it looks —
 * it is the difference between "your rank is wrong for a day" and "your rank is
 * ambiguous forever".
 */
export function seasonAt(configs: SeasonConfig[], now: Date = new Date()): Season {
  const live = configs.find((c) => now >= c.startsAt && now < c.endsAt);
  const chosen =
    live ??
    configs.find((c) => c.state === 'active') ??
    [...configs].reverse().find((c) => c.state !== 'draft') ??
    configs[configs.length - 1];

  // A window that has passed is closed whatever the flag says.
  const state: SeasonState = now >= chosen.endsAt ? 'closed' : chosen.state === 'draft' ? 'active' : chosen.state;
  return derive({ ...chosen, state }, now);
}

/** Every season that has finished, most recent first. */
export function elapsedSeasons(configs: SeasonConfig[], now: Date = new Date()): number[] {
  const current = seasonAt(configs, now).number;
  // Bounded: a season that closed before a learner joined cannot have held a
  // result for them, and walking back further only costs queries.
  const closed = configs.filter((c) => c.number < current && now >= c.endsAt).map((c) => c.number);
  const back = Math.min(current - 1, 12);
  const derived = Array.from({ length: back }, (_, i) => current - 1 - i);
  return [...new Set([...closed, ...derived])]
    .filter((n) => n < current && n >= 1)
    .sort((a, b) => b - a)
    .slice(0, 12);
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
//
// A configured season may override any of these by tier; the built-in ladder is
// always the fallback, so a season with no overrides pays exactly what the
// shipped design says it pays.

export type SeasonReward = {
  /** Stable id, stored on the result row. */
  id: string;
  name: string;
  detail: string;
  /** Registry icon name — narrowed to the four the rewards actually use so
   *  `Icon name={…}` stays type-checked from here. */
  icon: 'climb' | 'crown' | 'rank' | 'league';
};

/** The only icon names a reward may use, so a configured override cannot break
 *  the typed `<Icon name={…}>` at compile time. */
const REWARD_ICONS: SeasonReward['icon'][] = ['climb', 'crown', 'rank', 'league'];

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

/** Apply a season's overrides to the built-in ladder, tier by tier. */
function rewardsFor(config: SeasonConfig | null | undefined): Record<Tier, SeasonReward> {
  const base = { ...SEASON_REWARDS };
  const overrides = config?.rewards;
  if (!overrides) return base;
  for (const [tier, override] of Object.entries(overrides)) {
    if (!(tier in base) || !override) continue;
    const icon = REWARD_ICONS.includes(override.icon as SeasonReward['icon'])
      ? (override.icon as SeasonReward['icon'])
      : base[tier as Tier].icon;
    base[tier as Tier] = {
      id: tier,
      name: override.name?.trim() || base[tier as Tier].name,
      detail: override.detail?.trim() || base[tier as Tier].detail,
      icon,
    };
  }
  return base;
}

export function rewardFor(tier: Tier, config?: SeasonConfig | null): SeasonReward {
  const ladder = rewardsFor(config);
  return ladder[tier] ?? ladder.bronze;
}

/** Every reward in climb order, for the panel that explains the ladder. */
export function rewardLadder(config?: SeasonConfig | null): { tier: Tier; name: string; reward: SeasonReward }[] {
  const ladder = rewardsFor(config);
  return (Object.keys(ladder) as Tier[]).map((tier) => ({
    tier,
    name: tierName(tier),
    reward: ladder[tier],
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