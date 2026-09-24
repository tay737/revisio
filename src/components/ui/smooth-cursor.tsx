'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useSpring } from 'framer-motion';

/**
 * Magic UI's SmoothCursor, kept deliberately quiet.
 *
 * The native cursor stays visible — replacing it makes a form-heavy product
 * feel broken — so this is only a trailing ring plus a dot that tell you the
 * interface has weight. Springs are tight (a laggy trail reads as jank, which
 * was one of the complaints about the old motion), the ring collapses to a
 * caret over text fields, and the whole thing is off for touch and for anyone
 * who asked for reduced motion.
 */
export function SmoothCursor() {
  const [enabled, setEnabled] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [isText, setIsText] = useState(false);

  const dotX = useSpring(0, { stiffness: 1400, damping: 70, mass: 0.35 });
  const dotY = useSpring(0, { stiffness: 1400, damping: 70, mass: 0.35 });
  const ringX = useSpring(0, { stiffness: 340, damping: 30, mass: 0.6 });
  const ringY = useSpring(0, { stiffness: 340, damping: 30, mass: 0.6 });

  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || reduced) return;
    setEnabled(true);

    const move = (e: MouseEvent) => {
      dotX.set(e.clientX);
      dotY.set(e.clientY);
      ringX.set(e.clientX);
      ringY.set(e.clientY);
      setVisible(true);
      const target = e.target as HTMLElement | null;
      setIsText(!!target?.closest('input, textarea, select, [contenteditable]'));
    };
    const down = () => setPressed(true);
    const up = () => setPressed(false);
    const leave = () => setVisible(false);

    window.addEventListener('mousemove', move, { passive: true });
    window.addEventListener('mousedown', down);
    window.addEventListener('mouseup', up);
    document.documentElement.addEventListener('mouseleave', leave);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mousedown', down);
      window.removeEventListener('mouseup', up);
      document.documentElement.removeEventListener('mouseleave', leave);
    };
  }, [dotX, dotY, ringX, ringY]);

  if (!enabled) return null;

  return (
    <>
      <motion.div
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[100] hidden md:block"
        style={{ x: ringX, y: ringY, translateX: '-50%', translateY: '-50%' }}
        animate={{
          width: isText ? 2 : pressed ? 18 : 26,
          height: isText ? 16 : pressed ? 18 : 26,
          opacity: visible ? 1 : 0,
          borderRadius: isText ? 1 : 9999,
        }}
        transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      >
        <div className={`h-full w-full rounded-full border ${isText ? 'border-accent' : 'border-accent/40'}`} />
      </motion.div>
      <motion.div
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[101] hidden md:block"
        style={{ x: dotX, y: dotY, translateX: '-50%', translateY: '-50%' }}
        animate={{ opacity: visible && !isText ? 1 : 0, scale: pressed ? 0.6 : 1 }}
        transition={{ duration: 0.12 }}
      >
        <div className="h-[3px] w-[3px] rounded-full bg-accent" />
      </motion.div>
    </>
  );
}
