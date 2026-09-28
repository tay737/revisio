#!/usr/bin/env node
/**
 * One icon set, two native ports.
 *
 *   node scripts/native/make-icons.mjs
 *
 * The web app keeps every glyph in `src/components/ui/icons.tsx`, a registry of
 * semantic names (`rank`, `learn`, `streak`) resolved to lucide components. A
 * native client that draws an emoji instead is not the same product: an emoji
 * arrives with its own palette, so it becomes a second accent colour the design
 * language explicitly forbids, and it renders differently on every OS version.
 *
 * So this script reads that registry — the actual file the web imports, not a
 * copy of it — pulls the geometry out of `lucide-react`, and emits the same
 * icons as native vectors:
 *
 *   mobile/shared/icons.json                       the recorded geometry
 *   mobile/android/.../ui/Icons.kt                 Compose ImageVector
 *   mobile/ios/Sources/Revisio/Icons.swift         SwiftUI Path data
 *
 * Neither platform draws an icon by hand, and neither can drift from the web:
 * add a glyph to the registry and re-run this.
 *
 * Colours are never baked in. Every icon is stroked in `currentColor` (the
 * registry's own rule), which each port resolves from the text colour it is
 * drawn in — so an inactive nav item reads muted and an active one reads ink.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const REGISTRY = 'src/components/ui/icons.tsx';

/** PascalCase registry component → the kebab-case file lucide ships it under. */
const kebab = (name) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Za-z])(\d)/g, '$1-$2')
    .toLowerCase();

// ── read the registry ───────────────────────────────────────────────────────

const source = await readFile(path.join(root, REGISTRY), 'utf8');
const block = source.match(/export const icons = \{([\s\S]*?)\} satisfies/);
if (!block) throw new Error(`Could not find the icon registry in ${REGISTRY}.`);

const entries = [];
for (const line of block[1].split('\n')) {
  // `  learn: BookOpen,` — comments and blank lines fall through.
  const match = line.match(/^\s*([A-Za-z][A-Za-z0-9]*)\s*:\s*([A-Z][A-Za-z0-9]*)\s*,\s*$/);
  if (match) entries.push({ name: match[1], component: match[2] });
}
if (entries.length === 0) throw new Error('The registry parsed to zero icons.');

const lucideVersion = JSON.parse(
  await readFile(path.join(root, 'node_modules/lucide-react/package.json'), 'utf8'),
).version;

// ── geometry: every SVG element lucide uses, as a path `d` ──────────────────
//
// Both ports render icon data as SVG path strings — Compose has a `PathParser`
// and the Swift side carries a small one — so circles, rectangles, lines and
// polylines are converted here rather than teaching each platform five shapes.

const round = (n) => Number(Number(n).toFixed(4));

function circlePath({ cx, cy, r }) {
  const x = round(cx);
  const y = round(cy);
  const radius = round(r);
  return `M ${x - radius} ${y} a ${radius} ${radius} 0 1 0 ${radius * 2} 0 a ${radius} ${radius} 0 1 0 ${-radius * 2} 0 Z`;
}

function ellipsePath({ cx, cy, rx, ry }) {
  const x = round(cx);
  const y = round(cy);
  const a = round(rx);
  const b = round(ry);
  return `M ${x - a} ${y} a ${a} ${b} 0 1 0 ${a * 2} 0 a ${a} ${b} 0 1 0 ${-a * 2} 0 Z`;
}

function rectPath({ x, y, width, height, rx, ry }) {
  const left = round(x);
  const top = round(y);
  const w = round(width);
  const h = round(height);
  const r = Math.min(round(rx ?? ry ?? 0), w / 2, h / 2);
  if (r <= 0) {
    return `M ${left} ${top} L ${left + w} ${top} L ${left + w} ${top + h} L ${left} ${top + h} Z`;
  }
  return [
    `M ${left + r} ${top}`,
    `L ${left + w - r} ${top}`,
    `a ${r} ${r} 0 0 1 ${r} ${r}`,
    `L ${left + w} ${top + h - r}`,
    `a ${r} ${r} 0 0 1 ${-r} ${r}`,
    `L ${left + r} ${top + h}`,
    `a ${r} ${r} 0 0 1 ${-r} ${-r}`,
    `L ${left} ${top + r}`,
    `a ${r} ${r} 0 0 1 ${r} ${-r}`,
    'Z',
  ].join(' ');
}

