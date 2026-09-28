#!/usr/bin/env node
/**
 * Prove the native Android app is a working app with no network.
 *
 *   node scripts/native/android-smoke.mjs
 *   node scripts/native/android-smoke.mjs --apk path/to/app.apk --device emulator-5554
 *
 * This replaces the WebView smoke test, because the app it tested is gone. The
 * old test could only ask "did the cached website render", and the honest answer
 * in the offline case was "yes — the landing page", which is exactly the bug it
 * failed to catch. A native app makes a stronger claim possible: it can be asked
 * to *do the thing* with the network off.
 *
 * So this test seeds a signed-in session and a session's worth of cards into the
 * app's private storage (a debug build is debuggable, so `run-as` can reach it),
 * turns the network off, and then drives the real screen: open, read the home
 * screen, start a review, answer three cards, check that the marks are correct
 * and the reviews are queued for the server, then walk every other destination
 * and the loop again. No deployment is contacted at any point — if any of it
 * depended on a server, this would fail.
 *
 * Requirements: ANDROID_HOME (or ANDROID_SDK_ROOT) with platform-tools, and an
 * attached device or an AVD it can boot itself.
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

const root = process.cwd();
const PKG = flag('--package', 'app.revisio');

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
  const result = spawnSync(bin, args, { encoding: 'utf8', input });
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

async function defaultNetwork(serial) {
  const out = adb(serial, ['shell', 'dumpsys', 'connectivity'], { allowFail: true });
  const line = out.split('\n').find((l) => /Active default network/.test(l)) ?? '';
  return /none/i.test(line) ? null : line.trim();
}

async function setNetwork(serial, online) {
  if (online) {
    adb(serial, ['shell', 'cmd', 'connectivity', 'airplane-mode', 'disable'], { allowFail: true });
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

// ── reading and driving the screen ──────────────────────────────────────────

function uiXml(serial) {
  adb(serial, ['shell', 'uiautomator', 'dump', '/sdcard/revisio-ui.xml'], { allowFail: true });
  return adb(serial, ['shell', 'cat', '/sdcard/revisio-ui.xml'], { allowFail: true });
}

const textsOnScreen = (xml) =>
  [...xml.matchAll(/text="([^"]*)"/g)].map((m) => m[1]).filter((t) => t.length > 0);

const hasText = (xml, text) => textsOnScreen(xml).some((t) => t.includes(text));

/**
 * The same question, ignoring case.
 *
 * The design language sets eyebrows in uppercase — which is a typographic
 * decision, not a change of wording — so a check for "offline" should not care
 * which way the screen happens to shout it.
 */
const hasTextIgnoringCase = (xml, text) =>
  textsOnScreen(xml).some((t) => t.toLowerCase().includes(text.toLowerCase()));

/** The centre of the first node whose text equals `text`, or null. */
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

/**
 * Tap a destination in the tab bar, then wait for the screen it opens to prove
 * itself. `tap` has to be exact — the tab label and the screen heading are often
 * the same word — while `expect` is a substring of copy only that screen carries.
 */
async function waitForTextAfter(serial, tap, expect, timeoutMs = 20_000) {
  if (!(await tapText(serial, tap, timeoutMs))) return '';
  return waitForText(serial, expect, timeoutMs);
}

async function tapText(serial, text, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const xml = uiXml(serial);
    const at = findBounds(xml, text);
    if (at) {
      adb(serial, ['shell', 'input', 'tap', String(Math.round(at.x)), String(Math.round(at.y))], { allowFail: true });
      await sleep(700);
      return true;
    }
    if (Date.now() > deadline) return false;
    await sleep(1000);
  }
}

/** The centre of the largest node of a given accessibility class, or null. */
function findLargestByClass(xml, cls) {
  let best = null;
  for (const chunk of xml.split('<node')) {
    if (!chunk.includes(`class="${cls}"`)) continue;
    const bounds = chunk.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (!bounds) continue;
    const area = (Number(bounds[3]) - Number(bounds[1])) * (Number(bounds[4]) - Number(bounds[2]));
    if (!best || area > best.area) {
      best = {
        area,
        x: (Number(bounds[1]) + Number(bounds[3])) / 2,
        y: (Number(bounds[2]) + Number(bounds[4])) / 2,
      };
    }
  }
  return best;
}

function screenSize(serial) {
  const out = adb(serial, ['shell', 'wm', 'size'], { allowFail: true });
  const match = out.match(/(\d+)x(\d+)/);
  return match ? { w: Number(match[1]), h: Number(match[2]) } : { w: 1080, h: 2400 };
}

/**
 * Focus the answer field and type into it.
 *
 * Compose exposes text fields to uiautomator as `android.widget.EditText`, so
 * the field is tapped by class rather than guessed at. If that node is missing,
 * a coordinate in the middle of the card is a harmless fallback.
 */
