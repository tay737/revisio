#!/usr/bin/env node
/**
 * Render the brand source images that `@capacitor/assets` expands into the
 * per-density Android icons and the iOS asset catalogue.
 *
 * The outputs are committed, so a normal build never needs this script; run it
 * only when the mark changes:
 *
 *   node scripts/native/make-assets.mjs
 *
 * Centring is done by rasterising the glyph, trimming to its ink and compositing
 * it — not by SVG baseline attributes. The SVG rasteriser used here ignores
 * `dominant-baseline`, which silently pushed the mark below centre; trimming is
 * exact for any font and any size, so the icon cannot end up lopsided again.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ACCENT = '#1c64f2';
const SURFACE = '#000000';
const INK = '#f5f5f7';
const FONT = 'Helvetica Neue, Helvetica, Arial, sans-serif';

const root = process.cwd();
const outDir = path.join(root, 'assets');

/**
 * Rasterise text on a transparent canvas and trim it to its ink, so the result
 * is a tightly-cropped glyph we can centre exactly.
 */
async function glyph(text, { weight = 800, fontSize = 400 } = {}) {
  const pad = Math.round(fontSize * 0.6);
  const width = pad * 2 + Math.round(fontSize * text.length * 0.9);
  const height = pad * 2 + fontSize;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <text x="${pad}" y="${pad + fontSize * 0.8}" font-family="${FONT}"
            font-weight="${weight}" font-size="${fontSize}" fill="#ffffff">${text}</text>
    </svg>`;
  return sharp(Buffer.from(svg)).png().trim({ threshold: 1 }).toBuffer();
}

/** Place a trimmed glyph, scaled to `target` px on its longest side, dead centre. */
async function compose(size, background, layers) {
  const composites = [];
  for (const { glyph: src, scale } of layers) {
    const meta = await sharp(src).metadata();
    const longest = Math.max(meta.width, meta.height);
    const target = Math.round(size * scale);
    const scaled = await sharp(src)
      .resize({
        width: Math.round((meta.width / longest) * target),
        height: Math.round((meta.height / longest) * target),
      })
      .png()
      .toBuffer();
    const m = await sharp(scaled).metadata();
    composites.push({
      input: scaled,
      left: Math.round((size - m.width) / 2),
      top: Math.round((size - m.height) / 2),
    });
  }
  return sharp(Buffer.from(background(size))).composite(composites).png().toBuffer();
}

const flat = (color) => (size) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="${color}"/></svg>`;

const transparent = (size) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"></svg>`;

const roundedPlate = (size) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${ACCENT}"/></svg>`;

async function render(png, file, size) {
  const out = await sharp(png).resize(size, size, { fit: 'contain' }).png().toBuffer();
  await writeFile(path.join(outDir, file), out);
  return `${file} (${size}×${size}, ${(out.length / 1024).toFixed(1)} KB)`;
}

await mkdir(outDir, { recursive: true });

const R = await glyph('R');
const wordmark = await glyph('Revisio', { weight: 600, fontSize: 200 });

// iOS masks the icon itself, so it is full-bleed with no transparency.
const appIcon = await compose(1024, flat(ACCENT), [{ glyph: R, scale: 0.6 }]);
// Android adaptive: the mark alone inside the 66% safe zone, no plate.
const adaptiveFg = await compose(1024, transparent, [{ glyph: R, scale: 0.34 }]);

// The splash: crest plate + mark + wordmark, stacked and centred on surface.
const splashSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732">
    <rect width="2732" height="2732" fill="${SURFACE}"/></svg>`;
const crest = await compose(512, roundedPlate, [{ glyph: R, scale: 0.6 }]);
const splashBase = await sharp(Buffer.from(splashSvg))
  .composite([
    { input: crest, left: Math.round((2732 - 512) / 2), top: 2732 / 2 - 512 },
    {
      input: await sharp(wordmark)
        .resize({ width: 420 })
        .png()
        .toBuffer(),
      left: Math.round((2732 - 420) / 2),
      top: 2732 / 2 + 40,
    },
  ])
  .png()
  .toBuffer();
const splash = await sharp(splashBase).resize(2732, 2732).png().toBuffer();

const written = [
  await render(appIcon, 'icon.png', 1024),
  await render(adaptiveFg, 'icon-foreground.png', 1024),
  await render(await sharp(Buffer.from(flat(ACCENT)(1024))).png().toBuffer(), 'icon-background.png', 1024),
  await render(splash, 'splash.png', 2732),
  await render(splash, 'splash-dark.png', 2732),
  await render(await compose(512, flat(SURFACE), [{ glyph: R, scale: 0.6 }]), 'notification.png', 512),
];

console.log('native assets written to assets/:');
for (const line of written) console.log('  ' + line);
