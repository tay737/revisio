import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Every colour is a DESIGN.md token, wired to CSS variables so the
        // light/dark swap happens in one place (src/app/globals.css).
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        panel: 'rgb(var(--c-panel) / <alpha-value>)',
        pearl: 'rgb(var(--c-pearl) / <alpha-value>)',
        edge: 'rgb(var(--c-edge) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        soft: 'rgb(var(--c-soft) / <alpha-value>)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        'accent-focus': 'rgb(var(--c-accent-focus) / <alpha-value>)',
        'accent-ink': 'rgb(var(--c-accent-ink) / <alpha-value>)',
        good: 'rgb(var(--c-good) / <alpha-value>)',
        bad: 'rgb(var(--c-bad) / <alpha-value>)',
        nav: 'rgb(var(--c-nav) / <alpha-value>)',
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
    },
  },
  plugins: [],
};

export default config;
