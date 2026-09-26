'use client';

import { useEffect, useState } from 'react';
import { applyNativeChrome, isNative } from '@/lib/native';

/**
 * The app's only native-aware surface.
 *
 * Renders nothing on the web, and inside the shell it applies the native chrome
 * and shows one honest line when the device is offline — because the app is a
 * thin client, and a review that looks saved when there is no connection is the
 * one lie worth preventing.
 */
export default function NativeShell() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!isNative()) return;
    let dispose: () => void = () => undefined;
    let cancelled = false;
    void applyNativeChrome({
      onConnectivityChange: (online) => {
        if (!cancelled) setOffline(!online);
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
      <span>You&apos;re offline — reviews need a connection.</span>
    </div>
  );
}
