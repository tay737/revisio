import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Label — the field label.
 *
 * `.label` in `globals.css` is the Duolingo treatment: 13px, 700, uppercase and
 * 0.04em-tracked. It stays a real `<label>` so `htmlFor` keeps doing the work
 * (clicking the label focuses the control, and a screen reader announces the
 * pair) — the styling is the only thing this component adds.
 */
function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return <label data-slot="label" className={cn('label', className)} {...props} />;
}

export { Label };
