// ── Markdown → render model ─────────────────────────────────────────────────
// Pure, dependency-free, deterministic. Notes are authored as markdown; this
// module turns that text into a block tree the shared <Markdown/> component
// renders as real React elements — never dangerouslySetInnerHTML — so a note
// cannot inject markup and the parser can be checked with tsc alone.
//
// Supported: #–#### headings, paragraphs, **bold** / *italic* / `code`,
// [links](url), ![images](url), - / * / numbered lists (one nesting level),
// > blockquotes (multi-line), ``` fenced code, | tables |, --- rules, and
// math written between $…$ or $$…$$ rendered as styled math text. Inline
// formatting is applied uniformly everywhere (headings, quotes, cells).

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'bold'; c: Inline[] }
  | { t: 'italic'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'math'; v: string; display: boolean }
  | { t: 'link'; href: string; c: Inline[] }
  | { t: 'img'; alt: string; src: string };

export type Block =
  | { t: 'p'; c: Inline[] }
  | { t: 'h'; level: 1 | 2 | 3 | 4; c: Inline[] }
  | { t: 'quote'; c: Block[] }
  | { t: 'code'; v: string; lang: string }
  | { t: 'ul'; items: { c: Inline[]; sub: Inline[][] }[] }
  | { t: 'ol'; items: { c: Inline[]; sub: Inline[][] }[] }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] }
  | { t: 'hr' };

// ── inline parsing ──────────────────────────────────────────────────────────

/** Parse one line's inline content. Ordered: math before code before emphasis,
 *  so `$x_1$` and `**a *b* c**` both come out right. */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  let i = 0;
  const flush = () => {
    if (buf) out.push({ t: 'text', v: buf });
    buf = '';
  };

  while (i < src.length) {
    const rest = src.slice(i);

    // $$display math$$
    if (rest.startsWith('$$')) {
      const end = src.indexOf('$$', i + 2);
      if (end > -1) {
        flush();
        out.push({ t: 'math', v: src.slice(i + 2, end).trim(), display: true });
        i = end + 2;
        continue;
      }
    }
    // $inline math$ — guarded so prices ("$5") do not become math.
    if (src[i] === '$' && /\$[^$\s].*?[^$\s]\$|^\$[^$\s]\$/.test(rest)) {
      const end = src.indexOf('$', i + 1);
      if (end > -1) {
        flush();
        out.push({ t: 'math', v: src.slice(i + 1, end).trim(), display: false });
        i = end + 1;
        continue;
      }
    }
    // `code`
    if (src[i] === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > -1) {
        flush();
        out.push({ t: 'code', v: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    // ![alt](src) before [text](href)
    const img = rest.match(/^!\[([^\]]*)\]\(([^)\s]+)\)/);
    if (img) {
      flush();
      out.push({ t: 'img', alt: img[1], src: img[2] });
      i += img[0].length;
      continue;
    }
    const link = rest.match(/^\[([^\]]*)\]\(([^)\s]+)\)/);
    if (link) {
      flush();
      out.push({ t: 'link', href: link[2], c: parseInline(link[1]) });
      i += link[0].length;
      continue;
    }
    // **bold** then *italic*
    if (rest.startsWith('**')) {
      const end = src.indexOf('**', i + 2);
      if (end > -1) {
        flush();
        out.push({ t: 'bold', c: parseInline(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if (src[i] === '*') {
      const end = src.indexOf('*', i + 1);
      if (end > -1) {
        flush();
        out.push({ t: 'italic', c: parseInline(src.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    buf += src[i];
    i += 1;
  }
  flush();
  return out;
}

// ── block parsing ───────────────────────────────────────────────────────────

const UNORDERED = /^\s{0,3}[-*]\s+(.*)$/;
const ORDERED = /^\s{0,3}(\d+)[.)]\s+(.*)$/;
const HEAD = /^\s{0,3}(#{1,4})\s+(.*)$/;
const HRULE = /^\s{0,3}(---+|\*\*\*+)\s*$/;

/** Split a table row on `|`, tolerating escaped `\|` cells. */
function splitRow(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\' && line[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (line[i] === '|') {
      cells.push(cur.trim());
      cur = '';
    } else cur += line[i];
  }
  cells.push(cur.trim());
  return cells;
}

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // fenced code
    const fence = line.match(/^\s*```\s*(\S*)\s*$/);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // closing fence (or EOF)
      blocks.push({ t: 'code', v: body.join('\n'), lang: fence[1] ?? '' });
      continue;
    }

    if (HRULE.test(line)) {
      blocks.push({ t: 'hr' });
      i++;
      continue;
    }

    const head = line.match(HEAD);
    if (head) {
      blocks.push({ t: 'h', level: head[1].length as 1 | 2 | 3 | 4, c: parseInline(head[2].replace(/\s#+\s*$/, '')) });
      i++;
      continue;
    }

    // blockquote: gather consecutive `>` lines, then re-parse their body
    if (/^\s{0,3}>/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) {
        body.push(lines[i].replace(/^\s{0,3}>\s?/, ''));
        i++;
      }
      blocks.push({ t: 'quote', c: parseMarkdown(body.join('\n')) });
      continue;
    }

    // tables: a header row, a |---|---| separator, then rows
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) {
      const headCells = splitRow(line.replace(/^\s*\|/, '').replace(/\|\s*$/, ''));
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(splitRow(lines[i].replace(/^\s*\|/, '').replace(/\|\s*$/, '')).map(parseInline));
        i++;
      }
      blocks.push({ t: 'table', head: headCells.map(parseInline), rows });
      continue;
    }

    // lists: consecutive items; two-space indent marks a sub-line. Grouped so
    // interleaved paragraphs between items do not split one list in two.
    if (UNORDERED.test(line) || ORDERED.test(line)) {
      const ordered = ORDERED.test(line);
      const items: { c: Inline[]; sub: Inline[][] }[] = [];
      while (i < lines.length) {
        const m = ordered ? lines[i].match(ORDERED) : lines[i].match(UNORDERED);
        if (m) {
          items.push({ c: parseInline(m[2]), sub: [] });
          i++;
          continue;
        }
        const indent = lines[i].match(/^\s{2,}(\S.*)$/);
        if (indent && items.length > 0 && lines[i].trim()) {
          items[items.length - 1].sub.push(parseInline(indent[1]));
          i++;
          continue;
        }
        break;
      }
      blocks.push(ordered ? { t: 'ol', items } : { t: 'ul', items });
      continue;
    }

    // paragraph: gather until a blank line or a new block opener
    const para: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !HEAD.test(lines[i]) &&
      !UNORDERED.test(lines[i]) &&
      !ORDERED.test(lines[i]) &&
      !/^\s{0,3}>/.test(lines[i]) &&
      !/^\s*```/.test(lines[i]) &&
      !HRULE.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push({ t: 'p', c: parseInline(para.join(' ').trim()) });
  }
  return blocks;
}
