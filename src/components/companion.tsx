'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/icons';
import { RankCrest } from '@/components/ui/rank-crest';
import { SPRING } from '@/lib/motion';
import { companionFor, type CompanionSnapshot } from '@/lib/profile';
import { rankFor } from '@/domain/ranked';

/**
 * The companion.
 *
 * The brief was "a studying companion alongside being a tool". A companion needs
 * a body, so it has one: a round presence whose face **is your rank crest**, so
 * the thing speaking to you is visibly the thing you are building — and when the
 * crest ticks up a division, your companion changes with it.
 *
 * What it says is decided entirely by `profile.companionFor`; this component only
 * renders that decision. That is why the shell, the account sheet and the
 * dashboard can all show it without any risk of two different readings of the
 * same numbers.
 *
 * Colour is inherited: inside a band it reads as white-on-black through the
 * scope in globals.css, and on a light card it reads as ink. The action is an
 * underline rather than a hue, so the companion never introduces an accent of
 * its own.
 */
export function Companion({
  snap,
  className,
  onTile = false,
  compact = false,
}: {
  snap: CompanionSnapshot;
  className?: string;
  /** Rendered inside a band: the surface comes from the band scope. */
  onTile?: boolean;
  compact?: boolean;
}) {
  const read = companionFor(snap);
  const rank = rankFor(snap.totalXp);

  return (
    <div className={cn('flex items-start gap-3.5', className)}>
      <motion.span
        className={cn(
          'relative mt-0.5 grid shrink-0 place-items-center rounded-full border border-border',
          onTile ? 'bg-secondary' : 'bg-card',
          compact ? 'h-11 w-11' : 'h-14 w-14',
        )}
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={SPRING.pop}
      >
        <RankCrest rank={rank} size={compact ? 28 : 36} showProgress={false} animate={false} />
        {/* A slow halo: enough to read as alive, not enough to dance at you. */}
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full border border-foreground/20"
          animate={{ scale: [1, 1.14, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.span>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-pretty',
            compact ? 'text-[14px] leading-[1.5]' : 't-body',
            onTile ? 'text-muted-foreground' : 'text-foreground',
          )}
        >
          {read.line}
        </p>

        <motion.div
          className="mt-2.5"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING.settle, delay: 0.15 }}
        >
          <Link
            href={read.action.href}
            className="inline-flex items-center gap-1.5 text-[14px] font-semibold underline underline-offset-4 transition-opacity duration-150 hover:opacity-70"
          >
            {read.action.label}
            <Icon name="next" size={14} />
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
