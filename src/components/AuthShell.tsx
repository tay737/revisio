import Link from 'next/link';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { BlurFade } from '@/components/ui/blur-fade';

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
    <main className="flex min-h-screen flex-col bg-background">
      <div className="band tile-dark px-5 pt-safe">
        <div className="mx-auto flex w-full max-w-md items-center justify-between pt-5">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-foreground text-[13px] font-bold text-background">
              R
            </span>
            <span className="t-tagline">Revisio</span>
          </Link>
          <ThemeToggle />
        </div>

        <div className="mx-auto w-full max-w-md pb-16 pt-10">
          <p className="t-eyebrow">Spaced repetition</p>
          <h2 className="t-display mt-2 max-w-xs">Ten minutes a day.</h2>
        </div>
      </div>

      <div className="mx-auto -mt-8 w-full max-w-md flex-1 px-5 pb-12">
        <BlurFade delay={0.06}>{children}</BlurFade>

        {footer && (
          <div className="mt-5 text-center text-[13px] text-muted-foreground">
            <p>{footer}</p>
          </div>
        )}
      </div>
    </main>
  );
}
