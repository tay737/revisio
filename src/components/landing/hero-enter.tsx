'use client';

import { motion } from 'motion/react';
import { fadeUp, staggerParent } from '@/lib/motion';

/**
 * The landing page's one entrance.
 *
 * `BlurFade` is not used here on purpose: it animates `filter: blur()` on text
 * at display size, which docs/UI-SYSTEM.md §7.4 forbids (it resamples glyphs).
 * This runs transform + opacity only, and `MotionProvider` drops the transform
 * under reduced motion, so the finished composition is what a reduced-motion
 * visitor sees.
 */
export function HeroEnter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={staggerParent(0.07, 0.08)} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}

export function HeroItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={fadeUp}>
      {children}
    </motion.div>
  );
}
