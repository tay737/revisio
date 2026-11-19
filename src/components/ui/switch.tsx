'use client';

import { cn } from '@/lib/utils';

/**
 * The one switch. The pill stays 28px visually, but the button's box is
 * 48×44px so the touch target clears the project's 44px floor — the extra
 * height is transparent padding, not a bigger switch. The knob travels with
 * `transform`, never `left`: animating `left` re-lays-out the track on every
 * frame.
 *
 * This replaced three hand-rolled copies (settings Toggle, ConsentSection,
 * RemindersSection) plus a fourth smaller variant in the review session
 * options — one component so the hit area and the motion can never drift
 * apart again.
 */
export function Switch({
  id,
  label,
  on,
  onToggle,
  disabled,
  className,
}: {
  id?: string;
  /** Accessible name — pairs with a visible <label htmlFor> where one exists. */
  label: string;
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={cn('flex h-11 w-12 shrink-0 items-center justify-center disabled:opacity-50', className)}
    >
      <span
        className={cn(
          'relative block h-7 w-12 rounded-pill transition-colors duration-(--dur-out)',
          on ? 'bg-good' : 'bg-border-strong',
        )}
      >
        <span
          className={cn(
            'absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-(--dur-snap) ease-[var(--ease-out)]',
            on ? 'translate-x-5' : 'translate-x-0',
          )}
          aria-hidden
        />
      </span>
    </button>
  );
}
