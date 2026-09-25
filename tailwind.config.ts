import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Every colour is a DESIGN.md token, wired to CSS variables so the
        // light/dark swap — and the `.on-tile` remap inside a dark band —
        // happens in one place (src/app/globals.css). Never inline a hex.
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        shell: 'rgb(var(--c-shell) / <alpha-value>)',
        panel: 'rgb(var(--c-panel) / <alpha-value>)',
        pearl: 'rgb(var(--c-pearl) / <alpha-value>)',
        raise: 'rgb(var(--c-raise) / <alpha-value>)',
        sink: 'rgb(var(--c-sink) / <alpha-value>)',
        edge: 'rgb(var(--c-edge) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        soft: 'rgb(var(--c-soft) / <alpha-value>)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        'accent-focus': 'rgb(var(--c-accent-focus) / <alpha-value>)',
        'accent-ink': 'rgb(var(--c-accent-ink) / <alpha-value>)',
        // Status semantics only — correct/incorrect feedback. Never used for
        // anything that is merely positive; that is what the accent is for.
        good: 'rgb(var(--c-good) / <alpha-value>)',
        bad: 'rgb(var(--c-bad) / <alpha-value>)',
        nav: 'rgb(var(--c-nav) / <alpha-value>)',
        // The near-black tile family, for bands that stay dark in both themes.
        tile: 'rgb(var(--c-tile) / <alpha-value>)',
        'tile-2': 'rgb(var(--c-tile-2) / <alpha-value>)',
        'tile-3': 'rgb(var(--c-tile-3) / <alpha-value>)',
      },
      fontFamily: {
        display: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Inter', 'system-ui', 'sans-serif'],
        body: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Inter', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        tightest: '-0.022em',
        tight2: '-0.014em',
      },
      // Exactly one shadow exists in the system, and it belongs to media.
      boxShadow: {
        media: 'rgba(0, 0, 0, 0.22) 3px 5px 30px 0',
      },
      transitionTimingFunction: {
        apple: 'cubic-bezier(0.21, 0.47, 0.32, 0.98)',
      },
      // Spec spacing: 4 / 8 / 12 / 17 / 24 / 32 / 48 / 80.
      spacing: {
        17: '17px',
        section: '80px',
      },
      maxWidth: {
        // The spec's two content locks.
        measure: '980px',
        wide: '1440px',
      },
      // NB: the spec's radius ladder (5/8/11/18/pill) is *not* mapped onto
      // Tailwind's `rounded-*` scale on purpose — overriding `lg`/`md` would
      // silently change every existing rounded utility in the app. Radii are
      // written as explicit arbitrary values (`rounded-[18px]`, `rounded-[11px]`)
      // so each one is visibly a choice from the ladder.
    },
  },
  plugins: [],
};

export default config;
