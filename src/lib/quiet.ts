import { useSyncExternalStore } from 'react';

/**
 * Quiet mode (F1) — the single owner of the `data-quiet` attribute and the
 * behavioural half of stimulus suppression.
 *
 * Two channels, deliberately split:
 *
 *   - `data-quiet="true"` on <html> scopes the desaturated quiet palette in
 *     globals.css (colour is token work, so it lives CSS-side).
 *   - `useQuietMode()` lets celebration surfaces (Confetti, result numerals,
 *     crest/achievement entrances) skip their effect in JS — the DOM stays
 *     truthful for tests and screenshots; nothing is `display:none`.
 *
 * Mirrors `lib/theme.ts`: the attribute is the paint, this store is the
 * reactive read. `setQuietMode` is called from AppShell when `prefs.quietMode`
 * arrives and instantly from Settings on toggle.
 */

let quiet = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function setQuietMode(on: boolean): void {
  if (quiet === on) return;
  quiet = on;
  if (typeof document !== 'undefined') {
    if (on) document.documentElement.setAttribute('data-quiet', 'true');
    else document.documentElement.removeAttribute('data-quiet');
  }
  emit();
}

/** Non-reactive read for event handlers (ConfettiButton and friends). */
export function isQuietMode(): boolean {
  return quiet;
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function useQuietMode(): boolean {
  return useSyncExternalStore(subscribe, () => quiet, () => false);
}
