#!/usr/bin/env node
/**
 * Prove the native Android app works *signed in, online* — the half of the
 * contract the offline smoke test cannot reach.
 *
 *   node scripts/native/android-online-smoke.mjs \
 *     --base http://10.0.2.2:3123 --health http://127.0.0.1:3123 \
 *     --serve "npx next dev -p 3123" \
 *     --email dev@revisio.app --password 'ChangeMeNow!24'
 *
 * `verify:native` turns the network off and proves the app is a real app
 * without a server. That is a strong claim, and it was for a long time the only
 * claim: every destination was checked with no session behind it, so a screen
 * that only ever worked offline could pass the whole suite. The account screens
 * are exactly that screen — they need a token, a refresh and a server that
 * answers — and a failure there looked like "the Settings page is stuck" with
 * nothing in CI to say why.
 *
 * So this drives the same app against a server it can actually sign in to, and
 * it treats a visible error banner as a failure rather than as scenery: the
 * banner is the app's only report of what a route said, and a screen that shows
 * one while claiming to be loading is the bug this test exists for.
 *
 * It is read-mostly. It signs in (which mints a refresh token) and reads every
 * destination; it does not save a profile or flip a switch, so pointing it at a
 * real account cannot change that account's data.
 *
 * Requirements: ANDROID_HOME with platform-tools, an APK built against `--base`
 * (`./gradlew :app:assembleDebug -PrevisioApiBase=…`), and an attached device
 * or an AVD this can boot.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(name);
  return at === -1 ? fallback : argv[at + 1];
};

const root = process.cwd();
const PKG = flag('--package', 'app.revisio');
const BASE = flag('--base', 'http://10.0.2.2:3123');
const HEALTH = flag('--health', 'http://127.0.0.1:3123');
const EMAIL = flag('--email', 'dev@revisio.app');
const PASSWORD = flag('--password', 'ChangeMeNow!24');
const SERVE = flag('--serve', '');
/**
 * How to kill this device's session, for the one case that matters most.
 *
 * A refresh token that the server will not accept is the state every learner
 * lands in eventually — a password changed elsewhere, a token rotated out, a
 * long absence — and it is the state in which an account screen either tells
 * them the truth or lies to them with a loading spinner. The caller knows how
 * to reach its own database, so it passes the command:
 *
 *   --kill-session "psql $URL -c 'delete from refresh_tokens'"
 */
const KILL_SESSION = flag('--kill-session', '');
const SHOTS = path.join(root, 'dist', 'probe');

let failures = 0;
const clip = (value, n = 200) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text && text.length > n ? `${text.slice(0, n)}…` : text;
};
function check(label, condition, detail = '') {
  if (!condition) failures += 1;
  console.log(`${condition ? '  ok  ' : ' FAIL '} ${label}${condition ? '' : ` — ${clip(detail)}`}`);
}
const info = (label) => console.log(`  ..   ${label}`);

// ── tools ───────────────────────────────────────────────────────────────────

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

