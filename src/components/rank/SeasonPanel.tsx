'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useSeason } from '@/lib/useSeason';
import { Icon } from '@/components/ui/icons';
import { RankCrest } from '@/components/ui/rank-crest';
import { NumberTicker } from '@/components/ui/number-ticker';
import { TilePanel } from '@/components/ui/tile';
import { Notice } from '@/components/Notice';
import { SPRING, cappedDelay } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { reviewsForRp, tierColor } from '@/domain/ranked';
import { rewardLadder, seasonLine } from '@/domain/seasons';

/**
 * Season.
 *
 * The lifetime ladder says *how far you have come*. This says *what you are
 * winning right now*, and it is deliberately the more urgent of the two: a
 * ninety-day clock, a board everybody on it started from the bottom rung, and a
 * record of what you finished on.
 *
 * Three panels, in the order the season actually happens:
 *
 *   • The clock and your season rank — how much is left, where you are, and the
 *     next rung by name.
 *   • The board — the competition. Thirty seats, ordered on XP earned *inside*
 *     this window, so the person above you was reachable.
 *   • The showcase — closed seasons, their final crest, and the reward that
 *     tier earns. This is the part that outlives the season, so it is the part
 *     with the most generous space on the page.
 */
export function SeasonPanel() {
  const { season, loading, refresh } = useSeason();
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [claiming, setClaiming] = useState<number | null>(null);

  if (loading && !season) {
    return (
      <div className="card">
        <div className="skeleton h-4 w-40" />
        <div className="skeleton mt-4 h-24 w-full" />
      </div>
    );
  }

  if (!season) {
    return (
      <Notice tone="bad" show>
        The season could not be loaded. Try again in a moment.
      </Notice>
    );
  }

  const { mine, board, history } = season;
  const isLastDay = season.season.daysLeft <= 1;

  const claim = async (seasonNumber: number) => {
    setClaiming(seasonNumber);
    setError('');
    setNote('');
    try {
      const res = await api.patch<{ alreadyClaimed: boolean }>('/api/v1/seasons', { seasonNumber });
      setNote(
        res.alreadyClaimed
          ? 'That reward was already on your showcase.'
          : 'Claimed. It is on your showcase from now on.',
      );
      void refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not claim that reward.');
    } finally {
      setClaiming(null);
    }
  };

  return (
    <div className="space-y-4">
      <Notice tone="note" show={!!note}>
        {note}
      </Notice>
      <Notice tone="bad" show={!!error}>
        {error}
      </Notice>

      {/* ── The clock ─────────────────────────────────────────────────────── */}
      <TilePanel tone="dark">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="t-eyebrow">{season.season.label}</p>
            <h2 className="t-display mt-1">{season.season.rangeLabel}</h2>
          </div>
          <span className="num badge badge-quiet">
            {isLastDay ? 'Last day' : `${season.season.daysLeft} days left`}
          </span>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="meter h-2 flex-1">
            <motion.div
              className="meter-fill"
              initial={{ width: 0 }}
              animate={{ width: `${season.season.percentElapsed}%` }}
              transition={SPRING.meter}
            />
          </div>
          <span className="num t-fine shrink-0 text-muted-foreground">
            Day {season.season.day} of {season.season.lengthDays}
          </span>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-5 sm:gap-7">
          <motion.div initial={{ scale: 0.88, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={SPRING.pop}>
            <RankCrest rank={mine.rank} size={92} />
          </motion.div>

          <div className="min-w-0 flex-1">
            <p className="t-eyebrow">Season rank</p>
            <h3 className="t-display-md mt-1">{mine.placed ? mine.rank.label : 'Being placed'}</h3>
            <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">
              {seasonLine({
                daysLeft: season.season.daysLeft,
                rankLabel: mine.rank.label,
                placed: mine.placed,
                isLastDay,
              })}
            </p>

            <div className="mt-3.5 flex items-center gap-3">
              <div className="meter h-2 flex-1">
                <motion.div
                  className="meter-fill"
                  initial={{ width: 0 }}
                  animate={{ width: `${mine.rank.percent}%` }}
                  transition={SPRING.meter}
                />
              </div>
              <span className="num t-fine shrink-0 text-muted-foreground">
                <NumberTicker value={mine.xp} /> RP
              </span>
            </div>

            {!mine.placed && (
              <p className="mt-2 text-[13px] text-muted-foreground">
                {mine.reviews} of 10 reviews this season. The rank resets when the season does; this one
                does not.
              </p>
            )}
            {mine.placed && !mine.rank.isApex && (
              <p className="mt-2 text-[13px] text-muted-foreground">
                {mine.rank.remaining} RP to the next rung · about {reviewsForRp(mine.rank.remaining)} more
                reviews.
              </p>
            )}
          </div>

          <div className="flex w-full shrink-0 items-center justify-between gap-4 rounded-lg border border-border bg-secondary px-4 py-3.5 sm:w-auto sm:min-w-[190px]">
            <div>
              <p className="t-fine text-muted-foreground">On the season board</p>
              <p className="num mt-1 text-[17px] font-semibold">
                {mine.position}
                {mine.fieldSize > 0 && (
                  <span className="text-[13px] font-normal text-muted-foreground"> of {mine.fieldSize}</span>
                )}
              </p>
            </div>
            <Icon name="league" size={18} className="text-muted-foreground" />
          </div>
        </div>
      </TilePanel>

      {/* ── The board ─────────────────────────────────────────────────────── */}
      <section className="card">
        <header className="flex items-baseline justify-between gap-3">
          <h3 className="t-tagline">Season board</h3>
          <span className="t-fine text-muted-foreground">Resets with the season</span>
        </header>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          Everybody on this board started {season.season.label.toLowerCase()} on Bronze III. Ordered by XP
          earned inside the window.
        </p>

        {board.length === 0 ? (
          <p className="mt-4 text-[14px] text-muted-foreground">
            Nobody has logged XP this season yet. One review puts you on it.
          </p>
        ) : (
          <ol className="mt-4 divide-y divide-border">
            {board.map((row, i) => (
              <motion.li
                key={row.userId}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SPRING.settle, delay: cappedDelay(i, 0.02, 0.2) }}
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
                <RankCrest rank={row.rank} size={30} showProgress={false} animate={false} />
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate text-[15px]', row.isMe && 'font-bold')}>
                    {row.name}
                  </span>
                  <span
                    className="block truncate text-[12px]"
                    style={{ color: tierColor(row.rank.tier) }}
                  >
                    {row.rank.label}
                  </span>
                </span>
                <span className="num shrink-0 text-[14px] text-muted-foreground">
                  <NumberTicker value={row.xp} /> RP
                </span>
              </motion.li>
            ))}
          </ol>
        )}

        {mine.position > board.length && (
          <p className="mt-3 text-[13px] text-muted-foreground">
            You are {mine.position} in the season — outside the top {board.length}, and climbing.
          </p>
        )}
      </section>

      {/* ── The showcase ──────────────────────────────────────────────────── */}
      <section className="card">
        <header className="flex items-baseline justify-between gap-3">
          <h3 className="t-tagline">Your seasons</h3>
          <span className="num text-[13px] text-muted-foreground">{history.length}</span>
        </header>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          The rank you finished each season on. These do not change when the next one starts.
        </p>

        {history.length === 0 ? (
          <p className="mt-4 text-[14px] leading-relaxed text-muted-foreground">
            Nothing to show yet — no season has closed since your first ten reviews. When one does, the
            rank you hold on its last day is recorded here with the reward that tier earns.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {history.map((row) => (
              <li
                key={row.seasonNumber}
                className="flex flex-wrap items-center gap-4 rounded-lg border border-border px-4 py-3.5"
              >
                <RankCrest rank={row.rank} size={56} showProgress={false} animate={false} />
                <div className="min-w-0 flex-1">
                  <p className="t-eyebrow">Season {row.seasonNumber}</p>
                  <p className="t-strong mt-0.5" style={{ color: tierColor(row.rank.tier) }}>
                    {row.rank.label}
                  </p>
                  <p className="t-fine mt-0.5 text-muted-foreground">
                    {row.reviews} reviews · {row.rank.points.toLocaleString()} RP
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[14px] font-semibold">
                    <Icon name={row.reward.icon} size={14} className="text-gold" />
                    {row.reward.name}
                  </p>
                  <p className="t-fine mt-0.5 text-muted-foreground">{row.reward.detail}</p>
                </div>
                {row.rewardClaimedAt ? (
                  <span className="badge badge-quiet shrink-0 gap-1">
                    <Icon name="checked" size={12} />
                    Claimed
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm shrink-0"
                    disabled={claiming === row.seasonNumber}
                    onClick={() => claim(row.seasonNumber)}
                  >
                    {claiming === row.seasonNumber ? 'Claiming…' : 'Claim'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── What each tier pays ───────────────────────────────────────────── */}
      <section className="card">
        <h3 className="t-tagline">Season rewards</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          Paid on the tier you finish in, not the division — so a season never ends one rung short of
          the next tier for nothing.
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {rewardLadder().map((row) => (
            <li
              key={row.tier}
              className="flex items-start gap-2.5 rounded-md border border-border px-3.5 py-3"
            >
              <span
                className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: tierColor(row.tier) }}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="t-caption-s">{row.name}</p>
                <p className="text-[12px] text-muted-foreground">{row.reward.detail}</p>
              </div>
            </li>
          ))}
        </ul>
        <Link
          href="/review"
          className="btn btn-primary mt-4 gap-2 sm:w-auto"
        >
          Earn this season&apos;s rank
          <Icon name="next" size={16} />
        </Link>
      </section>
    </div>
  );
}