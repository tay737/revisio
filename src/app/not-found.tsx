import Link from 'next/link';
import { Icon } from '@/components/ui/icons';

/**
 * The branded 404.
 *
 * Server-rendered and dependency-free on purpose: a not-found can fire signed
 * out, mid-error, or anywhere the shell never mounted. Two doors out, ranked —
 * the dashboard first, the catalogue second — because "that page does not
 * exist" without a next step is just a politer dead end.
 */
export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-5 py-14">
      <div className="w-full max-w-md">
        <div className="card p-7 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-secondary text-muted-foreground">
            <Icon name="search" size={22} />
          </span>
          <h1 className="t-tagline mt-4">That page does not exist</h1>
          <p className="t-caption mt-2 text-muted-foreground">
            The link may be old or mistyped. Your queue and your streak are exactly where you left them.
          </p>

          <div className="mt-6 flex flex-col gap-2">
            <Link href="/dashboard" className="btn btn-primary w-full">
              Back to Today
            </Link>
            <Link href="/learn" className="btn btn-secondary w-full">
              Browse subjects
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