function run(bin, args, { allowFail = false, input } = {}) {
  // `logcat -d` on a booted emulator is tens of megabytes; without room for it
  // spawnSync aborts the whole run with ENOBUFS at the last check.
  const result = spawnSync(bin, args, { encoding: 'utf8', input, maxBuffer: 1 << 28 });
  if (result.error) throw result.error;
  if (!allowFail && result.status !== 0) {
    throw new Error(`${path.basename(bin)} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout ?? '';
}
const adb = (serial, args, options) => run(ADB, ['-s', serial, ...args], options);

async function waitFor(what, probe, timeoutMs, intervalMs = 1500) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await sleep(intervalMs);
  }
}

// ── the server ──────────────────────────────────────────────────────────────

/**
 * Start the app's server if asked, and wait until it answers.
 *
 * A dev server has to be started in the same process as the run — a shell in
 * this repository cannot leave one behind between commands — so `--serve` is
 * the honest way to make this test self-contained.
 */
async function startServer() {
  if (!SERVE) {
    info(`using the server already at ${HEALTH}`);
    return null;
  }
  info(`starting: ${SERVE}`);
  const child = spawn(SERVE, { shell: true, detached: true, stdio: 'ignore' });
  child.unref();
  return child;
}

async function waitForServer() {
  await waitFor(
    `${HEALTH} to answer`,
    async () => {
      try {
        const res = await fetch(`${HEALTH}/api/v1/auth/refresh`, { method: 'POST' });
        return res.status === 401 || res.ok;
      } catch {
        return false;
      }
    },
    180_000,
    2000,
  );
  info(`server is up at ${HEALTH}`);
}

/** Sign in over HTTP to prove the credentials this run will type are valid. */
async function verifyCredentials() {
  const res = await fetch(`${HEALTH}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.accessToken) {
    throw new Error(`could not sign in as ${EMAIL} at ${HEALTH}: ${res.status} ${clip(body)}`);
  }
  if (body.mfaRequired) throw new Error(`${EMAIL} needs a 2FA code; this app cannot enter one yet.`);
  return body.accessToken;
}

// ── device ──────────────────────────────────────────────────────────────────

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
  if (explicit) return { serial: explicit, booted: false };
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

const waitForBoot = (serial) =>
  waitFor(
    `${serial} to finish booting`,
    async () => adb(serial, ['shell', 'getprop', 'sys.boot_completed']).trim() === '1',
    240_000,
    3000,
  );

/** The device has to be online: this test is about the signed-in path. */
async function setNetwork(serial, online) {
  if (online) {
    adb(serial, ['shell', 'cmd', 'connectivity', 'airplane-mode', 'disable'], { allowFail: true });
    adb(serial, ['shell', 'svc', 'wifi', 'enable'], { allowFail: true });
    adb(serial, ['shell', 'svc', 'data', 'enable'], { allowFail: true });
  } else {
    adb(serial, ['shell', 'cmd', 'connectivity', 'airplane-mode', 'enable'], { allowFail: true });
    adb(serial, ['shell', 'svc', 'wifi', 'disable'], { allowFail: true });
    adb(serial, ['shell', 'svc', 'data', 'disable'], { allowFail: true });
  }
}

// ── reading and driving the screen ──────────────────────────────────────────

function uiXml(serial) {
  adb(serial, ['shell', 'uiautomator', 'dump', '/sdcard/revisio-live.xml'], { allowFail: true });
  return adb(serial, ['shell', 'cat', '/sdcard/revisio-live.xml'], { allowFail: true });
}

const textsOnScreen = (xml) =>
  [...xml.matchAll(/text="([^"]*)"/g)].map((m) => m[1]).filter((t) => t.length > 0);

const hasText = (xml, text) => textsOnScreen(xml).some((t) => t.includes(text));

function findBounds(xml, text) {
  for (const chunk of xml.split('<node')) {
    const label = chunk.match(/text="([^"]*)"/);
    if (!label || label[1] !== text) continue;
    const bounds = chunk.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (!bounds) continue;
    return {
      x: (Number(bounds[1]) + Number(bounds[3])) / 2,
      y: (Number(bounds[2]) + Number(bounds[4])) / 2,
    };
  }
  return null;
}

/** Every node of a given class, in screen order — Compose text fields, mostly. */
function findByClass(xml, cls) {
  const found = [];
  for (const chunk of xml.split('<node')) {
    if (!chunk.includes(`class="${cls}"`)) continue;
    const bounds = chunk.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (!bounds) continue;
    found.push({
      x: (Number(bounds[1]) + Number(bounds[3])) / 2,
      y: (Number(bounds[2]) + Number(bounds[4])) / 2,
      area: (Number(bounds[3]) - Number(bounds[1])) * (Number(bounds[4]) - Number(bounds[2])),
    });
  }
  return found.sort((a, b) => a.y - b.y || a.x - b.x);
}

async function waitForText(serial, text, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  for (;;) {
    last = uiXml(serial);
    if (hasText(last, text)) return last;
    if (Date.now() > deadline) return last;
    await sleep(1200);
  }
}

async function tapText(serial, text, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const at = findBounds(uiXml(serial), text);
    if (at) {
      adb(serial, ['shell', 'input', 'tap', String(Math.round(at.x)), String(Math.round(at.y))], { allowFail: true });
      await sleep(700);
      return true;
    }
    if (Date.now() > deadline) return false;
    await sleep(1000);
  }
}

async function waitForTextAfter(serial, tap, expect, timeoutMs = 25_000) {
  if (!(await tapText(serial, tap, timeoutMs))) return '';
  return waitForText(serial, expect, timeoutMs);
}

