import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Input — the one text field.
 *
 * Shape, stroke and focus state come from `.input` in `globals.css` (48px tall,
 * 2px stroke, 8px radius, filled focus ring), so a field looks the same whether
 * it is typed in an auth form, the admin console or a settings panel. It is a
 * plain `<input>` on purpose: every caller is a client form that already owns
 * `value`/`onChange`, and a primitive wrapper would add a boundary without
 * adding behaviour.
 */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return <input type={type} data-slot="input" className={cn('input', className)} {...props} />;
}

export { Input };
