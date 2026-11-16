import 'server-only';

// ── streak protection ───────────────────────────────────────────────────────

export type StreakState = {
  current: number;
  best: number;
  lastActiveDate: string | null; // YYYY-MM-DD, UTC
  freezes: number;
};

export type StreakEventKind = 'milestone' | 'freeze_earned' | 'freeze_used' | 'gap' | 'comeback' | 'repair';
export type StreakEvent = {
  kind: StreakEventKind;
  streakBefore: number;
  streakAfter: number;
  meta?: Record<string, unknown>;
};

export const STREAK_FREEZE_EVERY_DAYS = 7;
export const STREAK_MAX_FREEZES = 3;

function utcDayNumber(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}

export function addUtcDays(date: string, days: number): string {
  return new Date((utcDayNumber(date) + days) * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Pure streak transition. Freezes are earned every 7th consecutive day (cap 3)
 * and spent one-per-missed-day on the next gap. A break is never punished with
 * shame copy — it is recorded as a `comeback` event carrying the previous run.
 */
export function nextStreakState(state: StreakState, activityDate: string): { state: StreakState; events: StreakEvent[] } {
  const events: StreakEvent[] = [];
  const base = { best: Math.max(state.best, state.current), freezes: state.freezes };

  if (!state.lastActiveDate || state.current <= 0) {
    return { state: { current: 1, ...base, lastActiveDate: activityDate }, events };
  }
  if (state.lastActiveDate === activityDate) {
    return { state: { ...state, best: base.best }, events };
  }
  // Out-of-order write (e.g. a review processed across a UTC midnight boundary):
  // never regress lastActiveDate or spend a freeze on a day that already passed.
  if (utcDayNumber(activityDate) < utcDayNumber(state.lastActiveDate)) {
    return { state: { ...state, best: base.best }, events };
  }

  const gap = utcDayNumber(activityDate) - utcDayNumber(state.lastActiveDate) - 1;
  if (gap <= 0) {
    // Consecutive day (or an out-of-order same-week write): extend.
    const current = state.current + 1;
    let freezes = state.freezes;
    if (current % STREAK_FREEZE_EVERY_DAYS === 0 && freezes < STREAK_MAX_FREEZES) {
      freezes += 1;
      events.push({ kind: 'freeze_earned', streakBefore: current, streakAfter: current, meta: { freezes } });
    }
    return {
      state: { current, best: Math.max(base.best, current), lastActiveDate: activityDate, freezes },
      events,
    };
  }

  if (state.freezes >= gap) {
    const freezes = state.freezes - gap;
    const current = state.current + 1;
    events.push({
      kind: 'freeze_used',
      streakBefore: state.current,
      streakAfter: current,
      meta: { missedDays: gap, freezesUsed: gap, freezes },
    });
    return { state: { current, best: Math.max(base.best, current), lastActiveDate: activityDate, freezes }, events };
  }

  // The run ended. Keep the banked freezes; record the comeback honestly.
  events.push({
    kind: 'comeback',
    streakBefore: state.current,
    streakAfter: 1,
    meta: { missedDays: gap, previousStreak: state.current, freezes: state.freezes },
  });
  return { state: { current: 1, best: base.best, lastActiveDate: activityDate, freezes: state.freezes }, events };
}

// ── reminders / quiet hours ─────────────────────────────────────────────────

export type ReminderTrigger = 'dueCards' | 'streakRisk' | 'seasonEnding' | 'achievement' | 'weeklyRecap' | 'leagueEnding' | 'examCountdown';
export const REMINDER_TRIGGERS: ReminderTrigger[] = ['dueCards', 'streakRisk', 'seasonEnding', 'achievement', 'weeklyRecap', 'leagueEnding', 'examCountdown'];

export type ReminderPrefs = {
  enabled: boolean;
  /** HH:mm, learner-local wall clock. */
  localTime: string;
  timezone: string;
  quietStart?: string | null;
  quietEnd?: string | null;
  triggers?: Record<string, boolean>;
};

const LOCAL_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function isValidLocalTime(value: string): boolean {
  return LOCAL_TIME_RE.test(value);
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Learner-local date + minute-of-day for `now` in `tz`. */
export function localDateTimeParts(now: Date, tz: string): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const hour = Number(get('hour')) % 24;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: hour * 60 + Number(get('minute')),
  };
}

/**
 * Quiet hours may wrap midnight (22:00→07:00). Equal start/end means "no
 * quiet window" rather than "always quiet".
 */
export function inQuietHours(now: Date, tz: string, quietStart?: string | null, quietEnd?: string | null): boolean {
  if (!quietStart || !quietEnd || quietStart === quietEnd) return false;
  if (!isValidLocalTime(quietStart) || !isValidLocalTime(quietEnd)) return false;
  const { minutes } = localDateTimeParts(now, tz);
  const start = toMinutes(quietStart);
  const end = toMinutes(quietEnd);
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

/**
 * Whether `now` falls inside the send window for the learner's chosen local
 * time. `windowMinutes` is the scheduler's tick tolerance — a 15-minute cron
 * still lands inside the learner's chosen hour rather than drifting.
 */
export function reminderWindowOpen(prefs: ReminderPrefs, now: Date, windowMinutes = 15): boolean {
  if (!prefs.enabled || !isValidLocalTime(prefs.localTime) || !isValidTimeZone(prefs.timezone)) return false;
  if (inQuietHours(now, prefs.timezone, prefs.quietStart, prefs.quietEnd)) return false;
  const { minutes } = localDateTimeParts(now, prefs.timezone);
  const target = toMinutes(prefs.localTime);
  const diff = (minutes - target + 1440) % 1440;
  return diff >= 0 && diff < windowMinutes;
}

/** Dedupe key for one learner-local day; seasons use their own key. */
export function reminderDedupeKey(kind: string, now: Date, tz: string): string {
  return `${kind}:${localDateTimeParts(now, tz).date}`;
}

// ── challenges & goals ──────────────────────────────────────────────────────

export type ChallengeMetric = 'reviews' | 'correct' | 'perfect_session' | 'topics_mastered' | 'streak' | 'xp';
export type ChallengePeriod = 'daily' | 'weekly';

export type ChallengeDef = {
  id: string;
  period: ChallengePeriod;
  metric: ChallengeMetric;
  target: number;
  title: string;
  description: string;
  rewardXp: number;
};

export const CHALLENGES: ChallengeDef[] = [
  { id: 'daily-reviews-10', period: 'daily', metric: 'reviews', target: 10, title: 'Ten today', description: 'Review 10 cards today.', rewardXp: 15 },
  { id: 'daily-reviews-25', period: 'daily', metric: 'reviews', target: 25, title: 'Twenty-five today', description: 'Review 25 cards today.', rewardXp: 30 },
  { id: 'daily-perfect-session', period: 'daily', metric: 'perfect_session', target: 1, title: 'Clean sheet', description: 'Finish a session with no misses.', rewardXp: 20 },
  { id: 'weekly-reviews-100', period: 'weekly', metric: 'reviews', target: 100, title: 'Century week', description: 'Review 100 cards this week.', rewardXp: 75 },
  { id: 'weekly-topics-3', period: 'weekly', metric: 'topics_mastered', target: 3, title: 'Three topics down', description: 'Master every card in 3 topics this week.', rewardXp: 60 },
  { id: 'weekly-streak-7', period: 'weekly', metric: 'streak', target: 7, title: 'Week of showing up', description: 'Hold a 7-day streak.', rewardXp: 50 },
];

/** Period bucket: UTC date for daily, the Monday of the UTC week for weekly. */
export function challengePeriodStart(now: Date, period: ChallengePeriod): string {
  const date = now.toISOString().slice(0, 10);
  if (period === 'daily') return date;
  const day = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0=Sun
  const back = (day + 6) % 7;
  return addUtcDays(date, -back);
}

// ── exam countdown & cram plan ──────────────────────────────────────────────

/** Whole days from `now` to `examDate` (YYYY-MM-DD). Negative once it has passed. */
export function daysUntil(examDate: string, now = new Date()): number {
  const today = now.toISOString().slice(0, 10);
  return Math.round((utcDayNumber(examDate) - utcDayNumber(today)));
}

export type PlanPace = {
  daysLeft: number;
  topicsTotal: number;
  topicsRemaining: number;
  perDayNeeded: number;
  dailyTarget: number;
  onTrack: boolean;
};

export function planPace(input: {
  examDate: string;
  topicsTotal: number;
  topicsRemaining: number;
  dailyTarget: number;
  now?: Date;
}): PlanPace {
  const daysLeft = Math.max(0, daysUntil(input.examDate, input.now));
  const topicsRemaining = Math.max(0, input.topicsRemaining);
  const perDayNeeded = daysLeft > 0 ? Math.ceil(topicsRemaining / daysLeft) : topicsRemaining;
  return {
    daysLeft,
    topicsTotal: input.topicsTotal,
    topicsRemaining,
    perDayNeeded,
    dailyTarget: input.dailyTarget,
    onTrack: topicsRemaining === 0 || perDayNeeded <= input.dailyTarget,
  };
}

// ── safe social ─────────────────────────────────────────────────────────────

/** Canonical pair key — one row per unordered pair. */
export function socialPairKey(a: string, b: string): string {
  return [a, b].sort().join(':');
}

export type FriendBoardEntry = {
  userId: string;
  name: string;
  username: string | null;
  avatarColor: string | null;
  weeklyXp: number;
  streak: number;
  rank: number | null;
};

/**
 * Friend boards are private by construction: only accepted connections, and
 * only fields the *viewer* is allowed to see on profiles they could already
 * open. Leaderboard opt-out hides a learner from every board, friend or not.
 */
export function friendBoardVisible(opts: {
  connectionStatus: string;
  viewerIsParticipant: boolean;
  subjectLeaderboardOptOut: boolean;
}): boolean {
  return opts.connectionStatus === 'accepted' && opts.viewerIsParticipant && !opts.subjectLeaderboardOptOut;
}
