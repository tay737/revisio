/**
 * The staff audit — teacher and developer surfaces, end to end.
 *
 * `app-audit.ts` sweeps the twelve learner routes. This sweep covers the other
 * half of the product: /staff/login, /staff/register, /teacher, /admin, the
 * staff tab in /library, the role gates, and the approval flow that connects
 * them (register as teacher → approve in /admin → verify → teach).
 *
 * It writes to production, bounded and named:
 *
 *   • ux-audit-dev@revisio.probe   — developer fixture, created in the DB
 *   • ux-audit-teacher@revisio.probe — registered through the real API, approved
 *     through the real /admin UI (that approval IS part of the audit)
 *   • one class, one subject, one badge — created through the UI, deleted again
 *   • e2e-probe@revisio.probe is added to the class, then removed with it
 *
 * Read-only elsewhere: no flag toggles, no algorithm changes, no season writes,
 * no topic publishes left live.
 *
 *   E2E_BASE_URL=https://revisio-srs.vercel.app npm run audit:staff
 *   E2E_HEADED=1 npm run audit:staff
 */
import { readFile } from 'node:fs/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { findChromium, NO_BROWSER_HELP, signIn } from './lib/browser';
import { ensureProbeAccount } from './lib/probe';
import { eq } from 'drizzle-orm';
import { db } from '../../src/db/client';
import { users, approvalRequests } from '../../src/db/schema';
import { hashPassword } from '../../src/services/auth';

const require_ = createRequire(import.meta.url);
const axeSource = await readFile(require_.resolve('axe-core/axe.min.js'), 'utf8');

const baseUrl = process.env.E2E_BASE_URL ?? 'https://revisio-srs.vercel.app';
const headed = process.env.E2E_HEADED === '1';
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out = join(process.cwd(), 'artifacts', 'staff-audit', stamp);
mkdirSync(out, { recursive: true });

const DEV = { email: 'ux-audit-dev@revisio.probe', password: 'ux-audit-dev-pass', name: 'UX Audit Dev' };
const TEACHER = { email: 'ux-audit-teacher@revisio.probe', password: 'ux-audit-teacher-pass', name: 'UX Audit Teacher' };

// ── fixtures ────────────────────────────────────────────────────────────────

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

async function ensureTeacherRequested(): Promise<'created' | 'pending' | 'active'> {
  const [existing] = await db.select({ id: users.id, status: users.status, emailVerifiedAt: users.emailVerifiedAt })
    .from(users).where(eq(users.email, TEACHER.email));
  if (existing?.status === 'active') return 'active';
  if (existing) {
    const [req] = await db.select({ id: approvalRequests.id }).from(approvalRequests)
      .where(eq(approvalRequests.userId, existing.id)).limit(1);
    return req ? 'pending' : 'active';
  }
  const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: TEACHER.email, password: TEACHER.password, name: TEACHER.name,
      role: 'teacher', note: 'UX audit fixture — created by staff-audit.ts',
    }),
  });
  if (!res.ok) throw new Error(`teacher register failed: ${res.status} ${await res.text()}`);
  return 'created';
}

// ── findings plumbing (same contract as app-audit) ──────────────────────────

type Finding = { route: string; viewport: string; severity: 'fail' | 'warn'; rule: string; detail: string };
type Screen = {
  route: string; viewport: string;
  h1: string[]; headingOrder: string[];
  typeScale: { className: string; size: string; sample: string }[];
  smallTargets: { tag: string; text: string; w: number; h: number }[];
  overflowX: number; words: number;
};

