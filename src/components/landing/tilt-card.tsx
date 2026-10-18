'use client';

import { useRef, type ReactNode, type PointerEvent } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';

const SPRING = { stiffness: 180, damping: 22, mass: 0.5 };

/**
 * Tilts its child toward the pointer. Mouse only: touch has no hover to aim
 * with, so a finger drag must not wobble the card.
 */
export function TiltCard({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);

  const rotateX = useSpring(useTransform(py, [0, 1], [6, -6]), SPRING);
  const rotateY = useSpring(useTransform(px, [0, 1], [-7, 7]), SPRING);

  function onMove(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'mouse' || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    px.set((e.clientX - rect.left) / rect.width);
    py.set((e.clientY - rect.top) / rect.height);
  }

  function onLeave() {
    px.set(0.5);
    py.set(0.5);
  }

  return (
    <div style={{ perspective: 1200 }} onPointerMove={onMove} onPointerLeave={onLeave}>
      <motion.div ref={ref} className={className} style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}>
        {children}
      </motion.div>
    </div>
  );
}
