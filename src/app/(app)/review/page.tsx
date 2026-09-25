import { Suspense } from 'react';
import PageSkeleton from '@/components/PageSkeleton';
import ReviewClient from './ReviewClient';

/**
 * The review route — and, with `?topic=`, the first-exposure session.
 *
 * A server component purely so it can hold the `Suspense` boundary that
 * `useSearchParams` requires: without it Next cannot prerender the route and the
 * build fails. The session itself lives in `ReviewClient` because it is all
 * client state, and it is deliberately the *same* component for both modes —
 * a card met for the first time is answered, graded and celebrated exactly like
 * one met again.
 */
export default function ReviewPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="reader" />}>
      <ReviewClient />
    </Suspense>
  );
}
