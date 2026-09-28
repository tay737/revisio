#!/usr/bin/env node
/**
 * One design language, two native ports.
 *
 *   node scripts/native/make-theme.mjs
 *
 * `src/app/globals.css` is the only place Revisio's design language is written
 * down: the two-colour duet that owns the chrome, the five game colours that own
 * state, the radius ladder, the three documented drops, the easing curves and
 * the type scale. This reads that file and emits the same values twice:
 *
 *   mobile/android/app/src/main/kotlin/app/revisio/ui/Theme.kt
 *   mobile/ios/Sources/Revisio/Theme.swift
 *
 * Hand-copying them is how a phone drifts from the browser — a shade off on the
 * pressed lip, a radius that was 12 on one side and 16 on the other, a streak
 * orange that stopped matching. A generated file cannot drift; it can only be
 * stale, and re-running this is one command.
 *
 * MOBILE STEP: the scale is authored responsively, with a `clamp()` for the
 * display sizes and a `@media (min-width: 640px)` step for several controls.
 * A phone is below that breakpoint, so this takes the phone's value — the
 * `clamp` minimum, the pre-media base — which is exactly what the browser shows
 * at the same width.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const CSS = 'src/app/globals.css';
const css = await readFile(path.join(root, CSS), 'utf8');

// ── custom properties ───────────────────────────────────────────────────────

/** Collect `--name: value;` declarations from the first block matching `start`. */
function declarations(startPattern) {
  const at = css.search(startPattern);
  if (at === -1) throw new Error(`Could not find ${startPattern} in ${CSS}.`);
  const open = css.indexOf('{', at);
  const close = css.indexOf('\n}', open);
  const block = css.slice(open + 1, close);
  const found = {};
  for (const match of block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    found[match[1]] = match[2].trim();
  }
  return found;
}

/** `rgb(0 0 0 / 0.28)` and `#fff` both become 0xRRGGBB plus an alpha. */
function parseColor(raw) {
  const value = raw.trim().replace(/^var\((--[a-z0-9-]+)\)$/, (_, name) => {
    throw new Error(`Token resolves through ${name}; inline it in ${CSS} or teach parseColor.`);
  });
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const digits =
      hex[1].length === 3
        ? hex[1]
            .split('')
            .map((c) => c + c)
            .join('')
        : hex[1];
    return encode(digits.toUpperCase(), 'FF');
  }
  const rgb = value.match(
    /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*([\d.]+)\s*)?\)$/,
  );
  if (rgb) {
    const [, r, g, b, a] = rgb;
    const channel = (n) => Number(n).toString(16).padStart(2, '0').toUpperCase();
    const alpha = (a === undefined ? 255 : Math.round(Number(a) * 255))
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
    return encode(`${channel(r)}${channel(g)}${channel(b)}`, alpha);
  }
  throw new Error(`Unrecognised colour value in ${CSS}: ${raw}`);
}

/**
 * The same colour in the two orderings the platforms want: Compose packs
 * `Color(Long)` as ARGB, and the Swift initialiser below reads RGBA. Emitting
 * one encoding for both is how an alpha ends up on the wrong channel.
 */
function encode(rgb, alpha) {
  return {
    argb: `0x${alpha}${rgb}`,
    rgba: `0x${rgb}${alpha}`,
    hex6: `#${rgb}`,
  };
}

/**
 * The roles each port needs, in a fixed order, with the name it is known by on
 * each side. Keeping this list explicit means a token added to the stylesheet is
 * a visible omission here rather than a silent absence in two apps.
 */
const ROLES = [
  ['background', 'background'],
  ['foreground', 'foreground'],
  ['card', 'card'],
  ['card-foreground', 'cardForeground'],
  ['popover', 'popover'],
  ['primary', 'primary'],
  ['primary-foreground', 'primaryForeground'],
  ['secondary', 'secondary'],
  ['secondary-foreground', 'secondaryForeground'],
  ['muted', 'muted'],
  ['muted-foreground', 'mutedForeground'],
  ['accent', 'accent'],
  ['accent-foreground', 'accentForeground'],
  ['destructive', 'destructive'],
  ['destructive-foreground', 'destructiveForeground'],
  ['border', 'border'],
  ['border-strong', 'borderStrong'],
  ['input', 'input'],
  ['ring', 'ring'],
  ['good', 'good'],
  ['good-pressed', 'goodPressed'],
  ['good-soft', 'goodSoft'],
  ['streak', 'streak'],
  ['gold', 'gold'],
  ['info', 'info'],
  ['band', 'band'],
  ['band-foreground', 'bandForeground'],
  ['band-card', 'bandCard'],
  ['band-border', 'bandBorder'],
  ['band-muted', 'bandMuted'],
  ['band-secondary', 'bandSecondary'],
  ['lip', 'lip'],
  ['lip-soft', 'lipSoft'],
  ['scrim', 'scrim'],
];

