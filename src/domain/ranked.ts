// ── Ranked engine ───────────────────────────────────────────────────────────
// Pure. No database, no React, no formatting for a specific screen — the same
// module answers "what rank is 4,200 RP" for the API, the crest, the ladder and
// the post-session verdict, so those four can never disagree.
//
// The system synthesises the three things the product asked for:
//
//   • THE FPS HALF — a persistent rank. Ten tiers, three divisions each, so
//     thirty ranks (Bronze III → Legend I), earned with **RP** that never
//     resets. This is the ladder you climb; it is what makes a session feel
//     like it mattered beyond today.
//   • THE DUOLINGO HALF — a weekly lobby. You are seated with a cohort inside
//     your tier, and the week ends in a promotion zone (top of the lobby) and a
//     demotion zone (bottom). The rank is what you keep; the lobby is what
//     keeps the week interesting.
//   • THE SEASON — the same ladder again, earned from XP inside a 90-day
//     window (see `domain/seasons.ts`). The lifetime rank is the record; the
//     season rank is what you are competing for right now and what a reward is
//     paid on when it closes.
//
// Two rules about presentation that live here rather than in the UI:
//
//   1. RANK IS CODED BY GEOMETRY *AND* HUE. The crest still carries tier in
//      shape — chevron count, ring segments, division pips — so the ladder is
//      legible in monochrome, in greyscale print and to a colour-blind reader.
//      On top of that each tier now has its own metallic (see `TIER_COLOR`),
//      because "premium and competitive" is partly a colour claim and a
//      nine-metre ladder of identical black shields is not it. The metals are
//      scoped to the crest, the tier meters and the tier chips: the rest of the
//      app keeps its one-accent rule.
//   2. NEW ACCOUNTS ARE UNRANKED, NOT BRONZE III. Competitive games make you
//      play placements before you own a badge. That also spares a first-time
//      learner the insult of being handed a bronze medal on arrival.

export type Tier =
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'platinum'
  | 'emerald'
  | 'sapphire'
  | 'diamond'
  | 'ruby'
  | 'obsidian'
  | 'legend';
/** The `league_memberships.league` column predates this module and holds the
 *  original five values; the alias keeps the database's vocabulary readable at
 *  the boundary without a migration. Only those five are written there — the
 *  wider ladder is derived, never stored, so it can change without a migration. */
export type League = Tier;
export type Division = 3 | 2 | 1;
export const DIVISION_LABEL: Record<Division, string> = { 3: 'III', 2: 'II', 1: 'I' };

/**
 * RP per unit of XP. The two currencies are deliberately the same size — XP is
 * what the review loop already awards, and a second, silently-different number
 * would just be a thing to explain. RP is XP read through the ranked lens.
 */
export const RP_PER_XP = 1;

/** RP to clear one division, by tier. Bands widen as you climb: early ranks
 *  move fast (a new learner sees Bronze II within their first two sessions),
 *  Legend is a genuine project. Total to Legend I: 17,610 RP ≈ 1,760 reviews —
 *  roughly three months of a solid daily habit, which is the point of a ladder
 *  this long: the summit has to be something you were building towards. */
export const DIVISION_SPAN: Record<Tier, number> = {
  bronze: 120,
  silver: 180,
  gold: 250,
  platinum: 340,
  emerald: 450,
  sapphire: 580,
  diamond: 720,
  ruby: 880,
  obsidian: 1050,
  legend: 1300,
};

export const TIER_ORDER: Tier[] = [
  'bronze',
  'silver',
  'gold',
  'platinum',
  'emerald',
  'sapphire',
  'diamond',
  'ruby',
  'obsidian',
  'legend',
];

/**
 * The tier's metal, as a CSS custom property.
 *
 * Ten accents is a deliberate break from the one-accent chrome, and it is
 * scoped as tightly as it can be: these tokens are read by the crest, the tier
 * meters and the tier chips, and by nothing else. Every hue has a light-mode and
 * a dark-mode value in `globals.css` because the crest is drawn both on the
 * white canvas and on the near-black rank band, and a metal that reads as metal
 * on one ground turns into mud on the other.
 *
 * Returned as a `var()` string rather than a class name on purpose: the tier is
 * data, so the colour has to travel as data.
 */
const TIER_COLOR_VAR: Record<Tier, string> = {
  bronze: 'var(--tier-bronze)',
  silver: 'var(--tier-silver)',
  gold: 'var(--tier-gold)',
  platinum: 'var(--tier-platinum)',
  emerald: 'var(--tier-emerald)',
  sapphire: 'var(--tier-sapphire)',
  diamond: 'var(--tier-diamond)',
  ruby: 'var(--tier-ruby)',
  obsidian: 'var(--tier-obsidian)',
  legend: 'var(--tier-legend)',
};

/** The tier's metal, ready to hand to `style={{ color }}`. */
export function tierColor(tier: Tier): string {
  return TIER_COLOR_VAR[tier] ?? TIER_COLOR_VAR.bronze;
}

