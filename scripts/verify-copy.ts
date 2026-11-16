/**
 * Copy + token lint for UI-SYSTEM.md §9 and the type/colour floors.
 *
 * Deterministic, grep-able rules only — no prose linter:
 *
 *   1. Em dash (—) in rendered copy. Comments, en dashes (–), regex
 *      literals and non-rendered identifiers are excluded. Rendered strings
 *      and JSX text are indistinguishable at this level, so any surviving —
 *      is a violation until proven otherwise.
 *   2. `text-[Npx]` arbitrary font sizes — the .t-* ladder owns type.
 *   3. Inline hex colours outside the sanctioned files (theme-color meta,
 *      global-error fallback, OG image, unsubscribe email HTML).
 *
 * Scope: src/app + src/components (the rendered surface). Server services
 * carry their own copy review; native parity is enforced by copy-vectors.
 *
 * Run: npm run verify:copy   (no database needed)
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCAN_DIRS = ['src/app', 'src/components'];

/**
 * Sites allowed to keep an em dash, each with the reason it is not rendered
 * copy. Remove an entry the moment its reason expires — this list should only
 * ever shrink.
 */
const EM_DASH_ALLOW: { file: string; pattern: RegExp; why: string }[] = [
  {
    file: 'src/app/(app)/notifications/NotificationsClient.tsx',
    pattern: /Unread — /,
    why: 'DB-lane file with uncommitted work elsewhere; the sr-only prefix is deferred to the post-lane copy pass.',
  },
];

/** Files permitted to carry inline hex (emails, OG image, no-CSS fallbacks). */
const HEX_ALLOW = new Set([
  'src/app/layout.tsx', // theme-color meta tags
  'src/app/global-error.tsx', // renders when CSS may not have loaded
  'src/app/opengraph-image.tsx', // ImageResponse has no stylesheet
  'src/app/api/v1/settings/unsubscribe/route.ts', // transactional email HTML
]);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) yield full;
  }
}

/**
 * Strip comments while respecting string literals well enough for this lint:
 * // to end of line, /* … *​/ blocks (which also covers JSX {/* … *\/}
 * comments). A // inside a string literal is not treated as a comment.
 */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  let state: 'code' | 'line' | 'block' | 'sq' | 'dq' | 'tpl' = 'code';
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (state === 'code') {
      if (c === '/' && n === '/') { state = 'line'; i += 2; continue; }
      if (c === '/' && n === '*') { state = 'block'; i += 2; continue; }
      if (c === "'") { state = 'sq'; out += c; i++; continue; }
      if (c === '"') { state = 'dq'; out += c; i++; continue; }
      if (c === '`') { state = 'tpl'; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (state === 'line') {
      if (c === '\n') { state = 'code'; out += c; }
      i++; continue;
    }
    if (state === 'block') {
      if (c === '*' && n === '/') { state = 'code'; i += 2; continue; }
      if (c === '\n') out += c; // keep line numbers stable
      i++; continue;
    }
    // inside a string/template: copy verbatim, honour escapes. Single- and
    // double-quoted strings cannot span a newline in JS, so an apostrophe in
    // JSX text ("Don't") cannot swallow the rest of the file — the state ends
    // at EOL. Templates can span lines, so they keep their state.
    out += c;
    if (c === '\\') { out += n ?? ''; i += 2; continue; }
    if ((state === 'sq' || state === 'dq') && c === '\n') { state = 'code'; i++; continue; }
    const close = state === 'sq' ? "'" : state === 'dq' ? '"' : '`';
    if (c === close) state = 'code';
    i++;
  }
  return out;
}

/** Remove regex literals so dashes inside /…/ classes are not flagged. */
function stripRegexLiterals(line: string): string {
  return line.replace(/\/(?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\\n])+\//g, '//');
}

const failures: string[] = [];
const check = (msg: string, ok: boolean) => {
  if (!ok) failures.push(msg);
};

const files = SCAN_DIRS.flatMap((d) => [...walk(join(ROOT, d))]);

for (const file of files) {
  const rel = relative(ROOT, file);
  const code = stripComments(readFileSync(file, 'utf8'));
  const lines = code.split('\n');

  lines.forEach((raw, idx) => {
    const line = stripRegexLiterals(raw);
    const loc = `${rel}:${idx + 1}`;

    if (line.includes('—')) {
      const allowed = EM_DASH_ALLOW.some(
        (a) => a.file === rel && a.pattern.test(raw),
      );
      if (!allowed) {
        failures.push(`${loc}: em dash in rendered copy — ${raw.trim().slice(0, 100)}`);
      }
    }

    if (/text-\[\d+(?:\.\d+)?px\]/.test(line)) {
      failures.push(`${loc}: arbitrary text-[Npx] — use the .t-* ladder`);
    }

    if (!HEX_ALLOW.has(rel) && /#[0-9a-fA-F]{3,8}\b/.test(line)) {
      failures.push(`${loc}: inline hex outside sanctioned files — use tokens`);
    }
  });
}

if (failures.length) {
  console.log(`verify:copy — ${failures.length} violation(s)\n`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`verify:copy — clean (${files.length} files scanned)`);