const light = declarations(/:root\s*\{/);
const dark = declarations(/^\.dark\s*\{/m);

const colors = {};
for (const [token, name] of ROLES) {
  if (!(token in light)) throw new Error(`:root is missing --${token}`);
  if (!(token in dark)) throw new Error(`.dark is missing --${token}`);
  colors[name] = { light: parseColor(light[token]), dark: parseColor(dark[token]), token };
}

// ── radii, easing ───────────────────────────────────────────────────────────

const radii = {};
for (const match of css.matchAll(/--radius-([a-z0-9]+):\s*(\d+)px;/g)) {
  radii[match[1]] = Number(match[2]);
}

/**
 * `2xl` is a Tailwind name, and neither Kotlin nor Swift allows a leading digit
 * in an identifier. The doubled step is spelled out as `xxl` so it still reads as
 * the rung above `xl`; anything else numeric would have to be added here.
 */
const RADIUS_RENAMES = { '2xl': 'xxl' };
const radiusIdentifier = (name) => RADIUS_RENAMES[name] ?? name;
const baseRadius = Number((css.match(/--radius:\s*(\d+)px;/) ?? [])[1]);
if (!baseRadius) throw new Error('Could not read --radius.');

const easing = {};
for (const match of css.matchAll(/--ease-([a-z]+):\s*cubic-bezier\(([^)]+)\);/g)) {
  easing[match[1]] = match[2].split(',').map((n) => Number(n.trim()));
}

const shadows = {};
for (const match of css.matchAll(
  /--shadow-([a-z]+):\s*(\d+)px\s+(\d+)px\s+([\d.]+)px\s+(-?[\d.]+)px\s+rgb\(0 0 0 \/ ([\d.]+)\);/g,
)) {
  shadows[match[1]] = {
    x: Number(match[2]),
    y: Number(match[3]),
    blur: Number(match[4]),
    spread: Number(match[5]),
    alpha: Number(match[6]),
  };
}

// ── the motion language ─────────────────────────────────────────────────────
//
// `src/lib/motion.ts` is the single owner of every duration, easing and spring
// in the product — six springs, five durations, four curves, and the four
// entrance gestures built from them.
//
// This is the half of the design language the ports did not have. `globals.css`
// carries two cubic-beziers, and the native clients animated on those two plus
// a hand-picked 90ms tween, which is exactly why a press or a panel on a phone
// read as stiff next to a browser that springs. So the springs are read from
// their owner rather than re-invented, and a change there reaches both apps.

const MOTION = 'src/lib/motion.ts';
const motionSrc = await readFile(path.join(root, MOTION), 'utf8');

/** The text of a top-level `const NAME = { … }` object in motion.ts. */
function motionObject(name) {
  const at = motionSrc.search(new RegExp(`const ${name} = \\{`));
  if (at === -1) throw new Error(`Could not find ${name} in ${MOTION}.`);
  const close = motionSrc.indexOf('\n} as const;', at);
  return motionSrc.slice(at, close === -1 ? at + 4000 : close);
}

/** One named value out of a motion object, failing loudly when it is absent. */
function motionValue(pattern, label) {
  const value = (motionSrc.match(pattern) ?? [])[1];
  if (value === undefined) throw new Error(`Could not read ${label} from ${MOTION}.`);
  return Number(value);
}

const durations = {};
for (const match of motionObject('DUR').matchAll(/\n  ([a-z]+):\s*([\d.]+),/g)) {
  durations[match[1]] = Number(match[2]);
}
if (Object.keys(durations).length < 5) {
  throw new Error(`Only parsed ${Object.keys(durations).length} durations; DUR changed shape.`);
}

const curves = {};
for (const match of motionObject('EASE').matchAll(/\n  ([a-zA-Z]+):\s*\[([^\]]+)\]/g)) {
  curves[match[1]] = match[2].split(',').map((n) => Number(n.trim()));
}
if (Object.keys(curves).length < 4) {
  throw new Error(`Only parsed ${Object.keys(curves).length} curves; EASE changed shape.`);
}

