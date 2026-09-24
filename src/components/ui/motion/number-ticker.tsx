'use client';

import { useEffect, useRef, useState } from 'react';
import { useInView, useMotionValue, useSpring } from 'framer-motion';
import { cn } from '@/lib/utils';

function format(value: number, decimals: number, separator = true): string {
  if (!separator) return value.toFixed(decimals);
  return Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Magic UI's NumberTicker.
 *
 * A stat that counts up reads as *earned* rather than pasted. It starts at zero
 * (identical on server and client, so hydration stays clean), animates once the
 * element is in view, and skips straight to the target under reduced motion —
 * a number that jitters is worse than no animation at all.
 */
export function NumberTicker({
  value,
  decimals = 0,
  delay = 0,
  className,
  suffix,
}: {
  value: number;
  decimals?: number;
  delay?: number;
  className?: string;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { damping: 30, stiffness: 120, mass: 0.8 });
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  useEffect(() => {
    if (!inView) return;
    const id = setTimeout(() => motionValue.set(value), delay * 1000);
    return () => clearTimeout(id);
  }, [inView, value, delay, motionValue]);

  useEffect(
    () =>
      spring.on('change', (latest) => {
        if (ref.current) ref.current.textContent = format(Number(latest.toFixed(decimals)), decimals);
      }),
    [spring, decimals],
  );

  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {format(reduced ? value : 0, decimals)}
      {suffix}
    </span>
  );
}
