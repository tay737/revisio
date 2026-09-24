// Personalisation — pure functions, no React, no fetching. The app reads a
// learner snapshot and asks these for the words. Keeping the copy here (rather
// than inline in JSX) means it is testable, consistent across every surface,
// and the only place that decides how Revisio talks to someone.
//
// Voice notes: second person, quiet confidence, no exclamation marks, no
// emoji (the design system reserves colour for Action Blue). Teasing is fine;
// nagging is not. Every line should be true of the numbers we were given.

export type LearnerSnapshot = {
  name: string;
  role: string;
  due: number;
  reviewed: number;
  correct: number;
  streak: number;
  bestStreak: number;
  level: number;
  intoLevel: number;
  forNext: number;
  subjects: string[];
};

export function firstName(name: string): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return 'there';
  return trimmed.split(/\s+/)[0];
}

export function initials(name: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'R';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Time-of-day greeting. Late night gets acknowledged rather than scolded. */
export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  if (h < 23) return 'Good evening';
  return 'Late session';
}

export function greetingFor(name: string, now: Date = new Date()): string {
  return `${greeting(now)}, ${firstName(name)}`;
}

/**
 * Conversation starters for WordRotate on the dashboard. All are answers to
 * "what is this session actually about", so the rotation never feels random.
 */
export function openers(snap: Pick<LearnerSnapshot, 'due' | 'streak' | 'level' | 'subjects'>, now: Date = new Date()): string[] {
  const lines: string[] = [];
  if (snap.due > 0) {
    lines.push(`${snap.due} ${snap.due === 1 ? 'card is' : 'cards are'} waiting`);
    lines.push(`Let's clear today's queue`);
  } else {
    lines.push(`Nothing is due — you're ahead`);
    lines.push(`Want to get ahead instead?`);
  }
  if (snap.streak >= 2) lines.push(`Day ${snap.streak} of your streak`);
  if (snap.level > 1) lines.push(`Level ${snap.level} — keep it moving`);
  const subject = snap.subjects[0];
  if (subject) lines.push(`Back to ${subject}?`);
  return lines.length > 0 ? Array.from(new Set(lines)) : ["Let's get started"];
}

/**
 * The one-line nudge under the greeting. Ordered by what matters most right
 * now: unpaid queue, then today's work, then streak, then a quiet default.
 */
export function nudge(snap: Pick<LearnerSnapshot, 'due' | 'reviewed' | 'correct' | 'streak'>): string {
  const { due, reviewed, correct, streak } = snap;

  if (due > 0 && reviewed > 0) {
    return `${reviewed} in — ${due} still due. Momentum favours you.`;
  }
  if (due > 0 && due <= 10) {
    return `Only ${due} left. This is a short one.`;
  }
  if (due > 0) {
    return `${due} cards due. Nothing here you haven't met before.`;
  }
  if (reviewed > 0) {
    const accuracy = reviewed > 0 ? Math.round((correct / reviewed) * 100) : 0;
    if (accuracy === 100) return `Queue empty, ${reviewed} for ${reviewed}. That's a clean sheet.`;
    return `Queue clear — ${reviewed} reviews logged today.`;
  }
  if (streak >= 7) {
    return `${streak} days unbroken. Today just needs one review.`;
  }
  // Deliberately does not restate "nothing is due" — the rotating headline
  // above already says that, and hearing it twice reads as a bug.
  return 'Pick a topic and set tomorrow up well.';
}

/**
 * Level progress as a 0–100 integer for the meter width.
 * Clamped on purpose: a bad ratio used to produce a negative percentage, which
 * is invalid CSS, so the browser dropped the rule and the bar rendered full.
 */
export function levelPercent(snap: Pick<LearnerSnapshot, 'intoLevel' | 'forNext'>): number {
  if (!snap.forNext || snap.forNext <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((snap.intoLevel / snap.forNext) * 100)));
}

/** Progress-bar caption: how close the next level actually is. */
export function levelCaption(snap: Pick<LearnerSnapshot, 'level' | 'intoLevel' | 'forNext'>): string {
  const remaining = Math.max(0, snap.forNext - snap.intoLevel);
  if (remaining === 0) return `Level ${snap.level} complete`;
  const reviews = Math.max(1, Math.ceil(remaining / 12));
  return `${remaining} XP to Level ${snap.level + 1} — about ${reviews} ${reviews === 1 ? 'review' : 'reviews'}`;
}

/** Post-session copy. Score first, then one sentence that explains it. */
export function sessionSummary(correct: number, total: number): string {
  if (total === 0) return 'No cards answered yet.';
  const pct = Math.round((correct / total) * 100);
  if (pct === 100) return `${correct} for ${total}. Every one of them.`;
  if (pct >= 80) return `${correct} for ${total} — that's the recall we want.`;
  if (pct >= 50) return `${correct} for ${total}. The misses are the useful part.`;
  return `${correct} for ${total}. Worth a pass over the notes before the next run.`;
}

/** Empty-state copy that hands the learner a next action rather than a shrug. */
export function emptyQueueLine(due: number, streak: number): string {
  if (due === 0 && streak > 0) return `Your schedule is clear and your ${streak}-day streak is safe. Anything you do now is a head start.`;
  return 'Your schedule is clear. Cram a topic, read ahead, or come back tomorrow.';
}
