'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { cn } from '@/lib/utils';
import { DUR, EASE, REVEAL_VIEWPORT } from '@/lib/motion';

/**
 * Magic UI's BlurFade, wired to our motion tokens.
 *
 * Magic UI's recipe animates `filter: blur()` alongside opacity and y. We keep
 * that signature but cap the blur (5px by default) and promote the layer, so
 * the text resolves *into* focus instead of smearing — "crisp" was the brief.
 * Set `blur={0}` for large blocks where the blur pass would be wasted work.
 */
export function BlurFade({
  children,
  className,
  delay = 0,
  duration = DUR.reveal,
  yOffset = 8,
  blur = 5,
  inView = false,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  yOffset?: number;
  blur?: number;
  /** Reveal when scrolled into view instead of on mount. */
  inView?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inViewNow = useInView(ref, { once: true, margin: REVEAL_VIEWPORT.margin });

  const hidden = {
    y: yOffset,
    opacity: 0,
    ...(blur > 0 ? { filter: `blur(${blur}px)` } : {}),
  };
  const shown = {
    y: 0,
    opacity: 1,
    ...(blur > 0 ? { filter: 'blur(0px)' } : {}),
  };
  const t = { duration, delay, ease: EASE.out };

  return (
    <motion.div
      ref={ref}
      className={cn(blur > 0 && '[transform:translateZ(0)]', className)}
      initial={hidden}
      animate={inView ? (inViewNow ? shown : hidden) : shown}
      transition={t}
    >
      {children}
    </motion.div>
  );
}
