'use client';

import { useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * The liquid-glass surface.
 *
 * This is the one reading of "glassmorphic" that docs/DESIGN.md actually
 * sanctions: the spec's frosted sub-nav and sticky bar are `backdrop-filter:
 * saturate(180%) blur(20px)` over a translucent surface, and it forbids
 * *decorative gradients* — not translucency. So the glass here is built from
 * blur + saturation + a 1px hairline, never a gradient wash.
 *
 *   • `tone="pane"`  — the workhorse surface for cards and panels.
 *   • `tone="raised"` — a touch more opaque, for surfaces over busy content.
 *   • `tone="bar"`    — the 80%-opaque frosted bar from the spec (headers,
 *                       tab bars, floating sticky bars).
 *
 * `spotlight` adds a pointer-tracked specular highlight (Magic UI's MagicCard
 * idea). It is pure light — a radial accent at ~7% alpha that follows the
 * cursor — and is off by default so it only appears on surfaces you invite
 * the pointer onto.
 */
export function GlassCard({
  children,
  className,
  tone = 'pane',
  spotlight = false,
  hairline = true,
  as: Tag = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  tone?: 'pane' | 'raised' | 'bar';
  spotlight?: boolean;
  hairline?: boolean;
  as?: 'div' | 'section' | 'article' | 'aside' | 'header';
}) {
  const ref = useRef<HTMLDivElement>(null);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      el.style.setProperty('--glass-x', `${e.clientX - rect.left}px`);
      el.style.setProperty('--glass-y', `${e.clientY - rect.top}px`);
    },
    [],
  );

  const tones = {
    pane: 'bg-panel/62 backdrop-blur-xl backdrop-saturate-150',
    raised: 'bg-panel/80 backdrop-blur-xl backdrop-saturate-150',
    bar: 'bg-bg/80 backdrop-blur-xl backdrop-saturate-[1.8]',
  } as const;

  const classes = cn(
    'relative overflow-hidden rounded-[18px] border border-edge/70',
    tones[tone],
    hairline && 'glass-hairline',
    className,
  );

  const inner = (
    <>
      {spotlight && (
        <span
          aria-hidden
          className="glass-spotlight pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300"
        />
      )}
      {children}
    </>
  );

  if (Tag === 'div') {
    return (
      <div ref={ref} onPointerMove={spotlight ? onPointerMove : undefined} className={classes}>
        {inner}
      </div>
    );
  }
  return (
    <Tag
      ref={ref as never}
      onPointerMove={spotlight ? (onPointerMove as never) : undefined}
      className={classes}
    >
      {inner}
    </Tag>
  );
}