const springs = {};
for (const match of motionObject('SPRING').matchAll(
  /\n  ([a-zA-Z]+):\s*\{ type: 'spring', stiffness: ([\d.]+), damping: ([\d.]+), mass: ([\d.]+) \}/g,
)) {
  springs[match[1]] = { stiffness: Number(match[2]), damping: Number(match[3]), mass: Number(match[4]) };
}
if (Object.keys(springs).length < 6) {
  throw new Error(`Only parsed ${Object.keys(springs).length} springs; SPRING changed shape.`);
}

/**
 * The web's spring as Compose's spring.
 *
 * Both are the same damped harmonic oscillator; Compose simply has no mass term
 * and describes the damping as a ratio of critical. So the mass moves into the
 * ratio — `damping / (2·√(stiffness·mass))` — and the motion that comes out is
 * the motion the browser produces, not an approximation chosen by hand.
 */
const dampingRatio = ({ stiffness, damping, mass }) =>
  Number((damping / (2 * Math.sqrt(stiffness * mass))).toFixed(4));

const motions = {
  /** Press: the spec's `scale(0.95)`, which every tappable surface uses. */
  pressScale: motionValue(/whileTap: \{ scale: ([\d.]+) \}/, 'press scale'),
  hoverScale: motionValue(/whileHover: \{ scale: ([\d.]+) \}/, 'hover scale'),
  /** Entrance: rise and settle. */
  enterRise: motionValue(/export const fadeUp[\s\S]*?hidden: \{ opacity: 0, y: (\d+)/, 'fadeUp rise'),
  enterScaleRise: motionValue(/export const fadeScale[\s\S]*?hidden: \{ opacity: 0, scale: [\d.]+, y: (\d+)/, 'fadeScale rise'),
  enterScale: motionValue(/export const fadeScale[\s\S]*?hidden: \{ opacity: 0, scale: ([\d.]+)/, 'fadeScale scale'),
  routeRise: motionValue(/export const routeVariants[\s\S]*?hidden: \{ opacity: 0, y: (\d+)/, 'route rise'),
  /** A rail that slides in from the side (the ladder advancing a tier). */
  railSlide: motionValue(/railVariants[\s\S]*?x: dir > 0 \? (\d+)/, 'rail slide'),
  /** Sheets travel a little more than their own height, so nothing peeks. */
  sheetTravel: Number(((motionSrc.match(/sheetVariants[\s\S]*?y: '([\d.]+)%'/) ?? [])[1] ?? 102) / 100),
  /** Stagger, and the cap that keeps a long list from trickling in. */
  staggerStep: motionValue(/staggerParent = \(stagger = ([\d.]+)/, 'stagger step'),
  staggerChildren: motionValue(/delayChildren = ([\d.]+)/, 'stagger delayChildren'),
  listStep: motionValue(/cappedDelay\(index: number, step = ([\d.]+)/, 'capped stagger step'),
  listCap: motionValue(/cappedDelay[\s\S]*?cap = ([\d.]+)\)/, 'capped stagger cap'),
  /** Scroll-reveal margin: enter before the element is centred. */
  revealMargin: motionValue(/REVEAL_VIEWPORT = \{ once: true, margin: '-(\d+)px' \}/, 'reveal margin'),
};

/** Compose wants milliseconds; the web authors seconds. */
const ms = (seconds) => Math.round(seconds * 1000);

/**
 * `EASE.in` is `easeIn` on both sides.
 *
 * `in` is a reserved word in Kotlin *and* Swift, so the one curve the web names
 * that way cannot be emitted under its own name without backticks at every call
 * site. Everything else keeps the name it has in motion.ts, so the two files
 * stay greppable against each other.
 */
const curveName = (name) => (name === 'in' ? 'easeIn' : name);

const kotlinSprings = Object.entries(springs)
  .map(
    ([name, s]) =>
      `    /** stiffness ${s.stiffness} · damping ${s.damping} · mass ${s.mass} in the web. */\n` +
      `    val ${name} = SpringSpec(${s.stiffness}f, ${dampingRatio(s)}f, ${s.mass}f)`,
  )
  .join('\n');

const swiftSprings = Object.entries(springs)
  .map(
    ([name, s]) =>
      `    /// stiffness ${s.stiffness} · damping ${s.damping} · mass ${s.mass}\n` +
      `    public static let ${name} = SpringSpec(mass: ${s.mass}, stiffness: ${s.stiffness}, damping: ${s.damping})`,
  )
  .join('\n');

// ── the type scale ──────────────────────────────────────────────────────────
//
// `.t-*` rules are the ladder. A `clamp()` yields its minimum (the phone step),
// `line-height` becomes a multiplier, and a 640px media override is ignored for
// the same reason.

const length = (raw, fontSize) => {
  const value = raw.trim();
  const clamp = value.match(/^clamp\(([^)]+)\)$/);
  if (clamp) return Number(clamp[1].split(',')[0].trim().replace(/px$/, ''));
  if (value.endsWith('px')) return Number(value.replace(/px$/, ''));
  // A unitless line-height is already a multiplier.
  const asNumber = Number(value);
  if (!Number.isNaN(asNumber) && !value.includes('em')) return asNumber;
  return null;
};

const typography = {};
for (const match of css.matchAll(/\n  \.(t-[a-z-]+)\s*\{([^}]*)\}/g)) {
  const [, className, body] = match;
  const rawSize = (body.match(/font-size:\s*([^;]+);/) ?? [])[1];
  if (rawSize === undefined) continue;
  const sizePx = length(rawSize);
  if (sizePx === null || Number.isNaN(sizePx)) continue;
  const weight = Number(((body.match(/font-weight:\s*(\d+);/) ?? [])[1] ?? '400').trim());
  const rawLine = (body.match(/line-height:\s*([^;]+);/) ?? [])[1];
  let lineHeight = 1.3;
  if (rawLine) {
    const parsed = length(rawLine, sizePx);
    if (parsed !== null) {
      // A px line-height is a multiplier once divided by the size.
      lineHeight = rawLine.trim().endsWith('px') ? Number((parsed / sizePx).toFixed(3)) : parsed;
    }
  }
  const rawTracking = (body.match(/letter-spacing:\s*([^;]+);/) ?? [])[1];
  const tracking = rawTracking ? Number(rawTracking.replace(/em$/, '').trim()) : 0;
  const uppercase = /text-transform:\s*uppercase;/.test(body);
  typography[className.replace('t-', '').replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = {
    className,
    size: sizePx,
    weight,
    lineHeight,
    tracking,
    uppercase,
  };
}
if (Object.keys(typography).length < 8) {
  throw new Error(`Only parsed ${Object.keys(typography).length} type tokens; the ladder changed shape.`);
}

// ── control metrics ─────────────────────────────────────────────────────────
//
// Four numbers the controls are built from, read from the rules themselves so a
// change in the stylesheet reaches both apps: the pill, the minimum tap target,
// and the two flat bottom lips.

const metric = (pattern, label) => {
  const value = (css.match(pattern) ?? [])[1];
  if (value === undefined) throw new Error(`Could not read ${label} from ${CSS}.`);
  return Number(value);
};
const metrics = {
  // The phone step: `.btn` is 44px and grows to 48px only at 640px and up.
  buttonMinHeight: metric(/\.btn \{[^}]*min-height:\s*(\d+)px;/s, '.btn min-height'),
  buttonPadding: metric(/\.btn \{[^}]*padding:\s*0 (\d+)px;/s, '.btn padding'),
  optionMinHeight: metric(/\.option \{[^}]*min-height:\s*(\d+)px;/s, '.option min-height'),
  inputMinHeight: metric(/\.input \{[^}]*min-height:\s*(\d+)px;/s, '.input min-height'),
  inputBorder: metric(/\.input \{[^}]*border:\s*(\d+)px solid/s, '.input border'),
  meterHeight: metric(/\.meter \{[^}]*height:\s*(\d+)px;/s, '.meter height'),
  chipMinHeight: metric(/\.chip \{[^}]*min-height:\s*(\d+)px;/s, '.chip min-height'),
  pillOffset: metric(/\.btn-primary \{[^}]*box-shadow:\s*0 (\d+)px 0 0/s, '.btn-primary lip'),
  goodLipOffset: metric(/\.btn-good \{[^}]*box-shadow:\s*0 (\d+)px 0 0/s, '.btn-good lip'),
  iconMinHeight: metric(/\.btn-icon \{[^}]*min-height:\s*(\d+)px;/s, '.btn-icon min-height'),
  navHeight: 64, // the bottom bar's 64px slot height, `.h-16` in BottomNav
};

// ── emit ────────────────────────────────────────────────────────────────────

const header = (comment) =>
  `// GENERATED by scripts/native/make-theme.mjs from ${CSS} and ${MOTION}. Do not\n// edit: re-run the script instead.\n${comment}`;

const warn = `//\n// Two documents own that file, and the reconciliation between them is the\n// judgement call it documents: Uber owns the chrome (the ink/canvas duet, the\n// grayscale ramp, the pill, the type ladder), Duolingo owns the state (the\n// tactile lip under every button, the uppercase tracked label, and colour used\n// only where the game needs it — streak, correct, gold). Green is the one\n// control that is not navigation: the button you press inside a study session.\n`;

const kotlin = `package app.revisio.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

${header(warn)}
/** The palette, in both polarities. Light and dark are the same system flipped. */
data class RevisioColors(
${ROLES.map(([, name]) => `    val ${name}: Color,`).join('\n')}
)

private fun hex(value: Long) = Color(value)

val LightColors = RevisioColors(
${ROLES.map(([, name]) => `    ${name} = hex(${colors[name].light.argb}L),`).join('\n')}
)

val DarkColors = RevisioColors(
${ROLES.map(([, name]) => `    ${name} = hex(${colors[name].dark.argb}L),`).join('\n')}
)

/** The radius ladder, and the pill that is the only interactive shape. */
object Radius {
${Object.entries(radii)
  .map(([name, value]) => `    val ${radiusIdentifier(name)}: Dp = ${value}.dp`)
  .join('\n')}
    val base: Dp = ${baseRadius}.dp
}

/** The three documented drops. Cards stay flat: elevation is a colour change. */
object Shadows {
${Object.entries(shadows)
  .map(
    ([name, s]) =>
      `    /** x ${s.x} · y ${s.y} · blur ${s.blur} · spread ${s.spread} · alpha ${s.alpha} */\n    val ${name} = ShadowSpec(${s.x}f, ${s.y}f, ${s.blur}f, ${s.spread}f, ${s.alpha}f)`,
  )
  .join('\n')}
}

data class ShadowSpec(
    val x: Float,
    val y: Float,
    val blur: Float,
    val spread: Float,
    val alpha: Float,
)

/** The two curves the whole app animates on. */
object Easing {
${Object.entries(easing)
  .map(([name, points]) => `    val ${name} = CubicBezier(${points.map((p) => `${p}f`).join(', ')})`)
  .join('\n')}
}

data class CubicBezier(val x1: Float, val y1: Float, val x2: Float, val y2: Float)

/** The same curve as a Compose \`Easing\`, for a \`tween()\`. */
val CubicBezier.easing: androidx.compose.animation.core.Easing
    get() = androidx.compose.animation.core.CubicBezierEasing(x1, y1, x2, y2)

/**
 * A spring, as the web states it, with the conversion Compose needs.
 *
 * Compose's spring has no mass term and describes damping as a ratio of
 * critical, so \`mass\` is folded into the ratio rather than dropped — the motion
 * that comes out is the browser's, not a stand-in chosen by hand.
 */
data class SpringSpec(val stiffness: Float, val dampingRatio: Float, val mass: Float) {
    /**
     * The animation this spring describes, for any \`animate*AsState\` call —
     * and for the transitions, which ask for a \`FiniteAnimationSpec\`.
     */
    fun <T> spec(visibilityThreshold: T? = null): androidx.compose.animation.core.FiniteAnimationSpec<T> =
        androidx.compose.animation.core.spring(
            dampingRatio = dampingRatio,
            stiffness = stiffness,
            visibilityThreshold = visibilityThreshold,
        )
}

/**
 * The motion language — \`src/lib/motion.ts\`, the single owner of every
 * duration, curve, spring and gesture in the product.
 *
 * The stylesheet carries two curves and nothing else, which is why this port
 * animated on a hand-picked 90ms tween while the browser sprang. Six springs,
 * five durations and the four entrance gestures are read from their owner here
 * instead, so a press or a panel on a phone is the motion the website runs.
 */
object Motion {
    /** Seconds on the web; milliseconds here. */
    object Durations {
${Object.entries(durations)
  .map(([name, seconds]) => `        const val ${name} = ${ms(seconds)}`)
  .join('\n')}
    }

    /** The easing curves, as the browser states them. */
    object Curves {
${Object.entries(curves)
  .map(
    ([name, p]) =>
      `        val ${curveName(name)} = CubicBezier(${p[0]}f, ${p[1]}f, ${p[2]}f, ${p[3]}f)`,
  )
  .join('\n')}
    }

    /**
     * The pairs the web actually runs, so no screen has to remember which curve
     * goes with which duration.
     */
    val enter: androidx.compose.animation.core.AnimationSpec<Float> =
        androidx.compose.animation.core.tween(
            durationMillis = Durations.base,
            easing = Curves.out.easing,
        )
    val reveal: androidx.compose.animation.core.AnimationSpec<Float> =
        androidx.compose.animation.core.tween(
            durationMillis = Durations.reveal,
            easing = Curves.out.easing,
        )
    val exit: androidx.compose.animation.core.AnimationSpec<Float> =
        androidx.compose.animation.core.tween(
            durationMillis = Durations.quick,
            easing = Curves.easeIn.easing,
        )

    /** By intent: \`settle\` is the workhorse, \`press\` has teeth, \`pop\` bounces. */
    object Springs {
${kotlinSprings}
    }

    /** Press: the spec's \`scale(0.95)\`, which every tappable surface uses. */
    const val pressScale = ${motions.pressScale}f
    const val hoverScale = ${motions.hoverScale}f

    /** Entrances: rise and settle. Cards arrive at a hair under full size. */
    const val enterRise = ${motions.enterRise}f
    const val enterScale = ${motions.enterScale}f
    const val enterScaleRise = ${motions.enterScaleRise}f
    const val routeRise = ${motions.routeRise}f

    /** A rail that slides in from the side — the ladder advancing a tier. */
    const val railSlide = ${motions.railSlide}f

    /** A sheet starts this far below the screen, as a fraction of its height. */
    const val sheetTravel = ${motions.sheetTravel}f

    /** Stagger, and the cap that keeps a long list from trickling in. */
    const val staggerStep = ${ms(motions.staggerStep)}
    const val staggerChildren = ${ms(motions.staggerChildren)}
    const val listStep = ${ms(motions.listStep)}
    const val listCap = ${ms(motions.listCap)}

    /** How far above the fold a scroll reveal fires, once. */
    const val revealMargin = ${motions.revealMargin}

    /**
     * The delay before one child of a staggered list arrives.
     *
     * Capped, because \`stagger × 200 rows\` would leave the last row arriving
     * four seconds after the screen did. The cap is the web's.
     */
    fun stagger(index: Int): Int = minOf(index * listStep, listCap)
}

/**
 * The type ladder. Sizes are the phone step of a responsive scale, which is what
 * the browser shows at the same width.
 */
data class TypeToken(
    val size: Int,
    val weight: FontWeight,
    val lineHeight: Float,
    val tracking: Float,
    val uppercase: Boolean,
)

object Type {
${Object.entries(typography)
  .map(
    ([name, t]) =>
      `    /** \`${t.className}\` */\n    val ${name} = TypeToken(${t.size}, FontWeight(${t.weight}), ${t.lineHeight}f, ${t.tracking}f, ${t.uppercase})`,
  )
  .join('\n')}
}

/** Geometry the controls are built from, so a tap target is never improvised. */
object Metrics {
${Object.entries(metrics)
  .map(([name, value]) => `    val ${name} = ${value}.dp`)
  .join('\n')}
}
`;

const swiftWeight = (weight) => {
  const map = { 400: '.regular', 500: '.medium', 600: '.semibold', 700: '.bold' };
  if (!map[weight]) throw new Error(`No SwiftUI weight for ${weight}.`);
  return map[weight];
};

/**
 * Join entries with newlines, never leaving a comma on the last one.
 *
 * Swift only gained trailing commas in argument lists in 6.1 (SE-0439), so a
 * `RevisioColors(a: …, b: …, )` compiles on a developer's new Xcode and fails
 * the release on the runner's older toolchain — which is exactly the failure
 * this generator hit on its first published run. The generator does not write
 * one, and `assertNoTrailingComma` below refuses to emit one if it ever does.
 */
const joinEntries = (entries) => entries.join('\n').replace(/,\s*$/, '');

/**
 * Fail loudly here rather than silently on a runner with an older Swift.
 *
 * `,\s*)` is legal from Swift 6.1 and a syntax error before it, so the one
 * environment that cannot see the difference is the one that publishes.
 */
const assertNoTrailingComma = (source, label) => {
  const lines = source.split('\n');
  const offenders = [];
  lines.forEach((line, index) => {
    if (!/,\s*$/.test(line)) return;
    let next = index + 1;
    while (next < lines.length && lines[next].trim() === '') next += 1;
    if (next < lines.length && /^\s*\)/.test(lines[next])) offenders.push(index + 1);
  });
  for (const [, match] of source.matchAll(/,([ \t]*)\)/g)) {
    offenders.push(source.slice(0, match.index).split('\n').length);
  }
  if (offenders.length > 0) {
    throw new Error(
      `${label}: trailing comma before ')' on line(s) ${[...new Set(offenders)].join(', ')} — ` +
        'legal only from Swift 6.1, so it would break the release build',
    );
  }
};

// No `import UIKit`: every colour is built by SwiftUI's own `Color(hex:)`, so
// the theme compiles wherever SwiftUI does — including the macOS host that runs
// `swift test`, which is where this layer gets compiled on every push.
const swift = `import SwiftUI

${header(warn)}
/// The palette, in both polarities — the same system flipped, resolved live so a
/// device changing appearance mid-session repaints rather than restarting.
public struct RevisioColors: Sendable {
${ROLES.map(([, name]) => `    public let ${name}: Color`).join('\n')}

    public static let light = RevisioColors(
${joinEntries(ROLES.map(([, name]) => `        ${name}: Color(hex: ${colors[name].light.rgba}),`))}
    )

    public static let dark = RevisioColors(
${joinEntries(ROLES.map(([, name]) => `        ${name}: Color(hex: ${colors[name].dark.rgba}),`))}
    )

    public static func forScheme(_ scheme: ColorScheme) -> RevisioColors {
        scheme == .dark ? .dark : .light
    }
}

public extension Color {
    /// 0xRRGGBBAA, the same encoding the Kotlin side uses.
    init(hex: UInt64) {
        let red = Double((hex >> 24) & 0xFF) / 255
        let green = Double((hex >> 16) & 0xFF) / 255
        let blue = Double((hex >> 8) & 0xFF) / 255
        let alpha = Double(hex & 0xFF) / 255
        self.init(.sRGB, red: red, green: green, blue: blue, opacity: alpha)
    }
}

/// The radius ladder, and the pill that is the only interactive shape.
public enum Radius {
${Object.entries(radii)
  .map(([name, value]) => `    public static let ${radiusIdentifier(name)}: CGFloat = ${value}`)
  .join('\n')}
    public static let base: CGFloat = ${baseRadius}
}

/// The three documented drops. Cards stay flat: elevation is a colour change.
public struct ShadowSpec: Sendable {
    public let x: CGFloat
    public let y: CGFloat
    public let blur: CGFloat
    public let spread: CGFloat
    public let alpha: Double
}

public enum Shadows {
${Object.entries(shadows)
  .map(
    ([name, s]) =>
      `    /// x ${s.x} · y ${s.y} · blur ${s.blur} · spread ${s.spread} · alpha ${s.alpha}\n    public static let ${name} = ShadowSpec(x: ${s.x}, y: ${s.y}, blur: ${s.blur}, spread: ${s.spread}, alpha: ${s.alpha})`,
  )
  .join('\n')}
}