export type LadderRung = {
  tier: Tier;
  division: Division;
  /** Zero-based position on the ladder, 0 = Bronze III … 14 = Legend I. */
  index: number;
  /** Cumulative RP required to *enter* this rank. */
  base: number;
  /** RP needed to move from this rank to the next. */
  span: number;
};

/** The fifteen rungs, computed once from the tier order and the spans. */
export const RANK_LADDER: LadderRung[] = (() => {
  const rungs: LadderRung[] = [];
  let base = 0;
  let index = 0;
  for (const tier of TIER_ORDER) {
    // Within a tier we climb III → II → I, the way competitive ladders read.
    for (const division of [3, 2, 1] as Division[]) {
      rungs.push({ tier, division, index, base, span: DIVISION_SPAN[tier] });
      base += DIVISION_SPAN[tier];
      index += 1;
    }
  }
  return rungs;
})();

/** Total RP needed to clear the whole ladder (i.e. to hold Legend I). */
export const TOP_OF_LADDER = RANK_LADDER[RANK_LADDER.length - 1].base;

/** Placements before a rank is awarded. Five sessions' worth of reviews. */
export const PLACEMENT_REVIEWS = 10;

export type Rank = {
  tier: Tier;
  division: Division;
  index: number;
  label: string;
  short: string;
  /** Rank points, from XP. */
  points: number;
  /** RP earned inside the current division. */
  intoDivision: number;
  /** RP the current division costs in total. */
  forDivision: number;
  /** 0–100, clamped. A bad ratio must never emit a negative CSS width. */
  percent: number;
  /** RP left before the next rung (0 at the top). */
  remaining: number;
  /** True once the learner is holding the highest rank in the game. */
  isApex: boolean;
};

export function rpForXp(totalXp: number): number {
  return Math.max(0, Math.round((totalXp ?? 0) * RP_PER_XP));
}

/** Which rung a quantity of RP sits on. Clamped at both ends. */
export function rankFor(totalXp: number): Rank {
  const points = rpForXp(totalXp);
  let rung = RANK_LADDER[0];
  for (const candidate of RANK_LADDER) {
    if (points >= candidate.base) rung = candidate;
    else break;
  }
  const intoDivision = points - rung.base;
  const isApex = rung.index === RANK_LADDER.length - 1;
  const percent = Math.max(0, Math.min(100, Math.round((intoDivision / rung.span) * 100)));
  const label = `${tierName(rung.tier)} ${DIVISION_LABEL[rung.division]}`;
  return {
    tier: rung.tier,
    division: rung.division,
    index: rung.index,
    label,
    short: `${tierName(rung.tier).slice(0, 3).toUpperCase()} ${DIVISION_LABEL[rung.division]}`,
    points,
    intoDivision,
    forDivision: rung.span,
    percent,
    remaining: Math.max(0, rung.span - intoDivision),
    isApex,
  };
}

/**
 * Rough reviews needed to earn an amount of RP. Used for the "about 22
 * reviews" line — the only place the app converts RP back into work, so the
 * estimate is consistent wherever it appears. Ten RP is the average correct
 * review (see `XP_PER_CORRECT` in gamification).
 */
export function reviewsForRp(rp: number, perReview = 10): number {
  return Math.max(1, Math.ceil(rp / perReview));
}

/** The rung one above the current one, or null at the apex. */
export function nextRung(index: number): LadderRung | null {
  return RANK_LADDER[index + 1] ?? null;
}

