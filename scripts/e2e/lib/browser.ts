/**
 * The browser layer for testing a *deployed* Revisio.
 *
 * Everything before this only ever proved things about code: `tsc`, a build, an
 * API contract. None of it can see what a learner sees, which is why the
 * responsive pass and the merged Rank tab shipped on the strength of a typecheck
 * and were never once clicked. This module exists so that "I looked at it" is
 * something a machine can do.
 *
 * Three decisions worth writing down, because each one was the alternative to a
 * mistake that had already been made once:
 *
 *   1. `playwright-core`, and a browser we *find* rather than one we download.
 *      A full `playwright` install pulls ~150 MB of browser into the repo's
 *      neighbourhood on every fresh clone, for a tool that only runs when
 *      someone is debugging production. So: resolve whatever Chromium is already
 *      on the machine, and if there is none, say exactly how to get one instead
 *      of failing with "executable doesn't exist".
 *   2. Findings are collected *from the page*, not from the checks. A browser
 *      test that only asserts what it expected to find will happily pass on a
 *      page that threw a hydration error behind the assertion. So every uncaught
 *      error, every console error, every 5xx and every failed request is a
 *      finding, and a run with findings fails.
 *   3. Anything on the ignore list is printed, with its reason, and still
 *      counts as a *note* in the summary. A quiet allowlist is a place where
 *      real bugs go to be never looked at again.
 *
 * The allowlist is deliberately tiny. Every entry is a third party's noise, not
 * ours, and each says so.
 */
import { chromium, type Browser, type BrowserContext, type ConsoleMessage, type Page } from 'playwright-core';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/** A third party's noise. Every entry names who it belongs to and why. */
const IGNORED: { match: RegExp; why: string }[] = [
  // Vercel's edge runtime logs a failed beacon for the preview/devtools
  // extensions a browser injects. Not our page, not our bug.
  { match: /favicon|net::ERR_BLOCKED_BY_CLIENT|Download the React DevTools/i, why: 'browser-injected resource or devtools nudge' },
  // Next prefetches routes the learner might visit and abandons the request when
  // they go somewhere else first. An aborted `?_rsc=` prefetch is the framework
  // tidying up, not a broken link.
  { match: /net::ERR_ABORTED/i, why: 'an in-flight prefetch the browser cancelled on navigation' },
  // Chromium logs every non-2xx fetch as a console error. The response listener
  // below already records it — with the method, the URL and the status, which is
  // strictly better information — so counting it twice would make every run
  // fail twice over the same event.
  { match: /Failed to load resource: the server responded with a status of/i, why: 'duplicates the response listener, which names the request' },
];

/**
 * A 401 on the API is the documented refresh-and-retry dance, not a failure.
 *
 * The access token lives in memory, so every full page load re-fetches it from
 * the httpOnly refresh cookie: the first call is expected to come back 401, and
 * the client transparently refreshes and retries. Flagging it would mean every
 * run fails on a sign-in that worked. A 401 on anything *else* is still a
 * finding, and so is every other 4xx — an unhandled 403 or 404 is a bug even
 * though it is not a server error.
 */
function isExpectedAuthRetry(status: number, url: string) {
  return status === 401 && /\/api\/v1\//.test(url);
}

/** The icons a browser asks for unprompted. Their absence is not a page fault. */
function isBrowserIconRequest(url: string) {
  return /\/favicon|\/manifest|\/apple-touch-icon|\.ico(\?|$)/.test(url);
}

export type Finding = {
  kind: 'pageerror' | 'console' | 'requestfailed' | 'http5xx' | 'http4xx';
  where: string;
  detail: string;
};

export type Check = { label: string; ok: boolean; detail: string; ms: number; pageText?: string; skipped?: boolean };

/**
 * Where the Chromium actually is.
 *
 * Order matters: an explicit `E2E_CHROME` wins, then the Playwright cache (the
 * shape changes with every release, so the version directory is globbed rather
 * than pinned), then a system Chrome/Chromium. Chrome-for-Testing's executable is
 * named after the bundle, not after the product, which is why the candidates
 * below list the file each install actually uses.
 */
