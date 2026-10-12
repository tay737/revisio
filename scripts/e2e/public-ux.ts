import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { findChromium, NO_BROWSER_HELP } from './lib/browser';

const require_ = createRequire(import.meta.url);
const axeSource = require_.resolve('axe-core/axe.min.js');
const baseUrl = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3115';
const artifacts = join('artifacts', 'e2e-public-ux');
const routes = [
  { path: '/', status: 200 },
  { path: '/login', status: 200 },
  { path: '/register', status: 200 },
  { path: '/staff/register', status: 200 },
  { path: '/forgot-password', status: 200 },
  { path: '/reset-password', status: 200 },
  { path: '/privacy', status: 200 },
  { path: '/terms', status: 200 },
  { path: '/cookie-policy', status: 200 },
  { path: '/accessibility', status: 200 },
  { path: '/__public_ux_missing_route__', status: 404 },
] as const;

type AxeViolation = {
  id: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical' | null;
  help: string;
  nodes: { target: string[]; failureSummary?: string }[];
};

const report: {
  baseUrl: string;
  startedAt: string;
  routes: { path: string; status: number | null; headingCount: number; mainCount: number }[];
  axe: { path: string; theme: string; violations: AxeViolation[] }[];
  checks: string[];
  pageErrors: string[];
  apiRequests: string[];
  blockedWrites: string[];
} = {
  baseUrl,
  startedAt: new Date().toISOString(),
  routes: [],
  axe: [],
  checks: [],
  pageErrors: [],
  apiRequests: [],
  blockedWrites: [],
};

function check(condition: unknown, message: string): asserts condition {
  assert.ok(condition, message);
  report.checks.push(message);
}

