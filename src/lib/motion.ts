// ── Motion language ─────────────────────────────────────────────────────────
// The single owner of every duration, easing, spring and variant in the app.
// Nothing else may hardcode a timing.
//
// The brief was "fluid, not stiff, premium". Four rules follow from it:
//
//   1. SPRING OVER TWEEN FOR ANYTHING YOU TOUCH. A linear CSS transition on a
//      button reads mechanical because it has no velocity memory. Presses,
//      shared-layout pills and counters are springs.
//   2. NEVER BLOCK THE NEXT THING. `AnimatePresence mode="wait"` makes the
//      incoming page wait for the outgoing one to finish, which inserts a dead
//      beat on every navigation — the single biggest source of "stiff" in the
//      previous pass. Routes animate IN; the outgoing view is unmounted, and a
//      hairline progress bar carries continuity instead.
//   3. TRANSFORM + OPACITY ONLY. Never animate `filter: blur()` on text at
//      size (it resamples glyphs and reads soft), never animate `width`.
//   4. EXITS ARE FASTER THAN ENTRANCES. Leaving is not a performance.

import type { Transition, Variants } from 'motion/react';

type Cubic = [number, number, number, number];

/** Easings. `out` is the decelerate used for entrances; `swift` exits. */
export const EASE = {
  out: [0.22, 1, 0.36, 1] as Cubic,
  outSoft: [0.21, 0.47, 0.32, 0.98] as Cubic,
  inOut: [0.65, 0, 0.35, 1] as Cubic,
  in: [0.4, 0, 1, 1] as Cubic,
  linear: 'linear' as const,
};

/** Durations (seconds). Entrances quick; exits quicker. */
export const DUR = {
  instant: 0.12,
  quick: 0.18,
  base: 0.3,
  slow: 0.46,
  reveal: 0.6,
} as const;

/** Springs, by intent. `settle` is the workhorse; `press` has teeth. */
export const SPRING = {
  /** Button / chip / tile press — the system-wide scale(0.95) micro-interaction. */
  press: { type: 'spring', stiffness: 640, damping: 30, mass: 0.5 } as Transition,
  /** Shared-layout pills that travel between positions (nav, segmented control). */
  layout: { type: 'spring', stiffness: 480, damping: 38, mass: 0.75 } as Transition,
  /** Cards and sheets arriving — decisive, a hair of overshoot. */
  settle: { type: 'spring', stiffness: 300, damping: 28, mass: 0.85 } as Transition,
  /** Progress meters and counters — smooth, no wobble. */
  meter: { type: 'spring', stiffness: 150, damping: 26, mass: 1 } as Transition,
  /** Bottom sheets / expansion panels. */
  soft: { type: 'spring', stiffness: 260, damping: 30, mass: 0.9 } as Transition,
  /** Rank crest flips, badge pops. */
  pop: { type: 'spring', stiffness: 420, damping: 22, mass: 0.7 } as Transition,
} as const;

export const transition = {
  base: { duration: DUR.base, ease: EASE.out } as Transition,
  quick: { duration: DUR.quick, ease: EASE.out } as Transition,
  reveal: { duration: DUR.reveal, ease: EASE.out } as Transition,
  exit: { duration: DUR.quick, ease: EASE.in } as Transition,
} as const;

// ── Interaction gestures ────────────────────────────────────────────────────

/** Press: the spec's `transform: scale(0.95)` as a spring. */
export const press = {
  whileTap: { scale: 0.95 },
  whileHover: { scale: 1.015 },
} as const;

/** A card that lifts a hair under the pointer. Transform only, never shadow. */
export const lift = {
  whileHover: { y: -2 },
  whileTap: { scale: 0.99 },
  transition: SPRING.settle,
} as const;

// ── Entrances ───────────────────────────────────────────────────────────────

/** Entrance: rise + settle. Lists and page bodies. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: transition.base },
};

/** Entrance: scale + settle. Cards, badges, crests. */
export const fadeScale: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 8 },
  show: { opacity: 1, scale: 1, y: 0, transition: SPRING.settle },
};

/** Parent that paces its children. Pair with `fadeUp`/`fadeScale` items. */
export const staggerParent = (stagger = 0.05, delayChildren = 0.04): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren } },
});

/**
 * Route-change choreography. Entrance only — no `exit`. See rule 2 at the top:
 * a route that waits for its predecessor to leave is what makes an app feel
 * like a slideshow instead of an instrument.
 */
export const routeVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: DUR.base, ease: EASE.out } },
};

/** Kept as an alias so older call sites keep working. */
export const pageVariants = routeVariants;

/** Bottom sheet + its scrim. */
export const sheetVariants: Variants = {
  hidden: { y: '102%' },
  show: { y: 0, transition: SPRING.soft },
  exit: { y: '102%', transition: { duration: DUR.quick, ease: EASE.in } },
};

export const scrimVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: DUR.quick, ease: EASE.out } },
  exit: { opacity: 0, transition: { duration: DUR.instant, ease: EASE.in } },
};

/** Horizontal rail slide (rank ladder advancing a tier). */
export const railVariants: Variants = {
  enter: (dir: number) => ({ x: dir > 0 ? 32 : -32, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: SPRING.settle },
  exit: (dir: number) => ({ x: dir > 0 ? -32 : 32, opacity: 0, transition: transition.quick }),
};

/** Scroll-reveal viewport: fire once, slightly before the element is centred. */
export const REVEAL_VIEWPORT = { once: true, margin: '-80px' } as const;

/** Deterministic stagger delay for a hand-indexed child. */
export function delayFor(index: number, step = 0.05): number {
  return index * step;
}

/** A stagger that stays snappy no matter how long the list is. */
export function cappedDelay(index: number, step = 0.035, cap = 0.32): number {
  return Math.min(index * step, cap);
}
