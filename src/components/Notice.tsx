'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Icon, type IconName } from '@/components/ui/icons';
import { SPRING } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * One treatment for every inline result message: saved, published, failed.
 *
 * Replaces the per-page `<p className="rounded-xl bg-good/10 …">` strings, and
 * gives each message a glyph so a success and a failure are distinguishable
 * before the words are read — useful when the text is long and half-scrolled.
 */
export function Notice({
  tone,
  children,
  className,
}: {
  tone: 'good' | 'bad' | 'accent';
  children: React.ReactNode;
  className?: string;
}) {
  const icon: IconName = tone === 'good' ? 'reviewed' : tone === 'bad' ? 'due' : 'xp';
  const styles = {
    good: 'bg-good/10 text-good',
    bad: 'bg-bad/10 text-bad',
    accent: 'bg-accent/10 text-accent',
  } as const;

  return (
    <AnimatePresence initial={false}>
      {children ? (
        <motion.p
          role={tone === 'bad' ? 'alert' : 'status'}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={SPRING.soft}
          className={cn('t-caption flex items-start gap-2 rounded-[11px] px-3 py-2.5', styles[tone], className)}
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
