'use client';

import { MotionConfig } from 'framer-motion';

/**
 * One owner of motion policy for the whole app.
 *
 * `reducedMotion="user"` makes Framer Motion drop transforms (keeping opacity)
 * when the OS asks for reduced motion — so the CSS blanket rule in globals.css
 * is a belt-and-braces fallback rather than the only defence.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.26, ease: [0.21, 0.47, 0.32, 0.98] }}>
      {children}
    </MotionConfig>
  );
}
