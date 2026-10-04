'use client';

import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { SPRING, transition } from '@/lib/motion';
import { crestFor, tierColor, type Rank } from '@/domain/ranked';

/**
 * The rank crest.
 *
 * Rank is the loudest thing on the Progress page, so the crest carries the tier
 * twice over. **Hue** is the metal — bronze through rose-Legend, from
 * `--tier-*`, and it is the reason a thirty-rung ladder reads as a ladder
 * rather than as a strip of identical shields. **Geometry** is the belt-and-
 * braces half, and it is not a fallback:
 *
 *   • chevrons in the shield — 1 at Bronze, 5 at Legend. Military rank stripes.
 *   • division dots beneath them — III is one dot, I is three.
 *   • dial ticks around the ring — 6 at Bronze, 24 at Legend.
 *   • the ring itself fills with division progress in the tier's own metal.
 *
 * Geometry alone is enough to place the tier on the rail, in greyscale and for
 * a colour-blind reader; the metal is what makes it feel like a prize. Rungs the
 * learner has not reached drop to `muted`, so "yours" and "not yet" stay
 * legible side by side on a rail of thirty.
 */
export function RankCrest({
  rank,
  size = 88,
  showProgress = true,
  muted = false,
  className,
  animate = true,
}: {
  rank: Pick<Rank, 'tier' | 'division' | 'index' | 'percent' | 'label'>;
  size?: number;
  showProgress?: boolean;
  /** Rungs the learner has not reached: everything renders in `muted`. */
  muted?: boolean;
  className?: string;
  animate?: boolean;
}) {
  const spec = crestFor(rank);
  // The metal, unless this is a rung nobody has reached yet — in which case the
  // whole crest drops to muted marks, which is the one colour job left to the
  // plain text token.
  const markStyle = muted ? undefined : { color: tierColor(rank.tier) };
  const markTone = muted ? 'text-muted-foreground/45' : '';

  // Dial arc maths. r=45.5 with a 3px stroke sits inside a 100-unit box.
  const R = 45.5;
  const CIRC = 2 * Math.PI * R;
  const progress = Math.max(0, Math.min(100, rank.percent ?? 0));

  // Chevron stack, centred in the shield's wide upper body.
  const ridgeGap = 7.5;
  const ridgeTop = 48 - ((spec.ridges - 1) * ridgeGap) / 2;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={cn('shrink-0 overflow-visible', className)}
      role="img"
      aria-label={`Rank ${rank.label}`}
    >
      {/* Dial ticks — the mechanism. Longer with every tier, and washed in the
          metal at low opacity so the dial belongs to the same badge as the
          shield rather than sitting behind it in grey. */}
      <g
        className={muted ? 'text-muted-foreground/30' : undefined}
        style={muted ? undefined : { color: tierColor(rank.tier), opacity: 0.32 }}
      >
        {Array.from({ length: spec.segments }).map((_, i) => {
          const angle = (i / spec.segments) * Math.PI * 2 - Math.PI / 2;
          const x1 = 50 + Math.cos(angle) * 40;
          const y1 = 50 + Math.sin(angle) * 40;
          const x2 = 50 + Math.cos(angle) * 44;
          const y2 = 50 + Math.sin(angle) * 44;
          return (
            <motion.line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              initial={animate ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              transition={{ ...transition.quick, delay: animate ? Math.min(i * 0.012, 0.2) : 0 }}
            />
          );
        })}
      </g>

      {/* Progress ring — division progress. The only place the accent sweeps. */}
      {showProgress && (
        <>
          <circle cx={50} cy={50} r={R} fill="none" stroke="currentColor" strokeWidth={3} className="text-border/60" />
          <g transform="rotate(-90 50 50)">
            <motion.circle
              cx={50}
              cy={50}
              r={R}
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              className={markTone}
              style={markStyle}
              strokeDasharray={CIRC}
              initial={animate ? { strokeDashoffset: CIRC } : false}
              animate={{ strokeDashoffset: CIRC * (1 - progress / 100) }}
              transition={SPRING.meter}
            />
          </g>
        </>
      )}

      {/* The shield. Outline is ink, interior is the surface it sits on. */}
      <path
        d="M22 26 H78 V50 C78 67 65 79 50 85 C35 79 22 67 22 50 Z"
        className="fill-card stroke-foreground"
        strokeWidth={2.5}
        strokeLinejoin="round"
      />

      {/* Chevrons — the tier band. */}
      <g className={markTone} style={markStyle}>
        {Array.from({ length: spec.ridges }).map((_, i) => {
          const y = ridgeTop + i * ridgeGap;
          return (
            <motion.path
              key={i}
              d={`M37 ${y} L50 ${y - 6} L63 ${y}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={2.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={animate ? { opacity: 0, scale: 0.6 } : false}
              animate={{ opacity: 1, scale: 1 }}
              style={{ transformOrigin: '50px 48px' }}
              transition={{ ...SPRING.pop, delay: animate ? 0.06 + i * 0.045 : 0 }}
            />
          );
        })}
      </g>

      {/* Division pips. */}
      <g className={markTone} style={markStyle}>
        {Array.from({ length: spec.pips }).map((_, i) => {
          const spread = 5;
          const x = 50 + (i - (spec.pips - 1) / 2) * spread;
          return (
            <motion.circle
              key={i}
              cx={x}
              cy={72}
              r={2.4}
              fill="currentColor"
              initial={animate ? { opacity: 0, scale: 0 } : false}
              animate={{ opacity: 1, scale: 1 }}
              style={{ transformOrigin: `${x}px 72px` }}
              transition={{ ...SPRING.pop, delay: animate ? 0.16 + i * 0.05 : 0 }}
            />
          );
        })}
      </g>
    </svg>
  );
}

/**
 * The compact in-row form: a small crest with the rank's name beside it.
 * Used by the lobby, the ladder and the post-session verdict.
 */
export function RankChip({
  rank,
  muted = false,
  size = 34,
  className,
}: {
  rank: Pick<Rank, 'tier' | 'division' | 'index' | 'percent' | 'label'>;
  muted?: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <RankCrest rank={rank} size={size} showProgress={false} muted={muted} animate={false} />
      <span className={cn('t-caption-s', muted ? 'text-muted-foreground' : 'text-foreground')}>{rank.label}</span>
    </span>
  );
}
