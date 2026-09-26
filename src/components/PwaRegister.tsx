'use client';

import { useEffect } from 'react';
import { usesServiceWorker } from '@/lib/native';

export default function PwaRegister() {
  useEffect(() => {
    // The worker is the app's offline shell: without it a WebView with no
    // network has nothing to render and the app cannot even open. `lib/native`
    // owns that decision.
    if (usesServiceWorker() && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);
  return null;
}
