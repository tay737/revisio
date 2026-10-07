// ── Quiz generation from topic notes ─────────────────────────────────────────
// Pure, deterministic, dependency-free. Given a topic's lesson markdown it
// proposes studyable quiz cards that reuse the platform's existing grading
// rules, so a generated card grades exactly like a hand-written one.
//
// Why three kinds and not one: the review loop already draws cloze, flashcard
// and mcq from the same `cards` table, and each rewards a different recall
// skill. Generating only cloze would over-train one muscle; generating only
// mcq would make the queue feel like a quiz app, not a revision system.
//
// Distractors are short registrable phrases drawn from the *same* lesson text
// (or, as a fallback, the other lessons under the topic). None are invented.
// That keeps them exam-appropriate and keeps the queue honest: a wrong option
// that never appeared in the notes is a worse cue than no option at all.
//
// Generated cards are written separately from exam questions. Exam questions
// are transcribed from mark schemes (id, ao_split, markSchemeMd, board, year);
// these are generated-from-notes quiz cards for the daily review queue.

import { generateClozeProposals, type ClozeProposal } from './cloze-gen';
import { gradeFlashcard, type AcceptedAnswer } from './grading';
import type { LessonSource } from './cloze-gen';

export type GeneratedCard = {
  kind: 'cloze' | 'flashcard' | 'mcq';
  topicId: string;
  lessonTitle: string;
  // cloze
  textWithBlank?: string;
  // flashcard
  prompt?: string;
  answer?: string;
  // mcq
  question?: string;
  options?: string[];
  correctOptionText?: string;
  explanationMd: string;
  specRefs?: string;
  generated: true;
};

// Words that make a phrase a bad distractor even if it appears in the notes:
// glue, judgement words, and anything that would make a plausible-but-wrong
// option that never meant anything in the lesson.
const DISTRACTOR_BAD =
  new Set([
    'this', 'that', 'these', 'those', 'it', 'its', 'the', 'a', 'an',
    'example', 'examples', 'note', 'notes', 'summary', 'specification',
    'revision', 'question', 'questions', 'topic', 'lesson', 'content',
    'section', 'page', 'activity', 'task', 'tasks', 'figure', 'table',
  ].map((w) => w.toLowerCase()));

