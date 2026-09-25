import { cn } from '@/lib/utils';

/**
 * Bands and panels — the section rhythm from docs/DESIGN-UBER.md.
 *
 * The spec divides pages with **surface change, not chrome**: full-bleed bands
 * alternating canvas → ink → canvas, edge to edge, with no border and no shadow
 * between them, because the polarity shift *is* the divider. That alternation is
 * the single most recognisable thing about the system.
 *
 * Two renderings, because the app has two kinds of page:
 *
 *   • `TileBand` — a true viewport-width band, for surfaces that own the whole
 *     window (the landing page and the auth screens). It is deliberately a plain
 *     `w-full` section: the previous version centred itself with
 *     `left-1/2 w-screen -translate-x-1/2`, which is a `100vw` width on a page
 *     that also has a vertical scrollbar and therefore a horizontal one too.
 *   • `TilePanel` — the same idea at app-page scale: a rounded band inside the
 *     content column. A near-black panel on a light page reads as the same
 *     rhythm at a lower volume.
 *
 * Anything inside a dark band gets the `.band` scope, so it is written once and
 * comes out right on either ground — white ink, muted body, and a `bg-primary`
 * pill that inverts to white.
 */

const TONES = {
  dark: 'tile-dark',
  light: 'tile-white',
  parchment: 'tile-parchment',
} as const;

export function TileBand({
  tone = 'light',
  className,
  children,
  id,
}: {
  tone?: 'dark' | 'light' | 'parchment';
  className?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className={cn(TONES[tone], 'tile', className)}>
      <div className="mx-auto w-full max-w-[1200px]">{children}</div>
    </section>
  );
}

export function TilePanel({
  tone = 'dark',
  className,
  children,
}: {
  tone?: 'dark' | 'light' | 'parchment';
  className?: string;
  children: React.ReactNode;
}) {
  if (tone === 'dark') {
    return (
      <section
        className={cn(
          'tile-dark relative isolate overflow-hidden rounded-lg px-5 py-6 sm:px-8 sm:py-8',
          className,
        )}
      >
        {/* A 1px specular sheen along the top edge — the same light the spec's
            frosted bars rely on, and the reason a near-black panel reads as a
            surface rather than as a hole in the page. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
        />
        {children}
      </section>
    );
  }
  return (
    <section
      className={cn(
        'relative rounded-lg border border-border px-5 py-6 sm:px-8 sm:py-8',
        tone === 'parchment' ? 'bg-secondary' : 'bg-card',
        className,
      )}
    >
      {children}
    </section>
  );
}
