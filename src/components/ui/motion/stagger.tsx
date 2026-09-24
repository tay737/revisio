'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { cn } from '@/lib/utils';
import { REVEAL_VIEWPORT, fadeScale, fadeUp, staggerParent } from '@/lib/motion';

/**
 * Parent/child staggering built on the shared variants in `lib/motion`.
 * Children rise together with a small offset, which is what makes a grid read
 * as one composed movement rather than a dozen unrelated entrances.
 */
export function StaggerGroup({
  children,
  className,
  stagger = 0.05,
  delayChildren = 0.04,
  inView = false,
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
  delayChildren?: number;
  /** Reveal when scrolled into view instead of on mount. */
  inView?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inViewNow = useInView(ref, { once: true, margin: REVEAL_VIEWPORT.margin });
  const show = inView ? inViewNow : true;

  return (
    <motion.div
      ref={ref}
      className={cn(className)}
      variants={staggerParent(stagger, delayChildren)}
      initial="hidden"
      animate={show ? 'show' : 'hidden'}
    >
      {children}
    </motion.div>
  );
}

/** Child of `StaggerGroup`. Inherits the parent's timing. */
export function StaggerItem({
  children,
  className,
  step = 'up',
  as = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  /** `up` rises, `scale` settles from slightly small (for cards). */
  step?: 'up' | 'scale';
  as?: 'div' | 'li' | 'section' | 'article';
}) {
  const variants = step === 'scale' ? fadeScale : fadeUp;
  if (as === 'li') return <motion.li className={cn(className)} variants={variants}>{children}</motion.li>;
  if (as === 'section') return <motion.section className={cn(className)} variants={variants}>{children}</motion.section>;
  if (as === 'article') return <motion.article className={cn(className)} variants={variants}>{children}</motion.article>;
  return <motion.div className={cn(className)} variants={variants}>{children}</motion.div>;
}
