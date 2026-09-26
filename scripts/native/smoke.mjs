#!/usr/bin/env node
/**
 * Prove that a built native artefact is a working app.
 *
 *   npm run verify:native                 # the debug APK this repo builds
 *   node scripts/native/smoke.mjs --apk path/to/app.apk
 *   node scripts/native/smoke.mjs --device emulator-5554   # an already-running device
 *
 * `assert-live-url.mjs` reads a file and answers a *config* question: does this
 * build point at a deployment? That question has a static answer, and it caught
 * a release that shipped with no server URL. It cannot answer the *behavioural*
 * question, and the two are different:
 *
 *   does the artefact, once installed, actually open the app and keep working
 *   with no network?
 *
 * This script ignores configuration and drives the real surface: it installs
 * the APK on a device, launches it, and reads what the WebView rendered over the
 * Chrome DevTools Protocol. Then it turns the network off, restarts the app and
 * asks again — because "usable on a train" is a claim about the offline case,
 * and a WebView with no connection has nothing to render unless the service
 * worker wrote it there.
 *
 * It is the native counterpart of `verify:offline`: that one proves the offline
 * *contract* against a running server, this one proves the *artefact* on a
 * device. Both are pre-release gates; neither replaces a store review.
 *
 * Requirements: ANDROID_HOME (or ANDROID_SDK_ROOT) with platform-tools, and
 * either an attached device or an AVD it can boot itself.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(name);
  return at === -1 ? fallback : argv[at + 1];
};

const API_PORT = 9333; // unusual on purpose: 9222 collides with a real Chrome
const root = process.cwd();

let failures = 0;
const clip = (value, n = 160) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text && text.length > n ? `${text.slice(0, n)}…` : text;
};
function check(label, condition, detail = '') {
  if (!condition) failures += 1;
  console.log(`${condition ? '  ok  ' : ' FAIL '} ${label}${condition ? '' : ` — ${clip(detail)}`}`);
}
function info(label) {
  console.log(`  ..   ${label}`);
}

// ── tools ─────────────────────────────────────────────────────────────────────

const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!sdk) {
  console.error('ANDROID_HOME is not set; point it at an Android SDK to run this.');
  process.exit(2);
}
const ADB = path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
const EMULATOR = path.join(sdk, 'emulator', process.platform === 'win32' ? 'emulator.exe' : 'emulator');
if (!existsSync(ADB)) {
  console.error(`No adb at ${ADB}. Is the SDK complete?`);
  process.exit(2);
}

function run(bin, args, { allowFail = false } = {}) {
  const result = spawnSync(bin, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (!allowFail && result.status !== 0) {
    throw new Error(`${path.basename(bin)} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout ?? '';
}

const adb = (serial, args, options) => run(ADB, ['-s', serial, ...args], options);

// ── waiting ───────────────────────────────────────────────────────────────────

async function waitFor(what, probe, timeoutMs, intervalMs = 1500) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await sleep(intervalMs);
  }
}

// ── device ────────────────────────────────────────────────────────────────────

function attachedDevices() {
  return run(ADB, ['devices'])
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([, state]) => state === 'device')
    .map(([id]) => id);
}

async function ensureDevice() {
  const explicit = flag('--device');
  if (explicit) {
    info(`using the requested device ${explicit}`);
    return { serial: explicit, booted: false };
  }
  const existing = attachedDevices()[0];
  if (existing) {
    info(`using the attached device ${existing}`);
    return { serial: existing, booted: false };
  }

  const avd = flag('--avd', process.env.REVISIO_AVD || 'revisio_test');
  info(`no device attached; booting ${avd} headless`);
  const child = spawn(
    EMULATOR,
    ['-avd', avd, '-no-window', '-no-audio', '-no-boot-anim', '-no-snapshot', '-gpu', 'swiftshader_indirect'],
    { detached: true, stdio: 'ignore' },
  );
  child.unref();
  const serial = await waitFor('a device to attach', () => attachedDevices()[0] || null, 180_000);
  return { serial, booted: true, pid: child.pid };
}

async function waitForBoot(serial) {
  await waitFor(
    `${serial} to finish booting`,
    async () => adb(serial, ['shell', 'getprop', 'sys.boot_completed']).trim() === '1',
    240_000,
    3000,
  );
}

async function defaultNetwork(serial) {
  const out = adb(serial, ['shell', 'dumpsys', 'connectivity'], { allowFail: true });
  const line = out.split('\n').find((l) => /Active default network/.test(l)) ?? '';
  return /none/i.test(line) ? null : line.trim();
}

async function setNetwork(serial, online) {
  if (online) {
    adb(serial, ['shell', 'cmd', 'connectivity', 'airplane-mode', 'disable'], { allowFail: true });
    adb(serial, ['shell', 'settings', 'put', 'global', 'airplane_mode_on', '0'], { allowFail: true });
    adb(serial, ['shell', 'svc', 'wifi', 'enable'], { allowFail: true });
    adb(serial, ['shell', 'svc', 'data', 'enable'], { allowFail: true });
    await waitFor('the network to come up', () => defaultNetwork(serial), 90_000, 3000);
  } else {
    adb(serial, ['shell', 'cmd', 'connectivity', 'airplane-mode', 'enable'], { allowFail: true });
    adb(serial, ['shell', 'svc', 'wifi', 'disable'], { allowFail: true });
    adb(serial, ['shell', 'svc', 'data', 'disable'], { allowFail: true });
    await waitFor('the network to go down', async () => !(await defaultNetwork(serial)), 60_000, 2000);
  }
}

// ── reading the WebView ───────────────────────────────────────────────────────

/**
 * Every inspectable page the device is exposing. There can be more than one
 * WebView socket after a few installs, so each is asked in turn rather than
 * assuming the first is the app.
 */