export function findChromium(): string | null {
  const explicit = process.env.E2E_CHROME;
  if (explicit) {
    if (!existsSync(explicit)) throw new Error(`E2E_CHROME points at ${explicit}, which does not exist.`);
    return explicit;
  }
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  const candidates: string[] = [];
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
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  );
  return candidates.find((path) => existsSync(path)) ?? null;
}

export const NO_BROWSER_HELP = [
  'No Chromium found. Any one of these gives the harness a browser:',
  '',
  '  # already-cached Playwright browser, into a folder inside the project',
  '  PLAYWRIGHT_BROWSERS_PATH=.browsers npx playwright install chromium',
  '',
  '  # or point it at a browser you already have',
  '  E2E_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run e2e:smoke',
  '',
  'Add .browsers/ to .gitignore if you install one into the project.',
].join('\n');

/** One browser page plus everything heard on it. */
export class WatchedPage {
  readonly page: Page;
  /** Where this page has been, for finding reports — "/settings?from=rank". */
  where = '(never navigated)';
  readonly findings: Finding[] = [];
  readonly ignored: string[] = [];

  constructor(page: Page, private readonly suite: Suite) {
    this.page = page;
    page.on('pageerror', (error) => this.record('pageerror', error.message));
    page.on('console', (message: ConsoleMessage) => {
      if (message.type() !== 'error' && message.type() !== 'warning') return;
      this.record('console', `${message.type()}: ${message.text()}`);
    });
    page.on('requestfailed', (request) => {
      const failure = request.failure();
      this.record('requestfailed', `${request.method()} ${request.url()} — ${failure?.errorText ?? 'unknown'}`);
    });
    page.on('response', (response) => {
      const status = response.status();
      if (status < 400) return;
      if (isExpectedAuthRetry(status, response.url())) return;
      if (status === 404 && isBrowserIconRequest(response.url())) return;
      this.record(status >= 500 ? 'http5xx' : 'http4xx', `${status} ${response.request().method()} ${response.url()}`);
    });
  }

  private record(kind: Finding['kind'], detail: string) {
    const noise = IGNORED.find((rule) => rule.match.test(detail));
    if (noise) {
      this.ignored.push(`${kind}: ${detail} (ignored: ${noise.why})`);
      return;
    }
    const finding = { kind, where: this.where, detail };
    this.findings.push(finding);
    this.suite.note(`finding on ${this.where}: ${detail}`);
  }

  /** Navigate and remember where we are, so findings can be attributed. */
  async goto(path: string, waitUntil: 'load' | 'domcontentloaded' = 'domcontentloaded') {
    this.where = path;
    await this.page.goto(new URL(path, this.suite.baseUrl).toString(), { waitUntil });
  }

  /** Everything heard on this page is the suite's business when it is closed. */
  collect() {
    this.suite.addFindings(this.findings);
  }
}

/**
 * One run of one suite.
 *
 * `run()` takes the body so a suite can be written as a plain async function
 * with the suite in scope, and so the report is written from exactly one place
 * however the body exits — including when it throws.
 */
export class Suite {
  readonly checks: Check[] = [];
  readonly findings: Finding[] = [];
  readonly notes: string[] = [];
  readonly artifacts: string;
  private started = Date.now();
  private currentStep = '(start)';

  constructor(
    readonly name: string,
    readonly baseUrl: string,
    readonly headed = process.env.E2E_HEADED === '1',
  ) {
    // One directory per run, named for when it started: a failed run's evidence
    // is only useful if you can tell it apart from the six others on the desk.
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    this.artifacts = join(process.cwd(), 'artifacts', 'e2e', `${stamp}-${name}`);
    mkdirSync(this.artifacts, { recursive: true });
  }

  note(message: string) {
    this.notes.push(message);
  }

  addFindings(findings: Finding[]) {
    this.findings.push(...findings);
  }

  /** Group the next assertions under a name in the output. */
  async step<T>(title: string, body: () => Promise<T>): Promise<T> {
    this.currentStep = title;
    const at = this.checks.length;
    try {
      return await body();
    } finally {
      const taken = this.checks.length - at;
      this.note(`${taken > 0 ? 'ok  ' : 'warn'} ${title}${taken ? ` (${taken})` : ' (no checks)'}`);
      this.currentStep = '(start)';
    }
  }

