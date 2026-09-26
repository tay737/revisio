'use client';

import { useEffect, useState } from 'react';
import { applyNativeChrome, isNative } from '@/lib/native';
import { pendingCount } from '@/lib/offline';

/**
 * The app's only native-aware surface.
 *
 * Renders nothing on the web; inside the shell it applies the native chrome and
 * keeps one honest line about connectivity on screen. Now that a session can be
 * finished offline, that line is a *ledger*, not a refusal: it says how much
 * work is waiting on the server. Silence would be the wrong choice — the one
 * thing a learner on a train needs to know is that their answers are safe.
 */
export default function NativeShell() {
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (!isNative()) return;
    let dispose: () => void = () => undefined;
    let cancelled = false;
    void applyNativeChrome({
      onConnectivityChange: (online) => {
        if (cancelled) return;
        setOffline(!online);
        setPending(pendingCount());
      },
    }).then((cleanup) => {
      if (cancelled) cleanup();
      else dispose = cleanup;
    });
    return () => {
      cancelled = true;
      dispose();
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="native-offline" role="status" aria-live="polite">
      <span>
        {pending > 0
          ? `Offline — ${pending} ${pending === 1 ? 'review' : 'reviews'} saved, syncing when you reconnect.`
          : 'Offline — you can still review from your saved session.'}
      </span>
    </div>
  );
}
