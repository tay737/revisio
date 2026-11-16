'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { track } from '@/lib/analytics';

/**
 * Landing-page CTA measurement by event delegation: one listener on the
 * wrapper catches every "Start free" / "Log in" / "Try a card" tap without
 * threading props through server-rendered links. Fires `cta_click` with the
 * link target and the section it sits in (`hero`, `how`, `rank`, `close`,
 * `nav`, or the anchor's own id). Renders nothing; analytics-gated inside
 * `track`.
 */
export function LandingCtaTracker({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const href = anchor.getAttribute('href') ?? '';
      const target = href === '/register' ? 'register' : href === '/login' ? 'login' : href === '#try' ? 'demo' : null;
      if (!target) return;
      const section = anchor.closest('[id]')?.id
        ?? (anchor.closest('header') ? 'nav' : 'close');
      track('cta_click', { target, section });
    };
    node.addEventListener('click', onClick);
    return () => node.removeEventListener('click', onClick);
  }, []);

  return <div ref={ref} className="contents">{children}</div>;
}
