/**
 * Shared types and helpers for the Learn subject and topic screens.
 *
 * Kept client-safe (no server-only imports) so both route components and the
 * test-free typechecking surface can import from one place.
 */

export type Topic = {
  id: string;
  name: string;
  description: string;
  visibility: string;
  cards?: number;
  lessons?: number;
  /** Cards the learner has met (a scheduler state exists), out of `cards`. */
  met?: number;
  /** Spec references declared by the topic's lessons, deduped, in lesson order. */
  specRefs: string[];
};

/**
 * The leading unit code of a topic — the text before the first dash/dash-like
 * separator ("1.1.1 – 1.1.2 Pattern Recognition" → "1.1.1 – 1.1.2"). Topics
 * without a code land in "Other". Pure presentation-ordering, not data.
 */
export function unitFromTopic(t: { name: string }): string {
  const m = t.name.match(/^([\d.]+(?:\s*[–—-]\s*[\d.]+)?)/);
  if (!m) return 'Other';
  const code = m[1].trim();
  return /\d/.test(code) ? code : 'Other';
}

/**
 * Numeric sort on the leading version-like code so 1.2 < 1.10 < 1.1.11.
 * Tokens are split on dots AND dashes, then compared segment-by-segment as
 * numbers — comparing `parseFloat("1.1.11")` against `parseFloat("1.1.3")`
 * ties at 1.1 and silently falls back to a lexical compare, which is what put
 * 1.1.11 before 1.1.3 on the subject screen.
 */
export function topicSortKey(a: string | Topic, b: string | Topic): number {
  const ka = sortTokens(typeof a === 'string' ? a : unitFromTopic(a));
  const kb = sortTokens(typeof b === 'string' ? b : unitFromTopic(b));
  const n = Math.max(ka.length, kb.length);
  for (let i = 0; i < n; i++) {
    const va = ka[i];
    const vb = kb[i];
    if (va === undefined) return vb === undefined ? 0 : -1;
    if (vb === undefined) return 1;
    const na = Number(va);
    const nb = Number(vb);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) {
      if (na !== nb) return na - nb;
      continue;
    }
    const c = va.localeCompare(vb);
    if (c !== 0) return c;
  }
  return 0;
}

function sortTokens(key: string): string[] {
  return key.split(/[\s–—.-]+/).filter(Boolean);
}
