import 'dotenv/config';
// Maths engine verification: for every concept × difficulty, generate many
// seeded questions and assert the three invariants the product depends on:
//
//   1. Determinism — the same id builds byte-identical drafts (the server
//      marks from the id alone, so any drift means a student is marked wrong
//      for the answer the app showed them).
//   2. Self-consistency — the draft's own display answer passes marking.
//      A generator whose own answer fails is a question nobody can answer.
//   3. MCQ integrity — exactly one option passes marking, four distinct
//      options, and the correct one is always present.
//
// Run: npx tsx scripts/verify-maths.ts   (no database needed)

import {
  CONCEPTS,
  DIFFICULTIES,
  buildDraft,
  buildQuestion,
  markAnswer,
  questionId,
} from '../src/domain/maths';

let failures = 0;
const SAMPLES_PER_CONCEPT = 40;

function fail(msg: string) {
  failures++;
  console.error(`  ✗ ${msg}`);
}

for (const concept of CONCEPTS) {
  for (const difficulty of DIFFICULTIES) {
    for (let i = 0; i < SAMPLES_PER_CONCEPT; i++) {
      const id = questionId(concept.id, difficulty, 1000 + i * 7919);
      const draft = buildDraft(concept.id, difficulty, 1000 + i * 7919);
      const again = buildDraft(concept.id, difficulty, 1000 + i * 7919);

      if (JSON.stringify(draft) !== JSON.stringify(again)) {
        fail(`${id} is not deterministic`);
        continue;
      }
      if (!draft.prompt.trim()) fail(`${id} has an empty prompt`);
      if (draft.distractors.some((d) => d === draft.display)) fail(`${id} lists its own answer as a distractor`);

      // Self-consistency: the shown answer must always be marked correct.
      const selfVerdict = markAnswer(draft, draft.display);
      if (!selfVerdict.correct) {
        fail(`${id} marks its own answer "${draft.display}" as WRONG${selfVerdict.note ? ` (${selfVerdict.note})` : ''}`);
      }

      // A wrong answer must not pass: the first distractor must fail.
      const wrong = draft.distractors[0];
      if (wrong && markAnswer(draft, wrong).correct) {
        fail(`${id} accepts its own distractor "${wrong}"`);
      }

      // MCQ integrity through the student-facing surface.
      const q = buildQuestion(id, 'mcq');
      const opts = q.options ?? [];
      if (opts.length !== 4) fail(`${id} mcq has ${opts.length} options`);
      if (new Set(opts).size !== opts.length) fail(`${id} mcq has duplicate options`);
      const passing = opts.filter((o) => markAnswer(draft, o).correct);
      if (passing.length !== 1) fail(`${id} mcq has ${passing.length} passing options`);
      if (!passing.includes(draft.display)) fail(`${id} mcq lost its correct option`);
    }
  }
}

console.log(failures === 0 ? `✓ maths engine: ${CONCEPTS.length} concepts × ${DIFFICULTIES.length} difficulties × ${SAMPLES_PER_CONCEPT} samples all pass` : `✗ ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