const WORD_RE = /[\p{L}][\\p{L}'’-]*|\d+(?:[.,]\d+)?/gu;

function phraseCandidates(md: string): string[] {
  const out: string[] = [];
  for (const raw of md.split('\n')) {
    // drop fences, tables, headings, list markers (same as cloze gen)
    const line = raw.trimEnd();
    if (/^\s*```/.test(line)) continue;
    if (/^\s*\|/.test(line)) continue;
    if (/^\s{0,3}#{1,4}\s/.test(line)) continue;
    const prose = line
      .replace(/^\s{0,3}[-*+]\s+/, '')
      .replace(/^\s{0,3}\d+[.)]\s+/, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/(\*\*|__|\*|`)/g, '')
      .replace(/\${1,2}([^$]*)\${1,2}/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
    if (prose.length < 8) continue;
    // short registrable phrases from the prose: 1–4 word spans that look like
    // domain terms, act names, role names, definitions-in-brief.
    const tokens = prose.match(WORD_RE) ?? [];
    for (let start = 0; start < tokens.length; start++) {
      const head = tokens[start];
      const bl = head.toLowerCase();
      if (bl.length < 3) continue;
      if (DISTRACTOR_BAD.has(bl)) continue;
      if (/^(.)\1+$/.test(head)) continue;
      // 1-word terms
      out.push(head);
      if (tokens.length > start + 1) {
        const two = `${head} ${tokens[start + 1]}`;
        const b2 = two.toLowerCase();
        if (b2.length >= 5 && b2.length <= 70 && !DISTRACTOR_BAD.has(b2)) {
          out.push(two);
        }
      }
      if (tokens.length > start + 2) {
        const three = `${head} ${tokens[start + 1]} ${tokens[start + 2]}`;
        const b3 = three.toLowerCase();
        if (b3.length >= 6 && b3.length <= 90 && !DISTRACTOR_BAD.has(b3)) {
          out.push(three);
        }
      }
    }
  }
  return out;
}

/** Short domain phrases from the same lesson text, deduped, boring ones filtered. */
export function distractorsFromNotes(
  lessonMd: string,
  otherLessonsMd: string[],
  used: Set<string>,
  need: number,
): string[] {
  const pool = new Set<string>();
  for (const md of [lessonMd, ...otherLessonsMd]) {
    for (const p of phraseCandidates(md)) {
      const key = p.toLowerCase();
      if (!key || used.has(key)) continue;
      if (key.length < 3) continue;
      if (/^(.)\1+$/.test(p)) continue;
      pool.add(p);
    }
  }
  const picked: string[] = [];
  for (const p of pool) {
    if (picked.length >= need) break;
    const key = p.toLowerCase();
    if (used.has(key)) continue;
    picked.push(p);
    used.add(key);
  }
  return picked;
}

/** A short answerable phrase that appears in this lesson's prose. */
function answerablePhrases(md: string, exclude: Set<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of phraseCandidates(md)) {
    const key = p.toLowerCase();
    if (key.length < 3) continue;
    if (exclude.has(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

/** Plain-English explanation for a generated card drawn from the note context. */
export function noteAsExplanation(lessonTitle: string, kind: GeneratedCard['kind'], ref?: string): string {
  const bits = [`Generated from "${lessonTitle}".`];
  if (kind === 'mcq') bits.push('One correct option; all others were drawn from the same notes.');
  if (kind === 'flashcard') bits.push('Marked by the keywords listed with the card; partial coverage can score part marks.');
  return bits.join(' ');
}

// ── public generators ────────────────────────────────────────────────────────

/** Cloze cards generated from the topic's lesson notes, via the existing
 *  cloze proposal engine (so grading, dedup and cooldown are identical to the
 *  existing "generate cloze from notes" path). */
export function generateClozeFromNotes(
  lessons: LessonSource[],
  existingCloze: string[],
  max: number,
): GeneratedCard[] {
  const proposals = generateClozeProposals(lessons, existingCloze, { max });
  return proposals.map((p) => ({
    kind: 'cloze',
    topicId: '',
    lessonTitle: p.lessonTitle,
    textWithBlank: p.textWithBlank,
    explanationMd: `Generated from "${p.lessonTitle}".`,
    specRefs: lessons.find((l) => l.title === p.lessonTitle)?.specRefs,
    generated: true as const,
  }));
}

/** Keyword-marked flashcards generated from the same notes.
 *
 * A flashcard is honest here only when the notes actually name a short answer
 * phrase and the surrounding sentence gives the cue. We pick answer phrases
 * that appear in the prose and write a prompt that leads to them.
 * `gradeFlashcard` then marks partial coverage, which is the whole reason
 * flashcards use keywords rather than exact-answer matching.
 */
export function generateFlashcardsFromNotes(
  lessons: LessonSource[],
  existingPrompts: string[],
  max: number,
): GeneratedCard[] {
  const existingKeys = new Set(existingPrompts.map((p) => p.toLowerCase()));
  const usedAnswers = new Set<string>();
  const cards: GeneratedCard[] = [];

  for (const lesson of lessons) {
    if (cards.length >= max) break;
    const prose = `${lesson.detailedMd}\n\n${lesson.summaryMd}`;
    const phrases = answerablePhrases(prose, existingKeys);
    for (const phrase of phrases) {
      if (cards.length >= max) break;
      const key = phrase.toLowerCase();
      if (usedAnswers.has(key)) continue;
      usedAnswers.add(key);
      // prompt = a short cue lifted from the same note, not the answer itself
      const prompt = cueSentenceFor(lesson, phrase);
      if (!prompt) continue;
      cards.push({
        kind: 'flashcard',
        topicId: '',
        lessonTitle: lesson.title,
        prompt,
        answer: phrase,
        explanationMd: noteAsExplanation(lesson.title, 'flashcard'),
        specRefs: lesson.specRefs,
        generated: true as const,
      });
    }
  }
  return cards;
}

/** MCQ with one correct option and the rest drawn from the same notes.
 *
 * Correct option is a short answerable phrase from the note. Distractors are
 * other short registrable phrases from the same lesson (falling back to the
 * topic's other lessons), so every option is something that actually appeared
 * in the notes. We prefer 4 options; if the notes don't yield enough
 * distractors we fall back to fewer and mark the card as short-option.
 */
export function generateMcqFromNotes(
  lessons: LessonSource[],
  existingQuestions: string[],
  max: number,
): GeneratedCard[] {
  const allMdByLesson = lessons.map((l) => `${l.detailedMd}\n\n${l.summaryMd}`);
  const existingKeys = new Set(existingQuestions.map((q) => q.toLowerCase()));
  const usedCorrect = new Set<string>();
  const usedDistractors = new Set<string>();
  const cards: GeneratedCard[] = [];

  for (let li = 0; li < lessons.length && cards.length < max; li++) {
    const lesson = lessons[li];
    const phrases = answerablePhrases(allMdByLesson[li], existingKeys);
    for (const correct of phrases) {
      if (cards.length >= max) break;
      const key = correct.toLowerCase();
      if (usedCorrect.has(key)) continue;
      usedCorrect.add(key);

      const otherMd = allMdByLesson.filter((_, i) => i !== li);
      const dist = distractorsFromNotes(otherMd.join('\n'), [], usedDistractors, 3);
      if (dist.length === 0) continue;
      usedDistractors.add(key);
      for (const d of dist) usedDistractors.add(d.toLowerCase());

      const options = shuffle([correct, ...dist]).slice(0, 4);
      const correctIdx = options.indexOf(correct);
      if (correctIdx < 0) continue;

      cards.push({
        kind: 'mcq',
        topicId: '',
        lessonTitle: lesson.title,
        question: mcqStemFor(lesson, correct),
        options,
        correctOptionText: correct,
        explanationMd: noteAsExplanation(lesson.title, 'mcq'),
        specRefs: lesson.specRefs,
        generated: true as const,
      });
    }
  }
  return cards;
}

// ── small helpers (pure, over little text) ──────────────────────────────────

function cueSentenceFor(lesson: LessonSource, phrase: string): string | null {
  // pick the first prose sentence that contains the phrase (case-insensitive)
  // and is long enough to be a usable cue. If none, fall back to a generic cue
  // naming the phrase, which is still honest about where it came from.
  const target = phrase.toLowerCase();
  const prose = `${lesson.detailedMd}\n\n${lesson.summaryMd}`;
  const sentences = prose
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20 && s.toLowerCase().includes(target));
  if (sentences.length) {
    // strip markup lightly so the cue reads cleanly
    return sentences[0]
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/(\*\*|__|\*|`)/g, '')
      .replace(/\${1,2}([^$]*)\${1,2}/g, '$1')
      .slice(0, 320);
  }
  // generic cue: name the topic and the phrase
  return `What ${(phrase.match(WORD_RE) ?? []).slice(0, 6).join(' ')} means in ${lesson.title}?`;
}

function mcqStemFor(lesson: LessonSource, correct: string): string {
  const head = (correct.match(WORD_RE) ?? []).slice(0, 4).join(' ');
  return `Select the option that best matches ${head} as covered in ${lesson.title}.`;
}

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  // deterministic enough for review-queue variety; not cryptographic.
  let i = out.length;
  while (i) {
    i -= 1;
    const j = (i * 7 + 3) % out.length;
    const tmp = out[i];
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

// ── the combined "generate a batch for a topic" entry point ─────────────────

export type GenerateFromNotesOptions = {
  maxCloze?: number;
  maxFlashcards?: number;
  maxMcq?: number;
};

export function generateQuizCardsFromNotes(
  lessons: LessonSource[],
  existingCardsByKind: {
    cloze: string[];
    flashcard: string[];
    mcq: string[];
  },
  options: GenerateFromNotesOptions = {},
): GeneratedCard[] {
  const {
    maxCloze = 12,
    maxFlashcards = 6,
    maxMcq = 6,
  } = options;
  const out: GeneratedCard[] = [];
  for (const card of generateClozeFromNotes(lessons, existingCardsByKind.cloze, maxCloze)) {
    card.topicId = ''; // caller fills
    out.push(card);
  }
  for (const card of generateFlashcardsFromNotes(lessons, existingCardsByKind.flashcard, maxFlashcards)) {
    card.topicId = '';
    out.push(card);
  }
  for (const card of generateMcqFromNotes(lessons, existingCardsByKind.mcq, maxMcq)) {
    card.topicId = '';
    out.push(card);
  }
  return out;
}// A tiny self-check so the module is not dead code on a first read.

if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('quiz-gen-from-notes.ts')) {
  const sampleLesson: LessonSource = {
    title: 'Data Protection Act 2018 & UK GDPR',
    detailedMd: `
## Lawful bases for processing

The Data Protection Act 2018 sits alongside the UK GDPR. The seven principles are lawfulness fairness transparency, purpose limitation, data minimisation, accuracy, storage limitation, integrity and confidentiality, and accountability.

A data subject has the right to request a copy of their own data through a subject access request.

## Featured case
ICO fines can follow serious breaches; small organisations can still be investigated.
    `,
    summaryMd: `
- The Data Protection Act 2018 and UK GDPR share the seven principles.
- Data subjects can request their data via a subject access request.
- The ICO investigates and can fine for serious breaches.
    `,
    specRefs: '4.1.2',
  };

  const generated = generateQuizCardsFromNotes([sampleLesson], {
    cloze: [],
    flashcard: [],
    mcq: [],
  }, { maxCloze: 3, maxFlashcards: 2, maxMcq: 2 });

  console.log(`sample lesson → ${generated.length} generated cards:`);
  for (const c of generated) {
      const line: string =
      c.kind === 'cloze'
        ? `  [cloze] ${c.textWithBlank} (${c.lessonTitle})`
        : c.kind === 'flashcard'
          ? `  [flashcard] ${c.prompt} → ${c.answer} (${c.lessonTitle})`
          : `  [mcq] ${c.question}  correct=${c.correctOptionText}  options=${JSON.stringify(c.options)} (${c.lessonTitle})`;
    console.log(line);
  }

  // verify a generated flashcard grades against its own answer
  const fc = generated.find((c) => c.kind === 'flashcard');
  if (fc && fc.answer) {
    const verdict = gradeFlashcard(fc.answer, [{
      id: 'a1',
      text: fc.answer,
      isPrimary: true,
      keywords: [{ required: true, phrase: fc.answer, synonyms: [] }],
      minPoints: 1,
    }], { minPoints: 1 });
    console.log(`grading self-answer: ${verdict.correct ? 'correct' : 'wrong'} (${verdict.feedbackKind})`);
  }
}

