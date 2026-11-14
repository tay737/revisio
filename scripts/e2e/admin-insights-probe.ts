/**
 * Focused probe: the staff progress/insights sheet on /admin (and /teacher).
 *
 * The staff audit sweeps /admin as a page; this probe goes *inside* the
 * StudentProgressPanel — sheet geometry, inner overflow, focus behaviour,
 * target sizes, axe — at both house viewports and both themes, for a user
 * with real data and the expanded "Show all" card list.
 *
 *   E2E_BASE_URL=https://revisio-srs.vercel.app npm run probe:admin-insights
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { findChromium, NO_BROWSER_HELP, signIn } from './lib/browser';
import { eq } from 'drizzle-orm';
import { db } from '../../src/db/client';
import { users } from '../../src/db/schema';
import { hashPassword } from '../../src/services/auth';

const require_ = createRequire(import.meta.url);
const axeSource = await readFile(require_.resolve('axe-core/axe.min.js'), 'utf8');

const baseUrl = process.env.E2E_BASE_URL ?? 'https://revisio-srs.vercel.app';
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out = join(process.cwd(), 'artifacts', 'admin-insights', stamp);
mkdirSync(out, { recursive: true });

const DEV = { email: 'ux-audit-dev@revisio.probe', password: 'ux-audit-dev-pass', name: 'UX Audit Dev' };

async function ensureDev() {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, DEV.email));
  if (existing) {
    await db.update(users).set({
      passwordHash: await hashPassword(DEV.password),
      role: 'developer', status: 'active', emailVerifiedAt: new Date(),
    }).where(eq(users.id, existing.id));
    return;
  }
  await db.insert(users).values({
    id: 'ux-audit-dev', email: DEV.email, name: DEV.name,
    passwordHash: await hashPassword(DEV.password),
    role: 'developer', status: 'active', emailVerifiedAt: new Date(),
  });
}

// ── measurement ─────────────────────────────────────────────────────────────

const SHEET_MEASURE = `(() => {
  const text = (el) => (el ? (el.textContent || '').replace(/\\s+/g, ' ').trim() : '');
  const dlg = document.querySelector('[role="dialog"]');
  if (!dlg) return { open: false };
  const dr = dlg.getBoundingClientRect();
  const innerOverflow = [];
  for (const el of dlg.querySelectorAll('*')) {
    if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
      innerOverflow.push({
        tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 60),
        sw: el.scrollWidth, cw: el.clientWidth, text: text(el).slice(0, 40),
      });
    }
  }
  const controls = Array.from(dlg.querySelectorAll('a, button, [role="button"], input, select, textarea, summary'));
  const smallTargets = controls.map((el) => {
    const r = el.getBoundingClientRect();
    return { tag: el.tagName.toLowerCase(), text: (text(el) || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) };
  }).filter((t) => t.h > 0 && t.h < 44);
  const headings = Array.from(dlg.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((el) => el.tagName.toLowerCase() + ':' + text(el).slice(0, 50));
  const focusables = dlg.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])').length;
  return {
    open: true,
    dialog: { x: Math.round(dr.x), y: Math.round(dr.y), w: Math.round(dr.width), h: Math.round(dr.height) },
    dialogScroll: { sw: dlg.scrollWidth, cw: dlg.clientWidth, sh: dlg.scrollHeight, ch: dlg.clientHeight },
    docOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    bodyOverflow: getComputedStyle(document.body).overflow,
    innerOverflow: innerOverflow.slice(0, 10),
    smallTargets, headings, focusables,
    words: (dlg.textContent || '').trim().split(/\\s+/).filter(Boolean).length,
    hasShowAll: /Show all \\d+/.test(dlg.textContent || ''),
  };
})()`;

async function axeOnDialog(page: Page) {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(`axe.run(document.querySelector('[role="dialog"]') || document, { resultTypes: ['violations'] })`) as Promise<{
    violations: { id: string; impact: string | null; nodes: { target: string[] }[] }[];
  }>;
}

const findings: Record<string, unknown>[] = [];

async function probeSheet(page: Page, label: string, viewport: string) {
  const res = await page.evaluate(SHEET_MEASURE);
  const shot = `${label}-${viewport}.png`;
  await page.screenshot({ path: join(out, shot) });
  let axeViolations: unknown[] = [];
  try {
    const axe = await axeOnDialog(page);
    axeViolations = axe.violations.filter((v) => (v.impact ?? 'minor') !== 'minor')
      .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
  } catch (e) { axeViolations = [{ error: String(e) }]; }
  findings.push({ label, viewport, measure: res, axe: axeViolations, shot });
  return res as { hasShowAll?: boolean };
}

// ── run ─────────────────────────────────────────────────────────────────────

const executablePath = findChromium();
if (!executablePath) { console.error(NO_BROWSER_HELP); process.exit(1); }

await ensureDev();
console.log(`admin-insights probe → ${baseUrl}`);
console.log(`out: ${out}`);

const browser = await chromium.launch({ executablePath, headless: true });
const results: Record<string, unknown> = { base: baseUrl, startedAt: new Date().toISOString() };

try {
  for (const [vw, vh, vp] of [[1440, 900, '1440'], [390, 844, '390']] as const) {
    for (const scheme of ['light', 'dark'] as const) {
      const context = await browser.newContext({ viewport: { width: vw, height: vh }, colorScheme: scheme });
      context.setDefaultTimeout(25_000);
      const page = await context.newPage();
      const tag = `admin-${vp}-${scheme}`;

      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(`console ${m.text().slice(0, 160)}`); });

      const ok = await signIn(page, baseUrl, DEV.email, DEV.password);
      if (!ok.ok) throw new Error(`dev sign-in failed: ${ok.why}`);
      await page.goto(new URL('/admin', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
      await page.waitForFunction(`document.body.innerText.match(/developer admin|approval requests/i)`, undefined, { timeout: 15_000 }).catch(() => undefined);
      await page.waitForTimeout(800);

      // Prefer the data-rich account (1k+ reviews); fall back to any progress button.
      let row = page.locator('tr', { hasText: 'tayyab@outlook.jp' });
      if (!(await row.count())) row = page.locator('tr', { hasText: 'e2e-probe@revisio.probe' });
      if (!(await row.count())) row = page.locator('tr').filter({ has: page.getByRole('button', { name: /progress/i }) }).first();
      const btn = row.getByRole('button', { name: /progress/i }).first();
      if (!(await btn.count())) { findings.push({ label: tag, error: 'no progress button found' }); await context.close(); continue; }

      await btn.click();
      // Loading state shot
      await page.waitForTimeout(250);
      await page.screenshot({ path: join(out, `${tag}-loading.png`) });
      await page.waitForFunction(`document.body.innerText.match(/SRS strength|Nothing answered yet|No misses/)`, undefined, { timeout: 20_000 }).catch(() => undefined);
      await page.waitForTimeout(900); // let meter animations settle

      const m1 = await probeSheet(page, tag, vp);

      // Expand "Show all" if offered
      const showAll = page.getByRole('button', { name: /Show all \\d+/ });
      if (await showAll.count()) {
        await showAll.first().click();
        await page.waitForTimeout(600);
        await probeSheet(page, `${tag}-expanded`, vp);
        await page.getByRole('button', { name: /Show less/ }).first().click().catch(() => undefined);
        await page.waitForTimeout(400);
      }

      // Escape-close behaviour + focus return
      const before = await page.evaluate(`document.activeElement && (document.activeElement.textContent || document.activeElement.getAttribute('aria-label') || document.activeElement.tagName)`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      const stillOpen = await page.evaluate(`!!document.querySelector('[role="dialog"]')`);
      const afterFocus = await page.evaluate(`document.activeElement && (document.activeElement.textContent || document.activeElement.getAttribute('aria-label') || document.activeElement.tagName)`);
      findings.push({ label: `${tag}-escape`, escapeClosed: !stillOpen, focusBefore: before, focusAfter: afterFocus, errors });

      if (stillOpen) {
        await page.getByRole('button', { name: /^Close$/ }).first().click().catch(() => undefined);
        await page.waitForTimeout(400);
      }

      results[`${tag}-sheet`] = m1;
      await context.close();
    }
  }
} finally {
  await browser.close();
}

writeFileSync(join(out, 'report.json'), JSON.stringify({ ...results, findings }, null, 2));
console.log(`findings: ${findings.length} → ${join(out, 'report.json')}`);
for (const f of findings) console.log(JSON.stringify(f).slice(0, 300));
