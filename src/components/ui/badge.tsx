import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Badge — the pill label, and the one component for the app's `chip`s.
 *
 * Two grammars share one element and should not be spelled differently at call
 * sites:
 *
 *   `chip`   a token you can press or a fact you scan (a subject, a spec ref)
 *   `badge`  a stamped state (streak, promotion, "saved offline")
 *
 * The variants name the meaning, and the CSS classes they map to are the ones
 * `.chip` / `.badge*` already define — so a migrated call site keeps the exact
 * geometry, uppercase tracking and 44px touch target it had before.
 */
const badgeVariants = cva('inline-flex w-fit shrink-0 items-center', {
  variants: {
    variant: {
      chip: 'chip',
      'chip-active': 'chip chip-active',
      'chip-soft': 'chip chip-soft',
      quiet: 'badge badge-quiet',
      good: 'badge badge-good',
      gold: 'badge badge-gold',
      streak: 'badge badge-streak',
      default: 'badge',
    },
  },
  defaultVariants: {
    variant: 'quiet',
  },
});

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