  /**
   * One assertion, timed.
   *
   * A check never throws: a failed expectation must not abort the run, because
   * the checks *after* it are the ones that say whether this is one bug or
   * three. The step's own body is what may throw, and `step` records that as a
   * failure with a screenshot.
   *
   * `detail` may be a function, so a passing check does not pay for computing
   * the explanation of why it is not failing — which is how a report ends up
   * with four seconds of "reading the page" in every green run.
   */
  async check(
    label: string,
    body: () => boolean | Promise<boolean | { ok: boolean; detail?: string }>,
    detail?: string | (() => string | Promise<string>),
  ): Promise<boolean> {
    const at = Date.now();
    const explain = async () => (typeof detail === 'function' ? await detail() : detail ?? '');
    try {
      const result = await body();
      const ok = typeof result === 'boolean' ? result : result.ok;
      const note = ok ? '' : typeof result === 'boolean' ? await explain() : result.detail ?? (await explain());
      if (!ok) {
        const said = await this.pageText();
        const both = `${note ? `${note} | ` : ''}page said: ${said}`;
        this.checks.push({ label, ok, detail: both, ms: Date.now() - at, pageText: said });
        console.log(` FAIL  ${label} — ${both}`);
      } else {
        this.checks.push({ label, ok, detail: note, ms: Date.now() - at });
        console.log(`  ok   ${label}`);
      }
      return ok;
    } catch (error) {
      const note = error instanceof Error ? error.message : String(error);
      this.checks.push({ label, ok: false, detail: note, ms: Date.now() - at });
      console.log(` FAIL  ${label} — threw: ${note}`);
      await this.screenshot(`${slug(label)}-threw`);
      return false;
    }
  }

  /**
   * Record a check as not run, and say why.
   *
   * This exists because of a specific, dishonest failure mode: a write-then-verify
   * chain where the write fails and the verification *passes* — "the visitor does
   * not see the pronouns" is trivially true when the pronouns were never saved.
   * A skipped check is visibly not a pass, and it never inflates the totals, so a
   * broken run cannot look greener than it is.
   */
  skip(label: string, reason: string) {
    this.checks.push({ label, ok: true, skipped: true, detail: reason, ms: 0 });
    console.log(` skip  ${label} — ${reason}`);
  }

