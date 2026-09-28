#!/usr/bin/env tsx
/**
 * Emit golden vectors from the web's rank rules and copy module.
 *
 * Two things on the phone are *not* decided by a payload and therefore have to be
 * carried: the ladder (the screen draws rungs nobody has reached, which are not
 * facts about anybody) and the sentences (a phone that invented its own words for
 * "Good morning" would drift the moment the copy changed).
 *
 * Carrying them is only honest if the copies agree with the original on every
 * case that matters, so this freezes the original's behaviour into JSON:
 *
 *   • `src/domain/ranked.ts`  — the ladder, `rankFor`, `formFor`, `zoneBand`
 *   • `src/lib/profile.ts`    — greeting, openers, session summary, companion, lobby line
 *
 * The Kotlin and Swift conformance tests read the same file and fail the build if
 * their port disagrees on any vector. Rank and voice therefore still have one
 * owner: the TypeScript source. The ports are copies proven equal, not rival
 * authorities.
 *
 *   npx tsx scripts/native/copy-vectors.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  DIVISION_LABEL,
  DIVISION_SPAN,
  RANK_LADDER,
  TIER_ORDER,
  TOP_OF_LADDER,
  formFor,
  rankFor,
  reviewsForRp,
  tierName,
  zoneBand,
} from '../../src/domain/ranked';
import {
  companionFor,
  emptyQueueLine,
  firstName,
  greeting,
  initials,
  lobbyLine,
  openers,
  sessionSummary,
} from '../../src/lib/profile';

/** `now` with a chosen local hour, so the greeting is deterministic to test. */
const atHour = (hour: number) => new Date(2026, 0, 1, hour, 30, 0);

// ── the ladder and the rank maths ───────────────────────────────────────────

const XP_SAMPLES = [
  0, 1, 119, 120, 239, 240, 359, 360, 599, 600, 959, 960, 1559, 1560, 1559 + 750,
  TOP_OF_LADDER, TOP_OF_LADDER + 500, 999_999,
];

const rankCases = XP_SAMPLES.map((xp) => ({ xp, expected: rankFor(xp) }));

const formCases = [
  { reviewed: 0, correct: 0 },
  { reviewed: 3, correct: 3 },
  { reviewed: 4, correct: 4 },
  { reviewed: 10, correct: 9 },
  { reviewed: 10, correct: 7 },
  { reviewed: 10, correct: 4 },
  { reviewed: 3, correct: 1 },
].map((input) => ({ ...input, expected: formFor(input.reviewed, input.correct) }));

const zoneCases = [0, 1, 4, 10, 29, 30, 31, 60].map((size) => ({ size, expected: zoneBand(size) }));

const reviewRpCases = [0, 1, 9, 10, 11, 120, 750].map((rp) => ({ rp, expected: reviewsForRp(rp) }));

// ── the words ───────────────────────────────────────────────────────────────

const greetingCases = [0, 4, 5, 11, 12, 17, 18, 22, 23].map((hour) => ({
  hour,
  expected: greeting(atHour(hour)),
}));

const nameCases = [
  { name: 'Smoke Tester' },
  { name: '  Tayyab  ' },
  { name: 'Ada Lovelace Byron' },
  { name: 'Prince' },
  { name: '' },
].map((input) => ({ ...input, first: firstName(input.name), initials: initials(input.name) }));

const summaryCases = [
  { correct: 0, total: 0 },
  { correct: 3, total: 3 },
  { correct: 4, total: 5 },
  { correct: 1, total: 2 },
  { correct: 1, total: 4 },
].map((input) => ({ ...input, expected: sessionSummary(input.correct, input.total) }));

const emptyCases = [
  { due: 0, streak: 0 },
  { due: 0, streak: 4 },
  { due: 3, streak: 4 },
].map((input) => ({ ...input, expected: emptyQueueLine(input.due, input.streak) }));

const openerCases = [
  { due: 0, streak: 0, level: 1, subject: null },
  { due: 1, streak: 1, level: 1, subject: 'Biology' },
  { due: 7, streak: 12, level: 9, subject: 'Chemistry' },
  { due: 0, streak: 3, level: 2, subject: null },
].map((input) => ({
  ...input,
  expected: openers({
    due: input.due,
    streak: input.streak,
    level: input.level,
    subjects: input.subject ? [input.subject] : [],
  }),
}));

const lobbyCases = [
  { zone: 'pending', position: 0, size: 30, daysLeft: 5, rankLabel: 'Silver II' },
  { zone: 'promotion', position: 3, size: 30, daysLeft: 1, rankLabel: 'Silver II' },
  { zone: 'demotion', position: 28, size: 30, daysLeft: 2, rankLabel: 'Silver II' },
  { zone: 'safe', position: 14, size: 30, daysLeft: 6, rankLabel: 'Bronze I' },
].map((input) => ({ ...input, expected: lobbyLine(input as never) }));

