import Link from 'next/link';
import { ThemeToggle } from '@/components/ui/theme-toggle';

/**
 * One shell for all four auth pages (login, register, staff login, staff
 * register), so the same three lines of layout are not written four times.
 *
 * The previous version put a near-black tile over the upper 46% of the viewport
 * and floated the form in the middle of it, which meant the opaque white card
 * landed *across* the tile boundary at a different height on every device — it
 * read as a misaligned band rather than as a decision. It now does the thing the
 * spec actually describes: a compact ink band as the header, containing the
 * wordmark and one line, with the form card overlapping its lower edge by a
 * fixed 32px. A fixed overlap is what makes the card look placed instead of
 * fallen.
 *
 * The band carries the `.band` scope, so everything inside it — including the
 * theme toggle — is written once for a light page and comes out white here.
 */
export function AuthShell({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-viewport flex-col bg-background">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {/* A header landmark: otherwise the wordmark and strapline sit outside
          every region and axe reports the whole band as unlandmarked content. */}
      <header className="band tile-dark relative px-5 pt-safe">
        <div className="relative mx-auto flex w-full max-w-md items-center justify-between pt-5">
          <Link href="/" className="-my-1 flex items-center gap-2.5 py-1">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-foreground t-caption font-bold text-background">
              R
            </span>
            <span className="t-tagline">Revisio</span>
          </Link>
          <ThemeToggle />
        </div>

        {/* The band is a masthead, not a competing headline: the card's own h1
            has to be the largest thing on the screen. */}
        <div className="relative mx-auto w-full max-w-md pb-14 pt-9">
          <p className="t-eyebrow">Spaced repetition</p>
          <p className="t-display-sm mt-2 max-w-xs">Ten minutes a day.</p>
        </div>
      </header>

      {/* `relative z-10` is what makes the overlap visible: the header is a
          positioned element, so without it the band paints over the card's top
          32px and the page h1 sits on the band's edge. */}
      <main id="main" tabIndex={-1} className="relative z-10 mx-auto -mt-8 w-full max-w-md flex-1 px-5 pb-12 outline-none">
        {children}

        {footer && (
          <div className="auth-footer mt-5 text-center t-caption text-muted-foreground">
            <p>{footer}</p>
          </div>
        )}
      </main>
    </div>
  );
}
