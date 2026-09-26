#!/usr/bin/env node
/**
 * Turn this repository into buildable native projects.
 *
 *   node scripts/native/prepare.mjs                  # android + ios
 *   node scripts/native/prepare.mjs --android-only
 *   node scripts/native/prepare.mjs --ios-only
 *   node scripts/native/prepare.mjs --sync-only      # platforms already exist
 *
 * The native projects are generated, not committed: they are reproducible from
 * `capacitor.config.ts` plus `assets/`, and generating them keeps a machine that
 * cannot install CocoaPods or the Android SDK from blocking everyone else. CI
 * runs this exact script, so what a developer builds matches what is released.
 *
 * `NATIVE_APP_URL` must be set for a build that loads a real deployment; without
 * it the app boots into the bundled "not connected" shell.
 */

import { spawnSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const syncOnly = args.has('--sync-only');
const androidOnly = args.has('--android-only');
const iosOnly = args.has('--ios-only');

const platforms = androidOnly ? ['android'] : iosOnly ? ['ios'] : ['android', 'ios'];

function run(command, extraEnv = {}) {
  const result = spawnSync(command, { shell: true, stdio: 'inherit', cwd: root, env: { ...process.env, ...extraEnv } });
  if (result.status !== 0) {
    throw new Error(`\`${command}\` failed with exit code ${result.status}`);
  }
}

const exists = async (p) => access(path.join(root, p)).then(() => true, () => false);

if (!process.env.NATIVE_APP_URL) {
  console.warn(
    '\n  NATIVE_APP_URL is not set. The build will boot into the bundled shell,\n' +
      '  which tells the user the app is not connected to a server.\n' +
      '  Set it to the deployment to load, e.g. NATIVE_APP_URL=https://app.example.com\n',
  );
}

for (const platform of platforms) {
  if (!(await exists(platform))) {
    console.log(`\n▸ adding ${platform} platform`);
    run(`npx cap add ${platform}`);
  }
}

if (!syncOnly) {
  console.log('\n▸ stamping version from package.json');
  run('node scripts/native/set-version.mjs');

  console.log('\n▸ generating icons and splash screens');
  // Target the platform explicitly: with no flag the tool also emits a PWA
  // icon set at the repository root, which this app does not use (its manifest
  // points at a single SVG).
  for (const platform of platforms) {
    try {
      run(`npx capacitor-assets generate --${platform}`);
    } catch {
      // Cosmetic only — a plain Capacitor icon still builds and installs.
      console.warn(`  asset generation failed for ${platform}; continuing with the default icons`);
    }
  }
}

console.log('\n▸ syncing web assets and plugins');
run(`npx cap sync ${platforms.join(' ')}`);

console.log('\nnative projects ready.');
for (const platform of platforms) {
  console.log(`  ${platform}: npx cap open ${platform}`);
}