async function watchPage(page: Page) {
  page.on('pageerror', (error) => report.pageErrors.push(`${page.url()}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error' || /Failed to load resource: the server responded with a status of/i.test(message.text())) return;
    report.pageErrors.push(`${page.url()}: console ${message.text()}`);
  });
  page.on('requestfailed', (request) => {
    if (/net::ERR_ABORTED/.test(request.failure()?.errorText ?? '')) return;
    report.pageErrors.push(`${page.url()}: ${request.method()} ${request.url()} failed`);
  });
}

async function stubApis(context: BrowserContext) {
  await context.route('**/api/v1/**', async (route) => {
    const request = route.request();
    report.apiRequests.push(`${request.method()} ${new URL(request.url()).pathname}`);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      report.blockedWrites.push(`${request.method()} ${new URL(request.url()).pathname}`);
    }
    const body = new URL(request.url()).pathname.endsWith('/auth/subjects-public')
      ? { subjects: [] }
      : {};
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

function consentRegionOf(page: Page) {
  return page.getByRole('region', { name: 'Cookie consent' });
}

/**
 * Entrance fades render text part-way transparent, which axe samples as a
 * washed-out foreground and reports as a contrast failure. Wait until the
 * heading copy is fully opaque before scanning colours.
 */
async function waitForMotionToSettle(page: Page) {
  await page
    .waitForFunction(
      () =>
        [document.querySelector('h1'), document.querySelector('.t-eyebrow'), document.querySelector('.t-display')]
          .filter((el): el is Element => !!el)
          .every((el) => getComputedStyle(el).opacity === '1'),
      undefined,
      { timeout: 5_000 },
    )
    .catch(() => undefined);
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined);
  await page.waitForTimeout(200);
}

async function scanAxe(page: Page, path: string, theme: 'light' | 'dark') {
  const result = await page.evaluate(async () => {
    const axe = (window as Window & { axe?: { run: (root: Document) => Promise<{ violations: AxeViolation[] }> } }).axe;
    if (!axe) throw new Error('axe-core did not load');
    return axe.run(document);
  });
  report.axe.push({ path, theme, violations: result.violations });
}

/** Injected verbatim into the page; see the blocked-storage note below. */
const BLOCKED_STORAGE_STUB = `
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get: function () {
      return {
        getItem: function () { throw new DOMException('blocked', 'SecurityError'); },
        setItem: function () { throw new DOMException('blocked', 'SecurityError'); },
        removeItem: function () { throw new DOMException('blocked', 'SecurityError'); },
        clear: function () { throw new DOMException('blocked', 'SecurityError'); },
        key: function () { throw new DOMException('blocked', 'SecurityError'); },
        get length() { throw new DOMException('blocked', 'SecurityError'); },
      };
    },
  });
`;

async function makeContext(browser: Awaited<ReturnType<typeof chromium.launch>>) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  context.setDefaultTimeout(30_000);
  context.setDefaultNavigationTimeout(45_000);
  await stubApis(context);
  return context;
}

const executablePath = findChromium();
if (!executablePath) {
  console.error(NO_BROWSER_HELP);
  process.exit(1);
}

mkdirSync(artifacts, { recursive: true });
console.log(`public UX gate → ${baseUrl}`);
console.log(`browser: ${executablePath}`);
const browser = await chromium.launch({ executablePath, headless: process.env.E2E_HEADED !== '1' });

try {
  // Fresh visitor: the skip link precedes the landing navigation and consent UI.
  const keyboardContext = await makeContext(browser);
  const keyboardPage = await keyboardContext.newPage();
  await watchPage(keyboardPage);
  await keyboardPage.goto(new URL('/', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await keyboardPage.getByRole('region', { name: 'Cookie consent' }).waitFor();
  await keyboardPage.keyboard.press('Tab');
  check(await keyboardPage.locator(':focus').innerText() === 'Skip to content', 'first Tab reaches the skip link');
  await keyboardPage.keyboard.press('Enter');
  check(await keyboardPage.evaluate(() => document.activeElement?.id === 'main'), 'skip link moves focus to main');
  await keyboardContext.close();

  // Consent is anonymous, explicit, persistent, and never posts to an API.
  const consentContext = await makeContext(browser);
  const consentPage = await consentContext.newPage();
  await watchPage(consentPage);
  await consentPage.goto(new URL('/', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  const consentRegion = consentPage.getByRole('region', { name: 'Cookie consent' });
  await consentRegion.waitFor();
  const analytics = consentPage.getByRole('checkbox', { name: 'Analytics' });
  await analytics.check();
  check(await analytics.isChecked(), 'anonymous visitor can change an individual purpose');
  await consentPage.getByRole('button', { name: 'Reject all' }).click();
  const saved = await consentPage.evaluate(() => JSON.parse(localStorage.getItem('revisio.cookie-consent') ?? 'null')) as {
    decidedAt?: string;
    consent?: { choices?: { analytics?: boolean; essential?: boolean } };
  } | null;
  check(typeof saved?.decidedAt === 'string', 'reject-all persists an explicit decision timestamp');
  check(saved?.consent?.choices?.analytics === false && saved.consent.choices.essential === true, 'reject-all keeps optional purposes off and essential on');
  await consentPage.reload({ waitUntil: 'domcontentloaded' });
  await settle(consentPage);
  check(await consentPage.getByRole('region', { name: 'Cookie consent' }).count() === 0, 'reject-all remains dismissed after reload');

  // Partial choice is a completed decision and survives public navigation.
  await consentPage.evaluate(() => localStorage.removeItem('revisio.cookie-consent'));
  await consentPage.reload({ waitUntil: 'domcontentloaded' });
  const partialAnalytics = consentPage.getByRole('checkbox', { name: 'Analytics' });
  await partialAnalytics.check();
  await consentPage.getByRole('button', { name: 'Save choices' }).click();
  await consentPage.goto(new URL('/terms', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await consentPage.goto(new URL('/', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await settle(consentPage);
  check(await consentPage.getByRole('region', { name: 'Cookie consent' }).count() === 0, 'a partial choice stays dismissed across public navigation');
  const partial = await consentPage.evaluate(() => JSON.parse(localStorage.getItem('revisio.cookie-consent') ?? 'null')) as {
    consent?: { choices?: { analytics?: boolean; marketing?: boolean } };
  } | null;
  check(partial?.consent?.choices?.analytics === true && partial.consent.choices.marketing === false, 'partial purpose choices are preserved');
  await consentContext.close();

  // With storage disabled, controls remain available and the user can continue.
  // NOTE: the stub is passed as raw source, not as a function. tsx transpiles
  // callbacks with esbuild keepNames, which wraps inner functions in a
  // `__name()` helper that does not exist inside the page — the script would
  // throw and storage would never actually be blocked.
  const blockedStorageContext = await makeContext(browser);
  await blockedStorageContext.addInitScript({ content: BLOCKED_STORAGE_STUB });
  const blockedPage = await blockedStorageContext.newPage();
  await watchPage(blockedPage);
  await blockedPage.goto(new URL('/', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await blockedPage.getByRole('region', { name: 'Cookie consent' }).waitFor();
  const blockedPanel = consentRegionOf(blockedPage);
  const storageAlert = blockedPanel.getByRole('alert');
  await storageAlert.getByText(/could not read saved consent/i).waitFor({ state: 'visible' });
  await blockedPanel.getByRole('button', { name: 'Reject all' }).click();
  await storageAlert.getByText(/blocked storage.*visit only/i).waitFor({ state: 'visible', timeout: 5_000 });
  check(await storageAlert.innerText().then((text) => /visit only/i.test(text)), 'blocked storage truthfully reports that the choice is not saved');
  await blockedPanel.getByRole('button', { name: 'Continue for now' }).click();
  check(await blockedPage.getByRole('region', { name: 'Cookie consent' }).count() === 0, 'storage failure does not trap the visitor');
  await blockedStorageContext.close();

  // Registration DOB/guardian fields are shown only for learner accounts.
  const registerContext = await makeContext(browser);
  const registerPage = await registerContext.newPage();
  await watchPage(registerPage);
  await registerPage.goto(new URL('/register', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await registerPage.getByLabel('Learner’s date of birth').waitFor();
  const registrationConsent = consentRegionOf(registerPage);
  if (await registrationConsent.count()) {
    await registrationConsent.getByRole('button', { name: 'Reject all' }).click();
    await registrationConsent.waitFor({ state: 'detached' });
  }
  check(await registerPage.getByLabel('Learner’s date of birth').getAttribute('required') !== null, 'learner registration requires a date of birth');
  await registerPage.getByLabel('Learner’s date of birth').fill('2015-01-01');
  check(await registerPage.getByRole('checkbox', { name: /I am the parent or legal guardian/i }).count() === 1, 'under-13 registration presents guardian attestation');
  await registerPage.getByRole('button', { name: 'Teacher' }).click();
  check(await registerPage.getByLabel('Learner’s date of birth').count() === 0, 'teacher registration does not collect a learner date of birth');
  await registerContext.close();

  // Public, auth, legal and not-found routes: expected status, semantics, runtime.
  const routeContext = await makeContext(browser);
  const page = await routeContext.newPage();
  await watchPage(page);
  for (const route of routes) {
    const response = await page.goto(new URL(route.path, baseUrl).toString(), { waitUntil: 'domcontentloaded' });
    await settle(page);
    await waitForMotionToSettle(page);
    // Inject after navigation: a goto replaces the document, so a script tag
    // added before the loop would not survive the first route.
    await page.addScriptTag({ path: axeSource });
    const status = response?.status() ?? null;
    const headingCount = await page.locator('h1').count();
    const mainCount = await page.locator('main').count();
    report.routes.push({ path: route.path, status, headingCount, mainCount });
    check(status === route.status, `${route.path} responds ${route.status} (received ${status})`);
    check(await page.locator('html').getAttribute('lang') === 'en', `${route.path} declares the document language`);
    check(headingCount === 1, `${route.path} has exactly one h1 (found ${headingCount})`);
    check(mainCount === 1, `${route.path} has one main landmark (found ${mainCount})`);
    if (route.path !== '/__public_ux_missing_route__') {
      await scanAxe(page, route.path, 'light');
      await page.evaluate(() => document.documentElement.classList.add('dark'));
      await scanAxe(page, route.path, 'dark');
      await page.evaluate(() => document.documentElement.classList.remove('dark'));
    }
  }
  await page.screenshot({ path: join(artifacts, 'public-routes.png'), fullPage: true });
  await routeContext.close();

  // Consent panel layout and accessibility at the narrow phone sizes.
  const mobileContext = await makeContext(browser);
  const mobilePage = await mobileContext.newPage();
  await watchPage(mobilePage);
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 720 }]) {
    await mobilePage.setViewportSize(viewport);
    await mobilePage.goto(new URL('/', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
    const panel = mobilePage.getByRole('region', { name: 'Cookie consent' });
    await panel.waitFor();
    await settle(mobilePage);
    await waitForMotionToSettle(mobilePage);
    const dimensions = await mobilePage.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      panel: document.querySelector('[aria-label="Cookie consent"]')?.getBoundingClientRect().toJSON(),
      actions: [...document.querySelectorAll('[aria-label="Cookie consent"] button')].map((button) => button.getBoundingClientRect().toJSON()),
    }));
    check(dimensions.width <= dimensions.viewportWidth, `no horizontal document overflow at ${viewport.width}px`);
    check(!!dimensions.panel && dimensions.panel.height <= viewport.height && dimensions.panel.left >= 0, `consent panel stays within ${viewport.width}×${viewport.height}`);
    check(dimensions.actions.every((rect) => rect.bottom <= viewport.height && rect.left >= 0), `consent actions remain visible at ${viewport.width}px`);
    const analytics = mobilePage.getByRole('checkbox', { name: 'Analytics' });
    await analytics.focus();
    const focused = await mobilePage.evaluate(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return false;
      const rect = active.getBoundingClientRect();
      const panel = document.querySelector('[aria-label="Cookie consent"]');
      return !!panel && panel.contains(active) && rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight;
    });
    check(focused, `focused consent control remains visible at ${viewport.width}px`);
    await mobilePage.addScriptTag({ path: axeSource });
    await scanAxe(mobilePage, `consent@${viewport.width}`, 'light');
  }
  await mobileContext.close();

  // Manifest, static icons and worker registration; no install/update is forced.
  const pwaContext = await makeContext(browser);
  const pwaPage = await pwaContext.newPage();
  await watchPage(pwaPage);
  await pwaPage.goto(new URL('/', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  const manifest = await pwaContext.request.get(new URL('/manifest.webmanifest', baseUrl).toString());
  check(manifest.ok(), 'web app manifest is served');
  const manifestJson = await manifest.json() as { display?: string; icons?: { src: string }[] };
  check(manifestJson.display === 'standalone', 'manifest requests standalone display');
  for (const icon of manifestJson.icons ?? []) {
    const iconResponse = await pwaContext.request.get(new URL(icon.src, baseUrl).toString());
    check(iconResponse.ok(), `manifest icon ${icon.src} is served`);
  }
  const workerActive = await pwaPage.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8_000)),
    ]);
    return !!registration && !!registration.active;
  });
  check(workerActive, 'service worker registers and activates without a forced install/update prompt');
  await pwaContext.close();

  check(report.blockedWrites.length === 0, 'public suite made no API write requests');
  check(report.pageErrors.length === 0, `public routes raised no browser errors (${report.pageErrors.length} found)`);
  const blockers = report.axe.flatMap((scan) => scan.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => ({ path: scan.path, theme: scan.theme, violation })));
  check(blockers.length === 0, `axe reports no serious/critical violations (${blockers.length} found)`);

  const reportPath = join(artifacts, 'report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n${report.checks.length} checks passed; ${report.axe.reduce((count, scan) => count + scan.violations.length, 0)} axe violation instances.`);
  console.log(`Report: ${reportPath}`);
  if (report.apiRequests.length) console.log(`Stubbed API requests: ${report.apiRequests.length}; non-GET attempts: ${report.blockedWrites.length}`);
} catch (error) {
  writeFileSync(join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
