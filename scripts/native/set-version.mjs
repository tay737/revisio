#!/usr/bin/env node
/**
 * One version, defined once.
 *
 * `package.json` is the only place the product version is written. This copies
 * it into the generated native projects, because a release whose store version
 * disagrees with its tag is a support burden nobody notices until it matters.
 *
 *   node scripts/native/set-version.mjs
 *
 * Safe to run before `cap add`: missing platforms are skipped, not an error.
 */

import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;

/**
 * Android needs a monotonic integer, so encode the semver triple into one.
 * A prerelease of the same triple keeps the same code on purpose: alpha.1 and
 * alpha.2 are the same product version, and only the semver string changes.
 */
const [major = 0, minor = 0, patch = 0] = String(version)
  .split('-')[0]
  .split('.')
  .map((part) => Number.parseInt(part, 10) || 0);
const versionCode = major * 10000 + minor * 100 + patch;

async function exists(file) {
  try {
    await access(path.join(root, file));
    return true;
  } catch {
    return false;
  }
}

const changed = [];

// ── Android ──────────────────────────────────────────────────────────────────
const gradle = 'android/app/build.gradle';
if (await exists(gradle)) {
  const file = path.join(root, gradle);
  const before = await readFile(file, 'utf8');
  const after = before
    .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
    .replace(/versionName\s+"[^"]*"/, `versionName "${version}"`);
  if (after !== before) {
    await writeFile(file, after);
    changed.push(`${gradle} → versionName ${version}, versionCode ${versionCode}`);
  }
} else {
  changed.push(`${gradle} skipped (no Android project — run \`cap add android\`)`);
}

// ── iOS ──────────────────────────────────────────────────────────────────────
// Capacitor's template writes both values into Info.plist, so they can be set
// directly with no build-setting indirection to keep in sync.
const plist = 'ios/App/App/Info.plist';
if (await exists(plist)) {
  const file = path.join(root, plist);
  const before = await readFile(file, 'utf8');
  const after = before
    .replace(
      /(<key>CFBundleShortVersionString<\/key>\s*<string>)[^<]*(<\/string>)/,
      `$1${version}$2`,
    )
    .replace(/(<key>CFBundleVersion<\/key>\s*<string>)[^<]*(<\/string>)/, `$1${versionCode}$2`);
  if (after !== before) {
    await writeFile(file, after);
    changed.push(`${plist} → CFBundleShortVersionString ${version}, CFBundleVersion ${versionCode}`);
  }
} else {
  changed.push(`${plist} skipped (no iOS project — run \`cap add ios\`)`);
}

console.log(`version ${version} (build ${versionCode})`);
for (const line of changed) console.log('  ' + line);
