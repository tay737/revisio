#!/usr/bin/env node
/**
 * Every Swift file in `Sources/Revisio` must be in the Xcode target.
 *
 * The iOS app is built twice, by two different systems, and they do not agree
 * about what a source file is:
 *
 *   • SwiftPM globs `Sources/Revisio`, so `swift build` and `swift test` pick a
 *     new screen up the moment it is written;
 *   • `Revisio.xcodeproj` lists its files explicitly, so the app *archive* does
 *     not — and a screen the shell routes to but the target does not compile is
 *     a link error in a build nobody runs locally.
 *
 * That is not hypothetical: five views written by one session were left out of
 * the project file, and the release failed with `xcodebuild` exit 65 while every
 * local check was green. So the project file is verified here, where a mistake
 * costs a second instead of a release.
 *
 * Run: node scripts/native/check-ios-target.mjs   (also run by `verify:native:ios`)
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sources = path.join(root, 'mobile', 'ios', 'Sources', 'Revisio');
const project = path.join(root, 'mobile', 'ios', 'Revisio.xcodeproj', 'project.pbxproj');

const pbxproj = readFileSync(project, 'utf8');

const phase = pbxproj
  .split('/* Begin PBXSourcesBuildPhase section */')[1]
  ?.split('/* End PBXSourcesBuildPhase section */')[0];
if (!phase) {
  console.error('check-ios-target: no PBXSourcesBuildPhase in project.pbxproj');
  process.exit(1);
}

const compiled = new Set([...phase.matchAll(/\* ([A-Za-z0-9_.]+\.swift) in Sources \*\/,/g)].map((m) => m[1]));
const referenced = new Set(
  [...pbxproj.matchAll(/\* ([A-Za-z0-9_.]+\.swift) \*\/ = \{isa = PBXFileReference/g)].map((m) => m[1]),
);
const onDisk = readdirSync(sources).filter((name) => name.endsWith('.swift'));

const missing = onDisk.filter((name) => !compiled.has(name));
const dangling = [...compiled].filter((name) => !onDisk.includes(name));
const unreferenced = onDisk.filter((name) => compiled.has(name) && !referenced.has(name));

if (missing.length || dangling.length || unreferenced.length) {
  if (missing.length) console.error(`not compiled by the app target: ${missing.join(', ')}`);
  if (dangling.length) console.error(`compiled but not on disk: ${dangling.join(', ')}`);
  if (unreferenced.length) console.error(`no PBXFileReference: ${unreferenced.join(', ')}`);
  console.error('\nAdd them to mobile/ios/Revisio.xcodeproj/project.pbxproj (build file,');
  console.error('file reference, group, and the Sources phase) or the iOS release will fail.');
  process.exit(1);
}

console.log(`ios target: ${onDisk.length} sources, all listed in the app target`);
