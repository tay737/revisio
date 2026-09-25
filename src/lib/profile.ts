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

// ── the companion ───────────────────────────────────────────────────────────
// The product brief was "a studying companion alongside being a tool". A
// companion is a *presence with a state*, not a nicer string: it has to notice
// where you are and say the one thing that fits. That decision is a pure
// function here so every surface gives the same answer for the same numbers,
// and so the ordering of those decisions is written down once.
//
// The order below is the policy, and it is not arbitrary:
//   1. never reviewed anything        → welcome, and hand over one action
//   2. back after a real gap          → acknowledge it without scolding
//   3. queue empty, work already done → name the achievement
//   4. mid-session, queue remaining   → keep the momentum
//   5. queue full, nothing done       → the nudge
//   6. genuinely nothing to do        → offer a choice, don't nag
//
// Voice is unchanged from the rest of this module: second person, no
// exclamation marks, no emoji, never says the same thing twice.

export type CompanionTone =
  | 'welcome'
  | 'returning'
  | 'praise'
  | 'momentum'
  | 'nudge'
  | 'open';

export type CompanionSnapshot = LearnerSnapshot & {
  /** Total XP to date — the one number that distinguishes a new account. */
  totalXp: number;
  /** "Silver II", if the learner holds a rank. */
  rankLabel?: string;
};

export type CompanionRead = {
  tone: CompanionTone;
  line: string;
  action: { label: string; href: string };
};

export function companionFor(snap: CompanionSnapshot, now: Date = new Date()): CompanionRead {
  const { due, reviewed, correct, streak, bestStreak, totalXp, rankLabel } = snap;
  const rank = rankLabel ? ` ${rankLabel}` : '';

  // 1 — a brand new account. The one moment the app must not be coy.
  if (totalXp <= 0 && reviewed === 0) {
    return {
      tone: 'welcome',
      line: `Nothing here yet, ${firstName(snap.name)} — which is the good part. Ten minutes on the first topic and the scheduler starts working for you tonight.`,
      action: { label: 'Pick a topic', href: '/library' },
    };
  }

  // 2 — a gap worth acknowledging. Best-streak is the proof they were serious.
  if (streak === 0 && bestStreak >= 3 && reviewed === 0) {
    return {
      tone: 'returning',
      line: `You had ${bestStreak} days going. Nothing is lost — the queue has held your place, and it only takes today to start the next run.`,
      action: { label: 'Resume where you left off', href: due > 0 ? '/review' : '/learn' },
    };
  }

  // 3 — the work is done. Name it in their own numbers.
  if (due === 0 && reviewed > 0) {
    const clean = correct === reviewed;
    return {
      tone: clean ? 'praise' : 'open',
      line: clean
        ? `${reviewed} for ${reviewed}. That is a clean sheet, and it${rank ? ` is why you are holding${rank}` : ''}.`
        : `${reviewed} answered and the queue is clear${rank ? ` — still${rank}` : ''}. Days like this are what hold a rank together.`,
      action: { label: 'See the ladder', href: '/progress' },
    };
  }

  // 4 — mid-session. Short, because they are in the middle of something.
  if (reviewed > 0 && due > 0) {
    return {
      tone: 'momentum',
      line: `${reviewed} down, ${due} to go. You are faster on these than you were at the start.`,
      action: { label: 'Carry on', href: '/review' },
    };
  }

  // 5 — the nudge. Late at night it is an offer, not an order.
  if (due > 0) {
    const late = now.getHours() >= 23 || now.getHours() < 5;
    return {
      tone: 'nudge',
      line: late
        ? `${due} cards are due. Five of them would keep ${streak > 0 ? `day ${streak}` : 'the streak algorithm'} happy — the rest can wait for tomorrow.`
        : `${due} cards due, and nothing in there you have not seen before. Worth doing while they are still easy.`,
      action: { label: 'Start the queue', href: '/review' },
    };
  }

  // 6 — nothing due and nothing done: an invitation, not a reprimand.
  return {
    tone: 'open',
    line: 'Nothing is due, which means today is optional — the best kind. Get ahead on a topic, or protect the rank with a quick cram.',
    action: { label: 'Get ahead', href: '/learn' },
  };
}

/**
 * The lobby's line for the current week. Competitive framing without
 * aggression: the zone is a fact, and the sentence explains what it means.
 */
export function lobbyLine(input: {
  zone: 'promotion' | 'safe' | 'demotion' | 'pending';
  position: number;
  size: number;
  daysLeft: number;
  rankLabel: string;
}): string {
  const { zone, position, size, daysLeft, rankLabel } = input;
  const days = daysLeft === 1 ? 'Today is the last day' : `${daysLeft} days left`;
  if (zone === 'pending') {
    return `We are still placing you. A few more reviews and we will seat you in a ${rankLabel} lobby.`;
  }
  if (zone === 'promotion') {
    return `${position} of ${size} — you are inside the promotion zone. ${days}; holding this seat moves you up a rung.`;
  }
  if (zone === 'demotion') {
    return `${position} of ${size} — that is the demotion band. One session pulls you clear of it.`;
  }
  return `${position} of ${size} — safe, and close enough to the promotion band to take it. ${days}.`;
}
