'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

// Magic UI GradientText — adapted to docs/DESIGN.md's single-accent rule.
// Apple forbids multi-color gradients, so this is a monochrome Action-Blue
// sheen sweeping through the text (light→accent→light), not a rainbow.

export function GradientText({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('relative inline-block', className)}>
      <span aria-hidden className="absolute inset-0 select-none">
        <motion.span
          className="bg-[linear-gradient(110deg,transparent_20%,rgb(var(--c-accent))_50%,transparent_80%)] bg-[length:250%_100%] bg-clip-text text-transparent"
          animate={{ backgroundPosition: ['200% 0', '-100% 0'] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'linear', repeatDelay: 2 }}
        >
          {children}
        </motion.span>
      </span>
      <span className="text-accent">{children}</span>
    </span>
  );
}
