// ── SRS engine ──────────────────────────────────────────────────────────────
// Pure scheduling math. Two algorithms ship: sm2 (default) and fsrs-lite.
// Parameters are dev-tunable via /api/v1/admin/algorithms; the Scheduler
// interface is the seam for adding new algorithms (ARCHITECTURE.md §8).

export type Rating = 'again' | 'hard' | 'good' | 'easy';

export type CardState = {
  stage: 'new' | 'learning' | 'review' | 'mastered';
  intervalDays: number;
  ease: number;
  stability: number;
  difficulty: number;
  lapses: number;
  reps: number;
  algorithm: string;
};

export type SchedulingResult = CardState & { dueAt: Date };

export type SchedulerParams = Record<string, number>;

export interface Scheduler {
  readonly name: string;
  readonly description: string;
  defaultParams(): SchedulerParams;
  schedule(state: CardState, rating: Rating, params: SchedulerParams, now: Date): SchedulingResult;
}

// ── SM-2 (default) ──────────────────────────────────────────────────────────

export class Sm2Scheduler implements Scheduler {
  readonly name = 'sm2';
  readonly description = 'Classic SuperMemo-2 with learning steps.';

  defaultParams(): SchedulerParams {
    return { learningStepMinutes: 10, graduatingIntervalDays: 1, easyIntervalDays: 4, startEase: 2.5, minEase: 1.3, masterStreak: 5 };
  }

  schedule(state: CardState, rating: Rating, params: SchedulerParams, now: Date): SchedulingResult {
    const p = { ...this.defaultParams(), ...params };
    const next: CardState = { ...state, reps: state.reps + 1, algorithm: this.name };
    const minutes = p.learningStepMinutes ?? 10;

    if (rating === 'again') {
      next.stage = 'learning';
      next.lapses = state.stage === 'review' || state.stage === 'mastered' ? state.lapses + 1 : state.lapses;
      next.ease = Math.max(p.minEase, state.ease - 0.2);
      next.intervalDays = 0;
      next.stability = 0.1;
      return { ...next, dueAt: new Date(now.getTime() + minutes * 60_000) };
    }

    if (state.stage === 'new' || state.stage === 'learning') {
      // graduate after good/easy
      if (rating === 'easy') {
        next.stage = 'review';
        next.intervalDays = p.easyIntervalDays;
        next.ease = Math.min(3.2, state.ease + 0.1);
        return { ...next, dueAt: addDays(now, next.intervalDays) };
      }
      // hard keeps a short relearn step
      if (rating === 'hard') {
        next.stage = 'learning';
        return { ...next, dueAt: new Date(now.getTime() + minutes * 2 * 60_000) };
      }
      const consecutiveGood = state.stability + 1;
      if (consecutiveGood >= 2) {
        next.stage = 'review';
        next.intervalDays = p.graduatingIntervalDays;
        next.stability = consecutiveGood;
        return { ...next, dueAt: addDays(now, next.intervalDays) };
      }
      next.stage = 'learning';
      next.stability = consecutiveGood;
      return { ...next, dueAt: new Date(now.getTime() + minutes * 60_000) };
    }

    // review/mastered stage — SM-2 intervals
    const easeDelta = rating === 'hard' ? -0.15 : rating === 'good' ? 0 : 0.1;
    next.ease = Math.max(p.minEase, Math.min(3.2, state.ease + easeDelta));
    const mult = rating === 'hard' ? 1.2 : rating === 'good' ? next.ease : next.ease * 1.3;
    next.intervalDays = state.intervalDays > 0 ? Math.round(state.intervalDays * mult) : p.graduatingIntervalDays;
    next.stability = next.intervalDays;

    // mastered after a streak of successful long reviews
    if (next.intervalDays >= 21) next.stage = 'mastered';
    else next.stage = 'review';

    return { ...next, dueAt: addDays(now, next.intervalDays) };
  }
}

// ── FSRS-lite ───────────────────────────────────────────────────────────────
// Simplified three-component model: stability growth per rating, difficulty
// drift, interval = stability * requested retention factor.

export class FsrsLiteScheduler implements Scheduler {
  readonly name = 'fsrs-lite';
  readonly description = 'FSRS-inspired stability/difficulty model (lite).';

  defaultParams(): SchedulerParams {
    return { targetRetention: 0.9, againFactor: 0.4, hardFactor: 0.7, goodFactor: 1.0, easyFactor: 1.4, difficultyStep: 0.6, maxIntervalDays: 365 };
  }

  schedule(state: CardState, rating: Rating, params: SchedulerParams, now: Date): SchedulingResult {
    const p = { ...this.defaultParams(), ...params };
    const next: CardState = { ...state, reps: state.reps + 1, algorithm: this.name };

    const factor = rating === 'again' ? p.againFactor : rating === 'hard' ? p.hardFactor : rating === 'good' ? p.goodFactor : p.easyFactor;
    const dStep = p.difficultyStep * (rating === 'again' ? 1.5 : rating === 'hard' ? 1 : rating === 'good' ? 0.5 : -1);
    next.difficulty = clamp(state.difficulty + dStep, 1, 10);

    if (rating === 'again') {
      next.stability = Math.max(0.1, state.stability * factor);
      next.lapses = state.stage === 'review' || state.stage === 'mastered' ? state.lapses + 1 : state.lapses;
      next.stage = 'learning';
      next.intervalDays = 0;
      return { ...next, dueAt: new Date(now.getTime() + 10 * 60_000) };
    }

    next.stability = Math.max(0.3, state.stability * factor + (state.reps === 0 ? 0.5 : 0));
    const retentionGap = (1 - p.targetRetention) / p.targetRetention;
    next.intervalDays = Math.min(p.maxIntervalDays, Math.max(0.02, next.stability * retentionGap * 10));
    next.stage = next.intervalDays >= 21 ? 'mastered' : next.stage === 'new' ? 'review' : state.stage === 'learning' ? 'review' : state.stage;
    return { ...next, dueAt: addDays(now, next.intervalDays) };
  }
}

