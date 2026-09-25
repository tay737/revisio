'use client';

import { Icon } from '@/components/ui/icons';
import { RankCrest } from '@/components/ui/rank-crest';
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
 * The weekly lobby — the Duolingo half of the ranked system.
 *
 * It was a table: eight-column, horizontal scroll on a phone, with the seat
 * numbers repeated in a header. It is now a list of rows that reads top-to-bottom
 * on a 390px screen without a single horizontal swipe, because a league table is
 * a sequence — first to last — and a sequence belongs in a list, not a grid.
 *
 * The parts that make it a *league* rather than a leaderboard are kept:
 *
 *   • **The bands are labelled.** "Top five promote" is the entire reason to
 *     check the table twice.
 *   • **Empty seats are shown honestly**, dimmed and labelled, so the table
 *     never pretends a lobby of one is a competition.
 *   • **You are always seated**, even in a week you have not reviewed yet.
 *   • **Your own row is the only row in the promotion colour**, so the answer to
 *     "where am I" takes no reading.
 *
 * Colour does one job: green marks the promotion band, cardinal marks the
 * demotion band, and every other row is ink on canvas.
 */
export function LobbyTable({ lobby, className }: { lobby: LobbyData; className?: string }) {
  const unclaimed = Math.max(0, lobby.size - lobby.rows.length);
  const demotionFrom = lobby.size - lobby.band + 1;
  const shownSeats = Math.min(unclaimed, 3);

  return (
    <div className={cn('min-w-0', className)}>
      {/* Band legend. */}
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <span className="badge badge-good">
          <Icon name="zoneUp" size={12} />
          Top {lobby.band} promote
        </span>
        <span className="badge badge-quiet">
          <Icon name="zoneDown" size={12} />
          Bottom {lobby.band} demote
        </span>
        <span className="num ml-auto text-[12px] text-muted-foreground">
          {lobby.filled}/{lobby.size} seats
        </span>
      </div>

      <ol className="divide-y divide-border">
        {lobby.rows.map((row) => {
          const promoting = row.position <= lobby.band;
          const demoting = row.position >= demotionFrom;
          return (
            <li
              key={`${row.position}-${row.name}`}
              className={cn(
                'flex items-center gap-3 py-2.5',
                row.isMe && '-mx-2 rounded-md bg-secondary px-2',
              )}
            >
              <span
                className={cn(
                  'num w-6 shrink-0 text-center text-[13px]',
                  row.isMe ? 'font-bold' : 'text-muted-foreground',
                )}
              >
                {row.position}
              </span>

              {row.isMe && (
                <RankCrest rank={row.rank} size={30} showProgress={false} animate={false} />
              )}

              <span className="min-w-0 flex-1">
                <span className={cn('block truncate text-[15px]', row.isMe && 'font-bold')}>
                  {row.isMe ? 'You' : row.name}
                </span>
                {!row.isMe && (
                  <span className="block truncate text-[12px] text-muted-foreground">
                    {row.rank.label}
                  </span>
                )}
              </span>

              {promoting && (
                <Icon name="zoneUp" size={14} className="shrink-0 text-good" aria-label="Promotion band" />
              )}
              {demoting && !promoting && (
                <Icon
                  name="zoneDown"
                  size={14}
                  className="shrink-0 text-destructive"
                  aria-label="Demotion band"
                />
              )}

              <span className="num shrink-0 text-[14px] font-semibold">{row.xp} XP</span>
            </li>
          );
        })}

        {Array.from({ length: shownSeats }).map((_, i) => (
          <li key={`open-${i}`} className="flex items-center gap-3 py-2.5">
            <span className="num w-6 shrink-0 text-center text-[13px] text-muted-foreground">
              {lobby.rows.length + i + 1}
            </span>
            <span className="min-w-0 flex-1 text-[15px] italic text-muted-foreground">Open seat</span>
          </li>
        ))}
      </ol>

      {unclaimed > shownSeats && (
        <p className="mt-2 text-[12px] text-muted-foreground">
          +{unclaimed - shownSeats} more open seats
        </p>
      )}
    </div>
  );
}
