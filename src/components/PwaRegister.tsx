'use client';

import { useEffect } from 'react';
import { usesServiceWorker } from '@/lib/native';

export default function PwaRegister() {
  useEffect(() => {
    // Inside the native shell the app is served from the WebView's own cache
    // and the refresh token lives in a real cookie jar; a service worker would
    // add a second, conflicting cache. `lib/native` owns that decision.
    if (usesServiceWorker() && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);
  return null;
}
