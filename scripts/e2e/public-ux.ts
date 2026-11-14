import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Locator, type Page } from 'playwright-core';
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
  nodes: {
    target: string[];
    failureSummary?: string;
    any: { message: string }[];
    all: { message: string }[];
  }[];
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

/**
 * `locator.count()` does not wait. A checkbox or field that a React state change
 * has not rendered yet reads as absent, and one that a re-render is about to
 * remove reads as present — so a bare count after `fill()` or `click()` is a
 * race that passes or fails on timing (it failed against the deployed build
 * while passing locally). These two helpers give the DOM a bounded window to
 * reach the expected count and then report what is actually there, so the
 * assertion still fails on a real regression.
 */
async function presentEventually(locator: Locator, expected = 1, timeout = 8_000): Promise<number> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const count = await locator.count();
    if (count === expected || Date.now() > deadline) return count;
    await locator.page().waitForTimeout(100);
  }
}

async function absentEventually(locator: Locator, timeout = 2_000): Promise<boolean> {
  return (await presentEventually(locator, 0, timeout)) === 0;
}

/**
 * Wait until React owns the control the suite is about to type into.
 *
 * `waitFor()` resolves on the server-rendered node, which exists before the
 * client bundle has hydrated. A value typed into a controlled input in that
 * window is discarded when the first client render enforces its `value` prop
 * (the subjects fetch resolves straight after hydration and triggers exactly
 * that render), so the form never sees the date of birth: measured against the
 * deployed build, the guardian step appeared in 1 of 6 attempts without this
 * wait and 6 of 6 with it. React stamps its internals onto the nodes it
 * manages, so that key is a direct signal that typing will be heard.
 */
