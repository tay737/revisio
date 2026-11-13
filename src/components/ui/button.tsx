'use client';

import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cn } from '@/lib/utils';
import { buttonVariants, type ButtonVariantProps } from '@/lib/button-variants';
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
 * The variant table itself lives in `lib/button-variants.ts` so a server
 * component can style a `<Link>` without calling into a client module.
 *
 * `danger` is the app-wide name for a destructive action (the CSS class, the
 * variant and every call site agree — there is no second spelling).
 */
function Button({
  className,
  variant = 'primary',
  size = 'default',
  onClick,
  children,
  ...props
}: ButtonPrimitive.Props & ButtonVariantProps) {
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

export { Button };
