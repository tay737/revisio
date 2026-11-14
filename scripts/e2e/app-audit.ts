/**
 * The signed-in audit — what the app looks like after registration.
 *
 * `npm run e2e:public-ux` and `design:shots` cover the public pages. Everything
 * behind the login was only ever checked by `smoke.ts`, which asserts behaviour
 * (does a review save?) and not design: whether a section fades in, whether a
 * page carries two type scales, whether an icon disc is tinted blue, whether a
 * control is under 44px. Those are the failures this pass is about, so they need
 * a machine that measures them.
 *
 * It answers the questions `docs/UI-SYSTEM.md` makes observable:
 *
 *   • one `h1`, headings stepping one level at a time
 *   • no inline `text-[Npx]` type (the `.t-*` scale owns size)
 *   • one card radius, one button geometry
 *   • nothing looping at rest
 *   • colour used for state only (no tinted `bg-primary/10` chrome discs)
 *   • 44px tap targets, no sideways overflow at 390
 *   • axe: nothing moderate or worse
 *   • no console, page, 4xx or 5xx findings
 *
 * Reads only. It signs in as the dedicated probe account and writes nothing.
 *
 *   npm run audit:app                                    # against :3100
 *   E2E_BASE_URL=https://revisio-srs.vercel.app npm run audit:app
 *   E2E_HEADED=1 npm run audit:app                       # watch it
 *
 * The measuring code is a **string**, not a function. tsx compiles this file
 * with esbuild's `keepNames`, which injects a `__name` helper into every
 * function body — and Playwright serialises functions into the page, where that
 * helper does not exist. A string is the same code without the wrapper.
 */
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { findChromium, NO_BROWSER_HELP, signIn } from './lib/browser';
import { ensureProbeAccount } from './lib/probe';

const require_ = createRequire(import.meta.url);
const axeSource = await readFile(require_.resolve('axe-core/axe.min.js'), 'utf8');

const SERVE_PORT = Number(process.env.AUDIT_PORT ?? 3103);
const baseUrl = process.env.E2E_BASE_URL ?? (process.env.AUDIT_SERVE === '1' ? `http://127.0.0.1:${SERVE_PORT}` : 'http://127.0.0.1:3100');
/** A route subset, for a harness whose server does not outlive the full sweep. */
const ONLY = (process.env.AUDIT_ONLY ?? '').split(',').map((r) => r.trim()).filter(Boolean);
const headed = process.env.E2E_HEADED === '1';
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out = join(process.cwd(), 'artifacts', 'app-audit', stamp);
mkdirSync(out, { recursive: true });

/** Every screen behind the login, with the sentence that proves it rendered. */
const ROUTES: { path: string; name: string; ready: RegExp }[] = [
  { path: '/dashboard', name: 'Today', ready: /start review|cram instead|get ahead|your queue/i },
  { path: '/review', name: 'Review', ready: /due|nothing|review|card/i },
  { path: '/learn', name: 'Learn', ready: /subject|nothing published/i },
  { path: '/progress', name: 'Rank', ready: /rank|ladder|season/i },
  { path: '/progress?view=lobby', name: 'Rank — this week', ready: /lobby|week|board/i },
  { path: '/progress?view=board', name: 'Rank — XP board', ready: /xp board|xp/i },
  { path: '/progress?view=strength', name: 'Rank — strength', ready: /strength|card|review/i },
  { path: '/cram', name: 'Cram', ready: /cram|topic|pick/i },
  { path: '/exam', name: 'Exam', ready: /exam|paper|question/i },
  { path: '/practice', name: 'Practice', ready: /practice|maths|subject/i },
  { path: '/library', name: 'My content', ready: /content|topic|subject/i },
  { path: '/settings', name: 'Settings', ready: /profile|account|security|privacy/i },
];

type Finding = {
  route: string;
  viewport: string;
  severity: 'fail' | 'warn';
  rule: string;
  detail: string;
};

type Screen = {
  route: string;
  viewport: string;
  h1: string[];
  headingOrder: string[];
  typeScale: { className: string; size: string; sample: string }[];
  radii: string[];
  buttons: { radius: string; height: number; bg: string }[];
  animations: string[];
  tintedChrome: string[];
  smallTargets: { tag: string; text: string; w: number; h: number }[];
  overflowX: number;
  scrollHeight: number;
  words: number;
};

