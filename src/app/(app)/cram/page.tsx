import { Suspense } from 'react';
import PageSkeleton from '@/components/PageSkeleton';
import CramClient from './CramClient';

/**
 * Cram — a server component only to hold the `Suspense` boundary that
 * `useSearchParams` needs, so a topic can arrive preselected from its Learn row.
 */
export default function CramPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="reader" />}>
      <CramClient />
    </Suspense>
  );
}