  /**
   * What the page says, right now.
   *
   * A failing check is nearly always diagnosed by reading the page — "the tabs
   * are not there" is not a finding, "the page said 'Sign in'" is. So the text is
   * captured automatically on failure instead of being the next thing someone has
   * to go and write a debug script for.
   */
  async pageText(limit = 600) {
    const page = this.lastPage;
    if (!page) return '(no page)';
    // Only what a person could read. `textContent` would also return React's
    // flight payload — the `self.__next_f.push(...)` scripts — which is the
    // reason an earlier version of this dumped 600 characters of wire format
    // into a report instead of the sentence that would have explained the
    // failure. An empty `innerText` is itself the finding: the page had not
    // painted anything yet.
    try {
      const flat = (await page.page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
      if (!flat) return '(nothing rendered yet — the page was still blank)';
      return flat.length > limit ? `${flat.slice(0, limit)}…` : flat;
    } catch (error) {
      this.note(`pageText failed on ${page.where} — ${error instanceof Error ? error.message.split('\n')[0] : error}`);
      return '(the page could not be read)';
    }
  }

  /** A screenshot for the report, named after what it is evidence of. */
  async screenshot(name: string) {
    const page = this.lastPage;
    if (!page) return;
    try {
      await page.page.screenshot({ path: join(this.artifacts, `${slug(name)}.png`), fullPage: true });
    } catch {
      // A screenshot is evidence, not a requirement: a page that has navigated
      // away mid-capture must not turn a passing check into a failing one.
    }
  }

  private lastPage: WatchedPage | null = null;
  private opened: BrowserContext[] = [];

  /**
   * A second context, closed when the run ends.
   *
   * The signed-out world is the whole reason this harness can check a privacy
   * feature at all, and it needs a cookie jar that was never there — clearing
   * cookies in a shared context is a claim, a separate context is a fact.
   */
  async newContext(): Promise<BrowserContext> {
    if (!this.browser) throw new Error('the suite has no browser yet — call this from inside run()');
    const context = await this.browser.newContext({
      viewport: { width: 1280, height: 900 },
      reducedMotion: 'reduce',
    });
    context.setDefaultTimeout(20_000);
    this.opened.push(context);
    return context;
  }

  private browser: Browser | null = null;

  /** Wrap a fresh context's page so its findings and screenshots are ours. */
  async withPage<T>(context: BrowserContext, title: string, body: (watched: WatchedPage) => Promise<T>): Promise<T> {
    const watched = new WatchedPage(await context.newPage(), this);
    this.lastPage = watched;
    try {
      return await body(watched);
    } catch (error) {
      await this.screenshot(`${slug(title)}-threw`);
      throw error;
    } finally {
      watched.collect();
    }
  }

  private async open(body: (browser: Browser, context: BrowserContext) => Promise<void>) {
    const executablePath = findChromium();
    if (!executablePath) throw new Error(NO_BROWSER_HELP);
    this.note(`browser: ${executablePath}`);
    const browser = await chromium.launch({ executablePath, headless: !this.headed });
    this.browser = browser;
    // A fresh context per run: the refresh cookie is httpOnly, so "signed out"
    // has to mean a cookie jar that was never there, not one that was cleared.
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      // Determinism over realism: nothing in a smoke should wait on a network
      // that is merely slow, and animation-heavy screens are tested at their
      // settled state rather than mid-flight.
      reducedMotion: 'reduce',
    });
    context.setDefaultTimeout(20_000);
    try {
      await body(browser, context);
    } finally {
      for (const extra of this.opened) await extra.close().catch(() => undefined);
      await context.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
      this.browser = null;
    }
  }

  /**
   * Run the suite and write the report.
   *
   * The report is written from here and nowhere else, so a suite that throws
   * half way still leaves behind: which checks passed, what the page said while
   * failing, and every finding with the URL it came from.
   */
  async run(body: (suite: Suite, context: BrowserContext) => Promise<void>): Promise<number> {
    console.log(`\n${this.name} → ${this.baseUrl}`);
    console.log(`artifacts: ${this.artifacts}\n`);
    let crashed: string | null = null;
    try {
      await this.open((browser, context) => body(this, context));
    } catch (error) {
      crashed = error instanceof Error ? (error.stack ?? error.message) : String(error);
      this.note(`the run itself threw: ${error instanceof Error ? error.message : String(error)}`);
    }

    const failed = this.checks.filter((c) => !c.ok);
    const skipped = this.checks.filter((c) => c.skipped);
    const summary = {
      suite: this.name,
      baseUrl: this.baseUrl,
      startedAt: new Date(this.started).toISOString(),
      durationMs: Date.now() - this.started,
      passed: this.checks.length - failed.length - skipped.length,
      skipped: skipped.length,
      failed: failed.length,
      checks: this.checks,
      findings: this.findings,
      notes: this.notes,
      crashed,
    };
    writeFileSync(join(this.artifacts, 'summary.json'), JSON.stringify(summary, null, 2));

    if (this.findings.length) {
      console.log('\nFindings from the page (these fail the run):');
      for (const finding of this.findings) console.log(`  • [${finding.kind}] ${finding.where} — ${finding.detail}`);
    }
    if (crashed) console.log(`\nThe run threw:\n${crashed}`);
    console.log(
      `\n${this.name}: ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped, ${this.findings.length} finding(s) in ${Math.round(summary.durationMs / 1000)}s`,
    );
    if (skipped.length) {
      console.log('\nNot run (the check before them failed, so a pass would have meant nothing):');
      for (const check of skipped) console.log(`  • ${check.label} — ${check.detail}`);
    }
    if (failed.length) {
      console.log('\nFailed checks:');
      for (const check of failed) console.log(`  • ${check.label}${check.detail ? ` — ${check.detail}` : ''}`);
    }
    console.log(`Report: ${join(this.artifacts, 'summary.json')}`);

    // Findings are failures. A page that threw behind a passing assertion is
    // exactly the case a browser test exists to catch.
    return failed.length + this.findings.length + (crashed ? 1 : 0);
  }
}

/**
 * Sign in through the real form, the way a learner does.
 *
 * Written as a helper because the failure mode is worth naming: the app holds its
 * access token in memory, and `AppShell` bounces a session whose `/me` call
 * errored straight back to `/login`. When that happens the harness must say
 * "signed in, was bounced, /me said 500" rather than time out on a URL that never
 * arrived — and because a bounce is often one cold instance rather than a real
 * fault, it is worth exactly one retry before it is called a failure.
 */
