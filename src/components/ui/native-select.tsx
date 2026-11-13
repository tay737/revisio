import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * NativeSelect — a `<select>` that wears the app's field treatment.
 *
 * The app's pickers are short, fixed lists inside `<form>`s, submitted and
 * validated by the browser. The Base UI `Select` in `select.tsx` is the right
 * tool for a rich listbox; for these, keeping the native element means no
 * hidden input, no popup positioning and no rewrite of the `name`/`onChange`
 * contract — only the styling changes hands.
 */
function NativeSelect({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <select data-slot="native-select" className={cn('input', className)} {...props}>
      {children}
    </select>
  );
}

export { NativeSelect };
