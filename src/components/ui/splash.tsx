'use client';

import { AnimatePresence, motion } from 'framer-motion';

// Minimal splash: wordmark blur-in, one thin indeterminate bar, blur-out on
// exit. Nothing more (per request) — no spinners, no logos bouncing.

export function Splash({ show, label = 'Revisio' }: { show: boolean; label?: string }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[200] grid place-items-center bg-bg"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, filter: 'blur(12px)' }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          <div className="flex w-56 flex-col items-center gap-6">
            <motion.span
              className="display-tight text-2xl text-ink"
              initial={{ opacity: 0, filter: 'blur(14px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              transition={{ duration: 0.55, ease: [0.21, 0.47, 0.32, 0.98] }}
            >
              {label}
            </motion.span>
            <div className="h-[3px] w-full overflow-hidden rounded-full bg-edge">
              <motion.div
                className="h-full w-1/3 rounded-full bg-accent"
                animate={{ x: ['-100%', '300%'] }}
                transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
