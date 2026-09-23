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
