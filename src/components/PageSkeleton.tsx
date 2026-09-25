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

export default function PageSkeleton({ variant = 'default' }: { variant?: 'default' | 'reader' }) {
  if (variant === 'reader') {
    return (
      <div className="mx-auto max-w-xl space-y-4 pt-2" role="status" aria-label="Loading">
        <Skeleton className="h-5 w-28 rounded-full" />
        <Panel className="h-60 rounded-lg" />
        <Panel className="h-14 rounded-lg" />
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
