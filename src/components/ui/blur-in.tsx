'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

// Magic UI BlurIn — text resolves from a blur. Crisp and short (0.5s) so it
// feels like focus pulling into place, not a fade.

export function BlurIn({
  children,
  className,
  delay = 0,
  duration = 0.5,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
}) {
  return (
    <motion.span
      initial={{ opacity: 0, filter: 'blur(10px)', y: 6 }}
      animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
      transition={{ duration, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
      className={cn('inline-block', className)}
    >
      {children}
    </motion.span>
  );
}
