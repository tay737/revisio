'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Icon } from '@/components/ui/icons';

/**
 * The branded failure state.
 *
 * This fires *outside* the app shell — the session, the nav and the providers
 * cannot be assumed to exist, which is why it is plain markup and one icon, not
 * the Notice component. It renders outside `<body>`'s normal tree in the worst
 * case (global-error), so nothing here may depend on context.
 *
 * The copy takes a position: what happened was on our side, the learner's work
 * is safe, and there is one thing to do about it. A bare "Oops" would be a
 * second dead end in a row.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface it for the operator without showing a stack to the learner.
    console.error('[route error]', error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-background px-5 py-14">
      <div className="w-full max-w-md">
        <div className="card p-7 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-destructive/10 text-destructive-ink">
            <Icon name="due" size={22} />
          </span>
          <h1 className="t-tagline mt-4">Something went wrong on our side</h1>
          <p className="t-caption mt-2 text-muted-foreground">
            Your work is safe — nothing was lost. Give it a moment and try again.
          </p>

          <div className="mt-6 flex flex-col gap-2">
            <button type="button" onClick={reset} className="btn btn-primary w-full">
              <Icon name="rotate" size={16} />
              Try again
            </button>
            <Link href="/dashboard" className="btn btn-secondary w-full">
              Back to Today
            </Link>
          </div>

          {error.digest && (
            <p className="t-fine mt-4 text-muted-foreground">
              If this keeps happening, quote this code: <span className="font-mono">{error.digest}</span>
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
