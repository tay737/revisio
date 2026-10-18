'use client';

import { useEffect, useState } from 'react';
import { applyTheme, paintTheme, resolveTheme, type Theme } from '@/lib/theme';
import { AnimatedThemeToggler } from '@/components/ui/animated-theme-toggler';
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

  const label = theme === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance';

  // Controlled: the library animates the reveal, `lib/theme` still owns the
  // stored choice (its own localStorage write would fork the key).
  return (
    <AnimatedThemeToggler
      theme={theme ?? 'light'}
      onThemeChange={(next) => {
        applyTheme(next);
        setTheme(next);
      }}
      aria-label={label}
      title={label}
      className={cn(
        'grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border bg-card/60 text-muted-foreground backdrop-blur transition-colors duration-150 hover:text-foreground active:scale-95 [&>svg]:size-[18px] [&>svg]:stroke-[1.75]',
        className,
      )}
    />
  );
}