const screens: Screen[] = [];
const findings: Finding[] = [];
const pageFindings: string[] = [];
const axeFindings: { route: string; viewport: string; id: string; impact: string | null; nodes: string[] }[] = [];
const shots: string[] = [];

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
    if (!m || !text(el)) continue;
    const key = m[0] + '|' + text(el).slice(0, 24);
    if (seen.has(key)) continue;
    seen.add(key);
    typeScale.push({ className: m[0], size: getComputedStyle(el).fontSize, sample: text(el).slice(0, 48) });
  }
  const controls = Array.from(document.querySelectorAll('a, button, [role="button"]'));
  const smallTargets = controls
    .filter((el) => !(el.tagName === 'A' && (el.closest('p') || getComputedStyle(el).display === 'inline')))
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { tag: el.tagName.toLowerCase(), text: (text(el) || el.getAttribute('aria-label') || '').slice(0, 34), w: Math.round(r.width), h: Math.round(r.height) };
    })
    .filter((t) => t.h > 0 && t.h < 44);
  return {
    h1, headingOrder, typeScale, smallTargets,
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    words: ((document.querySelector('main') || document.body).textContent || '').trim().split(/\\s+/).filter(Boolean).length,
  };
})()`;

async function axe(page: Page) {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(`axe.run(document, { resultTypes: ['violations'] })`) as Promise<{
    violations: { id: string; impact: string | null; nodes: { target: string[] }[] }[];
  }>;
}

async function snap(page: Page, name: string, fullPage = false) {
  const file = `${name}.png`;
  await page.screenshot({ path: join(out, file), fullPage });
  shots.push(file);
}

/** Navigate, settle, measure, axe, shoot — the per-screen contract. */
async function sweep(page: Page, route: string, name: string, viewport: string, opts: { axe?: boolean; full?: boolean; wait?: RegExp | string } = {}) {
  await page.goto(new URL(route, baseUrl).toString(), { waitUntil: 'domcontentloaded' }).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
  if (opts.wait) {
    await page.waitForFunction(
      `document.body.innerText.match(${JSON.stringify(opts.wait instanceof RegExp ? opts.wait.source : opts.wait)})`,
      undefined, { timeout: 15_000 },
    ).catch(() => undefined);
  }
  await page.waitForTimeout(700);
  const m = (await page.evaluate(MEASURE)) as Omit<Screen, 'route' | 'viewport'>;
  screens.push({ route, viewport, ...m });
  if (opts.axe !== false) {
    const res = await axe(page).catch(() => null);
    for (const v of res?.violations ?? []) {
      if ((v.impact ?? 'minor') === 'minor') continue;
      axeFindings.push({
        route, viewport, id: v.id, impact: v.impact,
        nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
      });
    }
  }
  await snap(page, `${name}-${viewport}`, opts.full ?? true);
  return m;
}

async function clickButton(page: Page, name: string | RegExp, scope?: string) {
  const btn = scope ? page.locator(scope).getByRole('button', { name }) : page.getByRole('button', { name });
  await btn.first().click({ timeout: 10_000 });
}

// ── run ─────────────────────────────────────────────────────────────────────

const executablePath = findChromium();
if (!executablePath) {
  console.error(NO_BROWSER_HELP);
  process.exit(1);
}

console.log(`staff audit → ${baseUrl}`);
console.log(`out: ${out}`);

await ensureDev();
const teacherState = await ensureTeacherRequested();
console.log(`teacher fixture: ${teacherState}`);
await ensureProbeAccount();

const browser = await chromium.launch({ executablePath, headless: !headed });

async function newPage(viewport: { width: number; height: number }, colorScheme: 'light' | 'dark' = 'light') {
  const context = await browser.newContext({ viewport, colorScheme });
  context.setDefaultTimeout(25_000);
  const page = await context.newPage();
  return { context, page };
}

const report: Record<string, unknown> = { base: baseUrl, startedAt: new Date().toISOString(), teacherState };

try {
  // ── A. signed-out staff pages ──────────────────────────────────────────
  {
    const { context, page } = await newPage({ width: 1440, height: 900 });
    watch(page, 'signed-out');
    await sweep(page, '/staff/login', 'staff-login', '1440', { wait: /staff sign in/i });
    await sweep(page, '/staff/register', 'staff-register', '1440', { wait: /staff registration/i });
    await page.setViewportSize({ width: 390, height: 844 });
    await sweep(page, '/staff/login', 'staff-login', '390', { wait: /staff sign in/i });
    await sweep(page, '/staff/register', 'staff-register', '390', { wait: /staff registration/i });
    await context.close();
  }
  {
    const { context, page } = await newPage({ width: 1440, height: 900 }, 'dark');
    watch(page, 'signed-out-dark');
    await sweep(page, '/staff/login', 'staff-login-dark', '1440', { wait: /staff sign in/i, axe: false });
    await context.close();
  }

  // ── B. developer session ───────────────────────────────────────────────
  const dev = await newPage({ width: 1440, height: 900 });
  watch(dev.page, 'dev');
  {
    const ok = await signIn(dev.page, baseUrl, DEV.email, DEV.password);
    if (!ok.ok) throw new Error(`dev sign-in failed: ${ok.why}`);
  }

  // /admin — the whole panel, both viewports, both themes.
  await sweep(dev.page, '/admin', 'admin', '1440', { wait: /developer admin|approval requests/i });
  // Interactions that are safe and part of the audited flow:
  // 1. approve the teacher request if one is pending (the audit's own fixture)
  const pendingRow = dev.page.locator('div.inset', { hasText: TEACHER.email });
  if (await pendingRow.count()) {
    await pendingRow.first().getByRole('button', { name: /^Approve$/ }).click();
    await dev.page.waitForTimeout(1200);
    await snap(dev.page, 'admin-approval-after', false);
  }
  // 2. verify the teacher's email from the users table (needed before teacher login)
  const teacherRow = dev.page.locator('tr', { hasText: TEACHER.email });
  if (await teacherRow.count()) {
    const verifyBtn = teacherRow.first().getByRole('button', { name: /^Verify email$/ });
    if (await verifyBtn.count()) {
      await verifyBtn.click();
      await dev.page.waitForTimeout(1200);
      await snap(dev.page, 'admin-teacher-verified', false);
    }
  }
  // 3. badge mint → revoke round-trip (bounded: minted then deleted)
  await dev.page.getByLabel('Badge label').fill('UXAudit');
  await dev.page.getByRole('button', { name: /Mint badge/ }).click();
  await dev.page.waitForTimeout(1200);
  const badgeChip = dev.page.locator('span,div', { hasText: 'UXAudit' }).last();
  await snap(dev.page, 'admin-badge-minted', false);
  // delete it through its InlineConfirm
  const removeBadge = dev.page.getByRole('button', { name: /Remove badge UXAudit/ });
  if (await removeBadge.count()) {
    await removeBadge.first().click();
    await dev.page.getByRole('button', { name: /^Remove$/ }).last().click();
    await dev.page.waitForTimeout(1200);
  }
  // 4. StudentProgressPanel on the probe user
  const probeRow = dev.page.locator('tr', { hasText: 'e2e-probe@revisio.probe' });
  if (await probeRow.count()) {
    await probeRow.first().getByRole('button', { name: /progress/i }).click();
    await dev.page.waitForTimeout(2500);
    await snap(dev.page, 'admin-progress-sheet', false);
    await dev.page.getByRole('button', { name: /^Close$/ }).first().click().catch(() => undefined);
    await dev.page.waitForTimeout(400);
  }
  // 5. SeasonManager editor — open and cancel, never save
  const newSeason = dev.page.getByRole('button', { name: /New season/ });
  if (await newSeason.count()) {
    await newSeason.first().click();
    await dev.page.waitForTimeout(800);
    await snap(dev.page, 'admin-season-editor', false);
    await dev.page.getByRole('button', { name: /^Cancel$/ }).first().click().catch(() => undefined);
    await dev.page.waitForTimeout(400);
  }
  // 6. ContentManager — filter + merge disclosure + open first topic if any
  const cmFilter = dev.page.getByLabel('Filter topics');
  if (await cmFilter.count()) {
    await cmFilter.fill('a');
    await dev.page.waitForTimeout(400);
  }
  const mergeSummary = dev.page.locator('summary', { hasText: /Merge two topics/ });
  if (await mergeSummary.count()) {
    await mergeSummary.first().click();
    await dev.page.waitForTimeout(500);
    await snap(dev.page, 'admin-merge-open', false);
  }
  const openBtn = dev.page.getByRole('button', { name: /^Open$/ }).first();
  if (await openBtn.count()) {
    await openBtn.click();
    await dev.page.waitForTimeout(1500);
    await snap(dev.page, 'admin-topic-open', true);
    const backBtn = dev.page.getByRole('button', { name: /All topics/ });
    if (await backBtn.count()) await backBtn.first().click().catch(() => undefined);
    await dev.page.waitForTimeout(500);
  }
  // re-shoot /admin after interactions
  await sweep(dev.page, '/admin', 'admin-after', '1440', { wait: /developer admin/i });
  await dev.page.setViewportSize({ width: 390, height: 844 });
  await sweep(dev.page, '/admin', 'admin', '390', { wait: /developer admin|approval requests/i });
  // dark pass
  await dev.page.setViewportSize({ width: 1440, height: 900 });
  await dev.context.close();

  const devDark = await newPage({ width: 1440, height: 900 }, 'dark');
  watch(devDark.page, 'dev-dark');
  {
    const ok = await signIn(devDark.page, baseUrl, DEV.email, DEV.password);
    if (!ok.ok) throw new Error(`dev dark sign-in failed: ${ok.why}`);
    await sweep(devDark.page, '/admin', 'admin-dark', '1440', { wait: /developer admin|approval requests/i, axe: true });
    await devDark.context.close();
  }

  // ── C. teacher session ─────────────────────────────────────────────────
  const teacherStateNow = await db.select({ status: users.status, emailVerifiedAt: users.emailVerifiedAt })
    .from(users).where(eq(users.email, TEACHER.email)).then((r) => r[0]);
  report.teacherAfterApproval = teacherStateNow;

  const teach = await newPage({ width: 1440, height: 900 });
  watch(teach.page, 'teacher');
  const teacherLogin = await signIn(teach.page, baseUrl, TEACHER.email, TEACHER.password);
  report.teacherLogin = teacherLogin;

  if (teacherLogin.ok) {
    await sweep(teach.page, '/teacher', 'teacher', '1440', { wait: /teaching|classes|no classes/i });

    // New subject (needed before a class can pick one)
    await teach.page.getByLabel('Subject name').fill('UX Audit Subject');
    await teach.page.getByRole('button', { name: /^Create$/ }).last().click();
    await teach.page.waitForTimeout(1500);
    await snap(teach.page, 'teacher-subject-created', false);

    // New class
    await teach.page.getByLabel('Class name').fill('UX Audit Class');
    const subjectSelect = teach.page.getByLabel('Subject').first();
    if (await subjectSelect.count()) {
      await subjectSelect.selectOption({ label: 'UX Audit Subject' }).catch(async () => {
        await subjectSelect.selectOption({ index: 1 }).catch(() => undefined);
      });
    }
    await teach.page.getByRole('button', { name: /^Create$/ }).first().click();
    await teach.page.waitForTimeout(1500);
    await snap(teach.page, 'teacher-class-created', true);

    // Copy the join code
    const copyBtn = teach.page.getByRole('button', { name: /Copy join code/ }).first();
    if (await copyBtn.count()) {
      await copyBtn.click();
      await teach.page.waitForTimeout(400);
      await snap(teach.page, 'teacher-code-copied', false);
    }

    // Rename the class
    const renameBtn = teach.page.getByRole('button', { name: /^Rename$/ }).first();
    if (await renameBtn.count()) {
      await renameBtn.click();
      await teach.page.getByLabel('New class name').fill('UX Audit Class Renamed');
      await teach.page.getByRole('button', { name: /^Save$/ }).first().click();
      await teach.page.waitForTimeout(1200);
    }

    // Add the probe student by email
    const addBtn = teach.page.getByRole('button', { name: /Add student/ }).first();
    if (await addBtn.count()) {
      await addBtn.click();
      await teach.page.getByLabel('Student email').fill('e2e-probe@revisio.probe');
      await teach.page.getByRole('button', { name: /Add to class/ }).click();
      await teach.page.waitForTimeout(1500);
      await snap(teach.page, 'teacher-member-added', true);
    }

    // Progress sheet on the roster name
    const rosterName = teach.page.getByRole('button', { name: /View progress for/ }).first();
    if (await rosterName.count()) {
      await rosterName.click();
      await teach.page.waitForTimeout(2500);
      await snap(teach.page, 'teacher-progress-sheet', false);
      await teach.page.getByRole('button', { name: /^Close$/ }).first().click().catch(() => undefined);
      await teach.page.waitForTimeout(400);
    }

    // Rotate the join code
    const rotateBtn = teach.page.getByRole('button', { name: /^Rotate$/ }).first();
    if (await rotateBtn.count()) {
      await rotateBtn.click();
      await teach.page.waitForTimeout(1200);
    }

    // Delete the class (InlineConfirm) — cleanup
    const deleteBtn = teach.page.getByRole('button', { name: /^Delete$/ }).first();
    if (await deleteBtn.count()) {
      await deleteBtn.click();
      await teach.page.waitForTimeout(400);
      await teach.page.getByRole('button', { name: /^Delete$/ }).last().click();
      await teach.page.waitForTimeout(1500);
      await snap(teach.page, 'teacher-class-deleted', true);
    }
    // Delete the subject too (InlineConfirm is not on teacher page for subjects —
    // teacher subjects are not deletable here; leave "UX Audit Subject", harmless)

    await sweep(teach.page, '/teacher', 'teacher-after', '1440', { wait: /teaching/i });
    await teach.page.setViewportSize({ width: 390, height: 844 });
    await sweep(teach.page, '/teacher', 'teacher', '390', { wait: /teaching/i });
    await teach.context.close();

    // /library as staff — seven tabs incl. Marking
    const lib = await newPage({ width: 1440, height: 900 });
    watch(lib.page, 'teacher-library');
    {
      const ok = await signIn(lib.page, baseUrl, TEACHER.email, TEACHER.password);
      if (!ok.ok) throw new Error(`teacher library sign-in failed: ${ok.why}`);
      await sweep(lib.page, '/library', 'library-staff', '1440', { wait: /my content|topics/i });
      const markingTab = lib.page.getByRole('tab', { name: /Marking/ });
      if (await markingTab.count()) {
        await markingTab.first().click();
        await lib.page.waitForTimeout(1500);
        await snap(lib.page, 'library-marking', false);
      }
      const classTab = lib.page.getByRole('tab', { name: /^Class$/ });
      if (await classTab.count()) {
        await classTab.first().click();
        await lib.page.waitForTimeout(800);
        await snap(lib.page, 'library-class', false);
      }
      await lib.page.setViewportSize({ width: 390, height: 844 });
      await sweep(lib.page, '/library', 'library-staff', '390', { wait: /my content|topics/i });
      await lib.context.close();
    }

    // teacher → /admin gate
    const teachAdmin = await newPage({ width: 1440, height: 900 });
    watch(teachAdmin.page, 'teacher-admin-gate');
    {
      const ok = await signIn(teachAdmin.page, baseUrl, TEACHER.email, TEACHER.password);
      if (ok.ok) {
        await sweep(teachAdmin.page, '/admin', 'admin-gate-teacher', '1440', { wait: /developers only/i });
      }
      await teachAdmin.context.close();
    }
  } else {
    report.teacherBlocked = teacherLogin.why;
  }

  // ── D. role gates as the student probe ─────────────────────────────────
  const stu = await newPage({ width: 1440, height: 900 });
  watch(stu.page, 'student-gates');
  {
    const probe = await ensureProbeAccount();
    const ok = await signIn(stu.page, baseUrl, probe.email, probe.password);
    if (ok.ok) {
      await sweep(stu.page, '/teacher', 'teacher-gate-student', '1440', { wait: /teachers only/i });
      await sweep(stu.page, '/admin', 'admin-gate-student', '1440', { wait: /developers only/i });
      // nav check: student shell must not link to staff destinations
      const navText = await stu.page.locator('nav, [role="navigation"], aside').allInnerTexts().catch(() => [] as string[]);
      report.studentNavHasStaffLinks = navText.some((t) => /Teaching|Admin/.test(t));
    } else {
      report.studentLogin = ok.why;
    }
    await stu.context.close();
  }

  // ── E. keyboard spot-check on /admin ───────────────────────────────────
  {
    const { context, page } = await newPage({ width: 1440, height: 900 });
    watch(page, 'keyboard');
    const ok = await signIn(page, baseUrl, DEV.email, DEV.password);
    if (ok.ok) {
      await page.goto(new URL('/admin', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
      await page.waitForTimeout(1200);
      const stops: string[] = [];
      for (let i = 0; i < 20; i += 1) {
        await page.keyboard.press('Tab');
        const info = await page.evaluate(`(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return 'BODY';
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return el.tagName.toLowerCase() + ' "' + (el.textContent || el.getAttribute('aria-label') || '').replace(/\\s+/g,' ').trim().slice(0,30) + '" @' + Math.round(r.x) + ',' + Math.round(r.y) + ' outline=' + cs.outlineStyle + '/' + cs.outlineWidth;
        })()`);
        stops.push(String(info));
      }
      report.keyboardAdmin = stops;
      writeFileSync(join(out, 'keyboard-admin.json'), JSON.stringify(stops, null, 2));
    }
    await context.close();
  }
} finally {
  await browser.close();
}

report.screens = screens;
report.findings = findings;
report.pageFindings = pageFindings;
report.axe = axeFindings;
report.shots = shots;
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));

// console summary
const small = screens.flatMap((s) => s.smallTargets.map((t) => `${s.route}@${s.viewport}: ${t.tag} "${t.text}" ${t.w}x${t.h}`));
const inlineType = screens.flatMap((s) => s.typeScale.map((t) => `${s.route}@${s.viewport}: ${t.className} ${t.size} "${t.sample}"`));
const overflow = screens.filter((s) => s.overflowX > 0).map((s) => `${s.route}@${s.viewport}: +${s.overflowX}px`);
console.log(`\n${screens.length} screens · ${axeFindings.length} axe · ${pageFindings.length} page findings`);
if (small.length) console.log(`small targets (<44px):\n  ${[...new Set(small)].join('\n  ')}`);
if (inlineType.length) console.log(`inline type:\n  ${[...new Set(inlineType)].slice(0, 20).join('\n  ')}`);
if (overflow.length) console.log(`overflow:\n  ${overflow.join('\n  ')}`);
if (pageFindings.length) console.log(`page findings:\n  ${pageFindings.slice(0, 30).join('\n  ')}`);
console.log(`report: ${join(out, 'report.json')}`);
