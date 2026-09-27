'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { initials } from '@/lib/profile';

/**
 * The one avatar treatment.
 *
 * An owner has three looks, in priority order: an uploaded image (a URL under
 * /api/v1/assets, proxied so the private bucket never leaks), the chosen emoji
 * on a token colour, or initials. Every colour pair meets AA contrast in both
 * light and dark, so no caller can assemble an unreadable combination — and a
 * broken image URL degrades to the glyph rather than showing a hole.
 */
export const AVATAR_COLORS = ['ink', 'moss', 'bee', 'dawn', 'sky'] as const;
export type AvatarColor = (typeof AVATAR_COLORS)[number];

const SURFACE: Record<AvatarColor, string> = {
  ink: 'bg-foreground text-background',
  moss: 'bg-good-soft text-good-pressed',
  bee: 'bg-gold/30 text-foreground',
  dawn: 'bg-destructive/15 text-destructive',
  sky: 'bg-primary/15 text-primary',
};

export const AVATAR_EMOJI = ['🦉', '🧠', '📚', '⚡', '🌟', '🦊', '🐢', '🌙', '🎯', '🧪'] as const;

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

/** The profile banner: the uploaded image if there is one, else a quiet token wash. */
export function ProfileBanner({ imageUrl, className }: { imageUrl?: string | null; className?: string }) {
  return (
    <div className={cn('relative h-32 w-full overflow-hidden rounded-[var(--radius-card,16px)] sm:h-40', className)}>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full bg-gradient-to-br from-primary/10 via-transparent to-gold/15" aria-hidden />
      )}
    </div>
  );
}