async function typeIntoNthField(serial, index, text) {
  const fields = findByClass(uiXml(serial), 'android.widget.EditText');
  const field = fields[index];
  if (!field) return false;
  adb(serial, ['shell', 'input', 'tap', String(Math.round(field.x)), String(Math.round(field.y))], { allowFail: true });
  await sleep(400);
  adb(serial, ['shell', 'input', 'text', text], { allowFail: true });
  await sleep(300);
  return true;
}

function screenshot(serial, name) {
  mkdirSync(SHOTS, { recursive: true });
  const file = path.join(SHOTS, `${name}.png`);
  const shot = spawnSync(ADB, ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 1 << 28, encoding: null });
  if (shot.status === 0 && shot.stdout?.length) writeFileSync(file, shot.stdout);
  return file;
}

function launch(serial) {
  adb(serial, ['shell', 'am', 'force-stop', PKG], { allowFail: true });
  adb(serial, ['shell', 'am', 'start', '-n', `${PKG}/.MainActivity`], { allowFail: true });
}

/**
 * The app's own report of whatever a route said.
 *
 * The banner is the only place a failed call becomes words the learner can see,
 * so a screen that is showing one is a screen that failed — including when it
 * is *also* still claiming to load, which is the exact shape of the bug this
 * test was written after: an error banner above a permanent "Loading…".
 */
function bannerOn(xml) {
  const known = [
    "You're offline",
    'Sign in again',
    'did not work',
    'needs a connection',
    'could not',
    'not go through',
    'Failed',
  ];
  return textsOnScreen(xml).find((t) => known.some((k) => t.toLowerCase().includes(k.toLowerCase())));
}

function appPid(serial) {
  const out = adb(serial, ['shell', 'pidof', PKG], { allowFail: true }).trim();
  return out.split(/\s+/)[0] || '';
}

// ── run ─────────────────────────────────────────────────────────────────────

