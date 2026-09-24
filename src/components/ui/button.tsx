'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SPRING } from '@/lib/motion';

/**
 * Button — the spec's button grammars as a component.
 *
 * Deliberately no hover animation: docs/DESIGN.md documents only a default and
 * an active/pressed state, so hover is signalled by a brightness/colour shift
 * in CSS and motion is reserved for the press (`scale(0.95)`). The old version
 * scaled *up* on hover, which is both off-spec and the wrong affordance — a
 * button should acknowledge a press, not a pointer resting on it.
 *
 * Variants mirror the classes in globals.css, and only weight 400 or 600
 * appear anywhere in this system.
 */
const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-normal transition-[background-color,color,border-color,opacity] duration-150 ease-out disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'btn-primary',
        secondary: 'btn-secondary',
        ghost: 'btn-ghost',
        utility: 'btn-utility',
        danger: 'btn-danger',
        link: 'px-0 py-0 text-accent underline-offset-4 hover:underline',
      },
      size: {
        sm: 'btn-sm',
        md: '',
        /** Icon-only: 44×44, the spec's minimum touch target. */
        icon: 'h-11 w-11 rounded-full p-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends Omit<HTMLMotionProps<'button'>, 'children'>,
    VariantProps<typeof buttonVariants> {
  children?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, children, ...props }, ref) => (
    <motion.button
      ref={ref}
      whileTap={{ scale: 0.95 }}
      transition={SPRING.press}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {children}
    </motion.button>
  ),
);
Button.displayName = 'Button';

export { buttonVariants };
