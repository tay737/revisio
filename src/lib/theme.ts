// The single owner of theme policy. Both the pre-paint script and the React
// toggle read from here — no second copy of the key or the resolution rules.

export type Theme = 'light' | 'dark';

export const THEME_KEY = 'revisio-theme';

/** Stored preference wins; otherwise follow the OS. SSR-safe (defaults light). */
export function resolveTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* storage blocked (private mode) — fall through to the OS preference */
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Paint the theme onto <html> without recording a choice. */
export function paintTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
}

/**
 * Paint the theme and remember it. Split from `paintTheme` on purpose: syncing
 * on mount must not count as the user having chosen a theme, otherwise a
 * visitor who follows their OS preference gets it frozen into storage on the
 * first page view.
 */
export function applyTheme(theme: Theme): void {
  paintTheme(theme);
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
}

export function flipTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark';
}

/**
 * Runs before first paint so dark-mode users never see a white flash.
 * Kept in sync with resolveTheme by construction: `themeScript()` is generated
 * from THEME_KEY, the only other place the key appears.
 */
export function themeScript(): string {
  return `(function(){try{var t=localStorage.getItem('${THEME_KEY}');var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d){document.documentElement.classList.add('dark')}document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}})()`;
}
