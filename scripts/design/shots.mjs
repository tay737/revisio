/**
 * Design capture harness — what the page actually looks like and how it moves.
 *
 * Not a test suite. It answers the questions a designer asks of a browser:
 * what is the first screen, how big is the type, which button is primary, how
 * many things are animating, where does the layout overflow, and what does the
 * page look like at 390px and in the dark?
 *
 * It reuses the same "find a Chromium, do not download one" policy as
 * scripts/e2e/lib/browser.ts, but is deliberately dependency-free (plain .mjs)
 * so it can run without tsx.
 *
 * Usage:
 *   node scripts/design/shots.mjs                      # against :3100
 *   BASE_URL=http://127.0.0.1:3115 node scripts/design/shots.mjs
 */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3100';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = join(process.cwd(), 'artifacts', 'design', STAMP);
mkdirSync(OUT, { recursive: true });

function findChromium() {
  if (process.env.E2E_CHROME && existsSync(process.env.E2E_CHROME)) return process.env.E2E_CHROME;
  const candidates = [];
  // The project-local install first: it is the one this repo controls.
  const local = join(process.cwd(), '.browsers');
  if (existsSync(local)) {
    for (const entry of readdirSync(local)) {
      if (!entry.startsWith('chromium-')) continue;
      candidates.push(
        join(local, entry, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
        join(local, entry, 'chrome-mac', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
        join(local, entry, 'chrome-linux', 'chrome'),
      );
    }
  }
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

/** Read everything a design review needs, in one evaluate. */
const MEASURE = () => {
  const px = (v) => Math.round(parseFloat(v) * 10) / 10;
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(),
      text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      bg: cs.backgroundColor,
      color: cs.color,
      radius: cs.borderRadius,
      fontSize: px(cs.fontSize),
      fontWeight: cs.fontWeight,
      pad: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
    };
  };
  const h1 = document.querySelector('h1');
  const h2 = document.querySelector('h2');
  const buttons = Array.from(document.querySelectorAll('a, button')).filter((el) => {
    const cs = getComputedStyle(el);
    return cs.borderRadius === '999px' || /btn|button/i.test(el.className?.toString() ?? '');
  });
  const primary = buttons.find((el) => /btn-primary|bg-primary/.test(el.className?.toString() ?? ''));
  const cards = Array.from(document.querySelectorAll('[data-slot="card"], .card, .card-solid, .card-soft'));
  const fixed = Array.from(document.querySelectorAll('body *')).filter(
    (el) => getComputedStyle(el).position === 'fixed',
  );
  const running = document.getAnimations().filter((a) => a.playState === 'running');
  const animationNames = running.map((a) => {
    if (typeof a.animationName === 'string' && a.animationName) return `css:${a.animationName}`;
    if (typeof a.transitionProperty === 'string' && a.transitionProperty) return `transition:${a.transitionProperty}`;
    return `js:${a.constructor?.name ?? 'Animation'}`;
  });
  const widest = (() => {
    let best = { tag: '', width: 0 };
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect();
      if (r.width > best.width) {
        best = {
          tag: `${el.tagName.toLowerCase()}.${String(el.className ?? '').split(' ')[0]}`,
          width: Math.round(r.width + el.scrollLeft),
        };
      }
    }
    return best;
  })();
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const firstSection = document.querySelector('main > section');
  const nextSection = firstSection?.nextElementSibling ?? null;
  const fold = firstSection
    ? {
        heroHeight: Math.round(firstSection.getBoundingClientRect().height),
        heroFill: Math.round((firstSection.getBoundingClientRect().height / window.innerHeight) * 100) / 100,
        nextTop: nextSection ? Math.round(nextSection.getBoundingClientRect().top) : null,
      }
    : null;

  return {
    title: document.title,
    h1: h1 ? { ...box(h1), fontSize: px(getComputedStyle(h1).fontSize) } : null,
    h2: h2 ? box(h2) : null,
    h1Count: document.querySelectorAll('h1').length,
    primaryButton: primary ? box(primary) : null,
    buttonCount: buttons.length,
    buttonStyles: Array.from(
      new Set(buttons.map((el) => `${getComputedStyle(el).borderRadius}|${getComputedStyle(el).backgroundColor}|${getComputedStyle(el).boxShadow !== 'none' ? 'shadow' : 'flat'}`)),
    ),
    cards: {
      count: cards.length,
      radii: Array.from(new Set(cards.map((el) => getComputedStyle(el).borderRadius))),
    },
    body: {
      bg: getComputedStyle(document.body).backgroundColor,
      color: getComputedStyle(document.body).color,
      font: getComputedStyle(document.body).fontFamily,
      height: Math.round(document.documentElement.scrollHeight),
      viewport: window.innerHeight,
    },
    fonts: document.fonts.status,
    fixedCount: fixed.length,
    runningAnimations: running.length,
    animationNames: Array.from(new Set(animationNames)).slice(0, 12),
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    widest,
    fold,
    tokens: {
      background: cssVar('--background'),
      foreground: cssVar('--foreground'),
      radius: cssVar('--radius'),
      band: cssVar('--band'),
    },
    text: (document.body.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 400),
  };
};

const ROUTES = [
  { path: '/', label: 'landing' },
  { path: '/login', label: 'login' },
  { path: '/register', label: 'register' },
  { path: '/verify-email', label: 'verify-email' },
  { path: '/forgot-password', label: 'forgot-password' },
];

