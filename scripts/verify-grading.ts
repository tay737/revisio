// Grading verification: three invariant sets the product depends on.
//
//   1. Vector safety — `gradeCloze` with the default policy produces exactly
//      the outputs `mobile/shared/grading-vectors.json` pins, so the Kotlin
//      and Swift ports stay conformant. Any change here must regenerate the
//      vectors and the native tests on purpose, never by accident.
//   2. Similar-mode calibration — the meaning-aware rung warns on inflections,
//      synonyms and typos, and stays silent on unrelated words and on term
//      pairs a marker would never conflate.
//   3. Generator invariants — proposals blank real answer words, never repeat
//      a blank across passes, and never blank the lesson title.
//
// Run: npx tsx scripts/verify-grading.ts   (no database needed)

import { readFileSync } from 'node:fs';
import { gradeCloze, gradeClozeWithPolicy, DEFAULT_CLOZE_POLICY, type AcceptedAnswer } from '../src/domain/grading';
import { generateClozeProposals } from '../src/domain/cloze-gen';
import { canonicalWord } from '../src/domain/similarity';

let failures = 0;
const check = (name: string, cond: boolean, detail?: unknown) => {
  if (cond) console.log(`✓ ${name}`);
  else { failures++; console.log(`✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 220)}` : ''}`); }
};
const A = (text: string): AcceptedAnswer => ({ id: 'a1', text, isPrimary: true });
const similar = { ...DEFAULT_CLOZE_POLICY, mode: 'similar' as const };

// ── 1. vector safety ────────────────────────────────────────────────────────
const vectors = JSON.parse(readFileSync('./mobile/shared/grading-vectors.json', 'utf8')) as {
  cases: { fn: string; input: Record<string, unknown>; expected: Record<string, unknown> }[];
};
const clozeCases = vectors.cases.filter((c) => c.fn === 'gradeCloze');
let vectorDrift = 0;
for (const c of clozeCases) {
  const accepted = (c.input.accepted as { id: string; text: string; isPrimary: boolean }[]).map((a) => ({ ...a }));
  const actual = gradeCloze(String(c.input.answer), accepted);
  const want = c.expected as Record<string, unknown>;
  const actualCore: Record<string, unknown> = {
    correct: actual.correct,
    feedbackKind: actual.feedbackKind,
    ...(actual.matchedAnswerId ? { matchedAnswerId: actual.matchedAnswerId } : {}),
    ...(actual.note ? { note: actual.note } : {}),
  };
  const same = Object.keys(want).every((k) => actualCore[k] === want[k]);
  if (!same) { vectorDrift++; console.log(`   drift in "${String(c.input.answer)}": want ${JSON.stringify(want)} got ${JSON.stringify(actualCore)}`); }
}
check(`gradeCloze still matches all ${clozeCases.length} pinned vectors (native ports stay conformant)`, vectorDrift === 0, vectorDrift);

// ── 2. similar-mode calibration ─────────────────────────────────────────────
type Want = 'exact' | 'inflection' | 'synonym' | 'typo' | 'wrong';
const CALIBRATION: [string, string, Want][] = [
  ['firewal', 'firewall', 'typo'],
  ['encrypton', 'encryption', 'typo'],
  ['phishng', 'phishing', 'typo'],
  ['malwre', 'malware', 'typo'],
  ['breaches', 'breach', 'inflection'],
  ['passwords', 'password', 'inflection'],
  ['data', 'information', 'synonym'],
  ['encode', 'encrypt', 'synonym'],
  ['user name', 'username', 'inflection'],
  ['port', 'post', 'wrong'],
  ['threat', 'risk', 'wrong'],
  ['virus', 'malware', 'wrong'],
  [' social engineering', 'social engineering', 'exact'],
  ['breaks', 'break', 'inflection'],
];
let calibrationMisses = 0;
for (const [attempt, answer, want] of CALIBRATION) {
  const v = gradeClozeWithPolicy(attempt, [A(answer)], similar);
  const got: Want = v.correct ? 'exact' : v.similarity?.relation ?? 'wrong';
  if (got !== want) {
    calibrationMisses++;
    console.log(`   ${JSON.stringify(attempt)} vs "${answer}": want ${want}, got ${got}`);
  }
}
check(`similar-mode marks all ${CALIBRATION.length} calibration cases correctly`, calibrationMisses === 0, calibrationMisses);

// the warning must never appear when the verdict is correct
const exactVerdict = gradeClozeWithPolicy('encryption', [A('encryption')], similar);
check('exact answers under similar mode carry no similarity warning', exactVerdict.correct && !exactVerdict.similarity);
// and the wrong verdict still reads as wrong to the schedule
const near = gradeClozeWithPolicy('data', [A('information')], similar);
check('a synonym warning is still an incorrect verdict', !near.correct && near.similarity?.relation === 'synonym');
// unrelated words stay plain wrong with no note
const far = gradeClozeWithPolicy('firewall', [A('encryption')], similar);
check('unrelated words stay plain wrong', !far.correct && !far.similarity);

// ── 3. generator invariants ────────────────────────────────────────────────
const lessons = [{
  title: "Kolb's Experiential Learning Cycle",
  detailedMd: [
    '## The four stages',
    '',
    "Kolb's Experiential Learning Cycle has four stages that turn practical experience into structured learning.",
    '',
    'The first stage is concrete experience, where the learner actually does the activity and has the real experience.',
    '',
    'The second stage is reflective observation, where the learner reviews what happened and thinks about what worked, what went wrong and why.',
    '',
    'In the abstract conceptualisation stage, the learner links the reflection to theory or prior knowledge.',
    '',
    'The active experimentation stage involves planning and trying the improved approach in a new situation to test whether it works.',
    '',
    'The cycle is continuous because the results of active experimentation become the next concrete experience.',
  ].join('\n'),
  summaryMd: '',
}];
const pass1 = generateClozeProposals(lessons, [], { max: 10 });
const pass2 = generateClozeProposals(lessons, pass1.map((p) => p.textWithBlank), { max: 10 });

check('the generator proposes from real notes', pass1.length > 0, pass1.length);
check('every proposal blanks exactly one spot with ____', pass1.every((p) => p.textWithBlank.split('____').length === 2));
check('every proposal carries a non-empty answer', pass1.every((p) => p.answer.trim().length > 0));
const TITLE_WORDS = new Set(["kolb", "experiential", "learning", "cycle"].map((w) => w));
check('no proposal blanks a word from the lesson title',
  pass1.every((p) => !TITLE_WORDS.has(canonicalWord(p.answer))), pass1.map((p) => p.answer));
check('the same blank never appears twice in one pass',
  new Set(pass1.map((p) => p.textWithBlank)).size === pass1.length);
check('a second pass proposes blanks the first did not (variety, not repetition)',
  pass2.length > 0 && pass2.every((p) => !pass1.some((q) => q.textWithBlank === p.textWithBlank)));

console.log(`\n${failures === 0 ? '✓ grading: vectors, similar-mode and generator all pass' : `✗ ${failures} failure(s)`}`);
process.exit(failures === 0 ? 0 : 1);
