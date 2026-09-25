'use client';

import { motion } from 'framer-motion';
import { Icon } from '@/components/ui/icons';
import { RankCrest } from '@/components/ui/rank-crest';
import { cappedDelay, SPRING } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { type LobbyZone, type Rank } from '@/domain/ranked';

export type LobbyRow = {
  position: number;
  name: string;
  xp: number;
  isMe: boolean;
  rank: Rank;
};

export type LobbyData = {
  position: number;
  size: number;
  filled: number;
  zone: LobbyZone;
  band: number;
  rows: LobbyRow[];
};

/**
 * The weekly lobby table.
 *
 * This is the Duolingo half of the ranked system, and the parts that matter are
 * the parts a plain leaderboard leaves out:
 *
 *   • **The bands are labelled.** "Top five go up" is the only reason a
 *     leaderboard is worth checking twice.
 *   • **The empty seats are shown.** A league table that hides its empty seats
 *     pretends a table of one is a competition. Unclaimed seats are dimmed and
 *     labelled as such, so the shape of the league is visible and honest.
 *   • **You are always seated.** The learner's row is never missing, even in a
 *     week they have not reviewed yet.
 *
 * Colour does one job here: accent marks the promotion band and your own row,
 * nothing else. Demotion is signalled by direction (a chevron down) and weight,
 * not by a red — demotion is a mechanic, not an error, and the design system
 * reserves its error tone for things that are actually wrong.
 */
export function LobbyTable({
  lobby,
  className,
}: {
  lobby: LobbyData;
  className?: string;
}) {
  const unclaimed = Math.max(0, lobby.size - lobby.rows.length);
  const demotionFrom = lobby.size - lobby.band + 1;

  return (
    <div className={cn('overflow-hidden', className)}>
      {/* Zone legend */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 px-1">
        <span className="inline-flex items-center gap-1.5 t-fine text-accent">
          <Icon name="zoneUp" size={12} />
          Top {lobby.band} promote
        </span>
        <span className="inline-flex items-center gap-1.5 t-fine text-muted">
          <Icon name="zoneDown" size={12} />
          Bottom {lobby.band} demote
        </span>
        <span className="t-fine ml-auto text-muted">
          {lobby.filled} of {lobby.size} seats taken
        </span>
      </div>

      <ol className="space-y-0.5">
        {lobby.rows.map((row, i) => {
          const inPromotion = row.position <= lobby.band;
          const inDemotion = row.position >= demotionFrom;
          return (
            <motion.li
              key={`${row.position}-${row.name}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...SPRING.settle, delay: cappedDelay(i, 0.02, 0.24) }}
              className={cn(
                'flex items-center gap-3 rounded-[11px] px-3 py-2.5',
                row.isMe && 'bg-accent/10 ring-1 ring-inset ring-accent/25',
              )}
            >
              <span
                className={cn(
                  'w-6 shrink-0 text-center text-[14px] tabular-nums',
                  row.isMe ? 'font-semibold text-accent' : inPromotion ? 'font-semibold text-ink' : 'text-muted',
                )}
              >
                {row.position}
              </span>

              {/* Zone tick — a 2px bar rather than a coloured row. */}
              <span
                aria-hidden
                className={cn(
                  'h-6 w-[2px] shrink-0 rounded-full',
                  inPromotion ? 'bg-accent' : inDemotion ? 'bg-muted/60' : 'bg-transparent',
                )}
              />

              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-[17px]',
                  row.isMe ? 'font-semibold text-accent' : 'text-ink',
                )}
              >
                {row.name}
              </span>

              <span className="hidden shrink-0 sm:block">
                <RankCrest rank={row.rank} size={22} showProgress={false} animate={false} />
              </span>
              <span className="t-fine shrink-0 text-muted">{row.rank.label}</span>

              <span className="t-caption w-16 shrink-0 text-right tabular-nums text-muted">
                {row.xp} XP
              </span>
            </motion.li>
          );
        })}

        {/* Band label above the demotion zone, so the cut line is explained
            where it actually falls rather than only in the legend. */}
        {unclaimed === 0 && demotionFrom > lobby.rows.length + 1 && (
          <li aria-hidden className="flex items-center gap-2 px-3 py-1">
            <span className="h-px flex-1 bg-edge/70" />
            <span className="t-micro uppercase tracking-[0.08em] text-muted">Demotion line</span>
            <span className="h-px flex-1 bg-edge/70" />
          </li>
        )}

        {Array.from({ length: unclaimed }).map((_, i) => {
          const position = lobby.rows.length + i + 1;
          return (
            <li
              key={`unclaimed-${position}`}
              className="flex items-center gap-3 rounded-[11px] px-3 py-2 opacity-55"
            >
              <span className="w-6 shrink-0 text-center text-[14px] tabular-nums text-muted">{position}</span>
              <span aria-hidden className="h-6 w-[2px] shrink-0 rounded-full bg-transparent" />
              <span className="t-caption min-w-0 flex-1 truncate text-muted">Unclaimed seat</span>
              <span className="t-caption w-16 shrink-0 text-right tabular-nums text-muted">—</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
