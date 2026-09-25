import { cn } from '@/lib/utils';

/**
 * Tiles — the spec's section rhythm.
 *
 * docs/DESIGN.md divides every page with **surface change, not chrome**: full
 * "tiles" alternating white → parchment → near-black, edge to edge, with no
 * border and no shadow between them, because "the colour change itself is the
 * section divider". That alternation is the single most recognisable thing
 * about the system, and it was entirely absent from this app — which is why a
 * correct colour palette still read as flat.
 *
 * Two renderings, because the app has two kinds of page:
 *
 *   • `TileBand` — true viewport-width bands, for surfaces that own the whole
 *     window (the landing page, the auth screens).
 *   • `TilePanel` — the same tiles rendered inside the app's content column and
 *     rounded, for pages that live next to the sidebar. A near-black panel on a
 *     light page reads as the same rhythm at a smaller volume, which is exactly
 *     the spec's own "one design language expressed at different volumes".
 *
 * Anything inside a dark tile gets the `.on-tile` scope, so it is written once
 * and comes out right on either ground — white ink, muted body, Sky Link Blue.
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
    <section
      id={id}
      className={cn(TONES[tone], 'relative left-1/2 w-screen -translate-x-1/2', className)}
    >
      <div className="mx-auto w-full max-w-wide px-5 py-16 md:px-10 md:py-24">{children}</div>
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
          'tile-dark relative isolate overflow-hidden rounded-[18px] px-6 py-8 md:px-9 md:py-10',
          className,
        )}
      >
        {/* A single specular sheen along the top edge — the same 1px of light
            the spec's frosted bars rely on, and the reason a near-black panel
            reads as a surface rather than as a hole in the page. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
        />
        {children}
      </section>
    );
  }
  return (
    <section
      className={cn(
        'relative rounded-[18px] border border-edge/70 px-6 py-8 md:px-9 md:py-10',
        tone === 'parchment' ? 'bg-bg' : 'bg-panel',
        className,
      )}
    >
      {children}
    </section>
  );
}
