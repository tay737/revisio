'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { Icon } from '@/components/ui/icons';
import { RankCrest } from '@/components/ui/rank-crest';
import { NumberTicker } from '@/components/ui/number-ticker';
import { TilePanel } from '@/components/ui/tile';
import { SPRING } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { reviewsForRp, type Placement, type Rank, type WeekBounds } from '@/domain/ranked';
import type { LobbyData } from '@/components/rank/LobbyTable';

/**
 * Your rank, in one glance.
 *
 * The competitive half of the product, on the page people actually open first.
 * It is a **near-black band on a light canvas** — the spec's own section divider
 * used as the panel that carries the thing you are working toward, which says
 * "this is the scoreboard" without adding a second accent colour.
 *
 * Everything in it is a fact about the learner's own numbers: RP, the next rung
 * by name, roughly how much work that is, this week's contribution, and where
 * they currently sit. Nothing that merely *looks* like progress.
 *
 * Every colour below resolves through the band scope (see globals.css), so the
 * component is written once for a light page and renders correctly on the dark
 * ground it actually sits on. In dark mode the same tokens flip the panel a step
 * *up* off the black page rather than repeating it.
 */
export function RankStrip({
  rank,
  lobby,
  week,
  placement,
  xpThisWeek,
  className,
}: {
  rank: Rank;
  lobby: LobbyData;
  week: WeekBounds;
  placement: Placement;
  xpThisWeek: number;
  className?: string;
}) {
  const placing = placement.placing;

  const zoneLabel =
    lobby.zone === 'promotion'
      ? 'Promotion zone'
      : lobby.zone === 'demotion'
        ? 'Demotion zone'
        : lobby.zone === 'pending'
          ? 'Being placed'
          : 'Safe';

  return (
    <TilePanel tone="dark" className={cn('relative', className)}>
      {/* A single off-centre wash of light. Not decoration: it is the light
          source for the band, and it is what stops a near-black panel reading
          as a hole in the page. White at 10% — a rank is not a colour. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-white/10 blur-3xl"
      />

      <div className="relative flex flex-wrap items-center gap-5 sm:gap-7">
        <motion.div
          initial={{ scale: 0.88, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={SPRING.pop}
        >
          <RankCrest rank={rank} size={96} />
        </motion.div>

        <div className="min-w-0 flex-1">
          <p className="t-eyebrow">Your rank</p>
          <h2 className="t-display mt-1">{rank.label}</h2>

          <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">
            {placing
              ? `Placement — ${placement.done} of ${placement.target} reviews before you hold a rank.`
              : rank.isApex
                ? 'Top of the ladder. Holding it is the hard part.'
                : `${rank.remaining} RP to the next rung · about ${reviewsForRp(rank.remaining)} reviews.`}
          </p>

          <div className="mt-3.5 flex items-center gap-3">
            <div className="meter h-2 flex-1">
              <motion.div
                className="meter-fill"
                initial={{ width: 0 }}
                animate={{ width: `${placing ? placement.percent : rank.percent}%` }}
                transition={SPRING.meter}
              />
            </div>
            <span className="num t-fine shrink-0 text-muted-foreground">
              <NumberTicker value={placing ? placement.done : rank.points} />
              {placing ? `/${placement.target}` : ' RP'}
            </span>
          </div>
        </div>

        {/* Lobby status — the weekly stake, with the clock on it. */}
        <Link
          href="/progress"
          className="group flex w-full shrink-0 items-center justify-between gap-4 rounded-lg border border-border bg-secondary px-4 py-3.5 transition-colors duration-150 hover:border-border-strong sm:w-auto sm:min-w-[210px]"
        >
          <div>
            <p className="t-fine text-muted-foreground">
              {week.daysLeft === 1 ? 'Last day this week' : `${week.daysLeft} days left this week`}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-[14px] font-semibold">
              {zoneLabel}
              <Icon
                name={lobby.zone === 'demotion' ? 'zoneDown' : 'zoneUp'}
                size={13}
                className={
                  lobby.zone === 'promotion'
                    ? 'text-good'
                    : lobby.zone === 'demotion'
                      ? 'text-destructive'
                      : 'text-muted-foreground'
                }
              />
            </p>
            <p className="num t-fine mt-1 text-muted-foreground">
              {lobby.position} of {lobby.size} · <NumberTicker value={xpThisWeek} /> XP this week
            </p>
          </div>
          <Icon
            name="next"
            size={16}
            className="text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5"
          />
        </Link>
      </div>
    </TilePanel>
  );
}
