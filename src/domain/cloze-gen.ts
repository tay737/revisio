// ── Cloze generation from notes ─────────────────────────────────────────────
// Pure, deterministic, dependency-free. Given lesson markdown it proposes
// fill-the-blank questions ranked by how well they test recall, so a topic's
// notes keep producing *varied* questions instead of the same few cards on
// rotation. One job per stage:
//
//   1. sentences()  — markdown → prose sentences (fences, tables and markup
//                     stripped; the heading itself is not a sentence)
//   2. candidates() — sentence → every blankable token with a recall score:
//                     repeated terms, proper nouns and long domain words rank
//                     high; function words and short guessy words never rank
//   3. generate()   — pick the best candidate, then cool down: that sentence,
//                     that answer word and its neighbours step aside, so the
//                     first N proposals cover N different facts
//
// Every output carries the exact `answer` string and the prompt with the blank
// in place. Existing prompts (imported or hand-written) are deduped by
// normalised sentence, so generation only ever adds variety. It never deletes
// or edits anything — importing stays the other way in.

import { fullyNormalized } from './grading';
import { canonicalWord } from './similarity';

export type LessonSource = { title: string; detailedMd: string; summaryMd: string; specRefs?: string };

export type ClozeProposal = {
  /** the word that belongs in the blank */
  answer: string;
  /** the full sentence with `____` where the answer goes */
  textWithBlank: string;
  /** which lesson it came from, for provenance in the UI */
  lessonTitle: string;
  /** how strongly this tests recall — higher is a better question */
  score: number;
};

// Words that never make a good blank: glue, pronouns, and judgements about
// writing rather than content. Matched on the canonical form.
const STOPLIST = new Set(
  [
    'about','above','after','again','against','all','also','always','among','and','another','any','are','around','because','been','before','being','below','between','both','but','by','can','cannot','could','did','do','does','doing','done','down','during','each','either','else','enough','even','ever','every','few','first','for','found','from','further','get','give','had','has','have','having','he','her','here','hers','him','his','how','however','if','in','include','includes','including','into','is','it','its','itself','just','keep','last','later','least','less','like','made','make','many','may','might','more','most','much','must','near','need','needs','neither','never','next','not','now','of','off','often','on','once','one','only','onto','or','other','others','our','ours','out','over','own','per','perhaps','rather','really','same','should','since','so','some','such','take','than','that','the','their','theirs','them','then','there','these','they','this','those','through','too','toward','under','until','up','upon','us','use','used','uses','using','very','was','way','we','well','were','what','when','where','whether','which','while','who','whom','whose','why','will','with','within','without','would','yet','you','your','yours',
    // judgements about the notes, not content
    'example','examples','note','notes','summary','specification','revision','question','questions',
  ].map((w) => w),
);

