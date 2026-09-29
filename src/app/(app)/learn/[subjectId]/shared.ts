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
  /** Spec references declared by the topic's lessons, deduped, in lesson order. */
  specRefs: string[];
};

/**
 * The leading unit code of a topic — the text before the first dash/dash-like
 * separator ("1.1.1 – 1.1.2 Pattern Recognition" → "1.1.1 – 1.1.2"). Topics
 * without a code land in "Other". Pure presentation-ordering, not data.
 */
export function unitFromTopic(t: Topic): string {
  const m = t.name.match(/^([\d.]+(?:\s*[–—-]\s*[\d.]+)?)/);
  if (!m) return 'Other';
  const code = m[1].trim();
  return /\d/.test(code) ? code : 'Other';
}

/** Numeric sort on the leading version-like code so 1.10 > 1.2 but 1.2 < 1.10 stays readable. */
export function topicSortKey(a: string | Topic, b: string | Topic): number {
  const ka = (typeof a === 'string' ? a : unitFromTopic(a)).split(/[\s–—-]+/).filter(Boolean);
  const kb = (typeof b === 'string' ? b : unitFromTopic(b)).split(/[\s–—-]+/).filter(Boolean);
  const n = Math.max(ka.length, kb.length);
  for (let i = 0; i < n; i++) {
    const va = ka[i] ?? '';
    const vb = kb[i] ?? '';
    const na = parseFloat(va);
    const nb = parseFloat(vb);
    if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
    if (va !== vb) return va.localeCompare(vb);
  }
  return 0;
}