async function main() {
  const apkPath = path.resolve(root, flag('--apk', 'mobile/android/app/build/outputs/apk/debug/app-debug.apk'));
  if (!existsSync(apkPath)) {
    console.error(`No APK at ${apkPath}. Build one first, against ${BASE}.`);
    process.exit(2);
  }
  console.log(`Testing ${path.basename(apkPath)} against ${BASE}\n`);

  let server = null;
  const { serial, booted, pid } = await ensureDevice();
  try {
    server = await startServer();
    await waitForServer();
    await verifyCredentials();
    check('the credentials this run types are valid', true);

    await waitForBoot(serial);
    adb(serial, ['shell', 'input', 'keyevent', '82'], { allowFail: true }); // wake, in case of a lock screen
    await setNetwork(serial, true);

    adb(serial, ['uninstall', PKG], { allowFail: true });
    const installed = adb(serial, ['install', apkPath], { allowFail: true });
    check('the artefact installs on the device', /Success/.test(installed), installed.trim());

    // ── sign in ─────────────────────────────────────────────────────────────
    launch(serial);
    const auth = await waitForText(serial, 'Sign in', 45_000);
    check('a signed-out app asks for credentials', hasText(auth, 'Sign in'), textsOnScreen(auth).join(' | '));
    await typeIntoNthField(serial, 0, EMAIL);
    await typeIntoNthField(serial, 1, PASSWORD);
    adb(serial, ['shell', 'input', 'keyevent', '111'], { allowFail: true }); // close the keyboard
    await sleep(500);
    check('signing in is possible', await tapText(serial, 'Sign in'));
    screenshot(serial, '01-after-signin');

    const home = await waitForText(serial, 'Due now', 45_000);
    const homeText = textsOnScreen(home).join(' | ');
    check('the signed-in home screen appears', hasText(home, 'Due now') || hasText(home, 'cards ready'), homeText);
    check('the home screen is not showing the offline banner', !/offline/i.test(bannerOn(home) ?? ''), bannerOn(home) ?? '');
    screenshot(serial, '02-today');

    // A token the app never refreshes still looks signed in until it expires,
    // and the account screens are the first thing to fail when it does. So the
    // session is restarted here — force-stop drops the in-memory access token,
    // leaving only the refresh token the device stored — which is the state a
    // learner is in every time they open the app the next morning.
    launch(serial);
    await waitForText(serial, 'Due now', 45_000);
    info('relaunched: the in-memory token is gone, only the stored refresh token remains');

    // ── the account screen, which is where this fails first ─────────────────
    const you = await waitForTextAfter(serial, 'You', 'Account', 30_000);
    const youText = textsOnScreen(you).join(' | ');
    screenshot(serial, '03-you');
    check('the account screen opens', hasText(you, 'Account') || hasText(you, 'You'), clip(youText));
    check(
      'the account screen is not stuck loading',
      !hasText(you, 'Loading your account'),
      clip(youText),
    );
    check(
      'the account screen reports the signed-in learner',
      hasText(you, EMAIL) || hasText(you, 'Badges') || hasText(you, 'Level'),
      clip(youText),
    );
    const youBanner = bannerOn(you);
    check('the account screen shows no error banner', !youBanner, youBanner ?? '');
    check(
      'the account screen offers its settings',
      hasText(you, 'Save profile') || hasText(you, 'Profile'),
      clip(youText),
    );

    // ── the session the server will not renew ───────────────────────────────
    //
    // This is the case the offline suite cannot see and the happy path above
    // cannot reach: the app holds a refresh token, the server rejects it, and
    // the learner is looking at an account screen. It must end somewhere — the
    // sign-in screen, which is the only honest answer — and it must never be a
    // spinner that never resolves.
    if (KILL_SESSION) {
      info(`killing the session: ${KILL_SESSION}`);
      const killed = spawnSync(KILL_SESSION, { shell: true, encoding: 'utf8' });
      check('the session was revoked for this run', killed.status === 0, killed.stderr || killed.stdout);

      launch(serial);
      const after = await waitForText(serial, 'Sign in', 45_000);
      const afterText = textsOnScreen(after).join(' | ');
      screenshot(serial, '07-dead-session');
      check('a session the server rejects is not a loading screen', !hasText(after, 'Loading your account'), clip(afterText));
      check('a session the server rejects asks the learner to sign in again', hasText(after, 'Sign in'), clip(afterText));
      check(
        'the sign-in screen says why they are back here',
        hasText(after, 'session') || hasText(after, 'Sign in again') || hasText(after, 'signed out'),
        clip(afterText),
      );
      check(
        'the session is not left on the device pretending to be valid',
        hasText(after, 'Sign in'),
        clip(afterText),
      );
    }

    // ── the destinations that need the server ───────────────────────────────
    const rank = await waitForTextAfter(serial, 'Rank', 'Rank', 30_000);
    screenshot(serial, '04-rank');
    const rankText = textsOnScreen(rank).join(' | ');
    check('Rank opens while signed in', hasText(rank, 'Rank'), clip(rankText));
    const rankBanner = bannerOn(rank);
    check('Rank shows no error banner', !rankBanner, rankBanner ?? '');

    const learn = await waitForTextAfter(serial, 'Learn', 'Learn', 30_000);
    screenshot(serial, '05-learn');
    const learnBanner = bannerOn(learn);
    check('Learn shows no error banner', !learnBanner, learnBanner ?? '');

    const cram = await waitForTextAfter(serial, 'Cram', 'Cram', 30_000);
    screenshot(serial, '06-cram');
    const cramBanner = bannerOn(cram);
    check('Cram shows no error banner', !cramBanner, cramBanner ?? '');

    // ── nothing threw along the way ─────────────────────────────────────────
    const crash = adb(serial, ['shell', 'logcat', '-d', '-v', 'brief'], { allowFail: true })
      .split('\n')
      .filter((line) => /FATAL EXCEPTION|AndroidRuntime/.test(line) && line.includes(PKG))
      .slice(0, 4)
      .join('\n');
    check('the app did not crash', crash === '', crash);

    const pidNow = appPid(serial);
    check('the app is still running at the end', pidNow !== '', 'no pid for the package');

    info(`screenshots in ${path.relative(root, SHOTS)}`);
  } finally {
    if (server && !flag('--keep')) {
      try {
        process.kill(-server.pid, 'SIGKILL');
      } catch {
        /* already gone */
      }
    }
    if (booted && pid && !flag('--keep')) {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        /* the emulator already exited */
      }
    }
  }

  console.log(failures === 0 ? '\nThe signed-in online path works.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
