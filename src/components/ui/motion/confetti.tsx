'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { cn } from '@/lib/utils';

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  colour: string;
  life: number;
};

export type ConfettiHandle = {
  /** Burst from a point (fractions of the canvas, 0–1). */
  fire: (opts?: { origin?: { x: number; y: number }; count?: number; spread?: number }) => void;
};

/**
 * Magic UI's Confetti, on a canvas.
 *
 * Reserved for the two moments that have genuinely earned it: a correct answer
 * and a level-up. Under reduced motion `fire()` is a no-op — the verdict panel
 * already says "Correct", so nothing is lost.
 *
 * Palette is accent + the surface ladder's neutrals. No second accent colour,
 * because docs/DESIGN.md has exactly one.
 */
export const Confetti = forwardRef<ConfettiHandle, { className?: string }>(function Confetti(
  { className },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const frame = useRef<number | null>(null);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      particles.current = [];
    };
  }, []);

  const step = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== canvas.clientWidth * dpr) {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    const alive: Particle[] = [];
    for (const p of particles.current) {
      p.vy += 0.18; // gravity
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life -= 0.012;
      if (p.life <= 0) continue;
      alive.push(p);

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.colour;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.62);
      ctx.restore();
    }
    particles.current = alive;

    if (alive.length > 0) {
      frame.current = requestAnimationFrame(step);
    } else {
      frame.current = null;
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    }
  }, []);

  const fire = useCallback<ConfettiHandle['fire']>(
    ({ origin = { x: 0.5, y: 0.42 }, count = 64, spread = 0.9 } = {}) => {
      const canvas = canvasRef.current;
      if (!canvas || reduced.current) return;

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const cx = origin.x * w;
      const cy = origin.y * h;

      // accent blue plus the surface ladder — one accent, as the spec requires
      const palette = ['rgb(var(--c-accent))', 'rgb(var(--c-ink))', 'rgb(var(--c-edge))', 'rgb(var(--c-panel))'];
      const resolved = palette.map((c) => {
        const probe = document.createElement('span');
        probe.style.color = c;
        probe.style.display = 'none';
        document.body.appendChild(probe);
        const value = getComputedStyle(probe).color;
        probe.remove();
        return value;
      });

      for (let i = 0; i < count; i++) {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * spread * Math.PI;
        const speed = 5 + Math.random() * 8;
        particles.current.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed * (0.6 + Math.random() * 0.8),
          vy: Math.sin(angle) * speed,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.3,
          size: 5 + Math.random() * 6,
          colour: resolved[Math.floor(Math.random() * resolved.length)],
          life: 1,
        });
      }
      if (frame.current === null) frame.current = requestAnimationFrame(step);
    },
    [step],
  );

  useImperativeHandle(ref, () => ({ fire }), [fire]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 z-10 h-full w-full', className)}
    />
  );
});