const WORD_RE = /[\p{L}][\p{L}'’-]*|\d+(?:[.,]\d+)?/gu;

// ── stage 1: markdown → sentences ───────────────────────────────────────────

/** Strip a lesson to plain prose sentences, in order. Fenced code, tables,
 *  headings, quotes markers, list markers and inline markup all come out. */
export function sentencesFromMarkdown(md: string): string[] {
  const lines: string[] = [];
  let inFence = false;
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (/^\s*\|/.test(line)) continue; // table rows
    if (/^\s{0,3}#{1,4}\s/.test(line)) continue; // headings — a title is not a fact
    if (/^\s{0,3}>/.test(line)) lines.push(line.replace(/^\s{0,3}>\s?/, ''));
    else lines.push(line.replace(/^\s{0,3}[-*+]\s+/, '').replace(/^\s{0,3}\d+[.)]\s+/, ''));
  }
  const prose = lines
    .join(' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → their text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images → gone
    .replace(/(\*\*|__|\*|`)/g, '') // emphasis/code marks
    .replace(/\${1,2}([^$]*)\${1,2}/g, '$1') // $math$ → the expression
    .replace(/\s+/g, ' ')
    .trim();
  if (!prose) return [];
  return prose
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“'(])/)
    .map((s) => s.trim())
    .filter((s) => {
      const words = s.match(WORD_RE);
      return s.length >= 30 && s.length <= 320 && (words?.length ?? 0) >= 6;
    });
}

// ── stage 2: candidates ─────────────────────────────────────────────────────

type Candidate = {
  answer: string;
  index: number; // position of the token inside the sentence
  score: number;
  sentenceIndex: number;
  lessonTitle: string;
};

function tokenize(sentence: string): { text: string; index: number }[] {
  const out: { text: string; index: number }[] = [];
  for (const m of sentence.matchAll(WORD_RE)) {
    out.push({ text: m[0], index: m.index ?? 0 });
  }
  return out;
}

/** Words that carry the topic's weight: tokens appearing in several sentences.
 *  Computed once per generation pass over all the lesson text. */
function keywordVocabulary(allProse: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const sentence of allProse.split(/(?<=[.!?])\s+/)) {
    const seen = new Set<string>();
    for (const m of sentence.matchAll(WORD_RE)) {
      const key = canonicalWord(m[0]);
      if (key.length >= 4) seen.add(key);
    }
    for (const key of seen) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function scoreToken(token: string, titleWords: Set<string>, vocabulary: Map<string, number>): number {
  const canonical = canonicalWord(token);
  if (canonical.length < 4) return 0; // "a", "is", "TCP" aside — short blanks are guessy
  const raw = canonicalWord(token) || token.toLowerCase();
  if (STOPLIST.has(token.toLowerCase()) || STOPLIST.has(raw)) return 0;
  if (/^(.)\1+$/.test(canonical)) return 0;
  // The lesson title names the topic: blanking "Kolb" from "Kolb's cycle"
  // tests nothing and reads broken, so title words never become blanks.
  if (titleWords.has(canonical)) return 0;

  let score = 0;
  if (canonical.length >= 8) score += 2;
  const spread = vocabulary.get(canonical) ?? 0;
  if (spread >= 3) score += 3; // the term the notes keep returning to
  else if (spread === 2) score += 2;
  if (/^\d/.test(token)) score += 1; // dates, counts, versions
  return score;
}

// ── stage 3: pick with cooldown ─────────────────────────────────────────────

export type GenerateOptions = {
  /** maximum proposals to return */
  max?: number;
  /** sentences (by global order) excluded around each pick */
  cooldown?: number;
};

const DEFAULTS: Required<GenerateOptions> = { max: 30, cooldown: 1 };

/**
 * The one entry point. Deterministic: the same notes and the same existing
 * prompts always produce the same proposals in the same order.
 */
export function generateClozeProposals(
  lessons: LessonSource[],
  existingPrompts: string[],
  options: GenerateOptions = {},
): ClozeProposal[] {
  const opts = { ...DEFAULTS, ...options };

  const sentences: { text: string; lessonTitle: string }[] = [];
  for (const lesson of lessons) {
    for (const text of sentencesFromMarkdown(lesson.detailedMd)) sentences.push({ text, lessonTitle: lesson.title });
    // the summary restates the detailed notes; use it only when a lesson has
    // no detailed text of its own, so one idea never becomes two cards
    if (!lesson.detailedMd.trim()) {
      for (const text of sentencesFromMarkdown(lesson.summaryMd)) sentences.push({ text, lessonTitle: lesson.title });
    }
  }
  if (sentences.length === 0) return [];

  const vocabulary = keywordVocabulary(sentences.map((s) => s.text).join(' '));
  const titleWords = new Set(lessons.flatMap((l) => l.title.split(/[^\p{L}]+/u)).filter((w) => w.length >= 3).map(canonicalWord));

  // Dedup key for an existing or proposed prompt: the sentence with the blank
  // (or the word) removed, normalised. The same sentence blanked in the same
  // place always collides; the same sentence blanked at a *different* word is
  // a different question and is allowed through — that is variety, not repeat.
  const dedupKey = (before: string, after: string) => `${fullyNormalized(before)}⟂${fullyNormalized(after)}`;
  const takenBlanks = new Set(existingPrompts.map((p) => {
    const [b, ...rest] = p.split('____');
    return dedupKey(b ?? '', rest.join(' '));
  }));

  const candidates: Candidate[] = [];
  sentences.forEach((sentence, sentenceIndex) => {
    const tokens = tokenize(sentence.text);
    tokens.forEach((token) => {
      const score = scoreToken(token.text, titleWords, vocabulary);
      if (score <= 0) return;
      candidates.push({ answer: token.text, index: token.index, score, sentenceIndex, lessonTitle: sentence.lessonTitle });
    });
  });

  const proposals: ClozeProposal[] = [];
  const bannedSentences = new Set<number>();
  const bannedAnswers = new Set<string>();
  let cooledUntil = -1; // global sentence index up to which new picks are banned

  candidates.sort((a, b) => b.score - a.score || a.sentenceIndex - b.sentenceIndex || a.index - b.index);

  for (const candidate of candidates) {
    if (proposals.length >= opts.max) break;
    if (bannedAnswers.has(canonicalWord(candidate.answer))) continue;
    if (candidate.sentenceIndex <= cooledUntil || bannedSentences.has(candidate.sentenceIndex)) continue;

    const sentence = sentences[candidate.sentenceIndex];
    const before = sentence.text.slice(0, candidate.index);
    const after = sentence.text.slice(candidate.index + candidate.answer.length);
    if (takenBlanks.has(dedupKey(before, after))) continue;

    proposals.push({
      answer: candidate.answer,
      textWithBlank: `${before}____${after}`,
      lessonTitle: candidate.lessonTitle,
      score: candidate.score,
    });

    takenBlanks.add(dedupKey(before, after));
    bannedAnswers.add(canonicalWord(candidate.answer));
    bannedSentences.add(candidate.sentenceIndex);
    cooledUntil = Math.max(cooledUntil, candidate.sentenceIndex + opts.cooldown);
  }

  return proposals;
}