/// The two curves the whole app animates on.
public enum Easing {
${Object.entries(easing)
  .map(
    ([name, points]) =>
      `    public static let ${curveName(name)} = Animation.timingCurve(${points[0]}, ${points[1]}, ${points[2]}, ${points[3]})`,
  )
  .join('\n')}
}

///
/// The motion language — \`src/lib/motion.ts\`, the single owner of every
/// duration, curve, spring and gesture in the product.
///
/// \`globals.css\` carries two curves; the springs live here, and the ports
/// animated on a hand-picked 90ms tween until they were read from this file.
/// SwiftUI's \`interpolatingSpring(mass:stiffness:damping:)\` is the web's spring
/// equation written out, so these are the numbers and not a translation of them.
///
public enum Motion {
    /// Seconds, as the web authors them.
    public enum Durations {
${Object.entries(durations)
  .map(([name, seconds]) => `        public static let ${name}: Double = ${seconds}`)
  .join('\n')}
    }

    /// A curve at whatever duration you are about to run it for.
    public enum Curves {
${Object.entries(curves)
  .map(
    ([name, p]) =>
      `        public static func ${curveName(name)}(_ duration: Double) -> Animation {\n` +
      `            .timingCurve(${p[0]}, ${p[1]}, ${p[2]}, ${p[3]}, duration: duration)\n        }`,
  )
  .join('\n')}
    }

