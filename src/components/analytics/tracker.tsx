'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { analyticsAllowed, onConsentChange, track } from '@/lib/analytics';

/**
 * Emits `page_view` for every client-side navigation, but only while the
 * visitor's stored choice grants the Analytics purpose. Mounts once in the
 * root layout; renders nothing.
 *
 * The first view is captured on mount (the landing page included), and the
 * effect re-runs when consent flips so a grant mid-session starts measuring
 * from the next navigation rather than retroactively.
 */
export function AnalyticsTracker() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    const fire = () => {
      if (!pathname || pathname === lastPath.current || !analyticsAllowed()) return;
      lastPath.current = pathname;
      track('page_view');
    };
    fire();
    return onConsentChange(fire);
  }, [pathname]);

  return null;
}
