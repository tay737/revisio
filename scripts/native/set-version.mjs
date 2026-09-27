#!/usr/bin/env node
/**
 * One version, defined once.
 *
 * `package.json` is the only place the product version is written. This copies
 * it into both native clients, because a release whose store version disagrees
 * with its tag is a support burden nobody notices until it matters.
 *
 *   node scripts/native/set-version.mjs
 *
 * Android reads it from the Gradle module; iOS reads it from the app target's
 * build settings, which `Info.plist` forwards as `CFBundleShortVersionString`
 * and `CFBundleVersion`. Nothing is hard-coded twice.
 */

import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;

/**
 * Both platforms want a monotonic integer, so encode the semver triple into
 * one. A prerelease of the same triple keeps the same code on purpose: alpha.1
 * and alpha.2 are the same product version, and only the semver string changes.
 */
const [major = 0, minor = 0, patch = 0] = String(version)
  .split('-')[0]
  .split('.')
  .map((part) => Number.parseInt(part, 10) || 0);
const versionCode = major * 10000 + minor * 100 + patch;

const exists = async (file) =>
  access(path.join(root, file)).then(() => true, () => false);

/**
 * Rewrite a build setting in place, reporting whether it actually moved.
 *
 * `versionName = "1.0.0-alpha.2"` and `MARKETING_VERSION = 1.0.0-alpha.2;` are
 * different syntaxes for the same fact, so each target gets its own pattern.
 */
const stamp = async (file, label, replacements) => {
  if (!(await exists(file))) {
    console.log(`  ${file} not found; nothing to stamp`);
    return;
  }
  const target = path.join(root, file);
  const before = await readFile(target, 'utf8');
  let after = before;
  for (const [pattern, replacement] of replacements) {
    after = after.replace(pattern, replacement);
  }
  if (after !== before) {
    await writeFile(target, after);
    console.log(`  ${file} → ${label}`);
  } else {
    console.log(`  ${file} already at ${version}`);
  }
};

console.log(`version ${version} (build ${versionCode})`);

await stamp('mobile/android/app/build.gradle.kts', `versionName ${version}, versionCode ${versionCode}`, [
  [/versionCode\s*=\s*\d+/, `versionCode = ${versionCode}`],
  [/versionName\s*=\s*"[^"]*"/, `versionName = "${version}"`],
]);

// The Xcode project carries the version in every build configuration, so each
// occurrence is stamped — Release is the one an archive uses, but a stale Debug
// value is a trap for whoever debugs the next one.
await stamp('mobile/ios/Revisio.xcodeproj/project.pbxproj', `MARKETING_VERSION ${version}, CURRENT_PROJECT_VERSION ${versionCode}`, [
  [/MARKETING_VERSION = [^;]*;/g, `MARKETING_VERSION = ${version};`],
  [/CURRENT_PROJECT_VERSION = [^;]*;/g, `CURRENT_PROJECT_VERSION = ${versionCode};`],
]);