    /// The pairs the web actually runs, ready to hand to \`withAnimation\`.
    public enum Enter {
        public static let base = Curves.out(Durations.base)
        public static let reveal = Curves.out(Durations.reveal)
    }

    public enum Exit {
        public static let quick = Curves.easeIn(Durations.quick)
        public static let instant = Curves.easeIn(Durations.instant)
    }

    /// A spring as the web states it. \`.animation\` is the same spring in SwiftUI.
    public struct SpringSpec: Sendable {
        public let mass: Double
        public let stiffness: Double
        public let damping: Double

        public var animation: Animation {
            .interpolatingSpring(mass: mass, stiffness: stiffness, damping: damping)
        }
    }

    /// By intent: \`settle\` is the workhorse, \`press\` has teeth, \`pop\` bounces.
    public enum Springs {
${swiftSprings}
    }

    /// Press: the spec's \`scale(0.95)\`, which every tappable surface uses.
    public static let pressScale: CGFloat = ${motions.pressScale}
    public static let hoverScale: CGFloat = ${motions.hoverScale}

    /// Entrances: rise and settle. Cards arrive at a hair under full size.
    public static let enterRise: CGFloat = ${motions.enterRise}
    public static let enterScale: CGFloat = ${motions.enterScale}
    public static let enterScaleRise: CGFloat = ${motions.enterScaleRise}
    public static let routeRise: CGFloat = ${motions.routeRise}

