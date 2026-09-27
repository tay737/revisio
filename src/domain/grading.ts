// ── Grading engine ──────────────────────────────────────────────────────────
// Pure, dependency-free, deterministic. The server's verdict is final; the
// client may preview but never decide. See ARCHITECTURE.md §7.
//
// Cloze marking has two modes. `legacy` is the ladder below, byte-identical to
// the behaviour the grading vectors pin for the native ports — the default, and
// what `gradeCloze` always means. `similar` adds one final rung before
// "wrong": a word that *means* the accepted answer (inflection, synonym,
// strong-typo band, via `domain/similarity`) is marked **incorrect** with a
// warning instead of silently wrong. The warning travels as a `similarity`
// field, never as a new feedbackKind — the native engines decode
// feedbackKind as a closed enum, and an unknown string would break their
// decoding of every review.

import { bestRelation, type WordRelation } from './similarity';

export type FeedbackKind =
  | 'correct'
  | 'case_only'
  | 'punctuation_only'
  | 'case_and_punctuation'
  | 'near_miss'
  | 'wrong';

export type Verdict = {
  correct: boolean;
  feedbackKind: FeedbackKind;
  matchedAnswerId?: string;
  /** human-friendly notes, e.g. "watch your capitalisation" */
  note?: string;
  /** which keyword groups were matched / missed (flashcards) */
  matchedPhrases?: string[];
  missedPhrases?: string[];
  /**
   * Set only when similar-marking is on and the attempt meant the right thing
   * with the wrong word. The verdict is still incorrect — this field explains
   * why it was close, so the UI can warn instead of just going red.
   */
  similarity?: { relation: Exclude<WordRelation, 'exact' | 'none'>; matchedAnswer: string };
};

export type AcceptedAnswer = {
  id: string;
  text: string;
  isPrimary: boolean;
  keywords?: { required: boolean; phrase: string; synonyms?: string[] }[] | null;
  minPoints?: number | null;
};

// ── normalization ───────────────────────────────────────────────────────────

