'use client';

import { useId, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { SPRING } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * The forgetting curve, made touchable.
 *
 * Recall decays exponentially: R = e^(-t / S), where t is days since the last
 * review and S is the memory's stability in days. Each review that is answered
 * well grows S, which is why the gaps between reviews widen. The demo shows
 * that loop directly: drag the slider to let time pass, then rate the recall.
 * The curve re-draws, and the next review date moves out.
 */

const MAX_DAYS = 21;
const DUE_AT = 0.8; // schedule the next review when recall falls to 80%
const W = 320;
const H = 160;
const PAD = 12;

const RATINGS = [
  { id: 'again', label: 'Forgot', factor: 0.6, tone: 'text-destructive-ink' },
  { id: 'good', label: 'Got it', factor: 2.2, tone: 'text-good-strong' },
  { id: 'easy', label: 'Instant', factor: 3.4, tone: 'text-info-ink' },
] as const;

type RatingId = (typeof RATINGS)[number]['id'];

const retention = (days: number, stability: number) => Math.exp(-days / stability);

function curvePath(stability: number): string {
  const steps = 42;
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * MAX_DAYS;
    const x = PAD + (t / MAX_DAYS) * (W - PAD * 2);
    const y = PAD + (1 - retention(t, stability)) * (H - PAD * 2);
    pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return pts.join(' ');
}

export function ForgettingCurve() {
  const [stability, setStability] = useState(2);
  const [days, setDays] = useState(0);
  const [lastRating, setLastRating] = useState<RatingId | null>(null);
  const sliderId = useId();

  const recall = retention(days, stability);
  const recallPct = Math.round(recall * 100);
  const nextDueDays = -stability * Math.log(DUE_AT);
  const isDue = recall <= DUE_AT;

  const d = useMemo(() => curvePath(stability), [stability]);
  const dotX = PAD + (days / MAX_DAYS) * (W - PAD * 2);
  const dotY = PAD + (1 - recall) * (H - PAD * 2);

  function rate(id: RatingId) {
    const r = RATINGS.find((x) => x.id === id)!;
    // A miss shrinks stability (factor < 1); a hit grows it. Never below half a day.
    setStability((s) => Math.max(0.5, s * r.factor));
    setDays(0);
    setLastRating(id);
  }

  return (
    <div className="card !p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[12px] uppercase tracking-[0.08em] text-muted-foreground">Recall now</p>
          <p className="num mt-1 text-[40px] font-bold leading-none" aria-live="polite">
            {recallPct}%
          </p>
        </div>
        <div className="text-right">
          <p className="text-[12px] uppercase tracking-[0.08em] text-muted-foreground">Next review</p>
          <p className="mt-1 text-[17px] font-semibold">
            {isDue ? 'Due now' : `In ${Math.max(1, Math.round(nextDueDays - days))} days`}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible" role="img" aria-label={`Recall is ${recallPct}% after ${days} days`}>
          {/* The 80% line: below it, a review is due. */}
          <line
            x1={PAD}
            x2={W - PAD}
            y1={PAD + (1 - DUE_AT) * (H - PAD * 2)}
            y2={PAD + (1 - DUE_AT) * (H - PAD * 2)}
            className="stroke-border-strong"
            strokeDasharray="4 4"
          />
          <text x={W - PAD} y={PAD + (1 - DUE_AT) * (H - PAD * 2) - 5} textAnchor="end" className="fill-muted-foreground text-[10px]">
            review at 80%
          </text>

          <motion.path
            d={d}
            fill="none"
            className="stroke-foreground"
            strokeWidth={2.5}
            strokeLinecap="round"
            initial={false}
            animate={{ d }}
            transition={SPRING.meter}
          />

          <motion.circle
            cx={dotX}
            cy={dotY}
            r={6}
            className={cn(isDue ? 'fill-destructive-ink' : 'fill-good-strong')}
            initial={false}
            animate={{ cx: dotX, cy: dotY }}
            transition={SPRING.meter}
          />
        </svg>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        <label htmlFor={sliderId} className="text-[14px] text-muted-foreground">
          Days since you last reviewed: <span className="num font-semibold text-foreground">{days}</span>
        </label>
      </div>
      <input
        id={sliderId}
        type="range"
        min={0}
        max={MAX_DAYS}
        step={1}
        value={days}
        onChange={(e) => setDays(Number(e.target.value))}
        className="mt-2 w-full accent-foreground"
      />

      <p className="mt-4 text-[14px] text-muted-foreground">How well did you recall it?</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {RATINGS.map((r) => (
          <motion.button
            key={r.id}
            type="button"
            onClick={() => rate(r.id)}
            whileTap={{ scale: 0.96 }}
            className={cn(
              'btn btn-secondary !h-auto flex-col !py-3 text-[14px]',
              lastRating === r.id && 'ring-2 ring-ring',
            )}
          >
            <span className={cn('font-bold', r.tone)}>{r.label}</span>
          </motion.button>
        ))}
      </div>
      <p className="mt-3 text-[12px] text-muted-foreground" aria-live="polite">
        {lastRating === null
          ? 'Drag the slider to let time pass, then rate your recall.'
          : lastRating === 'again'
            ? `Forgotten. Stability drops to ${stability.toFixed(1)} days, so it comes back sooner.`
            : `Rescheduled. Stability is now ${stability.toFixed(1)} days, so the next gap is wider.`}
      </p>
    </div>
  );
}
