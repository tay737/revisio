'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Icon } from '@/components/ui/icons';
import { RankCrest } from '@/components/ui/rank-crest';
import { NumberTicker } from '@/components/ui/motion/number-ticker';
import { TilePanel } from '@/components/ui/tile';
import { SPRING } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { reviewsForRp, type Placement, type Rank, type WeekBounds } from '@/domain/ranked';
import type { LobbyData } from '@/components/rank/LobbyTable';

/**
 * Your rank, in one glance.
 *
 * This is the competitive half of the product surfacing on the page people
 * actually open first. It is a **near-black tile on a light canvas** — the
 * spec's own section divider used as the panel that carries the thing you are
 * working toward, which is the clearest way to say "this is the scoreboard"
 * without adding a second accent colour.
 *
 * Everything here is a fact about the learner's own numbers: RP, the next rung
 * by name, roughly how much work it is, this week's contribution and where they
 * currently sit in the lobby. No decoration, nothing that only looks like
 * progress.
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
      {/* A single off-centre wash of accent light. Not a decorative gradient
          mark: it is the light source for the tile, and it is what stops a
          near-black panel reading as a hole in the page. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-accent/20 blur-3xl"
      />

      <div className="relative flex flex-wrap items-center gap-5 sm:gap-7">
        <motion.div
          initial={{ scale: 0.88, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={SPRING.pop}
        >
          <RankCrest rank={rank} size={104} />
        </motion.div>

        <div className="min-w-[200px] flex-1">
          <p className="t-eyebrow !text-white/55">Your rank</p>
          <h2 className="display-tight t-display mt-1">{rank.label}</h2>

          {placing ? (
            <p className="t-caption mt-1.5 text-white/70">
              Placement: {placement.done} of {placement.target} reviews before you hold a rank.
            </p>
          ) : (
            <p className="t-caption mt-1.5 text-white/70">
              {rank.isApex
                ? 'You are at the top of the ladder. Holding it is the hard part.'
                : `${rank.remaining} RP to the next rung — about ${reviewsForRp(rank.remaining)} more reviews.`}
            </p>
          )}

          <div className="mt-3.5 flex items-center gap-3">
            <div className="meter meter-accent h-2 flex-1">
              <motion.div
                className="h-full rounded-full bg-accent"
                initial={{ width: 0 }}
                animate={{ width: `${placing ? placement.percent : rank.percent}%` }}
                transition={SPRING.meter}
              />
            </div>
            <span className="t-fine shrink-0 tabular-nums text-white/70">
              <NumberTicker value={placing ? placement.done : rank.points} />
              {placing ? `/${placement.target}` : ' RP'}
            </span>
          </div>
        </div>

        {/* Lobby status — the weekly stake, with the clock on it. */}
        <Link
          href="/progress"
          className="group flex w-full shrink-0 items-center justify-between gap-4 rounded-[18px] border border-white/12 bg-white/5 px-4 py-3.5 transition-colors duration-200 hover:border-accent/50 sm:w-auto sm:min-w-[210px]"
        >
          <div>
            <p className="t-fine text-white/55">
              {week.daysLeft === 1 ? 'Last day this week' : `${week.daysLeft} days left this week`}
            </p>
            <p className="t-caption-s mt-1 flex items-center gap-1.5 text-white">
              {zoneLabel}
              <Icon
                name={lobby.zone === 'demotion' ? 'zoneDown' : 'zoneUp'}
                size={12}
                className={lobby.zone === 'safe' || lobby.zone === 'pending' ? 'text-white/45' : 'text-accent'}
              />
            </p>
            <p className="t-fine mt-1 text-white/55">
              {lobby.position} of {lobby.size} · <NumberTicker value={xpThisWeek} /> XP this week
            </p>
          </div>
          <Icon
            name="next"
            size={16}
            className="text-white/40 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-accent"
          />
        </Link>
      </div>
    </TilePanel>
  );
}
