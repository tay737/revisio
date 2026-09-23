'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

// Dark/light toggle — persists to localStorage, toggles the `dark` class
// (tailwind darkMode: 'class'). Respects system preference on first visit.

const KEY = 'revisio-theme';

export function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try { localStorage.setItem(KEY, theme); } catch { /* ignore */ }
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    let initial: 'light' | 'dark' = 'light';
    try {
      const saved = localStorage.getItem(KEY) as 'light' | 'dark' | null;
      if (saved === 'light' || saved === 'dark') initial = saved;
      else initial = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch { /* ignore */ }
    setTheme(initial);
    applyTheme(initial);
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  };

  return (
    <button
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`grid h-9 w-9 place-items-center rounded-full border border-edge bg-panel text-muted transition-colors hover:text-ink active:scale-95 ${className ?? ''}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ rotate: -60, opacity: 0, scale: 0.6 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          exit={{ rotate: 60, opacity: 0, scale: 0.6 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="text-sm"
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
