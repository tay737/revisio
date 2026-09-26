'use client';

import { useEffect } from 'react';

/**
 * Register the offline shell for the *web* app.
 *
 * This used to consult `lib/native`, because the native apps were a WebView
 * around this site and needed the worker too. The native apps are now their own
 * clients — they do not load this app and never touch this worker — so the only
 * remaining question is whether the browser supports one, which it answers
 * itself.
 *
 * Note what this does *not* do: it does not decide what the app shows when the
 * network is gone. On the web that is still the service worker's cache (see
 * `public/sw.js`), and its fallback is a plain cached page, not the native
 * offline session a phone gets.
 */
export default function PwaRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);
  return null;
}
