import { cva, type VariantProps } from 'class-variance-authority';

/**
 * The button variant table.
 *
 * It lives in `lib/`, not in `components/ui/button.tsx`, because that component
 * is a `'use client'` module and a *value* imported from it cannot be called
 * while rendering on the server — every server page that styles a `<Link>` as a
 * button would throw "Attempted to call buttonVariants() from the server".
 * Shape and states still come from `.btn*` in globals.css.
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
      /** A filled destructive confirm — only for the final "do it" in a dialog. */
      destructive: 'btn bg-destructive text-white hover:opacity-90',
      /** Inside a study session only — see the note in globals.css. */
      good: 'btn-good',
      /** A segmented chip that is pressable (topic pickers, filter rails). */
      chip: 'chip',
      chipActive: 'chip chip-active',
      chipSoft: 'chip chip-soft',
      link: 'h-auto min-h-11 items-center bg-transparent p-0 font-medium text-foreground underline-offset-4 hover:underline sm:min-h-0',
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

type ButtonVariantProps = VariantProps<typeof buttonVariants>;

export { buttonVariants };
export type { ButtonVariantProps };
