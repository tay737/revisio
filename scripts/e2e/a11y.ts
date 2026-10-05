/**
 * The accessibility audit, run against a *deployed* Revisio.
 *
 *   npm run e2e:a11y                                       # production alias
 *   E2E_BASE_URL=http://127.0.0.1:3100 npm run e2e:a11y    # a local build
 *   E2E_HEADED=1 npm run e2e:a11y                          # watch it happen
 *
 * axe-core is injected into a real page on every screen the learner meets, and
 * everything it finds is written to artifacts/e2e-a11y/report.json. The exit
 * code counts only serious and critical violations — the ones that lock
 * somebody out — while moderate and minor ones are listed for a human to judge.
 *
 * It reuses the rules that earned their keep in smoke.ts: a dedicated probe
 * account, page findings collected separately from the scan, and a signed-out
 * world that is a separate cookie jar, never a cleared one.
 */
import { readFile } from 'node:fs/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { findChromium, NO_BROWSER_HELP, signIn, waitForText } from './lib/browser';
import { ensureProbeAccount } from './lib/probe';

const require_ = createRequire(import.meta.url);
const axeSource = await readFile(require_.resolve('axe-core/axe.min.js'), 'utf8');

const baseUrl = process.env.E2E_BASE_URL ?? 'https://revisio-srs.vercel.app';
const headed = process.env.E2E_HEADED === '1';
const reportPath = join('artifacts', 'e2e-a11y', 'report.json');

/** The screens a learner meets, with the label a person would give them. */
const SIGNED_IN: { path: string; name: string; ready: RegExp }[] = [
  { path: '/dashboard', name: 'Today', ready: /today|streak|due/i },
  { path: '/review', name: 'Review', ready: /nothing due|due today|start review|cards? due|no cards/i },
  { path: '/learn', name: 'Learn catalogue', ready: /learn|subject/i },
  { path: '/progress', name: 'Rank', ready: /rank|season|league/i },
  { path: '/cram', name: 'Cram', ready: /cram|pick|subject/i },
  { path: '/exam', name: 'Exam', ready: /exam|paper|practice/i },
  { path: '/library', name: 'Library', ready: /library|subject|topic/i },
  { path: '/settings', name: 'Settings', ready: /account|profile|security/i },
];

const SIGNED_OUT: { path: string; name: string; ready: RegExp }[] = [
  { path: '/', name: 'Landing', ready: /revisio|sign|start/i },
  { path: '/login', name: 'Sign in', ready: /sign in|password/i },
  { path: '/register', name: 'Register', ready: /create|account|password/i },
  { path: '/forgot-password', name: 'Forgot password', ready: /password|email/i },
];

type AxeNode = { target: string[]; failureSummary?: string };
type AxeViolation = {
  id: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical' | null;
  help: string;
  helpUrl: string;
  nodes: AxeNode[];
};
type AxeResult = { violations: AxeViolation[]; incomplete: AxeViolation[]; passes: { id: string }[] };

type Reported = {
  id: string;
  impact: string | null;
  help: string;
  where: string;
  nodes: { target: string[]; summary: string }[];
};

type Report = {
  baseUrl: string;
  startedAt: string;
  screens: number;
  passes: number;
  incomplete: number;
  violations: Reported[];
  pageFindings: string[];
};

const report: Report = {
  baseUrl,
  startedAt: new Date().toISOString(),
  screens: 0,
  passes: 0,
  incomplete: 0,
  violations: [],
  pageFindings: [],
};

/** Page noise the smoke already ruled out — same reasons, one list. */
const PAGE_NOISE: { match: RegExp; why: string }[] = [
  { match: /favicon|net::ERR_BLOCKED_BY_CLIENT|Download the React DevTools/i, why: 'browser-injected' },
  { match: /net::ERR_ABORTED/i, why: 'aborted prefetch' },
  { match: /Failed to load resource: the server responded with a status of/i, why: 'recorded by the response listener' },
];