const screens: Screen[] = [];
const findings: Finding[] = [];
const pageFindings: string[] = [];
const axeFindings: { route: string; viewport: string; id: string; impact: string; help: string; nodes: string[] }[] = [];

const NOISE: RegExp[] = [
  /favicon|net::ERR_BLOCKED_BY_CLIENT|Download the React DevTools/i,
  /net::ERR_ABORTED/i,
  /Failed to load resource: the server responded with a status of/i,
];

function watch(page: Page, where: string) {
  const note = (detail: string) => {
    if (NOISE.some((re) => re.test(detail))) return;
    pageFindings.push(`${where}: ${detail.split('\n')[0]}`);
  };
  page.on('pageerror', (error) => note(`pageerror ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') note(`console ${message.text()}`);
  });
  page.on('response', (response) => {
    const status = response.status();
    if (status < 400) return;
    if (status === 401 && /\/api\/v1\//.test(response.url())) return;
    note(`${status} ${response.request().method()} ${response.url()}`);
  });
}

/** One measurement, so every screen is judged the same way. */
const MEASURE = `(() => {
  const text = (el) => (el ? (el.textContent || '').replace(/\\s+/g, ' ').trim() : '');
  const all = Array.from(document.querySelectorAll('main *'));
  const h1 = Array.from(document.querySelectorAll('h1')).map(text);
  const headingOrder = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map(
    (el) => el.tagName.toLowerCase() + ':' + text(el).slice(0, 40),
  );
  const seen = new Set();
  const typeScale = [];
  for (const el of all) {
    const cls = String(el.className || '');
    const m = cls.match(/text-\\[(\\d+(?:\\.\\d+)?)px\\]/);
    if (!m) continue;
    if (!text(el)) continue;
    const key = m[0] + '|' + text(el).slice(0, 24);
    if (seen.has(key)) continue;
    seen.add(key);
    typeScale.push({ className: m[0], size: getComputedStyle(el).fontSize, sample: text(el).slice(0, 48) });
  }
  const cards = Array.from(document.querySelectorAll('[data-slot="card"], .card, .card-solid, .card-soft, .inset'));
  const radii = Array.from(new Set(cards.map((el) => getComputedStyle(el).borderRadius)));
  const controls = Array.from(document.querySelectorAll('a, button, [role="button"]'));
  const buttons = controls
    .filter((el) => {
      const cs = getComputedStyle(el);
      return cs.borderRadius === '999px' && cs.backgroundColor !== 'rgba(0, 0, 0, 0)';
    })
    .slice(0, 8)
    .map((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { radius: cs.borderRadius, height: Math.round(r.height), bg: cs.backgroundColor };
    });
  const smallTargets = controls
    // WCAG 2.5.8 exempts a link that runs inside a sentence: "Find one" at the
    // end of a line is prose, not a button, and padding it to 44px would break
    // the paragraph it lives in.
    .filter((el) => !(el.tagName === 'A' && (el.closest('p') || getComputedStyle(el).display === 'inline')))
    .map((el) => {
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        text: (text(el) || el.getAttribute('aria-label') || '').slice(0, 34),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    })
    .filter((t) => t.h > 0 && t.h < 44);
  const tintedChrome = Array.from(document.querySelectorAll('main [class*="bg-primary/"], main [class*="text-primary"]'))
    .map((el) => el.tagName.toLowerCase() + '.' + String(el.className).split(' ').slice(0, 3).join('.') + ' — ' + text(el).slice(0, 40))
    .slice(0, 20);
  const running = document.getAnimations().filter((a) => a.playState === 'running');
  const animations = Array.from(
    new Set(
      running.map((a) => {
        if (a.animationName) return 'css:' + a.animationName;
        if (a.transitionProperty) return 'transition:' + a.transitionProperty;
        return 'js:' + (a.constructor ? a.constructor.name : 'Animation');
      }),
    ),
  );
  return {
    h1: h1,
    headingOrder: headingOrder,
    typeScale: typeScale,
    radii: radii,
    buttons: buttons,
    animations: animations,
    tintedChrome: tintedChrome,
    smallTargets: smallTargets,
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    words: ((document.querySelector('main') || document.body).textContent || '').trim().split(/\\s+/).filter(Boolean).length,
  };
})()`;

async function axe(page: Page) {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(`axe.run(document, { resultTypes: ['violations'] })`) as Promise<{
    violations: { id: string; impact: string | null; help: string; nodes: { target: string[]; failureSummary?: string }[] }[];
  }>;
}

const executablePath = findChromium();
if (!executablePath) {
  console.error(NO_BROWSER_HELP);
  process.exit(1);
}

console.log(`app audit → ${baseUrl}`);
console.log(`out: ${out}`);

const probe = await ensureProbeAccount();
if (process.env.AUDIT_SERVE === '1') {
  // This sandbox removes .next between shell commands and kills a server left in
  // the background, so the audit owns its server: build, spawn, sweep, stop.
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(SERVE_PORT), '-H', '::'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });
  child.stdout.on('data', () => undefined);
  child.stderr.on('data', () => undefined);
  process.on('exit', () => child.kill());
  let ready = false;
  for (let i = 0; i < 90 && ready === false; i += 1) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const res = await fetch(`${baseUrl}/login`);
      ready = res.ok;
    } catch {
      ready = false;
    }
  }
  if (ready === false) throw new Error(`the audit's own server never came up on ${baseUrl}`);
}

const browser = await chromium.launch({ executablePath, headless: !headed });
const report = {
  base: baseUrl,
  startedAt: new Date().toISOString(),
  probe: probe.email,
  screens: [] as Screen[],
  findings,
  pageFindings,
  axe: axeFindings,
};

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  context.setDefaultTimeout(25_000);
  const page = await context.newPage();
  watch(page, 'signed-in');

  const signedIn = await signIn(page, baseUrl, probe.email, probe.password);
  if (!signedIn.ok) throw new Error(`could not sign in as the probe: ${signedIn.why}`);

  const viewports = [
    { w: 1440, h: 900, label: '1440' },
    { w: 390, h: 844, label: '390' },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.w, height: viewport.h });
    for (const route of ONLY.length ? ROUTES.filter((r) => ONLY.includes(r.path)) : ROUTES) {
      await page.goto(new URL(route.path, baseUrl).toString(), { waitUntil: 'domcontentloaded' }).catch((e) => {
        // One slow route must not end the sweep: record it and measure whatever
        // the browser has, then let the remaining screens run.
        pageFindings.push(`${route.path} @${viewport.label}: navigation failed — ${String(e).split('\n')[0]}`);
      });
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
      await page.waitForSelector('main h1, main h2', { timeout: 15_000 }).catch(() => undefined);
      // Layout settles after the data lands: a skeleton rail is briefly wider than
      // a 390px phone, and measuring it reported an overflow the page never had.
      await page
        .waitForFunction('document.fonts.status === "loaded"', undefined, { timeout: 5_000 })
        .catch(() => undefined);
      await page.waitForTimeout(600);
      await page
        .waitForFunction(
          '(() => { const w = document.documentElement.scrollWidth; if (window.__lw === w) window.__same = (window.__same || 0) + 1; else window.__same = 0; window.__lw = w; return window.__same >= 4; })()',
          undefined,
          { polling: 150, timeout: 6_000 },
        )
        .catch(() => undefined);

      const where = `${route.name} @${viewport.label}`;
      const landed = page.url().replace(baseUrl, '') || '/';
      if (/^\/login/.test(landed)) {
        // A reload with a valid refresh cookie must not sign the learner out.
        // Anything measured after this is the login page, so the rule list
        // below repeats itself — this finding names the actual cause.
        findings.push({
          route: route.path,
          viewport: viewport.label,
          severity: 'fail',
          rule: 'session-lost',
          detail: `a reload of ${route.path} landed on ${landed}`,
        });
      }
      const shot = `${route.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${viewport.label}`;
      await page.screenshot({ path: join(out, `${shot}.png`), fullPage: true });

      const m = (await page.evaluate(MEASURE)) as Omit<Screen, 'route' | 'viewport'>;
      const screen: Screen = { route: route.path, viewport: viewport.label, ...m };
      screens.push(screen);
      report.screens.push(screen);

      // ── the rules ─────────────────────────────────────────────────────────
      if (m.h1.length !== 1) {
        findings.push({
          route: route.path,
          viewport: viewport.label,
          severity: 'fail',
          rule: 'one-h1',
          detail: `${m.h1.length} h1 on screen: ${JSON.stringify(m.h1)}`,
        });
      }
      const levels = m.headingOrder.map((h) => Number(h.slice(1, 2)));
      for (let i = 1; i < levels.length; i += 1) {
        if (levels[i] - levels[i - 1] > 1) {
          findings.push({
            route: route.path,
            viewport: viewport.label,
            severity: 'fail',
            rule: 'heading-order',
            detail: `${m.headingOrder[i - 1]} → ${m.headingOrder[i]}`,
          });
        }
      }
      if (m.typeScale.length > 0) {
        findings.push({
          route: route.path,
          viewport: viewport.label,
          severity: 'fail',
          rule: 'inline-type',
          detail: m.typeScale.map((t) => `${t.className} (${t.size}) “${t.sample}”`).join(' · '),
        });
      }
      if (m.radii.length > 2) {
        findings.push({
          route: route.path,
          viewport: viewport.label,
          severity: 'fail',
          rule: 'card-radius',
          detail: `card radii in use: ${m.radii.join(', ')}`,
        });
      }
      const looping = m.animations.filter((a) => /infinite|beam|shimmer|pulse|spin|orbit/i.test(a));
      if (looping.length) {
        findings.push({
          route: route.path,
          viewport: viewport.label,
          severity: 'fail',
          rule: 'loop-at-rest',
          detail: looping.join(', '),
        });
      }
      if (m.tintedChrome.length) {
        findings.push({
          route: route.path,
          viewport: viewport.label,
          severity: 'warn',
          rule: 'tinted-chrome',
          detail: m.tintedChrome.join(' · '),
        });
      }
      // The 44px floor is a *touch* promise (UI-SYSTEM §10). A 36px icon button
      // under a mouse is correct and an audit that fails it would force desktop
      // chrome to grow for no one.
      if (m.smallTargets.length && viewport.label === '390') {
        findings.push({
          route: route.path,
          viewport: viewport.label,
          severity: 'fail',
          rule: 'tap-size',
          detail: m.smallTargets.map((t) => `${t.tag} ${t.w}×${t.h} “${t.text}”`).join(' · '),
        });
      }
      if (m.overflowX > 1) {
        findings.push({
          route: route.path,
          viewport: viewport.label,
          severity: 'fail',
          rule: 'overflow',
          detail: `${m.overflowX}px wider than the viewport`,
        });
      }

      const a = await axe(page);
      for (const v of a.violations) {
        if (v.impact !== 'serious' && v.impact !== 'critical' && v.impact !== 'moderate') continue;
        axeFindings.push({
          route: route.path,
          viewport: viewport.label,
          id: v.id,
          impact: v.impact ?? 'unknown',
          help: v.help,
          nodes: v.nodes
            .slice(0, 3)
            .map((n) => `${n.target.join(' ')} — ${(n.failureSummary ?? '').split('\n').slice(0, 2).join(' | ')}`),
        });
      }

      console.log(
        `${where.padEnd(28)} h1=${m.h1.length} type=${m.typeScale.length} radii=${m.radii.length} ` +
          `anims=${m.animations.length} tint=${m.tintedChrome.length} small=${m.smallTargets.length} ` +
          `overflow=${m.overflowX} words=${m.words}`,
      );
    }
  }

  await context.close();
} finally {
  await browser.close().catch(() => undefined);
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));

  const fails = findings.filter((f) => f.severity === 'fail');
  const warns = findings.filter((f) => f.severity === 'warn');
  console.log(
    `\n${screens.length} screens · ${fails.length} FAIL · ${warns.length} WARN · ${axeFindings.length} axe (moderate+) · ${pageFindings.length} page findings`,
  );

  if (fails.length) {
    console.log('\nFAIL');
    for (const f of fails) console.log(`  • ${f.rule} — ${f.route} @${f.viewport}: ${f.detail}`);
  }
  if (warns.length) {
    console.log('\nWARN');
    for (const f of warns) console.log(`  • ${f.rule} — ${f.route} @${f.viewport}: ${f.detail}`);
  }
  if (axeFindings.length) {
    console.log('\naxe');
    for (const f of axeFindings) console.log(`  • [${f.impact}] ${f.id} — ${f.route} @${f.viewport}: ${f.nodes[0]}`);
  }
  if (pageFindings.length) {
    console.log('\nPage findings');
    for (const f of pageFindings.slice(0, 20)) console.log(`  • ${f}`);
  }
  console.log(`\nreport: ${join(out, 'report.json')}`);

  if (fails.length || pageFindings.length) process.exitCode = 1;
}