export function tierName(tier: Tier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

/**
 * Promotion / demotion bands inside a weekly lobby.
 *
 * Duolingo promotes the top five of thirty and demotes the bottom five, so the
 * bands are proportional — but a lobby of four people should not promote three
 * of them, hence the floor of one and the ceiling of five.
 */
export function zoneBand(size: number): number {
  return Math.max(1, Math.min(5, Math.round(size * 0.17)));
}

export type LobbyZone = 'promotion' | 'safe' | 'demotion' | 'pending';

export function zoneFor(position: number, size: number, totalXp: number): LobbyZone {
  if (totalXp < PLACEMENT_REVIEWS) return 'pending';
  const band = zoneBand(size);
  if (position <= band) return 'promotion';
  if (position > size - band) return 'demotion';
  return 'safe';
}

export type Placement = {
  placing: boolean;
  done: number;
  target: number;
  percent: number;
};

export function placementFor(totalReviews: number, target = PLACEMENT_REVIEWS): Placement {
  const done = Math.max(0, Math.min(totalReviews, target));
  return {
    placing: totalReviews < target,
    done,
    target,
    percent: Math.round((done / target) * 100),
  };
}

/**
 * How a session moved the ladder. The review loop shows this the moment the
 * queue empties, which is the whole point of having a rank: the work has to
 * visibly *land* somewhere.
 */
export type RankChange = {
  gained: number;
  before: Rank;
  after: Rank;
  promoted: boolean;
  demoted: boolean;
  fromLabel: string;
  toLabel: string;
  /** True when this session carried the learner into a new tier, not just a
   *  division — the moment that earns the full crest animation. */
  tierChanged: boolean;
};

export function rankChange(beforeXp: number, afterXp: number): RankChange {
  const before = rankFor(beforeXp);
  const after = rankFor(afterXp);
  return {
    gained: after.points - before.points,
    before,
    after,
    promoted: after.index > before.index,
    demoted: after.index < before.index,
    fromLabel: before.label,
    toLabel: after.label,
    tierChanged: after.tier !== before.tier && after.index > before.index,
  };
}

/**
 * Form — competitive-gaming framing for "how are you playing right now".
 * Derived from today's numbers only, because that is all the shell has without
 * another request, and a form readout that lags a whole session is worse than
 * none. Returns a neutral state when there is nothing to judge yet.
 */
export type Form = 'sharp' | 'steady' | 'shaky' | 'unknown';

export function formFor(reviewed: number, correct: number): { form: Form; label: string; detail: string } {
  if (reviewed < 4) return { form: 'unknown', label: 'No read yet', detail: 'Four reviews is enough to call your form.' };
  const accuracy = correct / reviewed;
  if (accuracy >= 0.9) return { form: 'sharp', label: 'Sharp', detail: `${Math.round(accuracy * 100)}% today — this is your best gear.` };
  if (accuracy >= 0.7) return { form: 'steady', label: 'Steady', detail: `${Math.round(accuracy * 100)}% today. Solid, unspectacular, fine.` };
  return { form: 'shaky', label: 'Shaky', detail: `${Math.round(accuracy * 100)}% today. Slow down and read the whole clue.` };
}

// ── the lobby clock ─────────────────────────────────────────────────────────
// A weekly league needs a week, and the week needs one definition. The DB's
// `week_start` is the Monday in UTC (`services/study.mondayOf`), so this mirrors
// it on the client without importing a server-only module.

export type WeekBounds = {
  /** Monday, YYYY-MM-DD — matches `league_memberships.week_start`. */
  weekStart: string;
  /** Whole days left including today, 1 on Sunday evening. */
  daysLeft: number;
  /** 0–100 of the week elapsed — drives the lobby's ring. */
  percentElapsed: number;
  /** "Mon 22 – Sun 28 Sep", for the header of the lobby. */
  rangeLabel: string;
};

export function weekBounds(now: Date = new Date()): WeekBounds {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  const start = new Date(d.getTime() - dow * 86_400_000);
  const end = new Date(start.getTime() + 6 * 86_400_000);

  const elapsed = (now.getTime() - start.getTime()) / (7 * 86_400_000);
  const daysLeft = Math.max(0, Math.ceil((end.getTime() + 86_400_000 - now.getTime()) / 86_400_000));

  const fmt = (x: Date, withMonth: boolean) =>
    x.toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', ...(withMonth ? { month: 'short' } : {}) });
  const weekday = (x: Date) => x.toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short' });
  const month = end.toLocaleDateString('en-GB', { timeZone: 'UTC', month: 'short' });

  return {
    weekStart: start.toISOString().slice(0, 10),
    daysLeft,
    percentElapsed: Math.max(0, Math.min(100, Math.round(elapsed * 100))),
    rangeLabel: `${weekday(start)} ${fmt(start, false)} – ${weekday(end)} ${fmt(end, false)} ${month}`,
  };
}

// ── the crest's shape signature ─────────────────────────────────────────────
// The tier is carried twice: by hue (see `TIER_COLOR`) and by geometry. The
// geometry is not decoration and is not a fallback — it is what keeps a
// thirty-rung ladder legible in greyscale, at 34px, and for a reader who
// cannot separate two of the metals. Three signals, all readable at that size:
//
//   • RIDGES — chevrons stacked in the shield, paired across the ten tiers
//     (Bronze/Silver one, Gold/Platinum two, … Obsidian/Legend five). Military
//     rank stripes: ten chevrons will not fit a shield, so the count reads the
//     *band* you are in and the hue reads the exact tier.
//   • PIPS — a row of dots under the chevrons, one per division held
//     (III = 1, II = 2, I = 3).
//   • SEGMENTS — tick marks around the dial, 6 at Bronze to 24 at Legend. One
//     tick per tier, doubled at the summit: it reads as a mechanism winding
//     tighter as you climb.
//
// These numbers are design, not tuning knobs.

export type CrestSpec = {
  /** Chevrons stacked in the shield: 1 (Bronze/Silver) → 5 (Obsidian/Legend). */
  ridges: number;
  /** Tick marks around the dial: 6 → 24. */
  segments: number;
  /** Division dots, counted from the bottom (III = 1). */
  pips: number;
};

export function crestFor(rank: Pick<Rank, 'tier' | 'division' | 'index'>): CrestSpec {
  const tierIndex = TIER_ORDER.indexOf(rank.tier);
  const band = Math.max(0, tierIndex);
  return {
    ridges: 1 + Math.floor(band / 2),
    segments: 6 + band * 2,
    pips: 4 - rank.division,
  };
}
