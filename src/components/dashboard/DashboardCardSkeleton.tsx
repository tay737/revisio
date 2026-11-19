import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Loading placeholder for the self-fetching dashboard cards (#13/#17/#20).
 * Each card owns its fetch, so without this they pop in one by one and the
 * 2-col grid reflows under the learner. A shared skeleton keeps the grid
 * stable; it is decorative — the real card replaces it whole.
 */
export function DashboardCardSkeleton() {
  return (
    <Card aria-hidden="true">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-28 rounded bg-secondary" />
        <Skeleton className="h-3 w-16 rounded bg-secondary/70" />
      </div>
      <div className="mt-4 space-y-2.5">
        <Skeleton className="h-3 w-full rounded bg-secondary/70" />
        <Skeleton className="h-3 w-4/5 rounded bg-secondary/70" />
        <Skeleton className="h-3 w-3/5 rounded bg-secondary/70" />
      </div>
    </Card>
  );
}
