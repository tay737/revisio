'use client';

import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { RippleLayer, useRipples } from '@/components/ui/ripple-button';

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
  onClick,
  children,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  // Only the primary action gets the press ripple: it is the one the user is
  // meant to feel land. Secondary and utility buttons stay quiet.
  const rippled = variant === 'primary';
  const { ripples, add } = useRipples();
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      onClick={(event) => {
        if (rippled) add(event);
        onClick?.(event);
      }}
      {...props}
    >
      {children}
      {rippled && <RippleLayer ripples={ripples} />}
    </ButtonPrimitive>
  );
}

export { Button, buttonVariants };
