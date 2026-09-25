// ── Gamification engine ─────────────────────────────────────────────────────
// Pure XP math, level curve, league tiers, streak dates. See §9.

export const XP_PER_CORRECT: Record<string, number> = {
  cloze: 10,
  mcq: 8,
  flashcard: 12,
};

export const STREAK_BONUS = {
  week: 1.1, // >= 7 days
  month: 1.25, // >= 30 days
};

/** XP for one graded review. Wrong answers earn nothing (partial feedback on near-miss). */
export function xpForReview(input: {
  cardKind: string;
  correct: boolean;
  nearMiss?: boolean;
  streakDays: number;
  /** how many times this card was already reviewed today (anti-grind) */
  timesToday?: number;
}): number {
  if (!input.correct) return input.nearMiss ? 2 : 0;
  const base = XP_PER_CORRECT[input.cardKind] ?? 8;
  let xp = base;
  if (input.streakDays >= 30) xp = Math.round(xp * STREAK_BONUS.month);
  else if (input.streakDays >= 7) xp = Math.round(xp * STREAK_BONUS.week);
  const t = input.timesToday ?? 1;
  if (t > 5) xp = Math.max(1, Math.round(xp * 0.5)); // anti-grind decay
  return xp;
}

/**
 * Level curve: cumulative XP required to *enter* a level.
 * `threshold(n) = 50 * (n - 1)^1.5`, so level 1 starts at 0 XP, level 2 at 50,
 * level 3 at 141, level 4 at 260. The original `50 * n^1.5` made level 1 start
 * at 50 XP, which left every new account showing a negative progress bar
 * (`-50 / 91 XP`) and a meter pinned at full width.
 */
export function xpForLevel(level: number): number {
  return level <= 1 ? 0 : Math.round(50 * Math.pow(level - 1, 1.5));
}

export function levelForXp(totalXp: number): { level: number; intoLevel: number; forNext: number } {
  let level = 1;
  while (xpForLevel(level + 1) <= totalXp && level < 999) level += 1;
  const currentFloor = xpForLevel(level);
  const nextFloor = xpForLevel(level + 1);
  return { level, intoLevel: totalXp - currentFloor, forNext: nextFloor - currentFloor };
}

// ── ranks & leagues ─────────────────────────────────────────────────────────
// Moved to `domain/ranked.ts`. It is the one owner of tiers, divisions, RP and
// the weekly lobby's promotion/demotion bands. The old `LEAGUE_META` also lived
// here and carried a hex colour *and an emoji* per tier — four extra accents
// and a second illustration language inside a one-accent, one-icon system.
// Rank is now coded by geometry; see `crestFor()`.

export type { League, Tier } from './ranked';

// ── streaks ─────────────────────────────────────────────────────────────────

export function utcDateKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function yesterdayKey(d: Date = new Date()): string {
  return new Date(d.getTime() - 86_400_000).toISOString().slice(0, 10);
}

/** Given current streak state and a new activity date, compute the next streak. */
export function nextStreak(current: { current: number; best: number; lastActiveDate: string | null }, activityDate: string): { current: number; best: number; lastActiveDate: string } {
  if (current.lastActiveDate === activityDate) {
    return { current: current.current, best: Math.max(current.best, current.current), lastActiveDate: activityDate };
  }
  if (current.lastActiveDate === yesterdayKey()) {
    const next = current.current + 1;
    return { current: next, best: Math.max(current.best, next), lastActiveDate: activityDate };
  }
  if (current.lastActiveDate && current.lastActiveDate < yesterdayKey()) {
    return { current: 1, best: current.best, lastActiveDate: activityDate };
  }
  return { current: 1, best: Math.max(current.best, 1), lastActiveDate: activityDate };
}

// ── achievements ────────────────────────────────────────────────────────────

export type AchievementRule = { kind: string; threshold?: number; scope?: string };

export type AchievementFacts = {
  totalReviews: number;
  streakDays: number;
  totalXp: number;
  lastSessionCorrect: number;
  lastSessionTotal: number;
};

export function evaluateAchievements(rules: { id: string; rule: AchievementRule }[], facts: AchievementFacts): string[] {
  const unlocked: string[] = [];
  for (const { id, rule } of rules) {
    const t = rule.threshold ?? 1;
    switch (rule.kind) {
      case 'review_count':
        if (facts.totalReviews >= t) unlocked.push(id);
        break;
      case 'streak':
        if (facts.streakDays >= t) unlocked.push(id);
        break;
      case 'xp_total':
        if (facts.totalXp >= t) unlocked.push(id);
        break;
      case 'perfect_session':
        if (facts.lastSessionTotal >= t && facts.lastSessionCorrect === facts.lastSessionTotal) unlocked.push(id);
        break;
      default:
        break;
    }
  }
  return unlocked;
}