function linePath({ x1, y1, x2, y2 }) {
  return `M ${round(x1)} ${round(y1)} L ${round(x2)} ${round(y2)}`;
}

function pointsPath(points, close) {
  // SVG accepts `x,y` and `x y` interchangeably, and lucide uses both — a
  // space-separated list split on whitespace alone yields one number per
  // "pair" and a path of NaNs. Reading every number first and grouping them is
  // the only parse that is right for both spellings.
  const numbers = String(points).trim().split(/[\s,]+/).filter(Boolean).map(Number);
  const pairs = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) pairs.push([numbers[i], numbers[i + 1]]);
  if (pairs.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) {
    throw new Error(`points="${points}" is not a list of coordinate pairs.`);
  }
  const [first, ...rest] = pairs;
  return (
    `M ${round(first[0])} ${round(first[1])} ` +
    rest.map(([x, y]) => `L ${round(x)} ${round(y)}`).join(' ') +
    (close ? ' Z' : '')
  );
}

const num = (value, fallback = 0) => (value === undefined ? fallback : Number(value));

/** One lucide element as a path `d`. */
function elementToPath([tag, attrs]) {
  switch (tag) {
    case 'path':
      return attrs.d;
    case 'circle':
      return circlePath({ cx: num(attrs.cx), cy: num(attrs.cy), r: num(attrs.r) });
    case 'ellipse':
      return ellipsePath({
        cx: num(attrs.cx),
        cy: num(attrs.cy),
        rx: num(attrs.rx),
        ry: num(attrs.ry),
      });
    case 'rect':
      return rectPath({
        x: num(attrs.x),
        y: num(attrs.y),
        width: num(attrs.width),
        height: num(attrs.height),
        rx: attrs.rx === undefined ? undefined : Number(attrs.rx),
        ry: attrs.ry === undefined ? undefined : Number(attrs.ry),
      });
    case 'line':
      return linePath({
        x1: num(attrs.x1),
        y1: num(attrs.y1),
        x2: num(attrs.x2),
        y2: num(attrs.y2),
      });
    case 'polyline':
      return pointsPath(attrs.points, false);
    case 'polygon':
      return pointsPath(attrs.points, true);
    default:
      throw new Error(`lucide element <${tag}> is not handled; extend elementToPath.`);
  }
}

/**
 * Load one lucide icon's geometry.
 *
 * Some names in this lucide version are alias files that only re-export another
 * icon (`trash-2.mjs` is `export { default } from './trash.mjs'`), so a missing
 * `__iconData` means "follow the re-export" rather than "no such icon".
 */
async function loadIcon(file, seen = []) {
  if (seen.includes(file)) throw new Error(`lucide alias loop: ${seen.join(' → ')}`);
  const target = path.join(root, 'node_modules/lucide-react/dist/esm/icons', `${file}.mjs`);
  const module = await import(target);
  if (module.__iconData) return module.__iconData;
  const source = await readFile(target, 'utf8');
  const reExport = source.match(/from '\.\/([a-z0-9-]+)\.mjs'/);
  if (!reExport) throw new Error(`No icon data for ${file}.mjs and no re-export to follow.`);
  return loadIcon(reExport[1], [...seen, file]);
}

const icons = {};
for (const { name, component } of entries) {
  const data = await loadIcon(kebab(component));
  icons[name] = data.node.map(elementToPath);
}