function watchFindings(page: Page, where: string) {
  const note = (detail: string) => {
    const noise = PAGE_NOISE.find((rule) => rule.match.test(detail));
    if (noise) return;
    report.pageFindings.push(`${where}: ${detail}`);
  };
  page.on('pageerror', (error) => note(`pageerror ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') note(`console ${message.text()}`);
  });
  page.on('response', (response) => {
    const status = response.status();
    if (status < 400) return;
    if (status === 401 && /\/api\/v1\//.test(response.url())) return; // the documented refresh-and-retry dance
    if (status === 404 && /\/favicon|\/manifest|\.ico/.test(response.url())) return;
    note(`${status} ${response.request().method()} ${response.url()}`);
  });
}

/** Inject axe and run it against the whole document. */
async function axeRun(page: Page): Promise<AxeResult> {
  return page.evaluate((axeSrc: string) => {
    const axe = new Function(`${axeSrc}; return axe;`)() as {
      run: (context: unknown, options: unknown) => Promise<AxeResult>;
    };
    return axe.run(document, { resultTypes: ['violations', 'incomplete'] });
  }, axeSource);
}

/** Scan one screen — after waiting for the screen to actually be there. */
async function scan(page: Page, path: string, name: string, ready: RegExp) {
  await page.goto(new URL(path, baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  const said = await waitForText(page, ready, 12_000);
  if (!said.matched) {
    report.pageFindings.push(`${path}: never showed anything matching ${ready} — page said “${said.text.slice(-160)}”`);
  }
  // One beat of settle: motion is reduced, but layout still needs a frame.
  await page.waitForTimeout(600);
  report.screens += 1;

  let result: AxeResult;
  try {
    result = await axeRun(page);
  } catch (error) {
    report.pageFindings.push(`${path}: axe threw ${error instanceof Error ? error.message.split('\n')[0] : error}`);
    return;
  }

  report.passes += result.passes.length;
  report.incomplete += result.incomplete.length;

  for (const v of result.violations) {
    const nodes = v.nodes.slice(0, 4).map((n) => ({
      target: n.target,
      summary: (n.failureSummary ?? '').split('\n').slice(0, 3).join(' | '),
    }));
    const existing = report.violations.find((r) => r.id === v.id);
    if (existing) {
      if (!existing.where.includes(name)) existing.where += `, ${name}`;
      existing.nodes.push(...nodes);
    } else {
      report.violations.push({ id: v.id, impact: v.impact, help: v.help, where: name, nodes });
    }
  }
}

// ── the run ──────────────────────────────────────────────────────────────────

const executablePath = findChromium();
if (!executablePath) {
  console.error(NO_BROWSER_HELP);
  process.exit(1);
}
console.log(`a11y audit → ${baseUrl}`);

const probe = await ensureProbeAccount();
mkdirSync(join('artifacts', 'e2e-a11y'), { recursive: true });
const browser = await chromium.launch({ executablePath, headless: !headed });

try {
  // The signed-out world first: landing, auth screens, forgot-password.
  const anon = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  anon.setDefaultTimeout(20_000);
  const anonPage = await anon.newPage();
  watchFindings(anonPage, 'signed-out');
  for (const screen of SIGNED_OUT) {
    await scan(anonPage, screen.path, `${screen.name} (signed out)`, screen.ready);
  }
  await anon.close();

  // Then the signed-in app.
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  context.setDefaultTimeout(20_000);
  const page = await context.newPage();
  watchFindings(page, 'signed-in');
  const signedIn = await signIn(page, baseUrl, probe.email, probe.password);
  if (!signedIn.ok) throw new Error(`could not sign in as the probe: ${signedIn.why}`);
  for (const screen of SIGNED_IN) {
    await scan(page, screen.path, screen.name, screen.ready);
  }

  // The phone sweep: the four surfaces a thumb actually holds, at 390px.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const screen of [SIGNED_IN[0], SIGNED_IN[1], SIGNED_IN[2], SIGNED_IN[7]]) {
    await scan(page, screen.path, `${screen.name} @390`, screen.ready);
  }
  await context.close();
} finally {
  await browser.close().catch(() => undefined);

  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const blocking = report.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const judged = report.violations.filter((v) => v.impact !== 'serious' && v.impact !== 'critical');

  console.log(`\n${report.screens} screens scanned, ${report.passes} rule-passes, ${report.incomplete} incomplete`);
  if (blocking.length) {
    console.log('\nBlocking (serious/critical):');
    for (const v of blocking) {
      console.log(`  • [${v.impact}] ${v.id} — ${v.help} (${v.where})`);
      for (const n of v.nodes.slice(0, 2)) console.log(`      ${n.target.join(' ')} — ${n.summary}`);
    }
  } else {
    console.log('\nBlocking: none');
  }
  if (judged.length) {
    console.log('\nFor a human to judge (moderate/minor):');
    for (const v of judged) {
      console.log(`  • [${v.impact ?? '?'}] ${v.id} — ${v.help} (${v.where})`);
      for (const n of v.nodes.slice(0, 2)) console.log(`      ${n.target.join(' ')} — ${n.summary}`);
    }
  }
  if (report.pageFindings.length) {
    console.log('\nFindings from the page:');
    for (const f of report.pageFindings.slice(0, 12)) console.log(`  • ${f}`);
  }
  console.log(`\nReport: ${reportPath}`);

  if (blocking.length || report.pageFindings.length) process.exitCode = 1;
}
