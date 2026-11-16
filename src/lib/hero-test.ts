// A/B hero headline test (#23) — docs/MARKETING-AUDIT-2026-11-16.md item 4.
//
// Three H1 directions: the current mechanism-first line is the control, the
// audit's outcome-led and wedge-led candidates are the challengers. The
// variant is assigned once per browser (localStorage, same device-local
// pattern as the session prefs) so a returning visitor always sees the same
// headline and every funnel event they emit carries the same label.
//
// `getHeroVariant` assigns on first call — only the landing hero should call
// it. `storedHeroVariant` never assigns: signup events fired by someone who
// never saw the hero report 'none' rather than a variant they were never
// shown, which would silently pollute the readout.

export const HERO_VARIANTS = ['control', 'outcome', 'wedge'] as const;
export type HeroVariant = (typeof HERO_VARIANTS)[number];

const KEY = 'revisio.heroVariant';

function read(): HeroVariant | null {
  try {
    const stored = localStorage.getItem(KEY);
    return stored && (HERO_VARIANTS as readonly string[]).includes(stored)
      ? (stored as HeroVariant)
      : null;
  } catch {
    return null;
  }
}

/** Assign (once) and return this visitor's hero variant. Landing page only. */
export function getHeroVariant(): HeroVariant {
  if (typeof window === 'undefined') return 'control';
  const existing = read();
  if (existing) return existing;
  const pick = HERO_VARIANTS[Math.floor(Math.random() * HERO_VARIANTS.length)];
  try {
    localStorage.setItem(KEY, pick);
  } catch {
    // Storage denied — the pick still holds for this page view.
  }
  return pick;
}

/** The variant this visitor was actually shown, or 'none' if they never saw
 *  the hero. Safe to spread into any funnel event's props. */
export function heroProps(): { hero: HeroVariant | 'none' } {
  return { hero: typeof window === 'undefined' ? 'none' : (read() ?? 'none') };
}