// ── Strength ladder (levels 1–12) ──────────────────────────────────────────
// A BunPro-style ranking laid over whichever scheduler produces the intervals
// (sm2, fsrs-lite, or a dev-registered one). The ladder is deliberately NOT a
// third scheduler: it reads the state a scheduler produced and answers "how
// strong is this memory" on one fixed 1–12 scale, so the queue, the review
// verdict and the staff progress panel can never disagree about a card.

export type SrsTier = 'beginner' | 'adept' | 'seasoned' | 'mastered';

export type SrsLevel = {
  /** 1–12. */
  level: number;
  tier: SrsTier;
  /** Display name, e.g. "Adept II". Level 12 carries no numeral — it is the summit. */
  label: string;
  /** Interval a review at this level earns, in hours. null = complete/burned. */
  hours: number | null;
  /** Compact interval chip ("4h", "2w", "6mo"). null at the summit. */
  interval: string | null;
};

export const SRS_LADDER: SrsLevel[] = [
  { level: 1, tier: 'beginner', label: 'Beginner I', hours: 4, interval: '4h' },
  { level: 2, tier: 'beginner', label: 'Beginner II', hours: 8, interval: '8h' },
  { level: 3, tier: 'beginner', label: 'Beginner III', hours: 24, interval: '1d' },
  { level: 4, tier: 'adept', label: 'Adept I', hours: 48, interval: '2d' },
  { level: 5, tier: 'adept', label: 'Adept II', hours: 96, interval: '4d' },
  { level: 6, tier: 'adept', label: 'Adept III', hours: 192, interval: '8d' },
  { level: 7, tier: 'seasoned', label: 'Seasoned I', hours: 336, interval: '2w' },
  { level: 8, tier: 'seasoned', label: 'Seasoned II', hours: 720, interval: '1mo' },
  { level: 9, tier: 'seasoned', label: 'Seasoned III', hours: 1440, interval: '2mo' },
  { level: 10, tier: 'mastered', label: 'Mastered I', hours: 2880, interval: '4mo' },
  { level: 11, tier: 'mastered', label: 'Mastered II', hours: 4320, interval: '6mo' },
  { level: 12, tier: 'mastered', label: 'Mastered', hours: null, interval: null },
];

/** The 6-month step is the last timed rung; anything past it is burned. */
const LAST_TIMED_DAYS = 180;

/**
 * Which rung a scheduler state sits on. Learning cards hold level 1 — they are
 * minutes away, whatever their history. Graduated cards map by interval: the
 * level whose step the current interval has reached, and anything scheduled
 * past the 6-month rung is burned (level 12).
 */
export function srsLevelFor(state: { stage: string; intervalDays: number }): number {
  if (state.stage === 'new' || state.stage === 'learning') return 1;
  const days = Math.max(0, state.intervalDays);
  let level = 1;
  for (const rung of SRS_LADDER) {
    if (rung.hours !== null && days >= rung.hours / 24) level = rung.level;
  }
  return days > LAST_TIMED_DAYS ? 12 : level;
}

export function srsLevelInfo(level: number): SrsLevel {
  return SRS_LADDER[Math.min(SRS_LADDER.length, Math.max(1, level)) - 1];
}

export function srsInfoForState(state: { stage: string; intervalDays: number }): SrsLevel {
  return srsLevelInfo(srsLevelFor(state));
}

/**
 * The same mapping as `srsLevelFor`, emitted as a raw SQL CASE over the
 * `card_user_states` columns, generated from the ladder so the SQL aggregate and
 * the JS function can never drift. Columns are unqualified: use it only in
 * single-table queries on card_user_states (GROUP BY and SELECT both want the
 * identical expression, so build it once and pass it twice).
 */
export function srsLevelCaseSql(): string {
  const timed = SRS_LADDER
    .filter((rung): rung is SrsLevel & { hours: number } => rung.hours !== null)
    .sort((a, b) => b.hours - a.hours);
  const whens = timed.map((rung) => `when interval_days >= ${rung.hours} / 24.0 then ${rung.level}`).join(' ');
  return `case when stage in ('new','learning') then 1 when interval_days > ${LAST_TIMED_DAYS} then 12 ${whens} else 1 end`;
}

// ── registry ────────────────────────────────────────────────────────────────
// Dev-added algorithms register here. Each gets tunable params stored in the
// srs_algorithm_config feature flag payload.

const registry = new Map<string, Scheduler>();
export function registerScheduler(s: Scheduler) {
  registry.set(s.name, s);
}
registerScheduler(new Sm2Scheduler());
registerScheduler(new FsrsLiteScheduler());

export function getScheduler(name: string, fallback = 'sm2'): Scheduler {
  return registry.get(name) ?? registry.get(fallback)!;
}

export function listSchedulers(): { name: string; description: string; defaultParams: SchedulerParams }[] {
  return [...registry.values()].map((s) => ({ name: s.name, description: s.description, defaultParams: s.defaultParams() }));
}

// ── helpers ─────────────────────────────────────────────────────────────────

export function newCardState(algorithm: string): CardState {
  return { stage: 'new', intervalDays: 0, ease: 2.5, stability: 0, difficulty: 5, lapses: 0, reps: 0, algorithm };
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
