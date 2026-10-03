'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/icons';

/**
 * The one replacement for `window.confirm` in the staff consoles.
 *
 * A native dialog was wrong twice over: it is off-voice (the OS chrome, not the
 * app's), and it is off-architecture (docs/UI-SYSTEM: the app confirms inline).
 * This renders the consequence sentence *in the place the action lives*, so a
 * teacher reads what will happen next to the button that does it — with a
 * destructive treatment, not a white pill.
 *
 * One owner, so teacher and admin confirm the same way and the copy contract
 * ("state the consequence, then ask") lives in a single place.
 */
export function InlineConfirm({
  label,
  icon,
  title,
  message,
  confirmLabel = 'Delete',
  onConfirm,
}: {
  /** The closed control's label. */
  label: string;
  icon?: React.ComponentProps<typeof Icon>['name'];
  /** The consequence sentence — what happens, stated before the ask. */
  title: string;
  /** Optional second line: reversibility or what is *not* affected. */
  message?: string;
  confirmLabel?: string;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-ghost gap-1.5 text-destructive"
        onClick={() => setOpen(true)}
        aria-expanded={open}
      >
        {icon && <Icon name={icon} size={14} />}
        {label}
      </button>
    );
  }

  return (
    <div
      role="alertdialog"
      aria-label={title}
      className="w-full max-w-md rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3"
    >
      <p className="t-caption-s text-destructive">{title}</p>
      {message && <p className="t-caption mt-0.5 text-muted-foreground">{message}</p>}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-sm bg-destructive text-white hover:opacity-90"
          onClick={() => {
            setOpen(false);
            onConfirm();
          }}
        >
          {confirmLabel}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
