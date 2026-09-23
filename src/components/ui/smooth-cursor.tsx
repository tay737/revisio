'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useSpring } from 'framer-motion';

// Magic UI SmoothCursor — a spring-following cursor dot with a trailing ring.
// Pointer-fine devices only; hidden on touch and when reduced motion is set.
// Accent ring uses the single interactive color (docs/DESIGN.md).

export function SmoothCursor() {
  const [enabled, setEnabled] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [isText, setIsText] = useState(false);
  const x = useRef(-100);
  const y = useRef(-100);

  const dotX = useSpring(0, { stiffness: 900, damping: 60, mass: 0.4 });
  const dotY = useSpring(0, { stiffness: 900, damping: 60, mass: 0.4 });
  const ringX = useSpring(0, { stiffness: 220, damping: 26, mass: 0.7 });
  const ringY = useSpring(0, { stiffness: 220, damping: 26, mass: 0.7 });

  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || reduced) return;
    setEnabled(true);

    const move = (e: MouseEvent) => {
      x.current = e.clientX;
      y.current = e.clientY;
      dotX.set(e.clientX);
      dotY.set(e.clientY);
      ringX.set(e.clientX);
      ringY.set(e.clientY);
      setVisible(true);
      const t = e.target as HTMLElement | null;
      setIsText(!!t?.closest('input, textarea, [contenteditable]'));
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
      {/* trailing ring */}
      <motion.div
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[100] hidden md:block"
        style={{ x: ringX, y: ringY, translateX: '-50%', translateY: '-50%' }}
        animate={{
          width: isText ? 4 : pressed ? 30 : 38,
          height: isText ? 4 : pressed ? 30 : 38,
          opacity: visible ? 1 : 0,
          borderRadius: 9999,
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      >
        <div className="h-full w-full rounded-full border border-accent/50" />
      </motion.div>
      {/* dot */}
      <motion.div
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[101] hidden md:block"
        style={{ x: dotX, y: dotY, translateX: '-50%', translateY: '-50%' }}
        animate={{ opacity: visible && !isText ? 1 : 0, scale: pressed ? 0.7 : 1 }}
        transition={{ duration: 0.12 }}
      >
        <div className="h-1.5 w-1.5 rounded-full bg-accent" />
      </motion.div>
    </>
  );
}
