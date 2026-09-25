'use client';

import { useEffect, useState } from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { CircleCheck, Info, Loader2, OctagonX, TriangleAlert } from 'lucide-react';
import { resolveTheme, type Theme } from '@/lib/theme';

/**
 * The toaster.
 *
 * Every action that succeeds silently is a small failure of nerve, so the app
 * has one place to say "done": saving content, clearing a queue, joining a
 * class. Sonner supplies the behaviour (stacking, swipe-to-dismiss, timers,
 * the live region) and this file supplies the design language.
 *
 * The theme comes from `lib/theme` — the app's single owner of that state — and
 * the `MutationObserver` only mirrors the class the toggle writes onto `<html>`,
 * so a toast raised right after a theme flip is already the right colour. The
 * generated version of this file read `next-themes`, which this app does not
 * use: that would have been a second, unpopulated source of theme truth.
 */
export function Toaster(props: ToasterProps) {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    setTheme(resolveTheme());
    const observer = new MutationObserver(() => setTheme(resolveTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return (
    <Sonner
      theme={theme}
      position="top-center"
      className="toaster group"
      icons={{
        success: <CircleCheck className="size-5 text-good" />,
        info: <Info className="size-5 text-muted-foreground" />,
        warning: <TriangleAlert className="size-5 text-streak" />,
        error: <OctagonX className="size-5 text-destructive" />,
        loading: <Loader2 className="size-5 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            'group toast !rounded-lg !border-border !bg-card !text-card-foreground !shadow-[var(--shadow-card)] !font-sans',
          title: '!text-[15px] !font-semibold',
          description: '!text-[14px] !text-muted-foreground',
          actionButton: '!rounded-pill !bg-primary !text-primary-foreground',
          cancelButton: '!rounded-pill !bg-secondary !text-secondary-foreground',
        },
      }}
      {...props}
    />
  );
}
