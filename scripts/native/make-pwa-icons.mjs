#!/usr/bin/env node
/**
 * The PWA icon set, cut from the same mark the phones use.
 *
 *   node scripts/native/make-pwa-icons.mjs
 *
 * `public/icon.svg` is the one place the brand mark is drawn. The manifest
 * needs raster PNGs at 192 and 512 (and maskable variants so Android's adaptive
 * launcher can crop), which the SVG alone does not satisfy — Lighthouse
 * installability fails without them.
 *
 * `any` variants draw the mark inside its own rounded square on ink, matching
 * how the browser and the phones render it. `maskable` variants fill the whole
 * canvas with the ground colour and hold the mark inside the middle 80% safe
 * zone, so an OS that crops to a circle or squircle cannot clip the glyph.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ground = '#000000'; // the design system's ink — same source as the manifest
const root = process.cwd();
const svg = await readFile(path.join(root, 'public/icon.svg'));

/** Draw at `size`, either with the mark's own rounded square (`any`) or full-bleed (`maskable`). */
async function render(size, purpose) {
  if (purpose === 'maskable') {
    // Full-bleed ground; the mark sits in the middle 80% (the maskable safe zone).
    const inner = Math.round(size * 0.8);
    const mark = await sharp(svg, { density: 900 })
      .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    return sharp({
      create: { width: size, height: size, channels: 4, background: ground },
    })
      .composite([{ input: mark, gravity: 'centre' }])
      .png({ compressionLevel: 9 })
      .toBuffer();
  }
  return sharp(svg, { density: 900 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

for (const size of [192, 512]) {
  const png = await render(size, 'any');
  await writeFile(path.join(root, `public/icon-${size}.png`), png);
  console.log(`public/icon-${size}.png (${size}×${size})`);

  const maskable = await render(size, 'maskable');
  await writeFile(path.join(root, `public/icon-${size}-maskable.png`), maskable);
  console.log(`public/icon-${size}-maskable.png (${size}×${size}, maskable)`);
}
