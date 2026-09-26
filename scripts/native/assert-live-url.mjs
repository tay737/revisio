#!/usr/bin/env node
/**
 * Refuse to ship an app that is not connected to a server.
 *
 * A Capacitor build with no `server.url` still compiles, still installs and
 * still launches — it just shows the bundled "not connected" shell. That is the
 * right behaviour for a developer exploring the repo and the wrong behaviour for
 * a release, and the two are indistinguishable from the outside.
 *
 * This is the check that makes them distinguishable. It exists because a
 * workflow-level default was silently overridden by a step-level `env`, and the
 * resulting release looked completely healthy in CI.
 *
 *   node scripts/native/assert-live-url.mjs android
 *   node scripts/native/assert-live-url.mjs ios
 *
 * Exit code 0 means the app points somewhere; 1 means it does not.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const platform = process.argv[2];

const CONFIG_PATH = {
  android: 'android/app/src/main/assets/capacitor.config.json',
  ios: 'ios/App/App/capacitor.config.json',
};

if (!platform || !CONFIG_PATH[platform]) {
  console.error('usage: node scripts/native/assert-live-url.mjs <android|ios>');
  process.exit(2);
}

const relative = CONFIG_PATH[platform];
const expected = process.env.NATIVE_APP_URL?.trim();

let config;
try {
  config = JSON.parse(await readFile(path.join(root, relative), 'utf8'));
} catch (error) {
  console.error(`✗ could not read ${relative}: ${error.message}`);
  console.error('  Generate the native project first (npm run native:prepare).');
  process.exit(1);
}

const url = config?.server?.url;

if (!url) {
  console.error(`✗ ${platform}: the app is built without a server URL.`);
  console.error(`  ${relative} has no server.url, so this build would boot into`);
  console.error('  the bundled "not connected" shell instead of the app.');
  console.error('  Set NATIVE_APP_URL and rebuild — do not publish this artefact.');
  process.exit(1);
}

if (expected && url !== expected) {
  console.error(`✗ ${platform}: the app points at the wrong deployment.`);
  console.error(`  baked in: ${url}`);
  console.error(`  expected: ${expected}`);
  process.exit(1);
}

try {
  new URL(url);
} catch {
  console.error(`✗ ${platform}: server.url is not a valid URL: ${url}`);
  process.exit(1);
}

console.log(`✓ ${platform}: the app loads ${url}`);
