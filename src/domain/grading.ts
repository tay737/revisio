// ── Grading engine ──────────────────────────────────────────────────────────
// Pure, dependency-free, deterministic. The server's verdict is final; the
// client may preview but never decide. See ARCHITECTURE.md §7.

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

export function gradeCloze(userAnswer: string, accepted: AcceptedAnswer[]): Verdict {
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

  // 5) wrong content — show the primary answer
  const primary = accepted.find((a) => a.isPrimary) ?? accepted[0];
  return {
    correct: false,
    feedbackKind: 'wrong',
    note: primary ? `Answer: ${primary.text}` : undefined,
  };
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
  if (!user) {
    const primary = accepted.find((a) => a.isPrimary) ?? accepted[0];
    return { correct: false, feedbackKind: 'wrong', note: primary ? `Model answer: ${primary.text}` : 'No answer given.' };
  }

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
    note: `Missing key point(s): ${missedRequired.map((k) => k.phrase).join(', ')}. Model answer: ${rules.text}`,
  };
}

// ── multiple choice ─────────────────────────────────────────────────────────

export function gradeMcq(selectedOptionId: string | null, correctOptionId: string): Verdict {
  if (!selectedOptionId) return { correct: false, feedbackKind: 'wrong', note: 'No selection made.' };
  if (selectedOptionId === correctOptionId) return { correct: true, feedbackKind: 'correct' };
  return { correct: false, feedbackKind: 'wrong', note: 'Incorrect — one attempt only.' };
}
