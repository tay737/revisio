// ── Word & phrase similarity ────────────────────────────────────────────────
// Pure, dependency-free, deterministic. `gradeCloze` matches answers by
// normalised text alone, so a learner who types a plural, a British spelling
// or a same-meaning word is marked wrong with no hint why. This module gives
// the marker a vocabulary for *how* an attempt relates to an accepted answer:
//
//   exact      — the same string after full normalisation
//   inflection — the same word in a different form (breaks → break)
//   synonym    — a different word the dictionary says means the same here
//   typo       — a strong string match that is not a word the dictionary knows
//   none       — unrelated
//
// Two design rules. First, the dictionary is *conservative on purpose*:
// cyber-security terms that look interchangeable to a layperson (threat/risk/
// vulnerability) are deliberately absent, because conflating them would mark
// wrong answers right. Second, the dictionary is extensible: staff can add
// subject-specific groups in settings (ClozeMarkPolicy.extraSynonyms), merged
// with these at compare time. `thesaurus-js` was rejected for this role — it
// is a live scraper (axios + cheerio against thesaurus.com), so it cannot sit
// in a grading path that must be instant, offline-capable and deterministic.

import { fullyNormalized } from './grading';

export type WordRelation = 'exact' | 'inflection' | 'synonym' | 'typo' | 'none';

export type AnswerRelation = {
  relation: WordRelation;
  /** rough confidence in [0,1] — feeds nothing by default, useful for tests */
  score: number;
  /** the accepted answer that produced the best relation */
  matchedText: string;
};

// ── the curated dictionary ──────────────────────────────────────────────────
// Groups of words treated as the same meaning. Every word here was chosen to
// be safe to conflate in study notes; the bar is "a marker would accept it".
// Singular canonical form; inflections are folded before lookup.

const DICTIONARY: string[][] = [
  // computing / general academic
  ['information', 'data'],
  ['unnecessary', 'irrelevant', 'unneeded', 'excess'],
  ['important', 'key', 'significant', 'crucial', 'vital'],
  ['understand', 'comprehend', 'grasp'],
  ['create', 'make', 'build', 'construct'],
  ['use', 'utilise', 'utilize', 'employ'],
  ['check', 'verify', 'validate'],
  ['protect', 'secure', 'safeguard'],
  ['reduce', 'lower', 'decrease', 'minimise', 'minimize'],
  ['increase', 'raise', 'maximise', 'maximize'],
  ['allow', 'permit', 'let'],
  ['stop', 'prevent', 'block'],
  ['remove', 'delete', 'erase'],
  ['show', 'display', 'present'],
  ['hide', 'conceal'],
  ['start', 'begin', 'launch', 'initiate'],
  ['end', 'finish', 'terminate', 'complete'],
  ['help', 'assist', 'aid'],
  ['buy', 'purchase'],
  ['get', 'obtain', 'acquire'],
  ['give', 'provide', 'supply'],
  ['choose', 'select', 'pick'],
  ['find', 'locate', 'discover', 'detect'],
  ['improve', 'enhance', 'refine'],
  ['plan', 'design', 'specify'],
  ['break', 'split', 'divide', 'decompose'],
  ['combine', 'merge', 'join'],
  ['send', 'transmit'],
  ['store', 'save', 'keep', 'retain'],
  ['copy', 'duplicate', 'clone'],
  ['error', 'mistake', 'fault'],
  ['problem', 'issue'],
  ['answer', 'response', 'reply'],
  ['aim', 'goal', 'objective', 'purpose'],
  ['benefit', 'advantage', 'upside'],
  ['drawback', 'disadvantage', 'downside'],
  ['method', 'approach', 'technique', 'way'],
  ['stage', 'step', 'phase'],
  ['rules', 'laws', 'legislation'],
  ['employee', 'worker', 'staff member'],
  ['employer', 'company', 'organisation', 'organization', 'business'],
  ['customer', 'client', 'user'],
  ['sick', 'ill', 'unwell'],
  ['injury', 'harm', 'damage'],
  ['warning', 'caution', 'alert'],
  ['tired', 'fatigued', 'weary'],
  ['stress', 'pressure', 'strain'],
  ['permission', 'consent', 'authorisation', 'authorization'],
  ['personal', 'private'],
  ['public', 'open'],
  ['accurate', 'correct', 'precise', 'exact'],
  ['roughly', 'approximately', 'about'],
  ['quickly', 'rapidly', 'fast', 'swiftly'],
  ['slowly', 'gradually'],
  ['always', 'constantly', 'invariably'],
  ['never', 'at no point'],
  ['many', 'numerous', 'several', 'multiple'],
  ['few', 'little', 'limited'],
  ['big', 'large', 'sizeable', 'sizable'],
  ['small', 'tiny', 'minor'],
  ['new', 'recent', 'modern'],
  ['old', 'outdated', 'obsolete', 'legacy'],
  ['device', 'machine', 'equipment'],
  ['screen', 'monitor', 'display screen'],
  ['password', 'passphrase'],
  ['username', 'user name', 'login name'],
  ['malicious', 'harmful'],
  ['suspicious', 'dodgy', 'questionable'],
  ['update', 'upgrade', 'patch'],
  ['backup', 'back up', 'copy backup'],
  ['scan', 'sweep'],
  ['connect', 'link', 'attach'],
  ['disconnect', 'unlink', 'detach'],
  ['install', 'set up'],
  ['uninstall', 'remove installation'],
  ['encrypt', 'encode', 'cipher'],
  ['decrypt', 'decode'],
  ['steal', 'take', 'exfiltrate'],
  ['fake', 'counterfeit', 'forged', 'bogus'],
  ['identity', 'identity details', 'personal identity'],
  ['track', 'monitor', 'watch'],
  ['gather', 'collect', 'assemble'],
  ['spread', 'propagate', 'circulate'],
  ['target', 'aim at'],
  ['damage', 'harm', 'hurt'],
  ['repair', 'fix', 'mend'],
  ['review', 'examine', 'assess', 'evaluate'],
  ['follow', 'obey', 'comply with', 'adhere to'],
  ['break rules', 'violate', 'breach'],
  ['fine', 'penalty', 'sanction'],
  ['imprisonment', 'jail', 'prison sentence'],
  ['responsible', 'accountable', 'liable'],
  ['required', 'mandatory', 'obligatory', 'compulsory'],
  ['optional', 'voluntary'],
  ['sufficient', 'enough', 'adequate'],
  ['prior', 'previous', 'earlier'],
  ['subsequent', 'later', 'following'],
];

