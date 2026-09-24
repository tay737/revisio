'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { applyTheme, flipTheme, paintTheme, resolveTheme, type Theme } from '@/lib/theme';
import { SPRING } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * Light/dark toggle. Reads and writes only through `lib/theme`, so the policy
 * (key, OS fallback, persistence) lives in exactly one place — this component
 * just renders the state.
 *
 * 44×44 by default, matching the spec's minimum touch target.
 */
export function ThemeToggle({ className }: { className?: string }) {
  // `null` until mounted: the pre-paint script already applied the theme, so we
  // render a neutral button for one frame rather than guessing and flickering.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const current = resolveTheme();
    paintTheme(current); // sync the DOM, but do not record it as a choice
    setTheme(current);
  }, []);

  const toggle = () => {
    const next = flipTheme(theme ?? resolveTheme());
    applyTheme(next);
    setTheme(next);
  };

  const label = theme === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance';
  const Glyph = theme === 'dark' ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn(
        'grid h-11 w-11 shrink-0 place-items-center rounded-full border border-edge bg-panel/60 text-muted backdrop-blur transition-colors duration-150 hover:text-ink active:scale-95',
        className,
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme ?? 'pending'}
          initial={{ opacity: 0, rotate: -45, scale: 0.7 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 45, scale: 0.7 }}
          transition={SPRING.press}
        >
          <Glyph size={18} strokeWidth={1.75} aria-hidden />
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
