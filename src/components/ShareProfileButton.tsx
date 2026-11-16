'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { buttonVariants } from '@/lib/button-variants';
import { cn } from '@/lib/utils';

/**
 * "Copy profile link" for the signed-in owner viewing their own public
 * profile — the shareable progress card's only affordance. Copies the
 * canonical /u/<handle> URL; the confirmation is the label itself changing,
 * no toast system needed for one button.
 */
export function ShareProfileButton({ handle }: { handle: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'shrink-0 gap-1.5')}
      onClick={async () => {
        const url = `${window.location.origin}/u/${handle}`;
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          // Clipboard can be denied (permissions, non-secure context); the
          // address is still selectable in the URL bar, so fail quietly.
          return;
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      <Icon name={copied ? 'correct' : 'visible'} size={14} />
      {copied ? 'Link copied' : 'Share'}
    </button>
  );
}