/** Lookup: inflected-canonical word → group index. */
const GROUP_OF = new Map<string, number>();
DICTIONARY.forEach((group, i) => {
  for (const word of group) GROUP_OF.set(canonicalWord(word), i);
});

// ── word folding ────────────────────────────────────────────────────────────

/** Fold a word to a comparable canonical form: accents/punctuation gone, case
 *  gone, simple plural and possessive endings collapsed. Conservative — a
 *  word only folds to another if a marker would call them the same word. */
export function canonicalWord(word: string): string {
  let w = fullyNormalized(word).replace(/\s+/g, ' ');
  if (!w) return '';
  // possessives: "algorithm's" → "algorithm"
  w = w.replace(/'s$/, '');
  // simple plural folds (never for words that would be mangled)
  if (w.length > 4) {
    if (w.endsWith('ies')) w = `${w.slice(0, -3)}y`;
    else if (w.endsWith('sses')) w = w.slice(0, -2);
    else if (/(?:ch|sh|s|x|z)es$/.test(w) && w.length > 5) w = w.slice(0, -2);
    else if (/(?:[^s]s)$/.test(w) && !/(?:ss|us|is|as)$/.test(w)) w = w.slice(0, -1);
  }
  return w;
}

// ── string similarity ───────────────────────────────────────────────────────

/** Normalised Damerau–Levenshtein: 1 − edit distance (transpositions count
 *  as one) over the longer word. One dropped letter in "encrypton"→0.9, a
 *  swapped pair in "malwre"→0.86, while unrelated words land far below any
 *  threshold worth tuning to. */
export function stringSimilarity(a: string, b: string): number {
  const x = canonicalWord(a);
  const y = canonicalWord(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const m = x.length;
  const n = y.length;
  if (m === 0 || n === 0) return 0;
  // two-row dynamic programming with transpositions (optimal string alignment)
  let prev2: number[] | null = null;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let cur = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      let d = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && x[i - 1] === y[j - 2] && x[i - 2] === y[j - 1]) {
        d = Math.min(d, (prev2?.[j - 2] ?? i - 2) + 1);
      }
      cur[j] = d;
    }
    prev2 = prev;
    prev = cur;
    cur = new Array<number>(n + 1);
  }
  return 1 - prev[n] / Math.max(m, n);
}

/** Raw optimal-string-alignment distance behind `stringSimilarity`, for rules
 *  that think in edits rather than ratios. */
export function editDistance(a: string, b: string): number {
  const x = canonicalWord(a);
  const y = canonicalWord(b);
  const m = x.length;
  const n = y.length;
  let prev2: number[] | null = null;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let cur = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      let d = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && x[i - 1] === y[j - 2] && x[i - 2] === y[j - 1]) {
        d = Math.min(d, (prev2?.[j - 2] ?? i - 2) + 1);
      }
      cur[j] = d;
    }
    prev2 = prev;
    prev = cur;
    cur = new Array<number>(n + 1);
  }
  return prev[n];
}

// ── relation between a given answer and an accepted answer ──────────────────

/** How does the learner's word relate to the accepted text? Multi-word
 *  answers align token-by-token; a partial but complete match (user types
 *  "algorithmic" for "algorithmic thinking") counts as an inflection-band
 *  match because the learner clearly knows the term. */
