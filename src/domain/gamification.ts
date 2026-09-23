// ── Gamification engine ─────────────────────────────────────────────────────
// Pure XP math, level curve, league tiers, streak dates. See §9.

export type League = 'bronze' | 'silver' | 'gold' | 'diamond' | 'legend';

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

/** Level curve: xp_for_level(n) = 50 * n^1.5 (cumulative). */
export function xpForLevel(level: number): number {
  return Math.round(50 * Math.pow(level, 1.5));
}

export function levelForXp(totalXp: number): { level: number; intoLevel: number; forNext: number } {
  let level = 1;
  while (xpForLevel(level + 1) <= totalXp && level < 999) level += 1;
  const currentFloor = xpForLevel(level);
  const nextFloor = xpForLevel(level + 1);
  return { level, intoLevel: totalXp - currentFloor, forNext: nextFloor - currentFloor };
}

// ── leagues ─────────────────────────────────────────────────────────────────

export const LEAGUE_ORDER: League[] = ['bronze', 'silver', 'gold', 'diamond', 'legend'];

export function leagueForWeeklyXp(weeklyXp: number, rankPercentile: number): League {
  if (weeklyXp <= 0) return 'bronze';
  if (rankPercentile <= 0.1) return 'legend';
  if (rankPercentile <= 0.25) return 'diamond';
  if (rankPercentile <= 0.5) return 'gold';
  if (rankPercentile <= 0.75) return 'silver';
  return 'bronze';
}

export const LEAGUE_META: Record<League, { name: string; icon: string; color: string }> = {
  bronze: { name: 'Bronze', icon: '🥉', color: '#b08d57' },
  silver: { name: 'Silver', icon: '🥈', color: '#c0c0c0' },
  gold: { name: 'Gold', icon: '🥇', color: '#ffd700' },
  diamond: { name: 'Diamond', icon: '💎', color: '#7ee8fa' },
  legend: { name: 'Legend', icon: '👑', color: '#b388ff' },
};

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