export async function signIn(
  page: Page,
  baseUrl: string,
  email: string,
  password: string,
  attempts = 2,
): Promise<{ ok: boolean; why: string }> {
  let why = '';
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await page.goto(new URL('/login', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
    await page.fill('#email', email);
    await page.fill('#password', password);
    await page.getByRole('button', { name: /^Sign in$/ }).click();
    try {
      await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
      return { ok: true, why: '' };
    } catch {
      // Say what the page said, and where it ended up — the two facts that
      // separate "wrong password" from "signed in and bounced".
      const here = page.url().replace(baseUrl, '') || '/';
      const notice = await page
        .locator('body')
        .innerText()
        .then((t) => t.replace(/\s+/g, ' ').trim().slice(0, 200))
        .catch(() => '');
      why = `ended at ${here} after attempt ${attempt}: ${notice}`;
      if (here === '/login' && attempt < attempts) await page.waitForTimeout(2_000);
    }
  }
  return { ok: false, why };
}

/**
 * Wait until the page says something specific.
 *
 * `settleText` is not enough on its own in this app: a companion strip is
 * rendered above every screen, so "the page has 40 characters of text" is true
 * about a progress page whose tabs have not mounted yet. That produced a run
 * that reported four missing tabs on a screen that has four tabs. So the wait is
 * for the *sentence being asserted*, which is what a person actually waits for.
 */
export async function waitForText(
  page: Page,
  pattern: RegExp | string,
  timeout = 15_000,
): Promise<{ matched: boolean; text: string }> {
  const test = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
  const deadline = Date.now() + timeout;
  let text = '';
  while (Date.now() < deadline) {
    try {
      text = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
      if (test.test(text)) return { matched: true, text };
    } catch {
      // A navigation in flight makes the body unreadable for a moment.
    }
    await page.waitForTimeout(100);
  }
  return { matched: false, text };
}

/**
 * The horizontal-overflow check.
 *
 * `document.scrollWidth > clientWidth` is the only honest way to ask "does this
 * layout fit", and it is the check that would have caught the 320px work on the
 * day it shipped. Run it at the narrowest width the product claims to support
 * as well as the width most people use, because a layout that fits at 390 and
 * overflows at 320 is the normal way responsive work goes wrong.
 */
export async function noHorizontalOverflow(page: Page, label: string, width = 390) {
  const original = page.viewportSize();
  await page.setViewportSize({ width, height: 900 });
  // One frame for the resize to settle; without it this measures the old layout.
  await page.waitForTimeout(150);
  const measured = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
    // Which element is the widest, so the report can name a suspect rather than
    // just a number.
    widest: (() => {
      let best = { tag: '', width: 0 };
      for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
        const w = el.getBoundingClientRect().width + el.scrollWidth;
        if (w > best.width) best = { tag: `${el.tagName.toLowerCase()}.${el.className?.toString().split(' ')[0] ?? ''}`, width: w };
      }
      return best;
    })(),
  }));
  await page.setViewportSize(original ?? { width: 1280, height: 900 });
  const overflow = measured.scroll - measured.client;
  return {
    ok: overflow <= 1,
    detail: overflow > 1
      ? `${overflow}px of overflow at ${width}px (widest: ${measured.widest.tag} at ${Math.round(measured.widest.width)}px)`
      : '',
  };
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'check';

/**
 * Wait until the page has actually painted its content.
 *
 * Most screens here render client-side: the server sends a shell and the real
 * text arrives after a fetch. A check that runs on arrival is not testing the
 * screen, it is testing the network's luck — and when it fails, the evidence is
 * a blank page, which says nothing. So: wait for a minimum of readable text,
 * the way a person waits for a page to finish loading, and return what it said.
 */
export async function settleText(page: Page, minChars = 40, timeout = 15_000): Promise<{ text: string; painted: boolean }> {
  const deadline = Date.now() + timeout;
  let text = '';
  while (Date.now() < deadline) {
    try {
      text = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
    } catch {
      text = '';
    }
    if (text.length >= minChars) return { text, painted: true };
    await page.waitForTimeout(100);
  }
  return { text, painted: false };
}