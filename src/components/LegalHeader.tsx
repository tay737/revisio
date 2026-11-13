import Link from 'next/link';

/**
 * The header for the public document pages (privacy, terms, cookies,
 * accessibility).
 *
 * These routes sit outside the app shell and the landing page's own nav, which
 * used to leave a reader with no link back to the Service — the browser's Back
 * button was the only exit. The wordmark and the explicit Home link both land
 * on `/` at every viewport, and the other documents stay one tap away.
 */
const DOCUMENTS = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/cookie-policy', label: 'Cookies' },
  { href: '/accessibility', label: 'Accessibility' },
] as const;

export function LegalHeader({ current }: { current?: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 pt-safe backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 max-w-3xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 sm:px-6">
        <Link href="/" className="-my-1 flex items-center gap-2.5 py-1">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-foreground text-[13px] font-bold text-background">
            R
          </span>
          <span className="t-tagline">Revisio</span>
        </Link>

        <nav aria-label="Policies and agreements" className="ml-auto flex flex-wrap items-center gap-1">
          <Link
            href="/"
            className="rounded-pill px-2.5 py-1.5 text-[14px] font-medium text-muted-foreground hover:text-foreground"
          >
            ← Home
          </Link>
          {DOCUMENTS.map((document) => (
            <Link
              key={document.href}
              href={document.href}
              aria-current={current === document.href ? 'page' : undefined}
              className={
                current === document.href
                  ? 'rounded-pill px-2.5 py-1.5 text-[14px] font-semibold text-foreground'
                  : 'rounded-pill px-2.5 py-1.5 text-[14px] font-medium text-muted-foreground hover:text-foreground'
              }
            >
              {document.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
