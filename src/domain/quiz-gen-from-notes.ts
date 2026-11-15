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

import { generateClozeProposals, sentencesFromMarkdown, STOPLIST, type ClozeProposal } from './cloze-gen';
import { fullyNormalized, gradeFlashcard, type AcceptedAnswer } from './grading';
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
  // flashcard grading keywords (phrases the learner's answer must contain);
  // falls back to the full answer text when absent.
  keywords?: string[];
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

const WORD_RE = /[\p{L}][\p{L}'’-]*|\d+(?:[.,]\d+)?/gu;

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
      .replace(/(\d)['’]s\b/g, '$1') // "2018's" → "2018", not "2018" + "s"
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
      if (DISTRACTOR_BAD.has(bl) || STOPLIST.has(bl)) continue;
      if (/^(.)\1+$/.test(head)) continue;
      // 1-word terms
      out.push(head);
      // A span is only a term if it does not end on glue ("protection of")
      // and carries at most one stopword inside ("health and safety" is a
      // term; "sits alongside the" is not).
      const isGlue = (w: string) => STOPLIST.has(w.toLowerCase());
      const spanOk = (words: string[]) =>
        !isGlue(words[words.length - 1]) && words.filter(isGlue).length <= 1;
      if (tokens.length > start + 1) {
        const two = `${head} ${tokens[start + 1]}`;
        const b2 = two.toLowerCase();
        if (b2.length >= 5 && b2.length <= 70 && !DISTRACTOR_BAD.has(b2) && spanOk([head, tokens[start + 1]])) {
          out.push(two);
        }
      }
      if (tokens.length > start + 2) {
        const three = `${head} ${tokens[start + 1]} ${tokens[start + 2]}`;
        const b3 = three.toLowerCase();
        if (b3.length >= 6 && b3.length <= 90 && !DISTRACTOR_BAD.has(b3) && spanOk([head, tokens[start + 1], tokens[start + 2]])) {
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

/** A short answerable phrase that appears in this lesson's prose — but only a
 *  *term*: it must recur in the notes (count ≥ 2), and once a longer term is
 *  taken, its fragments ("Data", "Data Protection") step aside so one fact
 *  never becomes three cards. */
function answerablePhrases(md: string, exclude: Set<string>): string[] {
  const hay = ` ${fullyNormalized(md)} `;
  const scored: { phrase: string; count: number; words: number }[] = [];
  const seen = new Set<string>();
  for (const p of phraseCandidates(md)) {
    const key = p.toLowerCase();
    if (key.length < 3 || exclude.has(key) || seen.has(key)) continue;
    seen.add(key);
    const needle = ` ${fullyNormalized(p)} `;
    let count = 0;
    for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) count += 1;
    const words = (p.match(WORD_RE) ?? []).length;
    // A lone word earns a card only when it is a real term: recurring often
    // enough and long enough that it is not just a common noun ("request",
    // "limitation") that happens to appear in two sentences.
    if (count < 2 || (words === 1 && (count < 3 || p.replace(/[^\p{L}\p{N}]/gu, '').length < 5))) continue;
    scored.push({ phrase: p, count, words });
  }
  scored.sort((a, b) => b.words - a.words || b.count - a.count || a.phrase.localeCompare(b.phrase));
  const out: string[] = [];
  const outKeys: { padded: string; bigrams: Set<string> }[] = [];
  for (const s of scored) {
    const norm = fullyNormalized(s.phrase);
    const key = ` ${norm} `;
    const tokens = norm.split(' ');
    const bigrams = new Set(tokens.slice(0, -1).map((w, i) => `${w} ${tokens[i + 1]}`));
    const clashes = outKeys.some(
      (k) => k.padded.includes(key) || key.includes(k.padded) || [...bigrams].some((b) => k.bigrams.has(b)),
    );
    if (clashes) continue;
    out.push(s.phrase);
    outKeys.push({ padded: key, bigrams });
  }
  return out;
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
    answer: p.answer,
    explanationMd: '',
    specRefs: lessons.find((l) => l.title === p.lessonTitle)?.specRefs,
    generated: true as const,
  }));
}

/** Definition-shaped sentences: "X is Y", "X are Y", "X means Y",
 *  "X refers to Y". The term becomes the prompt, the predicate the answer —
 *  so the cue never contains the answer verbatim. */
const DEF_RE = /^(.{2,90}?)\s+(?:is|are|means|refers to|is defined as)\s+(.{6,240})$/;

function termLooksAnswerable(term: string): boolean {
  const words = term.match(WORD_RE) ?? [];
  if (words.length === 0 || words.length > 8) return false;
  const first = words[0]?.toLowerCase() ?? '';
  const last = words[words.length - 1]?.toLowerCase() ?? '';
  if (STOPLIST.has(first) || STOPLIST.has(last) || DISTRACTOR_BAD.has(first)) return false;
  if (/^\d/.test(first)) return false;
  // a real term is a noun phrase, not a clause fragment: it should not end
  // on a verb-ish stopword and should carry at least one content word ≥4.
  return words.some((w) => w.replace(/[^\p{L}\p{N}]/gu, '').length >= 4);
}

function tidyDefinition(raw: string): string {
  let d = raw.replace(/\s+/g, ' ').trim().replace(/[.]+$/, '');
  // cut trailing clause chains ("..., which ...", "; ...") to keep answers tight
  const cut = d.search(/,\s+(?:which|who|that|because|so|and|but|or)\b|;\s/);
  if (cut > 30) d = d.slice(0, cut).trim().replace(/[,;:]$/, '');
  const words = d.match(WORD_RE) ?? [];
  if (words.length > 30) d = words.slice(0, 30).join(' ');
  return d;
}

/** Grading keywords for a definition answer: the longest content phrases in
 *  the predicate, so a correct paraphrase still contains them. */
function keywordsForDefinition(definition: string): string[] {
  const phrases = phraseCandidates(definition)
    .map((p) => p.trim())
    .filter((p) => {
      const w = (p.match(WORD_RE) ?? []).length;
      return w >= 1 && p.length >= 4;
    })
    .sort((a, b) => (b.match(WORD_RE) ?? []).length - (a.match(WORD_RE) ?? []).length || b.length - a.length);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of phrases) {
    const key = p.toLowerCase();
    if (seen.has(key) || out.some((o) => o.toLowerCase().includes(key) || key.includes(o.toLowerCase()))) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= 3) break;
  }
  if (out.length === 0) {
    const w = (definition.match(WORD_RE) ?? []).filter((x) => x.replace(/[^\p{L}\p{N}]/gu, '').length >= 6).sort((a, b) => b.length - a.length);
    if (w[0]) out.push(w[0]);
  }
  return out;
}

