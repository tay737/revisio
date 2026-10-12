'use client';

import type { ElementType } from 'react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from 'motion/react';

interface WordRotateProps {
  words: string[];
  duration?: number;
  motionProps?: unknown;
  className?: string;
  as?: 'h1' | 'p' | 'span';
}

/** Stable copy avoids unattended motion and lets each surface own its semantics. */
export function WordRotate({ words, duration = 2500, motionProps, className, as = 'h1' }: WordRotateProps) {
  const Component = as as ElementType;
  const reduceMotion = useReducedMotion();
  const stableText = words[0] ?? '';
  // A reduced-motion preference must also stop content autoplay; a stable
  // semantic renderer is safer than rotating unannounced copy.
  void duration;
  void motionProps;
  void reduceMotion;
  return <Component className={cn(className)}>{stableText}</Component>;
}