async function devtoolsPages(serial) {
  const sockets = [
    ...new Set(
      adb(serial, ['shell', 'cat', '/proc/net/unix'], { allowFail: true })
        .split('\n')
        .map((line) => line.match(/webview_devtools_remote[_0-9]*/)?.[0])
        .filter(Boolean),
    ),
  ];
  const pages = [];
  for (const socket of sockets) {
    adb(serial, ['forward', `tcp:${API_PORT}`, `localabstract:${socket}`], { allowFail: true });
    const list = await fetch(`http://127.0.0.1:${API_PORT}/json`)
      .then((res) => res.json())
      .catch(() => null);
    if (Array.isArray(list)) pages.push(...list);
  }
  return pages;
}

/** What the app shows, or null while no page has landed on the deployment yet. */
async function readState(serial, expectedOrigin, expression = PROBE) {
  const page = (await devtoolsPages(serial)).find(
    (candidate) =>
      candidate.type === 'page' &&
      typeof candidate.url === 'string' &&
      (!expectedOrigin || candidate.url.startsWith(expectedOrigin)),
  );
  if (!page) return null;
  return evaluate(page.webSocketDebuggerUrl, expression).catch(() => null);
}

/** Evaluate an expression in the page and return its value. */
function evaluate(wsUrl, expression) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      try {
        socket.close();
      } catch {
        /* already closing */
      }
      reject(new Error('the DevTools evaluation timed out'));
    }, 15_000);
    socket.addEventListener('open', () =>
      socket.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: { expression, returnByValue: true, awaitPromise: true },
        }),
      ),
    );
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        /* already closing */
      }
      if (message.error) return reject(new Error(message.error.message));
      if (message.result?.exceptionDetails) return reject(new Error(message.result.exceptionDetails.text));
      resolve(message.result?.result?.value);
    });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('the DevTools socket failed'));
    });
  });
}

/**
 * What the app has on screen, as the renderer sees it. `rendered` is the literal
 * text in the DOM — the ground truth that something was drawn rather than a
 * blank WebView.
 */
const PROBE = `(async () => {
  const registration = navigator.serviceWorker
    ? await navigator.serviceWorker.getRegistration().catch(() => null)
    : null;
  return {
    title: document.title,
    url: location.href,
    rendered: (document.body ? document.body.innerText : '').replace(/\\s+/g, ' ').trim().slice(0, 300),
    controls: document.querySelectorAll('button, a, input, [role=button]').length,
    hasServiceWorker: !!navigator.serviceWorker,
    controlled: !!navigator.serviceWorker && !!navigator.serviceWorker.controller,
    registered: !!registration,
  };
})()`;

/**
 * Whether the app can survive the next launch with no network.
 *
 * This is the gate that makes the offline check mean something. Going offline
 * as soon as the first screen paints tests nothing: the worker has not installed
 * yet, so there is nothing cached and the app fails for a reason that will not
 * happen to a real user who opened it once. Waiting for the shell to be cached
 * first models the actual sequence — opened on wifi, then used on a train — and
 * the wait itself is the check for whether that sequence works.
 */
const READINESS = `(async () => {
  if (!navigator.serviceWorker) return { ready: false, controller: false, shellCached: false };
  const ready = await Promise.race([
    navigator.serviceWorker.ready.then(() => true),
    new Promise((r) => setTimeout(() => r(false), 4000)),
  ]);
  const shellCached = !!(await caches.match('/').catch(() => null));
  return { ready, controller: !!navigator.serviceWorker.controller, shellCached };
})()`;

async function waitForOfflineReady(serial, expectedOrigin, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let last = { ready: false, controller: false, shellCached: false };
  for (;;) {
    const read = await readState(serial, expectedOrigin, READINESS);
    if (read) last = read;
    if (last.ready && last.shellCached) return last;
    if (Date.now() > deadline) return last;
    await sleep(2000);
  }
}

/**
 * The activity to start, asked of the device rather than assumed. `monkey`
 * looks equivalent and silently does nothing here; resolving the launcher
 * component and using `am start` is the one that actually opens the app.
 */
function launcherComponent(serial, pkg) {
  const out = adb(
    serial,
    ['shell', 'cmd', 'package', 'resolve-activity', '--brief', '-c', 'android.intent.category.LAUNCHER', pkg],
    { allowFail: true },
  );
  const line = out.split('\n').map((s) => s.trim()).filter(Boolean).pop() ?? '';
  return /^[A-Za-z0-9_.]+\/[A-Za-z0-9_.$]+$/.test(line) ? line : `${pkg}/.MainActivity`;
}

