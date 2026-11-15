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
export const STOPLIST = new Set(
  [
    'about','above','across','after','again','against','alongside','amid','amidst','as','behind','beneath','beside','besides','beyond','concerning','despite','except','inside','outside','past','plus','regarding','round','save','throughout','till','unto','versus','via','worth','a','all','also','always','among','an','and','another','any','are','around','at','because','been','before','being','below','between','both','but','by','can','cannot','could','did','do','does','doing','done','down','during','each','either','else','enough','even','ever','every','few','first','for','found','from','further','get','give','had','has','have','having','he','her','here','hers','him','his','how','however','if','in','include','includes','including','into','is','it','its','itself','just','keep','last','later','least','less','like','made','make','many','may','me','might','more','most','much','must','my','near','need','needs','neither','never','next','not','now','of','off','often','on','once','one','only','onto','or','other','others','our','ours','out','over','own','per','perhaps','rather','really','same','should','since','so','some','such','take','than','that','the','their','theirs','them','then','there','these','they','this','those','through','to','too','toward','under','until','up','upon','us','use','used','uses','using','very','was','way','we','well','were','what','when','where','whether','which','while','who','whom','whose','why','will','with','within','without','would','yet','you','your','yours',
    // judgements about the notes, not content
    'example','examples','note','notes','summary','specification','revision','question','questions','mean','means','meant','meaning','become','becomes','becoming','remain','remains',
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
// A blank has to cover a whole term, not half of one. Single-token blanks split
// phrases ("subject access ____"), so candidates are mostly multi-word spans:
// every window of 2–6 tokens that holds at least two content words and whose
// content-word sequence recurs in the notes (count ≥ 2) is a candidate. The
// recurrence rule is what keeps this honest — a word pair that appears twice is
// a term the notes are teaching; a pair that appears once is just two words
// that happened to sit together. Single tokens stay as candidates for terms
// the notes repeat but never phrase, and they step aside inside a recurring
// phrase so "access" is never blanked out of "subject access request".

type Token = { text: string; index: number; end: number };
type Candidate = {
  answer: string;
  index: number; // char offset where the blank starts
  end: number; // char offset where the blank ends
  score: number;
  sentenceIndex: number;
  lessonTitle: string;
};

function tokenize(sentence: string): Token[] {
  const out: Token[] = [];
  for (const m of sentence.matchAll(WORD_RE)) {
    const index = m.index ?? 0;
    out.push({ text: m[0], index, end: index + m[0].length });
  }
  return out;
}

/** A token worth building a blank around: long enough, not glue, not a title word. */
function isContentToken(token: string, titleWords: Set<string>): boolean {
  const canonical = canonicalWord(token);
  if (canonical.length < 3) return false;
  if (STOPLIST.has(token.toLowerCase()) || STOPLIST.has(canonical)) return false;
  if (/^(.)\1+$/.test(canonical)) return false;
  if (titleWords.has(canonical)) return false;
  return true;
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

/** Canonical token sequence of an answer, for overlap checks between candidates. */
function canonSeq(text: string): string[] {
  return fullyNormalized(text)
    .split(' ')
    .filter(Boolean)
    .map((w) => canonicalWord(w))
    .filter(Boolean);
}

/** Is `small` a contiguous run inside `big`? Used so "data protection" and
 *  "data protection act" never both become cards — they are the same fact. */
function isSubseq(small: string[], big: string[]): boolean {
  if (small.length === 0 || small.length > big.length) return false;
  for (let i = 0; i + small.length <= big.length; i++) {
    let ok = true;
    for (let j = 0; j < small.length; j++) {
      if (small[j] !== big[i + j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
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

  // ── phrase candidates: windows of 2–6 tokens holding ≥2 content words.
  // The blank spans from the first to the last content token, so glue words
  // inside a term ("health and safety") stay inside the answer.
  const MAX_WINDOW = 6;
  const phraseCounts = new Map<string, number>();
  const phraseOccurrences = new Map<
    string,
    { sentenceIndex: number; answer: string; index: number; end: number; contentCount: number }[]
  >();

  sentences.forEach((sentence, sentenceIndex) => {
    const tokens = tokenize(sentence.text);
    const content = tokens.map((t) => isContentToken(t.text, titleWords));
    const seenSpans = new Set<string>();
    const countedKeys = new Set<string>();
    for (let start = 0; start < tokens.length; start++) {
      for (let len = 2; len <= MAX_WINDOW && start + len <= tokens.length; len++) {
        const window = tokens.slice(start, start + len);
        const contentPos = window.map((_, i) => i).filter((i) => content[start + i]);
        if (contentPos.length < 2 || contentPos.length > 5) continue;
        const first = window[contentPos[0]];
        const last = window[contentPos[contentPos.length - 1]];
        const key = contentPos.map((i) => canonicalWord(window[i].text)).join(' ');
        const spanId = `${key}@${first.index}`;
        if (seenSpans.has(spanId)) continue;
        seenSpans.add(spanId);
        const answer = sentence.text.slice(first.index, last.end).trim();
        if (answer.length < 6 || answer.length > 90 || /[,;:!?]/.test(answer)) continue;
        // Recurrence is document frequency: a phrase counts once per sentence.
        if (!countedKeys.has(key)) {
          countedKeys.add(key);
          phraseCounts.set(key, (phraseCounts.get(key) ?? 0) + 1);
        }
        const list = phraseOccurrences.get(key) ?? [];
        list.push({ sentenceIndex, answer, index: first.index, end: last.end, contentCount: contentPos.length });
        phraseOccurrences.set(key, list);
      }
    }
  });

  // Only phrases the notes repeat earn a blank; a one-off word pair is not a term.
  const coveredSpans: { index: number; end: number }[][] = sentences.map(() => []);
  const candidates: Candidate[] = [];
  for (const [key, occurrences] of phraseOccurrences) {
    const count = phraseCounts.get(key) ?? 0;
    if (count < 2) continue;
    for (const occ of occurrences) {
      candidates.push({
        answer: occ.answer,
        index: occ.index,
        end: occ.end,
        score: count * 4 + occ.contentCount,
        sentenceIndex: occ.sentenceIndex,
        lessonTitle: sentences[occ.sentenceIndex].lessonTitle,
      });
      coveredSpans[occ.sentenceIndex].push({ index: occ.index, end: occ.end });
    }
  }

  // Single-token candidates for terms the notes repeat but never phrase —
  // and never inside a recurring phrase, where they would split the term.
  const startsUpper = (t: Token | undefined) => !!t && /^\p{Lu}/u.test(t.text);
  sentences.forEach((sentence, sentenceIndex) => {
    const tokens = tokenize(sentence.text);
    tokens.forEach((token, ti) => {
      if (coveredSpans[sentenceIndex].some((s) => token.index >= s.index && token.index < s.end)) return;
      const score = scoreToken(token.text, titleWords, vocabulary);
      if (score <= 0) return;
      // A capitalised word beside another capitalised word is part of a name
      // ("Data Protection Act"); blanking it leaves half a term behind.
      if (startsUpper(token) && (startsUpper(tokens[ti - 1]) || startsUpper(tokens[ti + 1]))) return;
      candidates.push({
        answer: token.text,
        index: token.index,
        end: token.index + token.text.length,
        score,
        sentenceIndex,
        lessonTitle: sentence.lessonTitle,
      });
    });
  });

  const proposals: ClozeProposal[] = [];
  const bannedSentences = new Set<number>();
  const bannedAnswers: string[][] = [];
  let cooledUntil = -1; // global sentence index up to which new picks are banned

  candidates.sort((a, b) => b.score - a.score || a.sentenceIndex - b.sentenceIndex || a.index - b.index);

  for (const candidate of candidates) {
    if (proposals.length >= opts.max) break;
    const candSeq = canonSeq(candidate.answer);
    if (candSeq.length === 0) continue;
    if (bannedAnswers.some((b) => isSubseq(b, candSeq) || isSubseq(candSeq, b))) continue;
    if (candidate.sentenceIndex <= cooledUntil || bannedSentences.has(candidate.sentenceIndex)) continue;

    const sentence = sentences[candidate.sentenceIndex];
    const before = sentence.text.slice(0, candidate.index);
    const after = sentence.text.slice(candidate.end);
    // A blank needs context on at least one side, or the "question" is the
    // whole sentence with a hole in it.
    if (before.trim().length + after.trim().length < 20) continue;
    if (takenBlanks.has(dedupKey(before, after))) continue;

    proposals.push({
      answer: candidate.answer.trim(),
      textWithBlank: `${before}____${after}`,
      lessonTitle: candidate.lessonTitle,
      score: candidate.score,
    });

    takenBlanks.add(dedupKey(before, after));
    bannedAnswers.push(candSeq);
    bannedSentences.add(candidate.sentenceIndex);
    cooledUntil = Math.max(cooledUntil, candidate.sentenceIndex + opts.cooldown);
  }

  return proposals;
}