type CompanionInput = {
  name: string;
  due: number;
  reviewed: number;
  correct: number;
  streak: number;
  bestStreak: number;
  level: number;
  totalXp: number;
  rankLabel?: string;
  hour: number;
};

const companionBase = {
  name: 'Smoke Tester',
  role: 'student',
  due: 0,
  reviewed: 0,
  correct: 0,
  streak: 0,
  bestStreak: 0,
  level: 1,
  subjects: [] as string[],
  totalXp: 0,
};

const companionCases: CompanionInput[] = [
  // 1 — a brand new account.
  { name: 'Smoke Tester', due: 0, reviewed: 0, correct: 0, streak: 0, bestStreak: 0, level: 1, totalXp: 0, hour: 10 },
  // 2 — a gap worth acknowledging.
  { name: 'Smoke Tester', due: 4, reviewed: 0, correct: 0, streak: 0, bestStreak: 6, level: 4, totalXp: 900, hour: 14 },
  // 3 — the queue is clear, clean sheet and otherwise.
  { name: 'Smoke Tester', due: 0, reviewed: 5, correct: 5, streak: 3, bestStreak: 6, level: 4, totalXp: 1200, rankLabel: 'Silver II', hour: 19 },
  { name: 'Smoke Tester', due: 0, reviewed: 8, correct: 6, streak: 3, bestStreak: 6, level: 4, totalXp: 1200, rankLabel: 'Silver II', hour: 19 },
  // 4 — mid-session.
  { name: 'Smoke Tester', due: 6, reviewed: 4, correct: 3, streak: 3, bestStreak: 6, level: 4, totalXp: 1200, rankLabel: 'Bronze I', hour: 16 },
  // 5 — the nudge, day and night.
  { name: 'Smoke Tester', due: 9, reviewed: 0, correct: 0, streak: 5, bestStreak: 6, level: 4, totalXp: 1200, hour: 15 },
  { name: 'Smoke Tester', due: 9, reviewed: 0, correct: 0, streak: 5, bestStreak: 6, level: 4, totalXp: 1200, hour: 2 },
  { name: 'Smoke Tester', due: 9, reviewed: 0, correct: 0, streak: 0, bestStreak: 1, level: 4, totalXp: 1200, hour: 23 },
  // 6 — nothing due and nothing done.
  { name: 'Smoke Tester', due: 0, reviewed: 0, correct: 0, streak: 2, bestStreak: 2, level: 3, totalXp: 400, hour: 11 },
];

const companionVectors = companionCases.map((input) => {
  const snap = {
    ...companionBase,
    ...input,
  };
  const read = companionFor(snap as never, atHour(input.hour));
  return { input, expected: { tone: read.tone, line: read.line, actionLabel: read.action.label } };
});

// ── the file ────────────────────────────────────────────────────────────────

const payload = {
  version: 1,
  generatedFrom: ['src/domain/ranked.ts', 'src/lib/profile.ts'],
  note: 'Golden rank and copy vectors. Native ports must reproduce `expected` exactly.',
  ladder: {
    tiers: TIER_ORDER,
    divisionSpan: DIVISION_SPAN,
    divisionLabel: DIVISION_LABEL,
    rungCount: RANK_LADDER.length,
    topOfLadder: TOP_OF_LADDER,
    rungs: RANK_LADDER,
    tierNames: TIER_ORDER.map((tier) => ({ tier, expected: tierName(tier) })),
  },
  rankFor: rankCases,
  formFor: formCases,
  zoneBand: zoneCases,
  reviewsForRp: reviewRpCases,
  greeting: greetingCases,
  names: nameCases,
  sessionSummary: summaryCases,
  emptyQueueLine: emptyCases,
  openers: openerCases,
  lobbyLine: lobbyCases,
  companionFor: companionVectors,
};

const outDir = path.join(process.cwd(), 'mobile', 'shared');
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'copy-vectors.json');
writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`);

const total =
  rankCases.length +
  formCases.length +
  zoneCases.length +
  reviewRpCases.length +
  greetingCases.length +
  nameCases.length +
  summaryCases.length +
  emptyCases.length +
  openerCases.length +
  lobbyCases.length +
  companionVectors.length;

console.log(
  `wrote ${total} vectors (${RANK_LADDER.length} rungs, top of ladder ${TOP_OF_LADDER} RP) to ${path.relative(process.cwd(), outFile)}`,
);
