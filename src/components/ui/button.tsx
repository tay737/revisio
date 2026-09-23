'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-[15px] font-medium transition-all duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg select-none',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-ink hover:brightness-110 shadow-none',
        ghost: 'border border-edge bg-panel text-accent hover:bg-edge/30',
        danger: 'border border-bad/40 bg-transparent text-bad hover:bg-bad/10',
        utility: 'rounded-lg bg-ink text-panel hover:opacity-90',
        link: 'text-accent underline-offset-4 hover:underline px-0 py-0',
      },
      size: {
        sm: 'h-9 px-4 text-[13px]',
        md: 'h-11 px-[22px]',
        lg: 'h-13 px-7 text-base',
        icon: 'h-11 w-11 p-0',
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

/** shadcn-style button with the DESIGN.md press interaction (scale 0.95). */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, children, ...props }, ref) => (
    <motion.button
      ref={ref}
      whileTap={{ scale: 0.95 }}
      whileHover={{ scale: 1.015 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {children}
    </motion.button>
  ),
);
Button.displayName = 'Button';

export { buttonVariants };
