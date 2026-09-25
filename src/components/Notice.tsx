'use client';

import { AnimatePresence, motion } from 'motion/react';
import { Icon, type IconName } from '@/components/ui/icons';
import { SPRING } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * One treatment for every inline result message: saved, failed, noted.
 *
 * Three tones, each with one meaning and one glyph, so a success and a failure
 * are distinguishable before the words are read:
 *
 *   `good`  a thing happened that you wanted to happen (green, check)
 *   `bad`   something went wrong, and the message says what to do next (cardinal)
 *   `note`  information you asked for (neutral ink — never a colour, because it
 *           is not an outcome)
 *
 * `show` exists because a caller often knows whether the message applies (an
 * error string it just built) and the message itself can be empty on a first
 * render; without it, `<Notice show={!!error}>{error}</Notice>` renders nothing
 * even when there is an error to show.
 */
export function Notice({
  tone,
  show,
  children,
  className,
}: {
  tone: 'good' | 'bad' | 'note';
  /** Defaults to `Boolean(children)`. Pass it when the message may be empty. */
  show?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const visible = show ?? Boolean(children);
  const icon: IconName = tone === 'good' ? 'reviewed' : tone === 'bad' ? 'due' : 'xp';
  const styles = {
    good: 'bg-good-soft text-good-pressed',
    bad: 'bg-destructive/10 text-destructive',
    note: 'bg-secondary text-foreground',
  } as const;

  return (
    <AnimatePresence initial={false}>
      {visible ? (
        <motion.p
          role={tone === 'bad' ? 'alert' : 'status'}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={SPRING.soft}
          className={cn(
            'flex items-start gap-2 rounded-md px-3 py-2.5 text-[14px] leading-snug',
            styles[tone],
            className,
          )}
        >
          <span className="mt-0.5 shrink-0">
            <Icon name={icon} size={15} />
          </span>
          <span className="min-w-0">{children}</span>
        </motion.p>
      ) : null}
    </AnimatePresence>
  );
}