async function typeIntoField(serial, text) {
  const at = findLargestByClass(uiXml(serial), 'android.widget.EditText');
  const size = screenSize(serial);
  const point = at ?? { x: size.w / 2, y: size.h * 0.42 };
  adb(serial, ['shell', 'input', 'tap', String(Math.round(point.x)), String(Math.round(point.y))], { allowFail: true });
  await sleep(500);
  adb(serial, ['shell', 'input', 'text', text], { allowFail: true });
  await sleep(400);
  // Close the keyboard so the button under the field stays on screen.
  adb(serial, ['shell', 'input', 'keyevent', '111'], { allowFail: true });
  await sleep(500);
}

function launch(serial) {
  adb(serial, ['shell', 'am', 'force-stop', PKG], { allowFail: true });
  adb(serial, ['shell', 'am', 'start', '-n', `${PKG}/.MainActivity`], { allowFail: true });
}

/** Write a file into the app's private storage. Debug builds are debuggable. */
function seedFile(serial, relativePath, contents) {
  adb(serial, ['shell', 'run-as', PKG, 'mkdir', '-p', 'files/revisio'], { allowFail: true });
  const result = spawnSync(ADB, ['-s', serial, 'shell', 'run-as', PKG, 'tee', relativePath], {
    encoding: 'utf8',
    input: contents,
  });
  return result.status === 0;
}

const readSeededFile = (serial, relativePath) =>
  adb(serial, ['shell', 'run-as', PKG, 'cat', relativePath], { allowFail: true }).trim();

// ── the seeded session ──────────────────────────────────────────────────────

const SESSION = JSON.stringify({
  refreshToken: 'smoke-test-refresh-token',
  user: { id: 'smoke', email: 'smoke@example.com', name: 'Smoke Tester', role: 'student', status: 'active' },
});

const PACK = JSON.stringify({
  builtAt: '2026-01-01T00:00:00.000Z',
  cards: [
    {
      id: 'c1',
      kind: 'cloze',
      topicId: 't1',
      topicName: 'Cell biology',
      subjectId: 's1',
      subjectName: 'Biology',
      textWithBlank: 'The energy currency of the cell is ____.',
      prompt: null,
      question: null,
      options: null,
      stage: 'new',
      key: { kind: 'cloze', accepted: [{ id: 'a1', text: 'ATP', isPrimary: true }] },
    },
    {
      id: 'c2',
      kind: 'flashcard',
      topicId: 't1',
      topicName: 'Cell biology',
      subjectId: 's1',
      subjectName: 'Biology',
      textWithBlank: null,
      prompt: 'What does the mitochondrion do?',
      question: null,
      options: null,
      stage: 'new',
      key: {
        kind: 'flashcard',
        accepted: [
          {
            id: 'a2',
            text: 'It produces ATP',
            isPrimary: true,
            keywords: [{ required: true, phrase: 'atp' }],
            minPoints: 1,
          },
        ],
      },
    },
    {
      id: 'c3',
      kind: 'mcq',
      topicId: 't1',
      topicName: 'Cell biology',
      subjectId: 's1',
      subjectName: 'Biology',
      textWithBlank: null,
      prompt: null,
      question: 'Which organelle produces most of the cell\u2019s ATP?',
      options: [
        { id: 'o1', text: 'Nucleus' },
        { id: 'o2', text: 'Mitochondrion' },
      ],
      stage: 'new',
      key: { kind: 'mcq', correctOptionId: 'o2' },
    },
  ],
});

// ── run ─────────────────────────────────────────────────────────────────────