const VIEWPORTS = [
  { w: 1440, h: 900, label: '1440' },
  { w: 390, h: 844, label: '390' },
];

const report = { base: BASE, startedAt: new Date().toISOString(), shots: [], metrics: {}, errors: [] };

const executablePath = findChromium();
if (!executablePath) {
  console.error('No Chromium found. Run: PLAYWRIGHT_BROWSERS_PATH=.browsers npx playwright install chromium');
  process.exit(2);
}
console.log(`chromium: ${executablePath}`);
console.log(`out: ${OUT}`);

const browser = await chromium.launch({ executablePath, headless: true });

async function shoot({ path, label, viewport, theme, reduced, fullPage = false, at = 0 }) {
  const context = await browser.newContext({
    viewport: { width: viewport.w, height: viewport.h },
    colorScheme: theme,
    reducedMotion: reduced ? 'reduce' : 'no-preference',
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });

  await page.goto(new URL(path, BASE).toString(), { waitUntil: 'load' });
  await page.waitForSelector('h1', { timeout: 15_000 }).catch(() => undefined);
  if (at) await page.waitForTimeout(at);
  else await page.waitForTimeout(700);

  // A first-visit consent bar is part of the real first screen, but it hides the
  // fold; capture it once, then get out of the way.
  // The consent bar is part of a real first visit, but it covers the fold and
  // the login footer. Capture it once as evidence, then dismiss it for the
  // shots that are meant to show the page.
  const consent = page.locator('[aria-label="Cookie consent"]');
  const hasConsent = (await consent.count()) > 0;

  const name = `${label}-${viewport.label}-${theme}${reduced ? '-reduced' : ''}${at ? `-t${at}` : ''}`;
  if (hasConsent) {
    await page.screenshot({ path: join(OUT, `${name}-firstvisit.png`), fullPage: false });
    const reject = page.getByRole('button', { name: /reject all/i });
    if (await reject.count()) {
      await reject.click();
      await page.waitForTimeout(300);
    }
  }
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false });
  if (fullPage) await page.screenshot({ path: join(OUT, `${name}-full.png`), fullPage: true });

  const metrics = await page.evaluate(MEASURE);
  report.shots.push({ name, path, viewport: `${viewport.w}x${viewport.h}`, theme, reduced: !!reduced, at });
  report.metrics[name] = { ...metrics, hasConsent, errors };
  report.errors.push(...errors.map((e) => `${name}: ${e}`));

  console.log(
    `${name.padEnd(34)} h1=${String(metrics.h1?.fontSize ?? '-').padStart(5)}px ` +
      `h1s=${metrics.h1Count} anims=${String(metrics.runningAnimations).padStart(2)} ` +
      `overflow=${metrics.overflowX} cards=${metrics.cards.count} fixed=${metrics.fixedCount} ` +
      `fold=${metrics.fold ? `${metrics.fold.heroFill}/${metrics.fold.nextTop}` : '-'} ` +
      `body=${metrics.body.height}px${errors.length ? ` ERRORS=${errors.length}` : ''}`,
  );

  await context.close();
  return { hasConsent, page: null };
}

for (const route of ROUTES) {
  for (const viewport of VIEWPORTS) {
    for (const theme of ['light', 'dark']) {
      await shoot({ path: route.path, label: route.label, viewport, theme, fullPage: route.path === '/' });
    }
  }
}

// Tablet, where splits stack and a fold can slice a card.
await shoot({ path: '/', label: 'landing', viewport: { w: 768, h: 1024, label: '768' }, theme: 'light', fullPage: false });
await shoot({ path: '/', label: 'landing', viewport: { w: 1280, h: 800, label: '1280' }, theme: 'light', fullPage: false });

// The entrance: two frames so the motion can be judged, not just the end state.
await shoot({ path: '/', label: 'landing', viewport: { w: 1440, h: 900, label: '1440' }, theme: 'light', at: 120 });
await shoot({ path: '/', label: 'landing', viewport: { w: 1440, h: 900, label: '1440' }, theme: 'light', at: 450 });

// Reduced motion must show the finished page, with nothing moving.
await shoot({ path: '/', label: 'landing', viewport: { w: 1440, h: 900, label: '1440' }, theme: 'light', reduced: true, fullPage: true });
await shoot({ path: '/login', label: 'login', viewport: { w: 1440, h: 900, label: '1440' }, theme: 'light', reduced: true });

writeFileSync(join(OUT, 'metrics.json'), JSON.stringify(report, null, 2));
await browser.close();

const overflowing = Object.entries(report.metrics).filter(([, m]) => m.overflowX > 1);
const erroring = Object.entries(report.metrics).filter(([, m]) => m.errors.length);
console.log(`\n${report.shots.length} shots · ${overflowing.length} overflow · ${erroring.length} with console/page errors`);
if (overflowing.length) console.log('overflow:', overflowing.map(([n, m]) => `${n} (${m.overflowX}px, widest ${m.widest.tag} ${m.widest.width})`).join(', '));
if (erroring.length) for (const [n, m] of erroring) console.log(`${n}: ${m.errors.join(' | ')}`);
console.log(`metrics: ${join(OUT, 'metrics.json')}`);