export function normalize(input: string): string {
  return input.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

export function lowercase(input: string): string {
  return normalize(input).toLowerCase();
}

export function stripPunctuation(input: string): string {
  return normalize(input)
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripAccents(input: string): string {
  return input.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function fullyNormalized(input: string): string {
  return stripPunctuation(stripAccents(lowercase(input)));
}

// ── cloze ───────────────────────────────────────────────────────────────────

/** How strictly cloze answers are marked. Defaults reproduce legacy grading. */
export type ClozeMarkPolicy = {
  /** `legacy` = today's ladder only; `similar` adds the meaning-aware rung. */
  mode: 'legacy' | 'similar';
  /** Dice-coefficient floor for typo-band matches (0–1). */
  typoThreshold?: number;
  /** Tighter floor for words under five letters, where one wrong letter is
   *  more often a different word than a typo. */
  shortWordThreshold?: number;
  /** Staff-added same-meaning groups, e.g. [["phishing","fraud"]]. Merged
   *  with the built-in dictionary at compare time. */
  extraSynonyms?: string[][];
};

export const DEFAULT_CLOZE_POLICY: Required<Omit<ClozeMarkPolicy, 'extraSynonyms'>> & Pick<ClozeMarkPolicy, 'extraSynonyms'> = {
  mode: 'legacy',
  typoThreshold: 0.84,
  shortWordThreshold: 0.92,
};

export function gradeCloze(userAnswer: string, accepted: AcceptedAnswer[]): Verdict {
  return gradeClozeWithPolicy(userAnswer, accepted, DEFAULT_CLOZE_POLICY);
}

export function gradeClozeWithPolicy(
  userAnswer: string,
  accepted: AcceptedAnswer[],
  policy: ClozeMarkPolicy,
): Verdict {
  const user = normalize(userAnswer);
  if (!user) return { correct: false, feedbackKind: 'wrong', note: 'No answer given.' };

  // 1) exact match (after whitespace normalization)
  const exact = accepted.find((a) => normalize(a.text) === user);
  if (exact) return { correct: true, feedbackKind: 'correct', matchedAnswerId: exact.id };

  // 2) case-only difference → correct with a nudge
  const caseInsensitive = accepted.find((a) => lowercase(a.text) === lowercase(user));
  if (caseInsensitive) {
    return {
      correct: true,
      feedbackKind: 'case_only',
      matchedAnswerId: caseInsensitive.id,
      note: 'Correct — mind your capitalisation.',
    };
  }

  // 3) punctuation-only difference → correct with a nudge
  const punctInsensitive = accepted.find(
    (a) => stripPunctuation(lowercase(a.text)) === stripPunctuation(lowercase(user))
  );
  if (punctInsensitive) {
    return {
      correct: true,
      feedbackKind: 'punctuation_only',
      matchedAnswerId: punctInsensitive.id,
      note: 'Correct — check your punctuation.',
    };
  }

  // 4) both case + punctuation differ (e.g. "atp" vs "ATP.") → still correct
  const loose = accepted.find(
    (a) => stripPunctuation(stripAccents(lowercase(a.text))) === stripPunctuation(stripAccents(lowercase(user)))
  );
  if (loose) {
    return {
      correct: true,
      feedbackKind: 'case_and_punctuation',
      matchedAnswerId: loose.id,
      note: 'Correct — check capitalisation and punctuation.',
    };
  }

  // 5) wrong content — or, when similar-marking is on, one last rung: the
  // attempt may *mean* the answer without being it. Marked incorrect either
  // way; the similarity field is the warning that says how close it was. The
  // feedbackKind stays `wrong` (native engines decode it as a closed enum),
  // and the schedule treats it as a lapse — knowing the idea is not knowing
  // the word, and the word is what was asked.
  if (policy.mode === 'similar') {
    const relation = bestRelation(
      user,
      accepted.map((a) => a.text),
      policy.extraSynonyms ?? [],
      { typoThreshold: policy.typoThreshold, shortWordThreshold: policy.shortWordThreshold },
    );
    if (relation.relation === 'inflection') {
      return {
        correct: false,
        feedbackKind: 'wrong',
        note: `Right word, wrong form — the answer is written as “${relation.matchedText}”.`,
        similarity: { relation: 'inflection', matchedAnswer: relation.matchedText },
      };
    }
    if (relation.relation === 'synonym') {
      return {
        correct: false,
        feedbackKind: 'wrong',
        note: `Close in meaning, but “${relation.matchedText}” was the answer. Learn the exact term.`,
        similarity: { relation: 'synonym', matchedAnswer: relation.matchedText },
      };
    }
    if (relation.relation === 'typo') {
      return {
        correct: false,
        feedbackKind: 'wrong',
        note: `Nearly the answer, but not it — the blank wants “${relation.matchedText}”. Spelling is part of the recall.`,
        similarity: { relation: 'typo', matchedAnswer: relation.matchedText },
      };
    }
  }

  // 6) wrong content. The verdict says only *what was wrong with the attempt*;
  // the right answer travels separately as `primaryAnswer` on the result, so it
  // is stated once. Repeating it here printed it twice on the same card — once
  // as the filled blank, once as a note underneath.
  return { correct: false, feedbackKind: 'wrong' };
}

// ── flashcards (keyword-based marking) ──────────────────────────────────────

function includesPhrase(haystack: string, needle: string, synonyms: string[] = []): boolean {
  const candidates = [needle, ...synonyms].map(fullyNormalized);
  return candidates.some((c) => haystack.includes(c));
}

export function gradeFlashcard(
  userAnswer: string,
  accepted: AcceptedAnswer[],
  opts: { minPoints?: number } = {}
): Verdict {
  const user = fullyNormalized(userAnswer);
  if (!user) return { correct: false, feedbackKind: 'wrong', note: 'No answer given.' };

  const rules = accepted.find((a) => a.keywords && a.keywords.length > 0);
  if (!rules?.keywords) {
    // no keyword rules — fall back to cloze-style loose comparison
    return gradeCloze(userAnswer, accepted);
  }

  const minPoints = opts.minPoints ?? rules.minPoints ?? 2;
  const required = rules.keywords.filter((k) => k.required);
  const optional = rules.keywords.filter((k) => !k.required);

  const matchedRequired = required.filter((k) => includesPhrase(user, k.phrase, k.synonyms));
  const matchedOptional = optional.filter((k) => includesPhrase(user, k.phrase, k.synonyms));

  const matchedPhrases = [...matchedRequired, ...matchedOptional].map((k) => k.phrase);
  const missedRequired = required.filter((k) => !matchedRequired.includes(k));
  const missedOptional = optional.filter((k) => !matchedOptional.includes(k));
  const missedPhrases = [...missedRequired, ...missedOptional].map((k) => k.phrase);

  const requiredOk = matchedRequired.length === required.length;
  const pointsOk = matchedRequired.length + matchedOptional.length >= minPoints;

  if (requiredOk && pointsOk) {
    return {
      correct: true,
      feedbackKind: 'correct',
      matchedAnswerId: rules.id,
      matchedPhrases,
      missedPhrases,
      note: matchedOptional.length > 0 || missedOptional.length > 0
        ? `Covered: ${matchedPhrases.join(', ')}.`
        : undefined,
    };
  }

  if (requiredOk && !pointsOk) {
    return {
      correct: false,
      feedbackKind: 'near_miss',
      matchedAnswerId: rules.id,
      matchedPhrases,
      missedPhrases,
      note: `Good start — also include: ${missedOptional.slice(0, 3).map((k) => k.phrase).join(', ')}.`,
    };
  }

  return {
    correct: false,
    feedbackKind: requiredOk ? 'near_miss' : 'wrong',
    matchedAnswerId: rules.id,
    matchedPhrases,
    missedPhrases,
    // The matched and missed points are rendered from the lists above and the
    // right answer arrives as `modelAnswer`, so the note says only how it went.
    // Naming them again here printed the same sentences three times on one card.
    note: requiredOk ? 'Close — some required points were missing.' : 'Some required points were missing.',
  };
}

// ── multiple choice ─────────────────────────────────────────────────────────

export function gradeMcq(selectedOptionId: string | null, correctOptionId: string): Verdict {
  if (!selectedOptionId) return { correct: false, feedbackKind: 'wrong', note: 'No selection made.' };
  if (selectedOptionId === correctOptionId) return { correct: true, feedbackKind: 'correct' };
  return { correct: false, feedbackKind: 'wrong', note: 'Incorrect — one attempt only.' };
}
