/**
 * Capture golden-master screenshots of the WEB app at phone width (390px).
 *
 * These are the reference targets for the Flutter UI replica lane: when mobile
 * ships a build, we put these beside the Flutter screens and check layout
 * order, components, copy and rhythm match. Read-only — signs in as the
 * e2e-probe student and only navigates.
 *
 * Usage:
 *   node scripts/design/web-goldens.mjs                      # production
 *   BASE_URL=http://127.0.0.1:3100 node scripts/design/web-goldens.mjs
 */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const BASE = process.env.BASE_URL ?? 'https://revisio-srs.vercel.app';
const EMAIL = process.env.E2E_EMAIL ?? 'e2e-probe@revisio.probe';
const PASSWORD = process.env.E2E_PASSWORD ?? 'revisio-e2e-probe';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = join(process.cwd(), 'artifacts', 'design', 'web-goldens', STAMP);
mkdirSync(OUT, { recursive: true });

function findChromium() {
  const candidates = [];
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  if (existsSync(cache)) {
    for (const entry of readdirSync(cache)) {
      if (!entry.startsWith('chromium-')) continue;
      candidates.push(
        join(cache, entry, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
        join(cache, entry, 'chrome-mac', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
        join(cache, entry, 'chrome-linux', 'chrome'),
      );
    }
  }
  candidates.push(
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  );
  return candidates.find((p) => existsSync(p)) ?? null;
}

// Student-facing screens first; staff/authoring routes are appended when the
// probe's role allows (it won't — they 404/redirect for a student).
const ROUTES = [
  ['dashboard', '/dashboard'],
  ['review', '/review'],
  ['learn', '/learn'],
  ['progress', '/progress'],
  ['cram', '/cram'],
  ['exam', '/exam'],
  ['practice', '/practice'],
  ['library', '/library'],
  ['settings', '/settings'],
];

const exe = findChromium();
if (!exe) {
  console.error('no Chromium found');
  process.exit(1);
}

const browser = await chromium.launch({ executablePath: exe, headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

const shot = async (name) => {
  await page.waitForTimeout(700); // let fonts/paint settle
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
  console.log(`shot ${name}  <-  ${page.url().replace(BASE, '')}`);
};

// Sign in through the real form, waiting for React to own it first (a click on
// a server-rendered-only form fires a native GET, not the handler).
let signedIn = false;
for (let attempt = 1; attempt <= 2 && !signedIn; attempt += 1) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#email', { timeout: 20000 });
  await page
    .waitForFunction(
      () => {
        const form = document.querySelector('form');
        return !!form && Object.keys(form).some((k) => k.startsWith('__reactFiber$'));
      },
      undefined,
      { timeout: 20000 },
    )
    .catch(() => undefined);
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.getByRole('button', { name: /^Sign in$/ }).click();
  try {
    await page.waitForURL(/\/dashboard/, { timeout: 25000 });
    signedIn = true;
  } catch {
    const notice = await page.locator('body').innerText().then((t) => t.replace(/\s+/g, ' ').trim().slice(0, 200)).catch(() => '');
    console.log(`login attempt ${attempt} ended at ${page.url().replace(BASE, '')}: ${notice}`);
    await page.waitForTimeout(2000);
  }
}
if (!signedIn) console.log('WARNING: not signed in — shots will be of /login');

for (const [name, route] of ROUTES) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1200);
  await shot(name);
}

// Learn drill-downs: pick the first subject then first topic if present.
await page.goto(`${BASE}/learn`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1000);
const subjectLink = page.locator('a[href^="/learn/"]').first();
if (await subjectLink.count()) {
  await subjectLink.click().catch(() => {});
  await page.waitForTimeout(1200);
  await shot('learn-subject');
  const topicLink = page.locator('a[href*="/learn/"][href*="/"]').nth(1);
  // topic links look like /learn/<subject>/<topic>; grab the last path segment pair
  const topic = page.locator('a[href^="/learn/"]').filter({ has: page.locator('..') }).nth(1);
  const hrefs = await page.locator('a[href^="/learn/"]').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  const topicHref = hrefs.find((h) => (h.match(/\//g) || []).length >= 3);
  if (topicHref) {
    await page.goto(`${BASE}${topicHref}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(1200);
    await shot('learn-topic');
  }
}

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ base: BASE, at: STAMP, routes: ROUTES.map(([n, r]) => ({ name: n, route: r })) }, null, 2));
await browser.close();
console.log(`\nDone — ${OUT}`);
