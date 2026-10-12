'use client';

import { MotionConfig } from 'motion/react';
import { createContext, useContext, useState, useSyncExternalStore } from 'react';

const subscribeToMotionPreference = (callback: () => void) => {
  if (typeof window === 'undefined') return () => undefined;
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
};

const getMotionPreference = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const getServerMotionPreference = () => false;
const MotionPreferenceContext = createContext<{ setAccountReducedMotion: (reduced: boolean) => void } | null>(null);

export function useMotionPreference() {
  const context = useContext(MotionPreferenceContext);
  if (!context) throw new Error('useMotionPreference must be used inside MotionProvider');
  return context;
}

/**
 * One owner of motion policy for the whole app.
 *
 * `reducedMotion="user"` makes Framer Motion drop transforms (keeping opacity)
 * when the OS asks for reduced motion — so the CSS blanket rule in globals.css
 * is a belt-and-braces fallback rather than the only defence.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  const [accountReducedMotion, setAccountReducedMotion] = useState(false);
  const osReducedMotion = useSyncExternalStore(subscribeToMotionPreference, getMotionPreference, getServerMotionPreference);
  const reduceMotion = osReducedMotion || accountReducedMotion;

  return (
    <MotionPreferenceContext.Provider value={{ setAccountReducedMotion }}>
      <MotionConfig
        reducedMotion={reduceMotion ? 'always' : 'user'}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.26, ease: [0.21, 0.47, 0.32, 0.98] }}
      >
        <div data-motion-preference={reduceMotion ? 'reduced' : 'full'} className="contents">
          {children}
        </div>
      </MotionConfig>
    </MotionPreferenceContext.Provider>
  );
}
