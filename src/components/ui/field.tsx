'use client';

import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/icons';
import { Label } from '@/components/ui/label';

/**
 * Label + leading glyph + control. The glyph is positioned against the control
 * itself (not the whole field) so it stays centred in the pill whatever the
 * label above it does. `error`/`errorId` render the server-named problem beneath
 * this control only, wired by the caller's `aria-describedby`.
 */
export function Field({
  icon,
  label,
  htmlFor,
  error,
  errorId,
  children,
}: {
  icon: IconName;
  label: string;
  htmlFor: string;
  /** The server-named problem for this control, rendered beneath it. */
  error?: string;
  errorId?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor}>
        {label}
      </Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
          <Icon name={icon} size={17} />
        </span>
        {children}
      </div>
      {error && (
        <p id={errorId} role="alert" className="t-fine mt-1.5 font-medium text-destructive-ink">
          {error}
        </p>
      )}
    </div>
  );
}