async function main() {
  const apkPath = path.resolve(root, flag('--apk', 'mobile/android/app/build/outputs/apk/debug/app-debug.apk'));
  if (!existsSync(apkPath)) {
    console.error(`No APK at ${apkPath}. Build one first (npm run native:android:apk).`);
    process.exit(2);
  }
  console.log(`Testing ${path.basename(apkPath)} with no network\n`);

  const { serial, booted, pid } = await ensureDevice();
  try {
    await waitForBoot(serial);

    adb(serial, ['uninstall', PKG], { allowFail: true });
    const installed = adb(serial, ['install', apkPath], { allowFail: true });
    check('the artefact installs on the device', /Success/.test(installed), installed.trim());

    // Seed a signed-in session and today's cards, then make sure there is no
    // network. Everything after this point must work from device storage alone.
    seedFile(serial, 'files/revisio/revisio.session.v1', SESSION);
    seedFile(serial, 'files/revisio/revisio.offline.pack.v1', PACK);
    await setNetwork(serial, false);
    info('network is off; the app must work from device storage alone');

    // ── 1. it opens to its own UI, offline ───────────────────────────────────
    launch(serial);
    const home = await waitForText(serial, 'cards ready', 40_000);
    check('offline: opens to the app\u2019s own home screen', hasText(home, 'cards ready'), textsOnScreen(home).join(' | '));
    check(
      'offline: the saved session counts its cards',
      hasText(home, 'cards ready') && hasText(home, 'DUE NOW') && hasText(home, '3'),
      textsOnScreen(home).join(' | '),
    );
    check(
      'offline: it says it is offline rather than pretending',
      hasTextIgnoringCase(home, 'offline'),
      textsOnScreen(home).join(' | '),
    );
    check('offline: the learner is greeted by name (session survived)', hasText(home, 'Smoke Tester'), textsOnScreen(home).join(' | '));
    info(`seen: ${clip(textsOnScreen(home).join(' | '), 180)}`);

    // ── 2. a review runs to completion, offline ──────────────────────────────
    check('offline: a review can be started', await tapText(serial, 'Start review'));

    // Card 1 — cloze. Graded by the native port of the canonical engine.
    await waitForText(serial, 'energy currency', 20_000);
    await typeIntoField(serial, 'ATP');
    check('offline: the cloze card is answered and marked', await tapText(serial, 'Check'));
    const cloze = await waitForText(serial, 'Correct', 15_000);
    check('offline: the cloze answer is marked correct', hasText(cloze, 'Correct'), textsOnScreen(cloze).join(' | '));
    check(
      'offline: the mark is flagged as waiting for the server',
      hasText(cloze, 'Saved on this device'),
      textsOnScreen(cloze).join(' | '),
    );
    check('offline: moving on works', await tapText(serial, 'Next card'));

    // Card 2 — flashcard, keyword grading.
    await waitForText(serial, 'mitochondrion do', 20_000);
    await typeIntoField(serial, 'atp');
    check('offline: the flashcard is answered and marked', await tapText(serial, 'Check'));
    const flash = await waitForText(serial, 'Correct', 15_000);
    check('offline: the flashcard answer is marked correct', hasText(flash, 'Correct'), textsOnScreen(flash).join(' | '));
    check('offline: moving on works again', await tapText(serial, 'Next card'));

    // Card 3 — multiple choice.
    await waitForText(serial, 'Which organelle', 20_000);
    check('offline: an option can be chosen', await tapText(serial, 'Mitochondrion'));
    check('offline: the choice is marked', await tapText(serial, 'Check'));
    const mcq = await waitForText(serial, 'Correct', 15_000);
    check('offline: the chosen option is marked correct', hasText(mcq, 'Correct'), textsOnScreen(mcq).join(' | '));
    check('offline: the session can be finished', await tapText(serial, 'Finish'));

    const summary = await waitForText(serial, 'Session complete', 15_000);
    check('offline: the session reports a summary', hasText(summary, 'Session complete'), textsOnScreen(summary).join(' | '));
    check('offline: all three were scored correct', hasText(summary, '3 of 3 correct'), textsOnScreen(summary).join(' | '));
    info(`summary: ${clip(textsOnScreen(summary).join(' | '), 180)}`);

    // ── 3. the reviews are owed to the server, not lost ──────────────────────
    const outbox = readSeededFile(serial, 'files/revisio/revisio.offline.outbox.v1');
    let queued = [];
    try {
      queued = JSON.parse(outbox);
    } catch {
      /* reported below */
    }
    check('offline: all three reviews are queued for the server', Array.isArray(queued) && queued.length === 3, outbox);
    check(
      'offline: the queue carries the answers, ready to be re-graded',
      queued.map((r) => r.cardId).join(',') === 'c1,c2,c3',
      outbox,
    );

    // ── 4. the rest of the app is compiled in, not fetched ───────────────────
    // Every destination is a screen in this binary rather than a page behind a
    // URL, so losing the network cannot blank them. Each one has to say what it
    // is missing instead of failing, and the ones that are pure reading or pure
    // drilling have to keep working.
    check('offline: the summary closes back to the app', await tapText(serial, 'Done'));

    const learn = await waitForTextAfter(serial, 'Learn', 'Notes for every topic', 20_000);
    check(
      'offline: Learn opens to its own notes screen',
      hasText(learn, 'Notes for every topic'),
      textsOnScreen(learn).join(' | '),
    );

    const cram = await waitForTextAfter(serial, 'Cram', 'Practice without touching the schedule', 20_000);
    check(
      'offline: Cram opens to its own session builder',
      hasText(cram, 'Practice without touching the schedule'),
      textsOnScreen(cram).join(' | '),
    );

    const rank = await waitForTextAfter(serial, 'Rank', 'rank needs a connection', 20_000);
    check(
      'offline: Rank explains what it cannot compute yet',
      hasText(rank, 'rank needs a connection'),
      textsOnScreen(rank).join(' | '),
    );

    const you = await waitForTextAfter(serial, 'You', 'account details need a connection', 20_000);
    check(
      'offline: You explains what it cannot show yet',
      hasText(you, 'account details need a connection'),
      textsOnScreen(you).join(' | '),
    );
    info(`account: ${clip(textsOnScreen(you).join(' | '), 180)}`);

    // Back to the loop, which must still be the loop.
    const back = await waitForTextAfter(serial, 'Today', 'cards ready', 20_000);
    check(
      'offline: Today still offers the offline session after the tour',
      hasText(back, 'cards ready') && hasTextIgnoringCase(back, 'offline'),
      textsOnScreen(back).join(' | '),
    );

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

  console.log(failures === 0 ? '\nThe app works with no network.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
