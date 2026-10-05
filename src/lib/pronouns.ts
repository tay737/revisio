// Pronouns — the one profile field the app must never infer, guess, or fill in
// on someone's behalf. So this module owns exactly three things and nothing else:
//
//   • the shortlist of chips offered in Settings (never the whole answer)
//   • the shape a saved value may take
//   • how a typed answer is normalised before it is stored
//
// Free text is the answer; the chips are a shortcut. A closed list would have
// been easier to render and would have quietly told anyone outside it that they
// were not a case the product had thought about.
//
// Client-safe on purpose (no `server-only`): the settings form uses it to grey
// out its own Save before the request is made, and `PATCH /api/v1/me` imports
// the same functions to enforce what the form promised. One owner, so the two
// cannot disagree about what a legal value is. `scripts/native/make-account.mjs`
// emits the shortlist and the cap into Kotlin and Swift, so a phone cannot offer
// a different set of chips than the website.

/** Long enough for "she/they/her" and "Ask me — pronouns are personal". */
export const PRONOUN_MAX = 40;

/**
 * The chips. Ordering is deliberate: the three that answer "how do you refer to
 * me" most often come first, combinations follow, and the escape hatch ("ask me")
 * is last because reaching for it should be a deliberate act, not a default.
 */
export const PRONOUN_SUGGESTIONS = [
  'she/her',
  'he/him',
  'they/them',
  'she/they',
  'he/they',
  'ask me',
] as const;

/** The punctuation a pronoun set may actually contain. */
const ALLOWED_PUNCTUATION = new Set([
  ' ', '/', '-', '_', '+', ',', '.', '(', ')', "'", '&', '’',
]);

/**
 * Why this value cannot be saved, or null when it can.
 *
 * Letters, digits and marks are always fine in any script; the punctuation set
 * is the short list that covers the shapes people actually write ("she/her",
 * "he/they", "(ask me)", "Mx/they"). Anything else — a control character, a
 * newline, an angle bracket — is refused rather than stored, because this value
 * is rendered next to someone's name on a page strangers load.
 */
export function pronounsProblem(raw: string): string | null {
  const value = normalisePronouns(raw);
  if (value === null) return null; // empty is "I don't have any", not a problem
  if (value.length > PRONOUN_MAX) return `Keep it under ${PRONOUN_MAX} characters.`;
  for (const ch of value) {
    if (/[\p{L}\p{M}\p{N}]/u.test(ch)) continue;
    if (ALLOWED_PUNCTUATION.has(ch)) continue;
    return 'Pronouns are letters and a few marks — slash, hyphen, comma, brackets.';
  }
  return null;
}

/**
 * The value to store: trimmed, whitespace collapsed, empty becomes null.
 *
 * Case is deliberately preserved. "Ze/Zir" and "ZE/ZIR" are the same set to a
 * reader but the first is how the person chose to write it, and lowercasing a
 * person's own words about themselves is not ours to do.
 */
export function normalisePronouns(raw: string | null | undefined): string | null {
  const value = (raw ?? '').replace(/\s+/g, ' ').trim();
  return value.length === 0 ? null : value;
}