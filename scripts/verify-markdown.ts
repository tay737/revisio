// Markdown verification: parse invariants plus the URL rules the renderer
// enforces. Authored notes render through one pure parser into React elements
// — never dangerouslySetInnerHTML — so these checks cover the whole pipeline
// short of pixel output.
//
// Run: npx tsx scripts/verify-markdown.ts   (no database needed)

import { parseMarkdown, safeUrl, type Inline } from '../src/domain/markdown';

let failures = 0;
const check = (name: string, cond: boolean, detail?: unknown) => {
  if (cond) console.log(`✓ ${name}`);
  else { failures++; console.log(`✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 200)}` : ''}`); }
};

// ── structure ───────────────────────────────────────────────────────────────
const NOTE = [
  '# Top',
  '## Section',
  'A **bold** and *italic* and `code` and $x^2$ inline.',
  '$$E = mc^2$$',  '- one',
  '- two',
  '  wrapped continuation',
  '1. first',
  '2. second',
  '> quoted line',
  '> second line',
  '```text',
  'fenced code',
  '```',
  '| A | B |',
  '|---|---|',
  '| 1 | 2 |',
  '---',
  '[a link](https://revisio.app)',
  '![an image](https://revisio.app/x.png)',
].join('\n');

const blocks = parseMarkdown(NOTE);
const kinds = blocks.map((b) => b.t);
check('every block kind parses', ['h','p','h','p','ul','ol','quote','code','table','hr'].every((k) => kinds.includes(k as never)), kinds);
const ul = blocks.find((b) => b.t === 'ul') as { items: { c: Inline[]; sub: Inline[][] }[] } | undefined;
check('unordered lists parse without crashing (m[2] bug)', ul?.items.length === 2, ul?.items.length);
check('lists carry their sub-lines', ul?.items[1].sub.length === 1, ul?.items[1].sub.length);
check('quotes merge continuation lines', (blocks.find((b) => b.t === 'quote') as { c: unknown[] }).c.length === 1);

// ── inline ──────────────────────────────────────────────────────────────────
const p = blocks.find((b) => b.t === 'p') as { c: { t: string }[] };
check('inline covers bold, italic, code and math', ['bold','italic','code','math'].every((t) => p.c.some((n) => n.t === t)), p.c.map((n) => n.t));
const table = blocks.find((b) => b.t === 'table') as { head: { t: string }[][]; rows: { t: string }[][][] };
check('table cells parse inline too', table.head[0][0].t === 'text' && table.rows[0][0][0].t === 'text');

// ── injection safety ────────────────────────────────────────────────────────
const evil = 'See [docs](javascript:alert(1)), [thing](JAVASCRIPT:x), [data](data:text/html,<b>hi</b>) and ![i](vbscript:x)';
const evilHtml = parseMarkdown(evil);
const hrefs = JSON.stringify(evilHtml);
check('parser keeps raw URLs (rendering owns the policy)', hrefs.includes('javascript:alert'), 'parser must stay policy-free');

const allowed = ['https://revisio.app/help', 'http://localhost:3100', 'mailto:team@revisio.app', '/topics/abc', '#footnote'];
const blocked = ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,<script>', 'vbscript:msgbox(1)', 'file:///etc/passwd', '//evil.com/x'];
check('safeUrl allows web, mail and in-app targets', allowed.every((u) => safeUrl(u) === u), allowed.filter((u) => safeUrl(u) !== u));
check('safeUrl blocks script and pseudo schemes', blocked.every((u) => safeUrl(u) === '#'), blocked.filter((u) => safeUrl(u) !== '#'));

console.log(`\n${failures === 0 ? '✓ markdown: parse + safe-URL checks all pass' : `✗ ${failures} failure(s)`}`);
process.exit(failures === 0 ? 0 : 1);
