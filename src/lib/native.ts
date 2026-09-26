'use client';

// The one place that knows whether we are running inside the native shell, and
// the one place that decides what the shell changes. Nothing else in the app
// should import a Capacitor plugin: the web build must not need to know that a
// native build exists.
//
// Plugins are imported lazily so the browser bundle never carries the native
// bridge, and every native call is best-effort — a shell that fails to apply its
// chrome must still show a working app.

import { Capacitor } from '@capacitor/core';

export type NativePlatform = 'ios' | 'android' | 'web';

export function nativePlatform(): NativePlatform {
  const platform = Capacitor.getPlatform();
  return platform === 'ios' || platform === 'android' ? platform : 'web';
}

/** True only inside the iOS/Android WebView, never in a browser. */
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Whether the app should register the service worker.
 *
 * Always yes, including inside the native shell — and the shell needs it most.
 * The worker is what makes the app itself available with no network: the HTML,
 * the styles and the client bundles are served from its cache, which is what
 * lets the review screen open at all on a train. The earlier reasoning here
 * (that the WebView's own HTTP cache already did this) was wrong: an HTTP cache
 * is best-effort and cannot be relied on to boot an application.
 */
export function usesServiceWorker(): boolean {
  return true;
}

export type NativeChrome = {
  /** Called immediately and on every change: is the device online? */
  onConnectivityChange: (online: boolean) => void;
};

/**
 * Apply the native chrome and return a disposer.
 *
 * Deliberately small: a status bar that matches the app, a splash that hands
 * over as soon as the app paints, Android's hardware back button meaning
 * "go back, or leave", and connectivity the app can render. Notifications,
 * haptics and share are left to the surfaces that need them.
 */
export async function applyNativeChrome({ onConnectivityChange }: NativeChrome): Promise<() => void> {
  if (!isNative()) return () => undefined;

  const disposers: Array<() => void> = [];
  const platform = nativePlatform();

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });
    if (platform === 'android') {
      await StatusBar.setBackgroundColor({ color: '#000000' });
    }
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch {
    // A missing status bar is cosmetic; the app is still usable.
  }

  try {
    const { App } = await import('@capacitor/app');
    const handle = await App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else void App.exitApp();
    });
    disposers.push(() => void handle.remove());
  } catch {
    // Without the listener the hardware back button closes the app; acceptable.
  }

  try {
    const { Network } = await import('@capacitor/network');
    const handle = await Network.addListener('networkStatusChange', (status) => {
      onConnectivityChange(status.connected);
    });
    disposers.push(() => void handle.remove());
    onConnectivityChange((await Network.getStatus()).connected);
  } catch {
    // Web fallback: assume online. The API client already reports real failures.
    onConnectivityChange(true);
  }

  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch {
    // Some builds have no splash plugin; nothing to hide.
  }

  return () => {
    for (const dispose of disposers) dispose();
  };
}
