import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The native shell's one source of truth.
 *
 * Revisio is a thin client: every rule (grading, scheduling, XP) lives on the
 * server, so the native apps are the *same* Next.js app rendered in a native
 * WebView with native chrome around it. That means the shell must be told which
 * deployment to load — `NATIVE_APP_URL` — and it must fail gracefully rather
 * than show a blank screen when that deployment is unreachable.
 *
 * With no `NATIVE_APP_URL` set the WebView loads the bundled `native-www`
 * shell, which explains that the app is not yet pointed at a server. That is a
 * deliberate, legible failure: an alpha build with no URL is a configuration
 * error, not a white screen.
 */
const liveUrl = process.env.NATIVE_APP_URL?.trim();
const cleartext = liveUrl?.startsWith('http://') ?? false;

const config: CapacitorConfig = {
  appId: 'app.revisio',
  appName: 'Revisio',
  webDir: 'native-www',
  server: liveUrl
    ? {
        url: liveUrl,
        // Keep the WebView on https://localhost for the bundled shell and the
        // real https origin for the live app, so cookies (the refresh token)
        // behave exactly as they do in a browser.
        androidScheme: 'https',
        iosScheme: 'https',
        cleartext,
      }
    : undefined,
  android: {
    allowMixedContent: false,
    backgroundColor: '#000000',
  },
  ios: {
    // The app draws its own tab bar; letting iOS inset the WebView keeps the
    // bottom bar above the home indicator instead of under it.
    contentInset: 'always',
    backgroundColor: '#000000',
  },
  plugins: {
    SplashScreen: {
      // The Next.js app paints its own shell; the native splash only covers the
      // gap before the first byte, so it hands over immediately.
      launchShowDuration: 600,
      backgroundColor: '#1c64f2',
      showSpinner: false,
    },
    StatusBar: {
      overlaysWebView: false,
      style: 'DARK',
    },
    Keyboard: {
      resize: 'native',
    },
  },
};

export default config;
