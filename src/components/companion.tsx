'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/icons';
import { RankCrest } from '@/components/ui/rank-crest';
import { SPRING } from '@/lib/motion';
import { companionFor, type CompanionSnapshot } from '@/lib/profile';
import { rankFor } from '@/domain/ranked';

/**
 * The companion.
 *
 * The brief was "it should feel like a studying companion alongside being a
 * tool". A companion needs a body, so it has one: a small round presence whose
 * face *is your rank crest*, which means the thing speaking to you is visibly
 * the thing you are building. When the crest ticks up a division, your
 * companion changes with it.
 *
 * What it says is decided entirely by `profile.companionFor` — this component
 * only renders the decision, which is why the shell and the dashboard can both
 * show it without risking two different readings of the same numbers.
 */
export function Companion({
  snap,
  className,
  onTile = false,
  compact = false,
}: {
  snap: CompanionSnapshot;
  className?: string;
  /** Renders inside a near-black band: the crest picks up Sky Link Blue. */
  onTile?: boolean;
  compact?: boolean;
}) {
  const read = companionFor(snap);
  const rank = rankFor(snap.totalXp);

  return (
    <div className={cn('flex items-start gap-3.5', className)}>
      {/* The presence: the crest, breathing very slightly, so it reads as alive
          without becoming a mascot that dances at you. */}
      <motion.span
        className={cn(
          'relative mt-0.5 grid shrink-0 place-items-center rounded-full border',
          onTile ? 'border-white/15 bg-white/5' : 'border-edge/80 bg-panel/70',
          compact ? 'h-11 w-11' : 'h-14 w-14',
        )}
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={SPRING.pop}
      >
        <RankCrest rank={rank} size={compact ? 28 : 36} showProgress={false} animate={false} />
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full border border-accent/25"
          animate={{ scale: [1, 1.14, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.span>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-balance',
            compact ? 't-caption leading-[1.43]' : 't-body',
            onTile ? 'text-white/90' : 'text-ink',
          )}
        >
          {read.line}
        </p>

        <motion.div
          className="mt-3"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING.settle, delay: 0.15 }}
        >
          <Link
            href={read.action.href}
            className={cn(
              'inline-flex items-center gap-1.5 text-[14px] font-normal transition-colors duration-200',
              onTile ? 'text-[#2997ff] hover:text-white' : 'text-accent hover:underline',
            )}
          >
            {read.action.label}
            <Icon name="next" size={14} />
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
