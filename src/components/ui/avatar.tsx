import { cn } from '@/lib/utils';
import { initials } from '@/lib/profile';

/**
 * The one avatar treatment.
 *
 * v1.5 ships emoji + colour customisation rather than image uploads: there is
 * no object store wired to this deployment, and an avatar that fails to upload
 * is worse than a deliberate glyph. The shape stays a circle with initials,
 * but the owner can pick the glyph and the surface colour from five token
 * pairs — every pair meets AA contrast in both light and dark, so no caller
 * can assemble an unreadable combination.
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
  size = 36,
  className,
}: {
  name: string;
  emoji?: string | null;
  color?: string | null;
  size?: number;
  className?: string;
}) {
  const surface = SURFACE[(color ?? 'ink') as AvatarColor] ?? SURFACE.ink;
  return (
    <span
      className={cn('inline-grid shrink-0 select-none place-items-center overflow-hidden rounded-full font-semibold', surface, className)}
      style={{ width: size, height: size, fontSize: Math.round(size * (emoji ? 0.5 : 0.38)) }}
      aria-hidden
    >
      {emoji ? emoji : initials(name)}
    </span>
  );
}