// ── what the ports consume ──────────────────────────────────────────────────
//
// A single recorded artefact, the same shape `grading-vectors.json` has: the
// geometry both ports are held to, so a reviewer can diff the phone against the
// browser without building either.

const manifest = {
  version: 1,
  generatedFrom: REGISTRY,
  lucide: lucideVersion,
  grid: 24,
  strokeWidth: 1.75,
  icons,
};

await mkdir(path.join(root, 'mobile/shared'), { recursive: true });
await writeFile(
  path.join(root, 'mobile/shared/icons.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

// ── Compose ─────────────────────────────────────────────────────────────────

/** A Kotlin string literal. Path data holds no `$`, but escaping it is free. */
const kotlinString = (value) =>
  `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$')}"`;

// Two registry names are reserved words in both languages — `class` and
// `private` are semantic keys here (a topic's visibility, a lesson's), so they
// stay, quoted, rather than being renamed away from the web's vocabulary.
const KOTLIN_KEYWORDS = new Set([
  'as', 'break', 'class', 'continue', 'do', 'else', 'false', 'for', 'fun', 'if',
  'in', 'interface', 'is', 'null', 'object', 'package', 'return', 'super', 'this',
  'throw', 'true', 'try', 'typealias', 'typeof', 'val', 'var', 'when', 'while',
]);
const SWIFT_KEYWORDS = new Set([
  'actor', 'any', 'as', 'associatedtype', 'async', 'await', 'break', 'case',
  'catch', 'class', 'continue', 'convenience', 'default', 'defer', 'deinit', 'do',
  'dynamic', 'else', 'enum', 'extension', 'fallthrough', 'false', 'fileprivate',
  'final', 'for', 'func', 'guard', 'if', 'import', 'in', 'indirect', 'init', 'inout',
  'internal', 'is', 'lazy', 'let', 'mutating', 'nil', 'nonmutating', 'open', 'operator',
  'override', 'precedencegroup', 'private', 'protocol', 'public', 'repeat', 'required',
  'return', 'self', 'some', 'static', 'struct', 'subscript', 'super', 'switch',
  'throw', 'throws', 'true', 'try', 'typealias', 'unowned', 'var', 'weak', 'where',
  'while',
]);

const kotlinIdentifier = (name) => (KOTLIN_KEYWORDS.has(name) ? `\`${name}\`` : name);
const swiftIdentifier = (name) => (SWIFT_KEYWORDS.has(name) ? `\`${name}\`` : name);

const kotlin = `package app.revisio.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.dp

// GENERATED by scripts/native/make-icons.mjs from ${REGISTRY}
// and lucide-react ${lucideVersion}. Do not edit: re-run the script.
//
// These are the website's icons, not lookalikes. Each entry is the same
// geometry the browser draws, stroked at the registry's 1.75 weight on the same
// 24px grid, and drawn in the colour it is asked for rather than a fixed one —
// which is what lets an inactive nav item read muted and an active one read ink.

private fun icon(name: String, weight: Float, vararg paths: String): ImageVector {
    val builder = ImageVector.Builder(
        name = name,
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f,
    )
    paths.forEach { d ->
        builder.addPath(
            pathData = PathParser().parsePathString(d).toNodes(),
            stroke = SolidColor(Color.Black),
            strokeLineWidth = weight,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round,
        )
    }
    return builder.build()
}

private fun buildIcons(): List<Pair<String, List<String>>> = listOf(
${Object.entries(icons)
  .map(
    ([name, paths]) =>
      `    ${kotlinString(name)} to listOf(\n${paths
        .map((d) => `        ${kotlinString(d)},`)
        .join('\n')}\n    ),`,
  )
  .join('\n')}
)

/** The registry from \`src/components/ui/icons.tsx\`, as vectors. */
object RevisioIcons {
${Object.entries(icons)
  .map(
    ([name]) =>
      `    val ${kotlinIdentifier(name)}: ImageVector by lazy {\n        icon(${kotlinString(name)}, ${manifest.strokeWidth}f, *geometry.getValue(${kotlinString(name)}).toTypedArray())\n    }`,
  )
  .join('\n\n')}

    internal val geometry: Map<String, List<String>> by lazy { buildIcons().toMap() }
}

/**
 * The active state of a nav slot, at the weight the web switches to.
 *
 * The bottom bar moves each icon from stroke 1.9 to 2.3 when it becomes the
 * current destination, per the web's BottomNav. Compose bakes a stroke width
 * into the vector, so this is the same geometry built twice rather than a
 * modifier that cannot exist.
 */
object RevisioIconsActive {
${Object.entries(icons)
  .map(
    ([name]) =>
      `    val ${kotlinIdentifier(name)}: ImageVector by lazy {\n        icon(${kotlinString(name)}, 2.3f, *RevisioIcons.geometry.getValue(${kotlinString(name)}).toTypedArray())\n    }`,
  )
  .join('\n\n')}
}
`;

await writeFile(
  path.join(root, 'mobile/android/app/src/main/kotlin/app/revisio/ui/Icons.kt'),
  kotlin,
);

// ── SwiftUI ─────────────────────────────────────────────────────────────────

const swiftString = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const swift = `import SwiftUI

// GENERATED by scripts/native/make-icons.mjs from ${REGISTRY}
// and lucide-react ${lucideVersion}. Do not edit: re-run the script.
//
// The website's icons, drawn from the website's geometry — the same 24px grid
// and the same 1.75 stroke. An emoji would arrive with its own palette and
// become a second accent colour the design language forbids, and it renders
// differently on every iOS version; these do neither.

/// Every glyph the registry defines, by semantic name.
public enum RevisioIcons {
${Object.entries(icons)
  .map(
    ([name, paths]) =>
      `    public static let ${swiftIdentifier(name)}: [String] = [\n${paths
        .map((d) => `        "${swiftString(d)}",`)
        .join('\n')}\n    ]`,
  )
  .join('\n\n')}
}

/// Draws a registry glyph at the registry's stroke weight.
///
/// Colour is the caller's, mirroring lucide's \`currentColor\` rule: the same
/// glyph reads muted when a nav item is inactive, ink when it is active, and
/// good or streak where the game needs a colour — with no second copy of the
/// shape. Nothing here bakes in a palette, which is what an emoji would do.
public struct Icon: View {
    private let paths: [String]
    private let size: CGFloat
    private let strokeWidth: CGFloat
    private let color: Color

    public init(
        _ name: String,
        size: CGFloat = 18,
        strokeWidth: CGFloat = ${manifest.strokeWidth},
        color: Color = .primary
    ) {
        self.paths = Icon.registry[name] ?? []
        self.size = size
        self.strokeWidth = strokeWidth
        self.color = color
    }

    public var body: some View {
        Canvas { context, canvasSize in
            guard size > 0 else { return }
            let scale = canvasSize.width / ${manifest.grid}
            for d in paths {
                var path = SVGPath.parse(d)
                path = path.applying(
                    CGAffineTransform(scaleX: scale, y: scale)
                )
                context.stroke(
                    path,
                    with: .color(color),
                    style: StrokeStyle(
                        lineWidth: strokeWidth * scale,
                        lineCap: .round,
                        lineJoin: .round
                    )
                )
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    /// Name → geometry. Kept here so a missing name is a no-op rather than a crash.
    static let registry: [String: [String]] = [
${Object.entries(icons)
  .map(
    ([name, paths]) =>
      `        "${name}": [\n${paths
        .map((d) => `            "${swiftString(d)}",`)
        .join('\n')}\n        ],`,
  )
  .join('\n')}
    ]
}
`;

await writeFile(path.join(root, 'mobile/ios/Sources/Revisio/Icons.swift'), swift);

console.log(
  `icons: ${entries.length} glyphs → mobile/shared/icons.json, Icons.kt, Icons.swift (lucide ${lucideVersion})`,
);
