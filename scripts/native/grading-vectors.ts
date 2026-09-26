#!/usr/bin/env tsx
/**
 * Emit golden vectors from the canonical grading engine.
 *
 * `src/domain/grading.ts` is the one implementation of every grading rule and
 * its contract is that the client may preview but never decide. The native apps
 * need that same engine locally — offline review must grade with no server — so
 * each platform carries a *port* of it. A port is only honest if it agrees with
 * the original on every case that matters.
 *
 * This script freezes the original's behaviour into JSON. The Kotlin and Swift
 * conformance tests read the same file and fail the build if their port
 * disagrees with the TS engine on any vector. Grading therefore still has one
 * owner: the TypeScript source. The ports are copies proven equal, not rival
 * authorities.
 *
 *   npx tsx scripts/native/grading-vectors.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  gradeCloze,
  gradeFlashcard,
  gradeMcq,
  type AcceptedAnswer,
  type Verdict,
} from '../../src/domain/grading';

type Vector = {
  fn: 'gradeCloze' | 'gradeFlashcard' | 'gradeMcq';
  name: string;
  input: unknown;
  expected: Record<string, unknown>;
};

/** Drop undefined so the JSON matches what an omitted field means everywhere. */
function present(verdict: Verdict): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(verdict)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

const answer = (id: string, text: string, extra: Partial<AcceptedAnswer> = {}): AcceptedAnswer => ({
  id,
  text,
  isPrimary: true,
  ...extra,
});

const vectors: Vector[] = [];
const push = (fn: Vector['fn'], name: string, input: unknown, verdict: Verdict) =>
  vectors.push({ fn, name, input, expected: present(verdict) });

// ── cloze ───────────────────────────────────────────────────────────────────
const atp = [answer('a1', 'ATP'), answer('a2', 'adenosine triphosphate')];

push('gradeCloze', 'exact match', { answer: 'ATP', accepted: atp }, gradeCloze('ATP', atp));
push('gradeCloze', 'whitespace is normalised', { answer: '  ATP  ', accepted: atp }, gradeCloze('  ATP  ', atp));
push('gradeCloze', 'case-only difference is correct with a nudge', { answer: 'atp', accepted: atp }, gradeCloze('atp', atp));
push(
  'gradeCloze',
  'punctuation-only difference is correct with a nudge',
  { answer: 'ATP.', accepted: atp },
  gradeCloze('ATP.', atp),
);
push(
  'gradeCloze',
  'case and punctuation together are still correct',
  { answer: 'atp.', accepted: atp },
  gradeCloze('atp.', atp),
);
push(
  'gradeCloze',
  'accents are ignored on the loose pass',
  { answer: 'cafe', accepted: [answer('a3', 'café')] },
  gradeCloze('cafe', [answer('a3', 'café')]),
);
push('gradeCloze', 'a second accepted answer matches', { answer: 'adenosine triphosphate', accepted: atp }, gradeCloze('adenosine triphosphate', atp));
push('gradeCloze', 'wrong content', { answer: 'ADP', accepted: atp }, gradeCloze('ADP', atp));
push('gradeCloze', 'empty answer', { answer: '', accepted: atp }, gradeCloze('', atp));

// ── flashcards ──────────────────────────────────────────────────────────────
const keywords = (required: boolean, phrase: string, synonyms?: string[]) => ({ required, phrase, synonyms });

const mitochondrion = [
  answer('f1', 'Mitochondria make ATP', {
    keywords: [
      keywords(true, 'atp'),
      keywords(true, 'mitochondria', ['mitochondrion']),
      keywords(false, 'cristae'),
      keywords(false, 'matrix'),
    ],
    minPoints: 2,
  }),
];

push(
  'gradeFlashcard',
  'flashcard with all required points is correct',
  { answer: 'The mitochondria produces ATP via cristae.', accepted: mitochondrion },
  gradeFlashcard('The mitochondria produces ATP via cristae.', mitochondrion),
);
push(
  'gradeFlashcard',
  'synonyms count for a keyword',
  { answer: 'the mitochondrion makes atp', accepted: mitochondrion },
  gradeFlashcard('the mitochondrion makes atp', mitochondrion),
);
// One required point, two expected overall: all required covered but the total
// falls short, which is exactly the near-miss branch.
const brief = [answer('f3', 'Aerobic respiration', { keywords: [keywords(true, 'atp'), keywords(false, 'cristae'), keywords(false, 'matrix')], minPoints: 2 })];
push(
  'gradeFlashcard',
  'all required points but too few total is a near miss',
  { answer: 'it makes atp', accepted: brief },
  gradeFlashcard('it makes atp', brief),
);
push(
  'gradeFlashcard',
  'missing a required point is wrong',
  { answer: 'cristae exist', accepted: mitochondrion },
  gradeFlashcard('cristae exist', mitochondrion),
);
push(
  'gradeFlashcard',
  'punctuation and case do not matter to keyword matching',
  { answer: 'ATP! MITOCHONDRIA!', accepted: mitochondrion },
  gradeFlashcard('ATP! MITOCHONDRIA!', mitochondrion),
);
push(
  'gradeFlashcard',
  'no keyword rules falls back to cloze grading',
  { answer: 'mitochondria', accepted: [answer('f2', 'mitochondria')] },
  gradeFlashcard('mitochondria', [answer('f2', 'mitochondria')]),
);
push('gradeFlashcard', 'empty flashcard answer', { answer: '', accepted: mitochondrion }, gradeFlashcard('', mitochondrion));

// ── multiple choice ─────────────────────────────────────────────────────────
push('gradeMcq', 'the right option is correct', { selectedOptionId: 'o2', correctOptionId: 'o2' }, gradeMcq('o2', 'o2'));
push('gradeMcq', 'the wrong option is wrong', { selectedOptionId: 'o1', correctOptionId: 'o2' }, gradeMcq('o1', 'o2'));
push('gradeMcq', 'no selection is wrong', { selectedOptionId: null, correctOptionId: 'o2' }, gradeMcq(null, 'o2'));

const payload = {
  version: 1,
  generatedFrom: 'src/domain/grading.ts',
  note: 'Golden grading vectors. Native ports must reproduce `expected` exactly.',
  cases: vectors,
};

const outDir = path.join(process.cwd(), 'mobile', 'shared');
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'grading-vectors.json');
writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`);

console.log(`wrote ${vectors.length} vectors to ${path.relative(process.cwd(), outFile)}`);
