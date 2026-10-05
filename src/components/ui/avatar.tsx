'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { initials } from '@/lib/profile';
import { AVATAR_COLORS, BANNER_COLORS, type AvatarColor, type BannerColor } from '@/lib/colors';

// The palettes live in lib/colors (client-safe, server-importable); these
// re-exports keep every existing call site working.
export { AVATAR_COLORS, BANNER_COLORS };
export type { AvatarColor, BannerColor };

/**
 * The one avatar treatment.
 *
 * An owner has three looks, in priority order: an uploaded image (a URL under
 * /api/v1/assets, proxied so the private bucket never leaks), the chosen emoji
 * on a token colour, or initials. Every colour pair meets AA contrast in both
 * light and dark, so no caller can assemble an unreadable combination — and a
 * broken image URL degrades to the glyph rather than showing a hole.
 */
const SURFACE: Record<AvatarColor, string> = {
  ink: 'bg-foreground text-background',
  moss: 'bg-good-soft text-good-strong',
  bee: 'bg-gold/30 text-foreground',
  dawn: 'bg-destructive/15 text-destructive-ink',
  sky: 'bg-primary/15 text-primary',
};

export const AVATAR_EMOJI = ['🦉', '🧠', '📚', '⚡', '🌟', '🦊', '🐢', '🌙', '🎯', '🧪'] as const;

export const BANNER_WASH: Record<BannerColor, string> = {
  dusk: 'bg-gradient-to-br from-primary/12 via-transparent to-gold/15',
  rose: 'bg-gradient-to-br from-destructive/18 via-transparent to-gold/10',
  sea: 'bg-gradient-to-br from-primary/14 via-transparent to-good/12',
  moss: 'bg-gradient-to-br from-good-soft via-transparent to-primary/8',
  bee: 'bg-gradient-to-br from-gold/30 via-transparent to-destructive/8',
  ember: 'bg-gradient-to-br from-destructive/25 via-gold/10 to-transparent',
};

export function Avatar({
  name,
  emoji,
  color,
  imageUrl,
  size = 36,
  className,
}: {
  name: string;
  emoji?: string | null;
  color?: string | null;
  /** Uploaded avatar (an app-proxied asset URL). Takes priority over emoji. */
  imageUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const surface = SURFACE[(color ?? 'ink') as AvatarColor] ?? SURFACE.ink;
  const [imgBroken, setImgBroken] = useState(false);
  const showImage = imageUrl && !imgBroken;

  return (
    <span
      className={cn('inline-grid shrink-0 select-none place-items-center overflow-hidden rounded-full font-semibold', surface, className)}
      style={{ width: size, height: size, fontSize: Math.round(size * (emoji && !showImage ? 0.5 : 0.38)) }}
      aria-hidden
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl!}
          alt=""
          width={size}
          height={size}
          className="h-full w-full object-cover"
          onError={() => setImgBroken(true)}
        />
      ) : emoji ? (
        emoji
      ) : (
        initials(name)
      )}
    </span>
  );
}

/**
 * The profile banner: the uploaded image if there is one, else the chosen
 * token wash. The banner reserves the space below it for the avatar's
 * overlap — it never carries content of its own, so nothing inside it can
 * collide with the identity block that sits on its lower edge.
 */
export function ProfileBanner({
  imageUrl,
  color,
  className,
}: {
  imageUrl?: string | null;
  color?: string | null;
  className?: string;
}) {
  const wash = BANNER_WASH[(color ?? 'dusk') as BannerColor] ?? BANNER_WASH.dusk;
  return (
    <div className={cn('relative z-0 h-32 w-full overflow-hidden rounded-[var(--radius-card,16px)] sm:h-40', className)}>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className={cn('h-full w-full', wash)} aria-hidden />
      )}
    </div>
  );
}
