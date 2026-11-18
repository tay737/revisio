/**
 * Reading preset (F4) — `prefs.readingPreset` applied as
 * `data-reading="relaxed"` on <html>. CSS-only accommodation: letter-spacing
 * and leading move on prose surfaces, sizes and families never do.
 *
 * Kept beside `lib/quiet.ts` for the same reason: one small owner of a
 * `<html>` data attribute, called from AppShell on pref arrival and from
 * Settings for the instant toggle.
 */

export type ReadingPreset = 'default' | 'relaxed';

export function applyReadingPreset(preset: ReadingPreset | undefined): void {
  if (typeof document === 'undefined') return;
  if (preset === 'relaxed') {
    document.documentElement.setAttribute('data-reading', 'relaxed');
  } else {
    document.documentElement.removeAttribute('data-reading');
  }
}
