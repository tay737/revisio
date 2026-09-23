'use client';

import { cn } from '@/lib/utils';

// Magic UI Aurora — adapted to docs/DESIGN.md: Apple forbids decorative
// gradients, so this is a whisper-quiet atmospheric glow (very low alpha,
// large blur) that reads as light on a surface, not as a gradient. Used
// behind the landing hero and auth screens only.

const BLOBS = [
  { className: 'left-[-10%] top-[-20%] h-[520px] w-[520px] bg-accent/[0.05] dark:bg-accent/[0.07]', duration: '26s' },
  { className: 'right-[-15%] top-[10%] h-[620px] w-[620px] bg-accent/[0.04] dark:bg-accent/[0.05]', duration: '32s' },
  { className: 'left-[20%] bottom-[-30%] h-[560px] w-[560px] bg-accent/[0.03] dark:bg-accent/[0.05]', duration: '38s' },
];

export function Aurora({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      {BLOBS.map((b, i) => (
        <div
          key={i}
          className={cn('absolute rounded-full blur-[120px]', b.className)}
          style={{ animation: `aurora-drift-${i} ${b.duration} ease-in-out infinite alternate` }}
        />
      ))}
      <style>{`
        @keyframes aurora-drift-0 { from { transform: translate(0, 0) scale(1); } to { transform: translate(60px, 40px) scale(1.08); } }
        @keyframes aurora-drift-1 { from { transform: translate(0, 0) scale(1.05); } to { transform: translate(-50px, 60px) scale(0.95); } }
        @keyframes aurora-drift-2 { from { transform: translate(0, 0) scale(0.95); } to { transform: translate(40px, -50px) scale(1.1); } }
        @media (prefers-reduced-motion: reduce) { [aria-hidden] > div { animation: none !important; } }
      `}</style>
    </div>
  );
}
