'use client';

import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * The button.
 *
 * Geometry and states live in `globals.css` (`.btn`, `.btn-*`) — that file is
 * the single owner of the design language — and this component supplies the
 * typed API plus the Base UI behaviour (disabled handling, render-as, focus).
 * Two grammars only, per docs/DESIGN-UBER.md: **pill for actions**, and the
 * only exception is the compact utility chip.
 *
 * `danger` is the app-wide name for a destructive action (the CSS class, the
 * variant and every call site agree — there is no second spelling).
 */
const buttonVariants = cva('btn [&_svg]:pointer-events-none [&_svg]:shrink-0', {
  variants: {
    variant: {
      primary: 'btn-primary',
      secondary: 'btn-secondary',
      subtle: 'btn-subtle',
      ghost: 'btn-ghost',
      utility: 'btn-utility',
      danger: 'btn-danger',
      /** Inside a study session only — see the note in globals.css. */
      good: 'btn-good',
      link: 'h-auto min-h-0 bg-transparent p-0 font-medium text-foreground underline-offset-4 hover:underline',
    },
    size: {
      default: '',
      sm: 'btn-sm',
      lg: 'btn-lg',
      icon: 'btn-icon',
      'icon-sm': 'btn-icon min-h-8 w-8',
      'icon-lg': 'btn-icon min-h-11 w-11',
    },
  },
  defaultVariants: {
    variant: 'primary',
    size: 'default',
  },
});

function Button({
  className,
  variant = 'primary',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
