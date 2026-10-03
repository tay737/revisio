#!/usr/bin/env node
/**
 * The iOS app icon, cut from the same mark the web and Android apps use.
 *
 *   node scripts/native/make-ios-icon.mjs
 *
 * `public/icon.svg` is the one place the brand mark is drawn. Android keeps a
 * vector copy of it (`ic_launcher.xml`); iOS wants raster, so this renders the
 * SVG and commits the PNG.
 *
 * Two things the App Store insists on shape the output: an iOS icon carries no
 * transparency (rejected at upload) and no corner rounding (the springboard
 * masks it). So the mark is flattened onto the brand ink and rendered
 * full-bleed at the single 1024×1024 size iOS 16+ expects.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// The brand ground is the design system's own ink — the same `#000000` the
// manifest and viewport theme-color declare. It was the purged blue once.
const brand = '#000000';
const root = process.cwd();
const iconSet = path.join(root, 'mobile/ios/Revisio/Assets.xcassets/AppIcon.appiconset');

const svg = await readFile(path.join(root, 'public/icon.svg'));
const png = await sharp(svg, { density: 900 })
  .flatten({ background: brand })
  .resize(1024, 1024, { fit: 'contain', background: brand })
  .png({ compressionLevel: 9 })
  .toBuffer();

const info = await sharp(png).metadata();
if (info.width !== 1024 || info.height !== 1024 || info.hasAlpha) {
  throw new Error(`unexpected icon: ${info.width}×${info.height} alpha=${info.hasAlpha}`);
}

await mkdir(iconSet, { recursive: true });
await writeFile(path.join(iconSet, 'AppIcon.png'), png);
console.log(`mobile/ios/Revisio/Assets.xcassets/AppIcon.appiconset/AppIcon.png (1024×1024, opaque)`);
