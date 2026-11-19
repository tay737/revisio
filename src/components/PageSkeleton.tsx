import { Skeleton } from '@/components/ui/skeleton';

/**
 * Shared route skeleton.
 *
 * Every `loading.tsx` renders this, so a navigation shows the shape of the page
 * arriving rather than a blank box or a full-screen overlay. Radii and the
 * 20px→24px card padding match the real `.card`, because a skeleton that does
 * not line up with its page is worse than no skeleton at all.
 */
function Panel({ className }: { className?: string }) {
  return <Skeleton className={className} />;
}

export default function PageSkeleton({
  variant = 'default',
}: {
  /**
   * Shape-match the page it stands in for — a skeleton in the wrong shape is
   * worse than none, because the real layout pops into a different silhouette
   * and reads as a layout shift. `default` = dashboard-style stat grid +
   * panels; `reader` = narrow prose column; `list` = header + stacked rows
   * (rosters, topics, tables); `form` = header + stacked field cards
   * (settings, pickers).
   */
  variant?: 'default' | 'reader' | 'list' | 'form';
}) {
  if (variant === 'reader') {
    return (
      <div className="mx-auto max-w-xl space-y-4 pt-2" role="status" aria-label="Loading">
        <Skeleton className="h-5 w-28 rounded-full" />
        <Panel className="h-60 rounded-lg" />
        <Panel className="h-14 rounded-lg" />
      </div>
    );
  }

  if (variant === 'list') {
    return (
      <div className="space-y-4" role="status" aria-label="Loading">
        <div className="space-y-2.5">
          <Skeleton className="h-7 w-44 rounded-md" />
          <Skeleton className="h-4 w-64 rounded-full" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Panel key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'form') {
    return (
      <div className="space-y-4" role="status" aria-label="Loading">
        <div className="space-y-2.5">
          <Skeleton className="h-7 w-44 rounded-md" />
          <Skeleton className="h-4 w-64 rounded-full" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Panel key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" role="status" aria-label="Loading">
      <div className="space-y-2.5">
        <Skeleton className="h-7 w-44 rounded-md" />
        <Skeleton className="h-4 w-64 rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Panel key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      <Panel className="h-28 rounded-lg" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Panel className="h-32 rounded-lg" />
        <Panel className="h-32 rounded-lg" />
      </div>
    </div>
  );
}
