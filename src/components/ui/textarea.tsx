import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Textarea — the multi-line field.
 *
 * Shares `.input`, so it inherits the 2px stroke and focus state. The one
 * override is that a textarea may be resized vertically: the `.input` rule gives
 * it a taller radius and vertical padding, but resizing is a property of this
 * element, not of the token layer.
 */
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea data-slot="textarea" className={cn('input resize-y', className)} {...props} />;
}

export { Textarea };
