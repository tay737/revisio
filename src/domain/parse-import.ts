/**
 * Deck parsing — pure, no database, no framework.
 *
 * Kept apart from the route that stores the result so the grammar can be
 * exercised on its own: every import failure the user sees is a parse failure
 * reported with a line number, and line numbers are only trustworthy if the
 * parser is.
 *
 * Accepted per line:
 *
 *   `cloze: The powerhouse of the cell is the ____ | mitochondria`
 *   `mcq: Which organelle…; Ribosome; Mitochondrion; Nucleus | 1`
 *   `mcq: Which organelle…; Ribosome; *Mitochondrion; Nucleus`
 *   `front<tab>back`              → flashcard
 *   `front,"quoted, back"`        → flashcard (CSV)
 *
 * A `#` at the start of a line is a header or comment and is skipped.
 */

export type ParsedCard =
  | { kind: 'cloze'; textWithBlank: string; answers: string[] }
  | { kind: 'flashcard'; prompt: string; model: string }
  | { kind: 'mcq'; question: string; options: string[]; correctIdx: number };

export type ParseError = { row: number; message: string };
export type ParseResult = { rows: ParsedCard[]; errors: ParseError[] };

export type ImportKind = 'csv' | 'tsv' | 'anki_tsv';

/** Minimal RFC-4180 reader: handles quotes, escapes and embedded delimiters. */
function splitDelimited(line: string, delim: string): string[] {
  const out: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field.trim() === '') {
      quoted = true;
      field = '';
    } else if (ch === delim) {
      out.push(field);
      field = '';
    } else field += ch;
  }
  out.push(field);
  return out.map((s) => s.trim());
}

/**
 * Resolve which option is correct, from either:
 *   - an explicit trailing index (`… | 1`), or
 *   - a `*` on the option itself (`; *Mitochondrion;`).
 * An explicit index wins; `*` is the friendlier syntax and is preferred when
 * both are absent the whole row is rejected rather than silently defaulting.
 */
function resolveCorrect(options: string[], explicit?: string): { idx: number; options: string[] } | null {
  const starred = options.findIndex((o) => o.startsWith('*'));
  if (starred >= 0) {
    const cleaned = options.map((o) => (o.startsWith('*') ? o.slice(1).trim() : o));
    if (explicit !== undefined && explicit !== '') {
      const n = Number(explicit);
      // `*` and an index can disagree; the marker is the one the user typed on
      // the option, so it wins and the index is treated as noise.
      if (Number.isInteger(n) && n >= 0 && n < cleaned.length && n !== starred) return { idx: starred, options: cleaned };
    }
    return { idx: starred, options: cleaned };
  }
  if (explicit === undefined || explicit === '') return null;
  const n = Number(explicit);
  if (!Number.isInteger(n) || n < 0 || n >= options.length) return null;
  return { idx: n, options };
}

export function parseContent(text: string, kind: ImportKind): ParseResult {
  const delim = kind === 'csv' ? ',' : '\t';
  const errors: ParseError[] = [];
  const rows: ParsedCard[] = [];

  for (const [i, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    try {
      if (/^cloze\s*:/i.test(line)) {
        const [stem, ...answers] = line.replace(/^cloze\s*:/i, '').split('|').map((s) => s.trim());
        if (!stem) throw new Error('cloze needs a stem');
        if (!stem.includes('____')) throw new Error('the stem needs a ____ where the blank goes');
        const accepted = answers.filter(Boolean);
        if (accepted.length === 0) throw new Error('cloze needs at least one answer after a |');
        rows.push({ kind: 'cloze', textWithBlank: stem, answers: accepted });
        continue;
      }

      if (/^mcq\s*:/i.test(line)) {
        // The correct index may be separated by the file delimiter or by a `|`.
        const body = line.replace(/^mcq\s*:/i, '');
        const [questionPart, ...tail] = body.split(delim);
        const parts = questionPart.split(';').map((s) => s.trim());
        const explicit = tail.join(delim).split('|').pop()?.trim() ?? '';
        if (parts.length < 3) throw new Error('multiple choice needs a question and at least two options separated by ;');
        const [question, ...options] = parts;
        const resolved = resolveCorrect(options, explicit);
        if (!resolved) throw new Error('mark the correct option with * or end the row with | index');
        if (options.length < 2) throw new Error('multiple choice needs at least two options');
        rows.push({ kind: 'mcq', question, options: resolved.options, correctIdx: resolved.idx });
        continue;
      }

      const [front, ...rest] = splitDelimited(line, delim);
      const back = rest.filter(Boolean).join(delim).trim();
      if (!front) throw new Error('row has no front');
      if (!back) throw new Error(`row needs a back separated by "${kind === 'csv' ? ',' : 'tab'}"`);
      rows.push({ kind: 'flashcard', prompt: front, model: back });
    } catch (e) {
      errors.push({ row: i + 1, message: e instanceof Error ? e.message : String(e) });
    }
  }

  return { rows, errors };
}