    /// A rail that slides in from the side.
    public static let railSlide: CGFloat = ${motions.railSlide}

    /// A sheet starts this far below the screen, as a fraction of its height.
    public static let sheetTravel: CGFloat = ${motions.sheetTravel}

    /// Stagger, and the cap that keeps a long list from trickling in.
    public static let staggerStep: Double = ${motions.staggerStep}
    public static let staggerChildren: Double = ${motions.staggerChildren}
    public static let listStep: Double = ${motions.listStep}
    public static let listCap: Double = ${motions.listCap}

    /// How far above the fold a scroll reveal fires, once.
    public static let revealMargin: CGFloat = ${motions.revealMargin}

    /// The delay before one child of a staggered list arrives, capped as above.
    public static func stagger(_ index: Int) -> Double {
        min(Double(index) * listStep, listCap)
    }
}

/** The type ladder, as the phone step of a responsive scale. */
public struct TypeToken: Sendable {
    public let size: CGFloat
    public let weight: Font.Weight
    public let lineHeight: CGFloat
    public let tracking: CGFloat
    public let uppercase: Bool

    public var font: Font {
        .system(size: size, weight: weight)
    }

    /// Tracking is authored in em; SwiftUI wants points.
    public var trackingPoints: CGFloat { tracking * size }