/** Keyword-marked flashcards generated from the same notes.
 *
 * Cards are term→definition pairs lifted from definition-shaped sentences
 * ("X is Y", "X means Y"). The prompt asks what the term means, so the answer
 * is never visible on the card, and `keywordsForDefinition` gives the grader
 * the phrases a correct answer should contain.
 */
export function generateFlashcardsFromNotes(
  lessons: LessonSource[],
  existingPrompts: string[],
  max: number,
): GeneratedCard[] {
  const existingKeys = new Set(existingPrompts.map((p) => p.toLowerCase()));
  const usedTerms = new Set<string>();
  const cards: GeneratedCard[] = [];

  for (const lesson of lessons) {
    if (cards.length >= max) break;
    const sentences = sentencesFromMarkdown(`${lesson.detailedMd}\n\n${lesson.summaryMd}`);
    for (const sentence of sentences) {
      if (cards.length >= max) break;
      const m = sentence.trim().match(DEF_RE);
      if (!m) continue;
      const term = m[1].trim().replace(/^["'“”]+|["'“”.,;:!?]+$/g, '');
      const definition = tidyDefinition(m[2]);
      const key = term.toLowerCase();
      if (!termLooksAnswerable(term) || key.length < 3 || usedTerms.has(key) || existingKeys.has(`what does "${key}" mean?`)) continue;
      if (definition.split(/\s+/).length < 3) continue;
      usedTerms.add(key);
      cards.push({
        kind: 'flashcard',
        topicId: '',
        lessonTitle: lesson.title,
        prompt: `What does "${term}" mean?`,
        answer: definition,
        keywords: keywordsForDefinition(definition),
        explanationMd: '',
        specRefs: lesson.specRefs,
        generated: true as const,
      });
    }
  }
  return cards;
}

/** MCQ built on cloze proposals: the question is the gapped sentence itself,
 *  so the stem never leaks the answer, and every option is a term that
 *  actually appears in the notes. Distractors are filtered to phrases of a
 *  similar length and word count to the correct answer — random note phrases
 *  of a different shape give the answer away. Cards with fewer than three
 *  plausible distractors are skipped rather than shipped weak. */
export function generateMcqFromNotes(
  lessons: LessonSource[],
  existingQuestions: string[],
  max: number,
): GeneratedCard[] {
  const existingKeys = new Set(existingQuestions.map((q) => q.toLowerCase()));
  const usedCorrect = new Set<string>();
  const usedDistractors = new Set<string>();
  const cards: GeneratedCard[] = [];

  const proposals = generateClozeProposals(lessons, [], { max: max * 4 });
  const distractorPool = answerablePhrases(
    lessons.map((l) => `${l.detailedMd}\n\n${l.summaryMd}`).join('\n'),
    new Set(),
  );

  for (const p of proposals) {
    if (cards.length >= max) break;
    const qKey = (p.textWithBlank ?? '').toLowerCase();
    const aKey = (p.answer ?? '').toLowerCase();
    if (!qKey || !aKey || existingKeys.has(qKey) || usedCorrect.has(aKey)) continue;

    const aWords = (p.answer ?? '').split(/\s+/).length;
    const dist: string[] = [];
    for (const cand of distractorPool) {
      if (dist.length >= 3) break;
      const cKey = cand.toLowerCase();
      if (cKey === aKey || usedDistractors.has(cKey) || usedCorrect.has(cKey)) continue;
      if (aKey.includes(cKey) || cKey.includes(aKey)) continue;
      const cWords = cand.split(/\s+/).length;
      if (Math.abs(cWords - aWords) > 2) continue;
      if (Math.abs(cand.length - (p.answer ?? '').length) > (p.answer ?? '').length) continue;
      dist.push(cand);
      usedDistractors.add(cKey);
    }
    if (dist.length < 3) continue;

    usedCorrect.add(aKey);
    const options = shuffle([p.answer, ...dist]).slice(0, 4);
    cards.push({
      kind: 'mcq',
      topicId: '',
      lessonTitle: p.lessonTitle,
      question: p.textWithBlank,
      options,
      correctOptionText: p.answer,
      explanationMd: '',
      specRefs: lessons.find((l) => l.title === p.lessonTitle)?.specRefs,
      generated: true as const,
    });
  }
  return cards;
}

// ── small helpers (pure, over little text) ──────────────────────────────────

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

