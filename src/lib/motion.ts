// Motion language — the single owner of every duration, easing and variant.
// Design brief: "sleek, crisp, smooth". Two rules follow from that:
//   1. transform + opacity only (never animate `filter`/`width` on text — it
//      resamples glyphs and reads soft instead of crisp);
//   2. short and eased-out — motion confirms an action, it never performs.
// docs/DESIGN.md documents default + pressed states only, so springs are
// tuned for a decisive press, not a bouncy hover.

import type { Transition, Variants } from 'framer-motion';

type Cubic = [number, number, number, number];

/** Easings. `out` is the Apple-ish decelerate used for entrances. */
export const EASE = {
  out: [0.21, 0.47, 0.32, 0.98] as Cubic,
  inOut: [0.65, 0, 0.35, 1] as Cubic,
  in: [0.4, 0, 1, 1] as Cubic,
  linear: 'linear' as const,
};

/** Durations (seconds). Entrances are quick; exits are quicker still. */
export const DUR = {
  instant: 0.12,
  quick: 0.18,
  base: 0.26,
  slow: 0.42,
  reveal: 0.55,
} as const;

/** Springs, by intent. */
export const SPRING = {
  /** Button / chip press — the system-wide scale(0.95) micro-interaction. */
  press: { type: 'spring', stiffness: 520, damping: 32, mass: 0.6 } as Transition,
  /** Shared-layout pills that should settle without overshoot. */
  layout: { type: 'spring', stiffness: 420, damping: 36, mass: 0.8 } as Transition,
  /** Progress meters and counters — smooth, no wobble. */
  meter: { type: 'spring', stiffness: 140, damping: 24, mass: 1 } as Transition,
  /** Sheets / expansion panels. */
  soft: { type: 'spring', stiffness: 260, damping: 28, mass: 0.9 } as Transition,
};

export const transition = {
  base: { duration: DUR.base, ease: EASE.out } as Transition,
  quick: { duration: DUR.quick, ease: EASE.out } as Transition,
  reveal: { duration: DUR.reveal, ease: EASE.out } as Transition,
} as const;

/** Entrance: rise + settle. Used for lists and page bodies. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: transition.base },
};

/** Entrance: scale + settle. Used for cards and badges. */
export const fadeScale: Variants = {
  hidden: { opacity: 0, scale: 0.97, y: 6 },
  show: { opacity: 1, scale: 1, y: 0, transition: transition.base },
};

/** Parent that paces its children. Pair with `fadeUp`/`fadeScale` items. */
export const staggerParent = (stagger = 0.05, delayChildren = 0.04): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren } },
});

/** Route-change choreography for the app shell. */
export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: DUR.base, ease: EASE.out } },
  exit: { opacity: 0, y: -6, transition: { duration: DUR.quick, ease: EASE.in } },
};

/** Scroll-reveal viewport: fire once, slightly before the element is centred. */
export const REVEAL_VIEWPORT = { once: true, margin: '-80px' } as const;

/** Deterministic stagger delay for a hand-indexed child. */
export function delayFor(index: number, step = 0.05): number {
  return index * step;
}