    /// The label treatment: uppercased and letterspaced. Never applied to prose.
    public func text(_ string: String) -> String {
        uppercase ? string.uppercased() : string
    }
}

public enum Type {
${Object.entries(typography)
  .map(
    ([name, t]) =>
      `    /// \`${t.className}\`\n    public static let ${name} = TypeToken(size: ${t.size}, weight: ${swiftWeight(t.weight)}, lineHeight: ${t.lineHeight}, tracking: ${t.tracking}, uppercase: ${t.uppercase})`,
  )
  .join('\n')}
}

/** Geometry the controls are built from, so a tap target is never improvised. */
public enum Metrics {
${Object.entries(metrics)
  .map(([name, value]) => `    public static let ${name}: CGFloat = ${value}`)
  .join('\n')}
}
`;

assertNoTrailingComma(swift, 'Theme.swift');

await writeFile(
  path.join(root, 'mobile/android/app/src/main/kotlin/app/revisio/ui/Theme.kt'),
  kotlin,
);
await writeFile(path.join(root, 'mobile/ios/Sources/Revisio/Theme.swift'), swift);

console.log(
  `theme: ${ROLES.length} colours × 2 schemes, ${Object.keys(radii).length} radii, ` +
    `${Object.keys(typography).length} type tokens, ${Object.keys(easing).length} curves ` +
    `→ Theme.kt, Theme.swift`,
);
console.log(
  `motion: ${Object.keys(springs).length} springs, ${Object.keys(durations).length} durations, ` +
    `${Object.keys(curves).length} curves, ${Object.keys(motions).length - 0} gestures ` +
    `→ Motion in Theme.kt, Theme.swift`,
);
