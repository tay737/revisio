/**
 * Focused probe: the staff "student insights" experience — the path a teacher
 * takes from /teacher roster → StudentProgressPanel, and the dev path through
 * /admin → Progress, plus the authorization boundary on /api/v1/teacher/student.
 *
 *   E2E_BASE_URL=https://revisio-srs.vercel.app npm run probe:teacher-insights
 *
 * Writes (all reverted in `finally`):
 *   • class "UX Audit Insights" owned by ux-audit-teacher@revisio.probe
 *   • two throwaway students ux-audit-student-a/b@revisio.probe
 *   • seeded card_user_states / review_logs / streaks / xp_events for student-a
 *   • the class (cascade) and the seeded rows are deleted at the end
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { findChromium, NO_BROWSER_HELP, signIn } from './lib/browser';
import { and, eq } from 'drizzle-orm';
import { db } from '../../src/db/client';
import { users, classes, classMemberships, subjects, cards, topics, cardUserStates, reviewLogs, streaks, xpEvents } from '../../src/db/schema';
import { hashPassword } from '../../src/services/auth';

const require_ = createRequire(import.meta.url);
const axeSource = await readFile(require_.resolve('axe-core/axe.min.js'), 'utf8');

const baseUrl = process.env.E2E_BASE_URL ?? 'https://revisio-srs.vercel.app';
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out = join(process.cwd(), 'artifacts', 'teacher-insights', stamp);
mkdirSync(out, { recursive: true });

const DEV = { email: 'ux-audit-dev@revisio.probe', password: 'ux-audit-dev-pass', name: 'UX Audit Dev' };
const TEACHER = { email: 'ux-audit-teacher@revisio.probe', password: 'ux-audit-teacher-pass', name: 'UX Audit Teacher' };
const STUDENT_A = { email: 'ux-audit-student-a@revisio.probe', password: 'ux-audit-student-a-pass', name: 'UX Audit Student A' };
const STUDENT_B = { email: 'ux-audit-student-b@revisio.probe', password: 'ux-audit-student-b-pass', name: 'UX Audit Student B' };
const CLASS_NAME = 'UX Audit Insights';

// ── fixtures ────────────────────────────────────────────────────────────────

async function ensureUser(fx: { email: string; password: string; name: string }, id: string, role: 'student' | 'teacher' | 'developer') {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, fx.email));
  if (existing) {
    await db.update(users).set({
      passwordHash: await hashPassword(fx.password), role, status: 'active', emailVerifiedAt: new Date(),
    }).where(eq(users.id, existing.id));
    return existing.id;
  }
  await db.insert(users).values({
    id, email: fx.email, name: fx.name, passwordHash: await hashPassword(fx.password),
    role, status: 'active', emailVerifiedAt: new Date(),
  });
  return id;
}

const findings: Record<string, unknown>[] = [];
const authz: Record<string, unknown> = {};
let classId: string | null = null;
let studentAId: string | null = null;
let studentBId: string | null = null;

// ── measurement (same contract as admin-insights-probe) ─────────────────────

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
    innerOverflow: innerOverflow.slice(0, 10),
    smallTargets, headings, focusables,
    words: (dlg.textContent || '').trim().split(/\\s+/).filter(Boolean).length,
  };
})()`;

const PAGE_MEASURE = `(() => {
  const text = (el) => (el ? (el.textContent || '').replace(/\\s+/g, ' ').trim() : '');
  const controls = Array.from(document.querySelectorAll('main a, main button, [role="button"]'));
  const smallTargets = controls.map((el) => {
    const r = el.getBoundingClientRect();
    return { tag: el.tagName.toLowerCase(), text: (text(el) || el.getAttribute('aria-label') || '').slice(0, 44), w: Math.round(r.width), h: Math.round(r.height) };
  }).filter((t) => t.h > 0 && t.h < 44);
  return {
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    smallTargets,
    rosterRows: document.querySelectorAll('main ul li').length,
  };
})()`;

async function axeOn(page: Page, selector?: string) {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(`axe.run(${selector ? `document.querySelector('${selector}') || document` : 'document'}, { resultTypes: ['violations'] })`) as Promise<{
    violations: { id: string; impact: string | null; nodes: { target: string[] }[] }[];
  }>;
}

async function probeSheet(page: Page, label: string, shot: string) {
  const res = await page.evaluate(SHEET_MEASURE);
  await page.screenshot({ path: join(out, shot) });
  let axeViolations: unknown[] = [];
  try {
    const axe = await axeOn(page, '[role="dialog"]');
    axeViolations = axe.violations.filter((v) => (v.impact ?? 'minor') !== 'minor')
      .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
  } catch (e) { axeViolations = [{ error: String(e) }]; }
  findings.push({ label, measure: res, axe: axeViolations, shot });
  return res as { open?: boolean };
}

// ── run ─────────────────────────────────────────────────────────────────────

const executablePath = findChromium();
if (!executablePath) { console.error(NO_BROWSER_HELP); process.exit(1); }

console.log(`teacher-insights probe → ${baseUrl}`);
console.log(`out: ${out}`);

const devId = await ensureUser(DEV, 'ux-audit-dev', 'developer');
const teacherId = await ensureUser(TEACHER, 'ux-audit-teacher', 'teacher');
studentAId = await ensureUser(STUDENT_A, 'ux-audit-student-a', 'student');
studentBId = await ensureUser(STUDENT_B, 'ux-audit-student-b', 'student');

// Class owned by the teacher fixture, both students as members.
const [subj] = await db.select({ id: subjects.id }).from(subjects).limit(1);
if (!subj) throw new Error('no subject to hang the class on');
const existing = await db.select({ id: classes.id }).from(classes)
  .where(and(eq(classes.teacherId, teacherId), eq(classes.name, CLASS_NAME))).limit(1);
if (existing[0]) {
  classId = existing[0].id;
} else {
  classId = crypto.randomUUID();
  await db.insert(classes).values({ id: classId, teacherId, name: CLASS_NAME, subjectId: subj.id, joinCode: 'UXAUD1' });
}
await db.insert(classMemberships).values([
  { classId: classId!, userId: studentAId! },
  { classId: classId!, userId: studentBId! },
]).onConflictDoNothing();

// Seed student-a with believable activity on real public cards.
const seedCards = await db
  .select({ cardId: cards.id, topicId: cards.topicId, kind: cards.kind, prompt: cards.prompt, textWithBlank: cards.textWithBlank, question: cards.question })
  .from(cards)
  .innerJoin(topics, eq(cards.topicId, topics.id))
  .where(eq(topics.visibility, 'public'))
  .limit(6);
if (seedCards.length >= 4 && studentAId) {
  const stages = ['mastered', 'review', 'review', 'learning', 'new', 'mastered'] as const;
  const intervals = [21, 7, 4, 2, 0, 30];
  const dueInDays = [-1, 0, 2, 5, -3, 10];
  await db.insert(cardUserStates).values(seedCards.map((c, i) => ({
    userId: studentAId!, cardId: c.cardId, stage: stages[i], intervalDays: intervals[i],
    lapses: i === 3 ? 2 : 0, reps: 3 + i,
    dueAt: new Date(Date.now() + dueInDays[i] * 86_400_000),
    lastReviewedAt: new Date(Date.now() - (i + 1) * 86_400_000),
  }))).onConflictDoNothing();

  const answers = ['paris', 'the mitochondria is the powerhouse of the cell', 'WWII ended in 1945', 'a much longer learner answer that will definitely exceed forty eight characters so the expand affordance has something to do'];
  const corrects = [true, false, true, false, true, false, true, true, false, true];
  await db.insert(reviewLogs).values(corrects.map((ok, i) => ({
    id: crypto.randomUUID(), userId: studentAId!, cardId: seedCards[i % seedCards.length].cardId,
    mode: 'daily' as const, rating: (ok ? 'good' : 'again') as 'good' | 'again',
    userAnswer: answers[i % answers.length],
    graded: { correct: ok, feedbackKind: ok ? 'correct' : 'wrong' },
    durationMs: 4000 + i * 500, xpAwarded: ok ? 10 : 2,
    reviewedAt: new Date(Date.now() - i * 3_600_000),
  })));
  await db.insert(streaks).values({ userId: studentAId!, current: 4, best: 9, lastActiveDate: new Date().toISOString().slice(0, 10) })
    .onConflictDoUpdate({ target: streaks.userId, set: { current: 4, best: 9 } });
  await db.insert(xpEvents).values([10, 10, 2, 10, 10].map((amount, i) => ({
    id: crypto.randomUUID(), userId: studentAId!, amount, source: 'review' as const, refId: seedCards[i % seedCards.length].cardId,
  })));
  console.log(`seeded student-a with ${seedCards.length} cards, 10 reviews`);
}

const browser = await chromium.launch({ executablePath, headless: true });
const report: Record<string, unknown> = { base: baseUrl, startedAt: new Date().toISOString(), classId, studentAId, studentBId };

async function newPage(vw: number, vh: number, scheme: 'light' | 'dark' = 'light') {
  const context = await browser.newContext({ viewport: { width: vw, height: vh }, colorScheme: scheme });
  context.setDefaultTimeout(25_000);
  return { context, page: await context.newPage() };
}

try {
  // ── A. authorization boundary (once, teacher + student + dev sessions) ────
  {
    const { context, page } = await newPage(1440, 900);
    const t = await signIn(page, baseUrl, TEACHER.email, TEACHER.password);
    authz.teacherLogin = t.ok;
    if (t.ok) {
      const member = await context.request.get(`${baseUrl}/api/v1/teacher/student?userId=${studentAId}`);
      const nonMember = await context.request.get(`${baseUrl}/api/v1/teacher/student?userId=${devId}`);
      const self = await context.request.get(`${baseUrl}/api/v1/teacher/student?userId=${teacherId}`);
      authz.teacherMember = member.status();
      authz.teacherNonMember = nonMember.status();
      authz.teacherSelf = self.status();
    }
    await context.close();
  }
  {
    const { context, page } = await newPage(1440, 900);
    const s = await signIn(page, baseUrl, STUDENT_A.email, STUDENT_A.password);
    authz.studentLogin = s.ok;
    if (s.ok) {
      const r = await context.request.get(`${baseUrl}/api/v1/teacher/student?userId=${studentBId}`);
      authz.studentRequest = r.status();
    }
    await context.close();
  }
  {
    const { context, page } = await newPage(1440, 900);
    const d = await signIn(page, baseUrl, DEV.email, DEV.password);
    authz.devLogin = d.ok;
    if (d.ok) {
      const r = await context.request.get(`${baseUrl}/api/v1/teacher/student?userId=${studentAId}`);
      authz.devAnyUser = r.status();
    }
    await context.close();
  }
  report.authz = authz;

  // ── B. teacher path: roster → insights sheet ─────────────────────────────
  for (const [vw, vh, vp] of [[1440, 900, '1440'], [390, 844, '390']] as const) {
    for (const scheme of ['light', 'dark'] as const) {
      const { context, page } = await newPage(vw, vh, scheme);
      const tag = `teacher-${vp}-${scheme}`;
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(`console ${m.text().slice(0, 160)}`); });

      const ok = await signIn(page, baseUrl, TEACHER.email, TEACHER.password);
      if (!ok.ok) { findings.push({ label: tag, error: `teacher sign-in failed: ${ok.why}` }); await context.close(); continue; }
      await page.goto(new URL('/teacher', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
      await page.waitForFunction(`document.body.innerText.includes('${CLASS_NAME}')`, undefined, { timeout: 15_000 }).catch(() => undefined);
      await page.waitForTimeout(800);

      const roster = (await page.evaluate(PAGE_MEASURE)) as Record<string, unknown>;
      await page.screenshot({ path: join(out, `${tag}-roster.png`), fullPage: vw === 390 });
      findings.push({ label: `${tag}-roster`, measure: roster });

      // Open student A's insights via the roster name button.
      const nameBtn = page.getByRole('button', { name: /View progress for UX Audit Student A/ });
      if (!(await nameBtn.count())) {
        findings.push({ label: tag, error: 'roster name button not found' });
        await context.close(); continue;
      }
      await nameBtn.first().click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(out, `${tag}-sheet-loading.png`) });
      await page.waitForFunction(`document.body.innerText.match(/SRS strength|Nothing answered yet|No misses/)`, undefined, { timeout: 20_000 }).catch(() => undefined);
      await page.waitForTimeout(900);
      await probeSheet(page, `${tag}-sheet-A`, `${tag}-sheet-A.png`);

      // Prev/next inside the class roster.
      const nextBtn = page.getByRole('button', { name: /Next student/ });
      if (await nextBtn.count()) {
        await nextBtn.first().click();
        await page.waitForTimeout(1200);
        const header = await page.evaluate(`document.querySelector('[role="dialog"] h2')?.textContent || ''`);
        findings.push({ label: `${tag}-next`, header });
        await page.screenshot({ path: join(out, `${tag}-sheet-B.png`) });
      }

      // Show all cards if offered.
      const showAll = page.getByRole('button', { name: /Show all \d+/ });
      if (await showAll.count()) {
        await showAll.first().click();
        await page.waitForTimeout(600);
        await probeSheet(page, `${tag}-sheet-expanded`, `${tag}-sheet-expanded.png`);
      }

      // Escape closes + focus returns to the roster button.
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      const stillOpen = await page.evaluate(`!!document.querySelector('[role="dialog"]')`);
      const focusAfter = await page.evaluate(`document.activeElement && (document.activeElement.getAttribute('aria-label') || document.activeElement.textContent || '').slice(0, 60)`);
      findings.push({ label: `${tag}-escape`, escapeClosed: !stillOpen, focusAfter, errors });
      if (stillOpen) await page.getByRole('button', { name: /^Close$/ }).first().click().catch(() => undefined);
      await context.close();
    }
  }

  // ── C. dev path: /admin users table → Progress on the data-rich account ──
  for (const [vw, vh, vp] of [[1440, 900, '1440'], [390, 844, '390']] as const) {
    const { context, page } = await newPage(vw, vh);
    const tag = `admin-${vp}`;
    const ok = await signIn(page, baseUrl, DEV.email, DEV.password);
    if (!ok.ok) { findings.push({ label: tag, error: `dev sign-in failed: ${ok.why}` }); await context.close(); continue; }
    await page.goto(new URL('/admin', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
    await page.waitForFunction(`document.body.innerText.match(/developer admin|approval requests/i)`, undefined, { timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(800);

    // Filter to the data-rich account first — the table is long.
    const filter = page.getByLabel('Filter users');
    if (await filter.count()) {
      await filter.fill('tayyab@outlook.jp');
      await page.waitForTimeout(600);
    }
    const row = page.locator('tr', { hasText: 'tayyab@outlook.jp' });
    const btn = row.getByRole('button', { name: /progress/i }).first();
    if (!(await btn.count())) {
      findings.push({ label: tag, error: 'no progress button on tayyab row' });
      await context.close(); continue;
    }
    await btn.click();
    await page.waitForFunction(`document.body.innerText.match(/SRS strength|Nothing answered yet|No misses/)`, undefined, { timeout: 20_000 }).catch(() => undefined);
    await page.waitForTimeout(900);
    await probeSheet(page, `${tag}-sheet-rich`, `${tag}-sheet-rich.png`);

    // The answer chips are the diagnostic surface — capture what staff actually read.
    const answerChips = await page.evaluate(`Array.from(document.querySelectorAll('[role="dialog"] button')).map(b => (b.textContent||'').trim()).filter(t => t.length > 0 && t.length < 90).slice(0, 30)`);
    findings.push({ label: `${tag}-answer-chips`, chips: answerChips });
    await context.close();
  }
} finally {
  await browser.close();
  // ── cleanup: class (cascades memberships), seeded rows, throwaway students ──
  try {
    if (classId) await db.delete(classes).where(eq(classes.id, classId));
    if (studentAId) {
      await db.delete(reviewLogs).where(eq(reviewLogs.userId, studentAId));
      await db.delete(cardUserStates).where(eq(cardUserStates.userId, studentAId));
      await db.delete(xpEvents).where(eq(xpEvents.userId, studentAId));
      await db.delete(streaks).where(eq(streaks.userId, studentAId));
      await db.delete(users).where(eq(users.id, studentAId));
    }
    if (studentBId) await db.delete(users).where(eq(users.id, studentBId));
    console.log('cleanup done');
  } catch (e) {
    console.error('cleanup failed:', e);
  }
}

report.findings = findings;
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(`findings: ${findings.length} → ${join(out, 'report.json')}`);
for (const f of findings) console.log(JSON.stringify(f).slice(0, 400));
process.exit(0);
