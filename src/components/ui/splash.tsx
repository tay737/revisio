'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { DUR, EASE } from '@/lib/motion';

/**
 * The session-bootstrap splash — the only full-screen overlay left.
 *
 * It is shown while we resolve whether someone is signed in, and nowhere else.
 * Route changes no longer trigger it: a fixed-duration overlay on every
 * navigation made the app feel slower than it is, so loading is now handled by
 * each route's `loading.tsx` skeleton plus the shell's in-place page
 * transition. One loading story, not two.
 */
export function Splash({ show, label = 'Revisio' }: { show: boolean; label?: string }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[200] grid place-items-center bg-bg"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DUR.base, ease: EASE.out }}
        >
          <div className="flex w-52 flex-col items-center gap-6">
            <motion.span
              className="display-tight t-tagline text-ink"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DUR.slow, ease: EASE.out }}
            >
              {label}
            </motion.span>
            {/* one hairline bar — the spec's elevation-free progress cue */}
            <div className="meter w-full">
              <motion.div
                className="h-full w-1/3 rounded-full bg-accent"
                animate={{ x: ['-110%', '330%'] }}
                transition={{ duration: 1.1, repeat: Infinity, ease: EASE.inOut }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
