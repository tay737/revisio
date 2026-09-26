#!/usr/bin/env node
/**
 * One version, defined once.
 *
 * `package.json` is the only place the product version is written. This copies
 * it into the native Android module, because a release whose store version
 * disagrees with its tag is a support burden nobody notices until it matters.
 *
 *   node scripts/native/set-version.mjs
 *
 * The iOS client is a Swift package with no bundle yet (see docs/MOBILE.md), so
 * it has no version field to stamp — that arrives with the Xcode app target.
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

const gradle = 'mobile/android/app/build.gradle.kts';

const exists = async (file) =>
  access(path.join(root, file)).then(() => true, () => false);

console.log(`version ${version} (build ${versionCode})`);

if (await exists(gradle)) {
  const file = path.join(root, gradle);
  const before = await readFile(file, 'utf8');
  const after = before
    .replace(/versionCode\s*=\s*\d+/, `versionCode = ${versionCode}`)
    .replace(/versionName\s*=\s*"[^"]*"/, `versionName = "${version}"`);
  if (after !== before) {
    await writeFile(file, after);
    console.log(`  ${gradle} → versionName ${version}, versionCode ${versionCode}`);
  } else {
    console.log(`  ${gradle} already at ${version}`);
  }
} else {
  console.log(`  ${gradle} not found; nothing to stamp`);
}
