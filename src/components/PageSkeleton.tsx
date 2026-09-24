import { cn } from '@/lib/utils';

/**
 * Shared route skeleton.
 *
 * Every `loading.tsx` renders this, so a navigation shows the shape of the page
 * that is arriving rather than a blank box or a full-screen overlay. Radii and
 * gaps come from the design tokens (18px cards, 8px rhythm) so the skeleton and
 * the real content line up — a skeleton that doesn't match its page is worse
 * than none at all.
 */
function Bar({ className }: { className?: string }) {
  return (
    <div className={cn('skeleton rounded-full', className)} />
  );
}

function Panel({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-[18px]', className)} />;
}

export default function Loading({ variant = 'default' }: { variant?: 'default' | 'reader' }) {
  if (variant === 'reader') {
    return (
      <div className="mx-auto max-w-xl space-y-5" role="status" aria-label="Loading">
        <Bar className="h-4 w-32" />
        <Panel className="h-56" />
        <Panel className="h-12" />
      </div>
    );
  }

  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <div className="space-y-2">
        <Bar className="h-8 w-52" />
        <Bar className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Panel key={i} className="h-24" />
        ))}
      </div>
      <Panel className="h-28" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Panel className="h-36" />
        <Panel className="h-36" />
      </div>
    </div>
  );
}