/**
 * Launch the app and read it once it has actually painted.
 *
 * Waiting for the target alone is not enough: the WebView exposes a page before
 * the deployment navigates into it, so a single read can catch `about:blank`.
 * This polls until the app's own URL has rendered content, then hands back the
 * last thing it saw if it runs out of time — so a genuine failure reports what
 * the screen really showed instead of hiding behind a timeout.
 */
async function launchAndRead(serial, pkg, expectedOrigin, what) {
  adb(serial, ['shell', 'am', 'force-stop', pkg], { allowFail: true });
  adb(serial, ['shell', 'am', 'start', '-n', launcherComponent(serial, pkg)], { allowFail: true });

  const blank = {
    title: '',
    url: 'about:blank',
    rendered: '',
    controls: 0,
    hasServiceWorker: false,
    controlled: false,
    registered: false,
  };
  const deadline = Date.now() + 90_000;
  let last = blank;
  for (;;) {
    const state = await readState(serial, expectedOrigin);
    if (state) {
      last = state;
      if (state.url.startsWith(expectedOrigin) && state.rendered.length > 0) return state;
    }
    if (Date.now() > deadline) {
      info(`gave up waiting for ${what}`);
      return last;
    }
    await sleep(2000);
  }
}

// ── expected identity ─────────────────────────────────────────────────────────

function bakedServerUrl(apkPath) {
  const out = spawnSync('unzip', ['-p', apkPath, 'assets/capacitor.config.json'], { encoding: 'utf8' });
  if (out.status !== 0) return null;
  try {
    return JSON.parse(out.stdout)?.server?.url ?? null;
  } catch {
    return null;
  }
}

// ── run ───────────────────────────────────────────────────────────────────────

async function main() {
  const apkPath = path.resolve(root, flag('--apk', 'android/app/build/outputs/apk/debug/app-debug.apk'));
  if (!existsSync(apkPath)) {
    console.error(`No APK at ${apkPath}. Build one first (npm run native:apk).`);
    process.exit(2);
  }
  const expectedUrl = flag('--url', process.env.NATIVE_APP_URL || bakedServerUrl(apkPath));
  if (!expectedUrl) {
    console.error('The build carries no server URL, so it would boot the "not connected" shell. Nothing to smoke-test.');
    process.exit(1);
  }
  const expectedOrigin = new URL(expectedUrl).origin;
  const pkg = flag('--package', 'app.revisio');
  console.log(`Testing ${path.basename(apkPath)} against ${expectedOrigin}\n`);

  const { serial, booted, pid } = await ensureDevice();
  try {
    await waitForBoot(serial);

    const fresh = /Success/.test(
      adb(serial, ['install', '-r', apkPath], { allowFail: true }) || '',
    );
    // A signature change (a rebuilt debug key) needs the old install gone first.
    if (!fresh) {
      adb(serial, ['uninstall', pkg], { allowFail: true });
      const retry = adb(serial, ['install', apkPath], { allowFail: true });
      check('the artefact installs on the device', /Success/.test(retry), retry.trim());
    } else {
      check('the artefact installs on the device', true);
    }

    // ── 1. online ─────────────────────────────────────────────────────────────
    await setNetwork(serial, true);
    const online = await launchAndRead(serial, pkg, expectedOrigin, 'the app to open online');
    check('online: the app opens on the deployment it was built for', online.url.startsWith(expectedOrigin), online.url);
    check('online: the app painted something', online.rendered.length > 0, online.rendered);
    check('online: the page has interactive controls', online.controls > 0, online.controls);
    info(`online: "${online.title}" — ${clip(online.rendered, 120)}`);

    // Model a real first visit before pulling the plug: open it on wifi, let it
    // cache, then use it as if on a train.
    const warm = await waitForOfflineReady(serial, expectedOrigin);
    check('online: the service worker installed and cached the app shell', warm.ready && warm.shellCached, warm);

    // ── 2. offline ────────────────────────────────────────────────────────────
    // The claim the app exists to make. A WebView with no network has nothing to
    // render unless the worker already wrote the app there, so this is the check
    // that turns "offline support" from a description into a fact.
    await setNetwork(serial, false);
    const offline = await launchAndRead(serial, pkg, expectedOrigin, 'the app to open with no network');
    check('offline: the app still opens with the network off', offline.url.startsWith(expectedOrigin), offline.url);
    check('offline: the app painted something without the deployment', offline.rendered.length > 0, offline.rendered);
    check('offline: the page has interactive controls', offline.controls > 0, offline.controls);
    info(`offline: "${offline.title}" — ${clip(offline.rendered, 120)}`);

    // Restore the device so a reused emulator is not left in airplane mode.
    await setNetwork(serial, true);
  } finally {
    if (booted && pid && !flag('--keep')) {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        /* the emulator already exited */
      }
    }
  }

  console.log(failures === 0 ? '\nThe artefact is a working app.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