export type CompareOptions = { typoThreshold?: number; shortWordThreshold?: number };

const DEFAULT_THRESHOLDS: Required<CompareOptions> = { typoThreshold: 0.84, shortWordThreshold: 0.92 };

export function compareAnswer(
  userAnswer: string,
  acceptedText: string,
  extraSynonyms: string[][] = [],
  opts: CompareOptions = {},
): AnswerRelation {
  const user = fullyNormalized(userAnswer);
  const accepted = fullyNormalized(acceptedText);
  if (!user || !accepted) return { relation: 'none', score: 0, matchedText: acceptedText };
  if (user === accepted) return { relation: 'exact', score: 1, matchedText: acceptedText };

  const u = canonicalWord(userAnswer);
  const a = canonicalWord(acceptedText);
  if (u === a) return { relation: 'inflection', score: 0.96, matchedText: acceptedText };

  // spacing variants: "user name" vs "username" is the same word typed
  // differently, not a wrong answer
  if (u.replace(/ /g, '') === a.replace(/ /g, '')) {
    return { relation: 'inflection', score: 0.96, matchedText: acceptedText };
  }

  // the dictionary may hold phrases ("staff member"), so try it on the whole
  // strings before any token alignment
  const wholeGroup = groupOf(u, extraSynonyms);
  if (wholeGroup >= 0 && wholeGroup === groupOf(a, extraSynonyms)) {
    return { relation: 'synonym', score: 0.9, matchedText: acceptedText };
  }

  const userTokens = user.split(' ');
  const acceptedTokens = accepted.split(' ');

  const thresholds = { ...DEFAULT_THRESHOLDS, ...opts };

  // token-aligned multi-word comparison: every token must relate
  if (userTokens.length > 1 || acceptedTokens.length > 1) {
    if (userTokens.length === acceptedTokens.length) {
      let worst: AnswerRelation = { relation: 'exact', score: 1, matchedText: acceptedText };
      for (let i = 0; i < userTokens.length; i++) {
        const r = compareAnswer(userTokens[i], acceptedTokens[i], extraSynonyms, opts);
        if (ORDER[r.relation] < ORDER[worst.relation]) worst = { ...r, matchedText: acceptedText };
      }
      return worst;
    }
    // partial-but-complete: the learner's tokens all appear (in order) in the
    // accepted phrase, or the accepted tokens all appear in the learner's
    const [shorter, longer] = userTokens.length < acceptedTokens.length ? [userTokens, acceptedTokens] : [acceptedTokens, userTokens];
    let li = 0;
    let hits = 0;
    for (const token of shorter) {
      let matched = false;
      while (li < longer.length) {
        const r = compareAnswer(token, longer[li], extraSynonyms, opts);
        if (r.relation !== 'none') {
          matched = true;
          hits += 1;
          li += 1;
          break;
        }
        li += 1;
      }
      if (!matched) break;
    }
    if (hits === shorter.length) {
      return { relation: 'inflection', score: 0.85, matchedText: acceptedText };
    }
    return { relation: 'none', score: 0, matchedText: acceptedText };
  }  const dice = stringSimilarity(u, a);
  // A single edit in a word of six letters or more is safe to call a typo —
  // shorter words have too many real neighbours at one edit away. Otherwise
  // the tuned floor decides.
  const singleEdit = Math.min(u.length, a.length) >= 6 && editDistance(u, a) <= 1;
  // short words must clear a higher bar: one wrong letter in a 4-letter word
  // is more often a different word than a typo
  const floor = Math.min(u.length, a.length) < 5 ? thresholds.shortWordThreshold : thresholds.typoThreshold;
  if (singleEdit || dice >= floor) return { relation: 'typo', score: dice, matchedText: acceptedText };

  return { relation: 'none', score: 0, matchedText: acceptedText };
}

const ORDER: Record<WordRelation, number> = { exact: 0, inflection: 1, synonym: 2, typo: 3, none: 4 };

function groupOf(canonical: string, extraSynonyms: string[][]): number {
  const builtin = GROUP_OF.get(canonical);
  if (builtin !== undefined) return builtin;
  for (let i = 0; i < extraSynonyms.length; i++) {
    if (extraSynonyms[i].some((word) => canonicalWord(word) === canonical)) return 10_000 + i;
  }
  return -1;
}

/** The single lookup callers want: best relation across every accepted answer. */
export function bestRelation(
  userAnswer: string,
  acceptedTexts: string[],
  extraSynonyms: string[][] = [],
  opts: CompareOptions = {},
): AnswerRelation {
  let best: AnswerRelation = { relation: 'none', score: 0, matchedText: acceptedTexts[0] ?? '' };
  for (const text of acceptedTexts) {
    const r = compareAnswer(userAnswer, text, extraSynonyms, opts);
    if (ORDER[r.relation] < ORDER[best.relation]) best = r;
  }
  return best;
}