async function waitForHydration(page: Page, selector: string) {
  await page.waitForFunction(
    (sel) => {
      const element = document.querySelector(sel);
      return !!element
        && Object.keys(element).some((key) => key.startsWith('__reactFiber$') || key.startsWith('__reactProps$'));
    },
    selector,
    { timeout: 15_000 },
  );
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
 * The per-purpose controls sit behind the `Customise` disclosure, so a test that
 * wants one has to open the disclosure first — the way a person would. It
 * returns the Analytics checkbox once the list is actually on screen.
 */
async function openConsentPurposes(page: Page, region = consentRegionOf(page)) {
  const toggle = region.getByRole('button', { name: 'Customise' });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  const analytics = region.getByRole('checkbox', { name: 'Analytics' });
  await analytics.waitFor({ state: 'visible' });
  return analytics;
}

/**
 * Axe must not sample an element mid-fade: a half-transparent label reads as low
 * contrast. Wait for every finite animation to finish; infinite loops (shimmer,
 * pulse, spin) never finish and are ignored, since they do not change ink colour.
 */
async function waitForMotionToSettle(page: Page) {
  await page
    .waitForFunction(
      () =>
        document
          .getAnimations()
          .filter((a) => a.effect?.getTiming().iterations !== Infinity)
          .every((a) => a.playState !== 'running'),
      undefined,
      { timeout: 8_000 },
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
  check(
    await consentRegion.getByRole('checkbox').count() === 0,
    'optional purposes stay behind the disclosure until asked for',
  );
  check(
    await consentRegion.getByRole('button', { name: 'Customise' }).getAttribute('aria-expanded') === 'false',
    'the purposes disclosure starts collapsed and says so',
  );
  const analytics = await openConsentPurposes(consentPage, consentRegion);
  check(
    await consentRegion.getByRole('button', { name: 'Customise' }).getAttribute('aria-expanded') === 'true',
    'customise reveals the purpose controls',
  );
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
  check(await absentEventually(consentPage.getByRole('region', { name: 'Cookie consent' })), 'reject-all remains dismissed after reload');

  // Partial choice is a completed decision and survives public navigation.
  await consentPage.evaluate(() => localStorage.removeItem('revisio.cookie-consent'));
  await consentPage.reload({ waitUntil: 'domcontentloaded' });
  const partialAnalytics = await openConsentPurposes(consentPage);
  await partialAnalytics.check();
  await consentPage.getByRole('button', { name: 'Save choices' }).click();
  await consentPage.goto(new URL('/terms', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await consentPage.goto(new URL('/', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await settle(consentPage);
  check(await absentEventually(consentPage.getByRole('region', { name: 'Cookie consent' })), 'a partial choice stays dismissed across public navigation');
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
  check(await absentEventually(blockedPage.getByRole('region', { name: 'Cookie consent' })), 'storage failure does not trap the visitor');
  await blockedStorageContext.close();

  // Registration is a multi-step wizard. The study step (level and subjects)
  // comes straight after the role, then the account, then "About you" with DOB
  // and guardian consent, and a teacher never sees the study or DOB steps.
  const registerContext = await makeContext(browser);
  const registerPage = await registerContext.newPage();
  await watchPage(registerPage);
  await registerPage.goto(new URL('/register', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await registerPage.getByRole('button', { name: 'Student' }).waitFor();
  check(await absentEventually(registerPage.getByLabel('Learner’s date of birth')), 'the first wizard step collects no date of birth');
  // The banner mounts from the client bundle, so it has to be waited for before
  // it is dismissed — a bare `count()` reads "no banner" on an unhydrated page
  // and the panel then covers the registration controls the checks click.
  const registrationConsent = consentRegionOf(registerPage);
  if (await presentEventually(registrationConsent, 1, 5_000) === 1) {
    await registrationConsent.getByRole('button', { name: 'Reject all' }).click();
    await registrationConsent.waitFor({ state: 'detached' });
  }
  await waitForHydration(registerPage, 'fieldset button');
  // Each step exits with an animation that keeps its Continue/Back buttons in
  // the DOM for a moment, so every advance waits for the outgoing step to detach
  // before the next control is clicked.
  await registerPage.getByRole('button', { name: 'Student' }).click();
  await registerPage.getByRole('button', { name: 'Continue' }).click();
  await registerPage.locator('fieldset').waitFor({ state: 'detached' });
  // Study before account: the level and subjects are asked while motivation is
  // highest, and the email form only after that investment.
  await registerPage.locator('#level-group').waitFor();
  check(await absentEventually(registerPage.locator('#name')), 'the study step is asked before the account step');
  await registerPage.getByRole('button', { name: 'GCSE' }).click();
  check(
    (await registerPage.getByRole('button', { name: 'GCSE' }).getAttribute('aria-pressed')) === 'true',
    'choosing a level records the choice',
  );
  await registerPage.getByRole('button', { name: 'Continue' }).click();
  await registerPage.locator('#level-group').waitFor({ state: 'detached' });
  await registerPage.locator('#name').waitFor();
  await waitForHydration(registerPage, '#name');
  await registerPage.locator('#name').fill('Wizard Probe');
  await registerPage.locator('#email').fill('wizard-probe@revisio.probe');
  await registerPage.locator('#password').fill('correct-horse-battery');
  await registerPage.getByRole('button', { name: 'Continue' }).click();
  await registerPage.locator('#name').waitFor({ state: 'detached' });
  await registerPage.getByLabel('Learner’s date of birth').waitFor();
  await waitForHydration(registerPage, '#dateOfBirth');
  await registerPage.getByLabel('Learner’s date of birth').fill('2015-01-01');
  check(await registerPage.getByLabel('Learner’s date of birth').getAttribute('required') !== null, 'learner registration requires a date of birth');
  check(await presentEventually(registerPage.getByRole('checkbox', { name: /I am the parent or legal guardian/i })) === 1, 'under-13 registration presents guardian attestation');
  // Back to the role step, then choose teacher: the About-you step has no DOB.
  await registerPage.getByRole('button', { name: 'Back' }).click();
  await registerPage.locator('#dateOfBirth').waitFor({ state: 'detached' });
  await registerPage.locator('#name').waitFor();
  await registerPage.getByRole('button', { name: 'Back' }).click();
  await registerPage.locator('#name').waitFor({ state: 'detached' });
  await registerPage.locator('#level-group').waitFor();
  await registerPage.getByRole('button', { name: 'Back' }).click();
  await registerPage.locator('#level-group').waitFor({ state: 'detached' });
  await registerPage.getByRole('button', { name: 'Teacher' }).waitFor();
  await registerPage.getByRole('button', { name: 'Teacher' }).click();
  await registerPage.getByRole('button', { name: 'Continue' }).click();
  await registerPage.locator('fieldset').waitFor({ state: 'detached' });
  await registerPage.locator('#name').waitFor();
  await registerPage.getByRole('button', { name: 'Continue' }).click();
  await registerPage.locator('#name').waitFor({ state: 'detached' });
  await registerPage.locator('#note').waitFor();
  check(await absentEventually(registerPage.getByLabel('Learner’s date of birth')), 'teacher registration does not collect a learner date of birth');
  await registerContext.close();

  // Public, auth, legal and not-found routes: expected status, semantics, runtime.
  const routeContext = await makeContext(browser);
  // A first visit shows the cookie banner as a fixed, full-width sheet over the
  // page, and axe measures contrast through it. Record a decision here so the
  // route scans read the page itself; the banner has its own checks above.
  await routeContext.addInitScript(() => {
    if (!localStorage.getItem('revisio.cookie-consent')) {
      const now = new Date().toISOString();
      localStorage.setItem(
        'revisio.cookie-consent',
        JSON.stringify({ version: 1, decidedAt: now, consent: { version: 1, updatedAt: now, choices: {} } }),
      );
    }
  });
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
    // Policy pages sit outside the app shell: without their own header a reader
    // had no link back to the Service and only the browser Back button.
    if (['/privacy', '/terms', '/cookie-policy', '/accessibility'].includes(route.path)) {
      const homeLink = page.getByRole('link', { name: '← Home' });
      check(await homeLink.isVisible(), `${route.path} shows a Home link`);
      check((await homeLink.getAttribute('href')) === '/', `${route.path} Home link points at the landing page`);
    }
    if (route.path !== '/__public_ux_missing_route__') {
      await scanAxe(page, route.path, 'light');
      await page.evaluate(() => document.documentElement.classList.add('dark'));
      // Colours transition over ~150ms when the theme flips. Axe must sample the
      // settled dark palette, not the in-between colours of the switch.
      await waitForMotionToSettle(page);
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
    // The rest state is new markup (heading, inline privacy link, three
    // controls), so it is scanned on its own rather than inferred from the
    // expanded panel.
    await mobilePage.addScriptTag({ path: axeSource });
    await scanAxe(mobilePage, `consent@${viewport.width}`, 'light');
    // Rest first: measure the compact bar, then the same panel with the
    // purposes open. Growing on demand is the property being bought.
    const restingHeight = (await panel.boundingBox())?.height ?? 0;
    const analytics = await openConsentPurposes(mobilePage, panel);
    await settle(mobilePage);
    const expandedHeight = (await panel.boundingBox())?.height ?? 0;
    check(
      expandedHeight > restingHeight,
      `customise grows the consent panel only when opened (${Math.round(restingHeight)}→${Math.round(expandedHeight)} at ${viewport.width}px)`,
    );
    check(restingHeight <= viewport.height * 0.45, `the consent panel rests under half the screen at ${viewport.width}px`);
    await analytics.focus();
    const focused = await mobilePage.evaluate(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return false;
      const rect = active.getBoundingClientRect();
      const panel = document.querySelector('[aria-label="Cookie consent"]');
      return !!panel && panel.contains(active) && rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight;
    });
    check(focused, `focused consent control remains visible at ${viewport.width}px`);
    await scanAxe(mobilePage, `consent-expanded@${viewport.width}`, 'light');
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

  // Install affordance appears only for a real `beforeinstallprompt`, and
  // disappears once the platform reports the app installed. The synthetic
  // event is passed as source so esbuild's keepNames wrapper cannot leak a
  // `__name` reference into the page.
  await pwaPage.evaluate(`(() => {
    const event = new Event('beforeinstallprompt');
    event.prompt = function () { return Promise.resolve(); };
    event.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
    window.dispatchEvent(event);
    return true;
  })()`);
  const installButton = pwaPage.getByRole('button', { name: 'Install app' });
  await installButton.waitFor({ timeout: 5_000 });
  check(true, 'a beforeinstallprompt event reveals the install action');
  await installButton.click();
  check(await absentEventually(installButton), 'installing dismisses the install action');

  // A waiting worker exposes Later and a truthful review guard; an explicit
  // update activates it and reloads the page exactly once. The probe worker is
  // served at the same scope, which the browser treats as an update and parks
  // in `waiting` while the real worker still controls the page.
  await pwaContext.route('**/sw-probe.js', (route) => route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: "self.addEventListener('install', function () {});\n"
      + "self.addEventListener('activate', function (event) { event.waitUntil(self.clients.claim()); });\n"
      + "self.addEventListener('message', function (event) { if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting(); });\n",
  }));
  await pwaPage.evaluate(`navigator.serviceWorker.register('/sw-probe.js')`);
  const updateButton = pwaPage.getByRole('button', { name: 'Update now' });
  await updateButton.waitFor({ timeout: 15_000 });
  check(true, 'a waiting worker reveals the explicit update action');
  await pwaPage.getByRole('button', { name: 'Later' }).click();
  check(await absentEventually(updateButton), 'Later dismisses the update for this view');

  // The deferral is per view, not permanent: a fresh document offers it again.
  await pwaPage.goto(new URL('/terms', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  const updatedButton = pwaPage.getByRole('button', { name: 'Update now' });
  await updatedButton.waitFor({ timeout: 15_000 });
  // Count reloads from the document side: `framenavigated` can fire more than
  // once for one service-worker-controlled reload, so the truth is how many
  // documents were initialised. A baseline of 1 is set in the current page; a
  // single reload makes it 2.
  await pwaPage.evaluate(`sessionStorage.setItem('revisio-probe-loads', '1')`);
  await pwaPage.addInitScript({
    content: "try { sessionStorage.setItem('revisio-probe-loads', String(Number(sessionStorage.getItem('revisio-probe-loads') || '0') + 1)); } catch (e) {}",
  });
  await Promise.all([
    pwaPage.waitForEvent('framenavigated', { predicate: (frame) => frame === pwaPage.mainFrame(), timeout: 15_000 }),
    updatedButton.click(),
  ]);
  await settle(pwaPage);
  await pwaPage.waitForTimeout(500);
  const documentsLoaded = Number(await pwaPage.evaluate(`Number(sessionStorage.getItem('revisio-probe-loads') || '0')`));
  check(documentsLoaded === 2, `an explicit update reloads the page exactly once (${documentsLoaded - 1} reloads)`);
  const controlledBy = await pwaPage
    .waitForFunction(
      "!!navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL",
      undefined,
      { timeout: 10_000 },
    )
    .then((handle) => handle.jsonValue() as Promise<string>)
    .catch(() => null);
  // The reloaded page re-registers the app's own /sw.js, which may take over
  // from the probe; what matters is that some worker controls the page.
  check(
    typeof controlledBy === 'string' && controlledBy.endsWith('/sw.js'),
    `the page is controlled by an active worker after the update (controller: ${String(controlledBy)})`,
  );
  await pwaContext.close();

  // iOS has no install prompt; Safari users get the Add to Home Screen path.
  const iosContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  iosContext.setDefaultTimeout(30_000);
  await stubApis(iosContext);
  const iosPage = await iosContext.newPage();
  await watchPage(iosPage);
  await iosPage.goto(new URL('/', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await iosPage.getByText(/Add to Home Screen/i).waitFor({ timeout: 10_000 });
  check(true, 'iOS Safari is told how to install instead of being offered a prompt');
  await iosContext.close();

  // A failed worker registration says so and offers Retry; the retry works.
  const retryContext = await makeContext(browser);
  let refuseWorker = true;
  await retryContext.route('**/sw.js', (route) => {
    if (refuseWorker) return route.fulfill({ status: 500, contentType: 'text/javascript', body: 'nope' });
    return route.continue();
  });
  const retryPage = await retryContext.newPage();
  // The injected 500 is itself logged by the browser as a console error; that
  // one line is the fault under test, not an application failure. Everything
  // else in this context is still required to be clean and is reported.
  const retryErrors: string[] = [];
  retryPage.on('pageerror', (error) => retryErrors.push(error.message));
  retryPage.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (/bad HTTP response code \(500\) was received when fetching the script/i.test(message.text())) return;
    retryErrors.push(message.text());
  });
  await retryPage.goto(new URL('/', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  const offlineNotice = retryPage.getByText(/Offline support could not start/i);
  await offlineNotice.waitFor({ timeout: 10_000 });
  check(true, 'a failed worker registration is reported instead of swallowed');
  refuseWorker = false;
  await retryPage.getByRole('button', { name: 'Retry' }).click();
  check(await absentEventually(offlineNotice), 'retrying the worker registration clears the failure notice');
  check(retryErrors.length === 0, `failed-registration probe raised no unexpected errors (${retryErrors.join('; ')})`);
  await retryContext.close();

  check(report.blockedWrites.length === 0, 'public suite made no API write requests');
  check(report.pageErrors.length === 0, `public routes raised no browser errors (${report.pageErrors.length} found)`);
  const blockers = report.axe.flatMap((scan) => scan.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => ({ path: scan.path, theme: scan.theme, violation })));
  const blockerSummary = blockers
    .map((b) => `${b.path} [${b.theme}] ${b.violation.id}: ${b.violation.nodes.slice(0, 3).map((n) => `${n.target.join(' ')} (${n.any.concat(n.all).map((c) => c.message).join('; ') || n.failureSummary})`).join(' | ')}`)
    .join('\n  ');
  check(blockers.length === 0, `axe reports no serious/critical violations (${blockers.length} found)\n  ${blockerSummary}`);

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
