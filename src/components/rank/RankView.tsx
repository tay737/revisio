'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useSeason } from '@/lib/useSeason';
import { Icon } from '@/components/ui/icons';
import { RankCrest } from '@/components/ui/rank-crest';
import { NumberTicker } from '@/components/ui/number-ticker';
import { Notice } from '@/components/Notice';
import { SPRING, cappedDelay } from '@/lib/motion';
import { cn } from '@/lib/utils';
import {
  DIVISION_LABEL,
  DIVISION_SPAN,
  RANK_LADDER,
  TIER_ORDER,
  rankFor,
  reviewsForRp,
  tierColor,
  tierName,
  type Rank,
  type Tier,
} from '@/domain/ranked';
import { seasonLine, type SeasonReward } from '@/domain/seasons';

/**
 * Rank — one view, because there is one rank.
 *
 * This used to be two tabs. "Ladder" showed the whole climb on **lifetime** XP
 * and said so; "Season" showed the same thirty rungs on XP earned inside a
 * ninety-day window. Two tabs, two implementations of one idea, and the copy
 * under each had to explain how they related — which is a sign the split was
 * wrong rather than that it needed a better explanation.
 *
 * The rank is now seasonal. So there is one number, one engine
 * (`domain/ranked`), and one screen, ordered the way the thing actually happens:
 *
 *   • **The clock** — which season, how far through, what it pays.
 *   • **The ladder** — every rung, your position marked, drawn from *this*
 *     season's XP. Reaching a rung this season means nothing next season, and
 *     the rail is where that becomes obvious rather than where it is explained.
 *   • **The board** — the competition. Thirty seats, everybody on it started
 *     this season on Bronze III, so the person above you was reachable.
 *   • **Your seasons** — what you finished on, and the reward that tier earns.
 *     This is the part that outlives the season, so it gets the most space.
 *   • **Your record** — lifetime XP through the same engine. Not your rank any
 *     more: the number that never resets, kept because a learner who has put in
 *     two years should be able to see that somewhere.
 */

export type RankViewData = {
  /** The seasonal rank — the one the whole screen is about. */
  rank: Rank;
  placement: { placing: boolean; done: number; target: number; percent: number };
  form: { form: string; label: string; detail: string } | null;
  /** The same engine on lifetime XP — the record, not the rank. */
  lifetimeRank: Rank;
  totalXp: number;
};

export function RankView({ data }: { data: RankViewData }) {
  const { season, loading, refresh } = useSeason();
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [claiming, setClaiming] = useState<number | null>(null);

  if (loading && !season) {
    return (
      <div className="space-y-4">
        <div className="card">
          <div className="skeleton h-4 w-40" />
          <div className="skeleton mt-4 h-24 w-full" />
        </div>
        <div className="card">
          <div className="skeleton h-40 w-full" />
        </div>
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

  const { board, history } = season;
  const isLastDay = season.season.daysLeft <= 1;
  // The season endpoint is the authority on the season figures; the ranked
  // payload carries the same rank computed at request time. Preferring the
  // season's own `mine` keeps one number on screen even if the two requests
  // straddled a review — the ladder, the clock and the board then cannot
  // disagree with each other about the same season.
  const mine = season.mine;
  const rank = mine.rank;

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

      <SeasonClock season={season.season} mine={mine} isLastDay={isLastDay} />
      <TierProgress rank={rank} form={data.form} />
      <TheLadder rank={rank} placement={data.placement} season={season.season} />
      <SeasonBoard season={season.season} board={board} mine={mine} />
      <Showcase history={history} claiming={claiming} onClaim={claim} />
      <YourRecord lifetimeRank={data.lifetimeRank} totalXp={data.totalXp} />
      {/* The ladder as the API priced it, overrides included. */}
      <SeasonRewards rewards={season.rewards} />
    </div>
  );
}

// ── the clock ───────────────────────────────────────────────────────────────

function SeasonClock({
  season,
  mine,
  isLastDay,
}: {
  season: { number: number; label: string; rangeLabel: string; daysLeft: number; day: number; lengthDays: number; percentElapsed: number };
  mine: { xp: number; reviews: number; placed: boolean; rank: Rank; position: number; fieldSize: number };
  isLastDay: boolean;
}) {
  return (
    <section className="card">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="t-eyebrow">{season.label}</p>
          <h2 className="t-display mt-1">{season.rangeLabel}</h2>
        </div>
        <span className="num badge badge-quiet shrink-0">
          {isLastDay ? 'Last day' : `${season.daysLeft} days left`}
        </span>
      </header>

      <div className="mt-4 flex items-center gap-3">
        <div className="meter h-2 flex-1">
          <motion.div
            className="meter-fill"
            initial={{ width: 0 }}
            animate={{ width: `${season.percentElapsed}%` }}
            transition={SPRING.meter}
          />
        </div>
        <span className="num t-fine shrink-0 text-muted-foreground">
          Day {season.day} of {season.lengthDays}
        </span>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-5 sm:gap-7">
        <motion.div initial={{ scale: 0.88, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={SPRING.pop}>
          <RankCrest rank={mine.rank} size={92} />
        </motion.div>

        <div className="min-w-0 flex-1">
          <p className="t-eyebrow">Your rank</p>
          <h3 className="t-display-md mt-1">{mine.placed ? mine.rank.label : 'Being placed'}</h3>
          <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">
            {seasonLine({
              daysLeft: season.daysLeft,
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
              {mine.reviews} of 10 reviews this season.
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
    </section>
  );
}

// ── tier meters ─────────────────────────────────────────────────────────────

function TierProgress({
  rank,
  form,
}: {
  rank: Rank;
  form: { form: string; label: string; detail: string } | null;
}) {
  const tiers = useMemo(() => {
    return TIER_ORDER.map((tier) => {
      const base = RANK_LADDER.find((r) => r.tier === tier)!.base;
      const total = DIVISION_SPAN[tier] * 3;
      const earned = Math.max(0, Math.min(total, rank.points - base));
      return { tier, base, total, earned, percent: Math.round((earned / total) * 100) };
    });
  }, [rank.points]);

  return (
    <section className="card">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="t-tagline">Tier progress</h3>
        <span className="num text-[13px] text-muted-foreground">
          <NumberTicker value={rank.points} /> RP this season
        </span>
      </div>

      <div className="mt-4 flex gap-1.5">
        {tiers.map((t) => {
          const isCurrent = t.tier === rank.tier;
          const cleared = rank.points >= t.base + t.total;
          const metal = tierColor(t.tier);
          return (
            <div key={t.tier} className="min-w-0 flex-1">
              <div className="meter h-2">
                <motion.div
                  className="h-full rounded-pill"
                  // Cleared and current tiers fill in their own metal; a tier
                  // still ahead of you stays ink-less grey, so a glance at the
                  // rail reads as "how far through have I got".
                  style={cleared || isCurrent ? { background: metal } : { background: 'var(--border-strong)' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${t.percent}%` }}
                  transition={SPRING.meter}
                />
              </div>
              <p
                className={cn(
                  'mt-1.5 truncate text-[10px] font-bold uppercase tracking-[0.06em]',
                  !isCurrent && 'text-muted-foreground',
                )}
                style={isCurrent ? { color: metal } : undefined}
                title={cleared ? `${tierName(t.tier)} — cleared` : tierName(t.tier)}
              >
                {tierName(t.tier)}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3.5">
        <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <Icon name="form" size={14} />
          Form
          <strong className="font-semibold text-foreground">{form?.label ?? '—'}</strong>
        </span>
        <span className="min-w-0 flex-1 text-[13px] text-muted-foreground">{form?.detail}</span>
      </div>
    </section>
  );
}

// ── the rail ────────────────────────────────────────────────────────────────

function TheLadder({
  rank,
  placement,
  season,
}: {
  rank: Rank;
  placement: { placing: boolean; done: number; target: number };
  season: { number: number; label: string };
}) {
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [rank.index]);

  return (
    <section className="card">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="t-tagline">The ladder</h3>
        <span className="num text-[13px] text-muted-foreground">
          {placement.placing ? `Placement ${placement.done}/${placement.target}` : `${RANK_LADDER.length} ranks`}
        </span>
      </div>

      <div className="rail mt-4">
        {RANK_LADDER.map((rung) => {
          const rungRank = rankFor(rung.base);
          const isCurrent = rung.index === rank.index;
          const reached = rung.index <= rank.index;
          return (
            <div
              key={rung.index}
              ref={isCurrent ? activeRef : undefined}
              className={cn(
                'flex w-[96px] flex-col items-center gap-1.5 rounded-lg border px-2.5 py-3.5 text-center',
                isCurrent ? 'border-foreground bg-secondary' : 'border-border',
              )}
            >
              <RankCrest rank={rungRank} size={42} showProgress={false} muted={!reached} animate={false} />
              <p className={cn('text-[13px] font-semibold', reached ? 'text-foreground' : 'text-muted-foreground')}>
                {DIVISION_LABEL[rung.division]}
              </p>
              {/* The tier's metal rides the label once you have reached it —
                  the same rule as the crest: unreached rungs are grey. */}
              <p
                className="text-[10px] uppercase tracking-[0.06em]"
                style={reached ? { color: tierColor(rung.tier) } : undefined}
              >
                {tierName(rung.tier)}
              </p>
              <p className="num text-[10px] text-muted-foreground">{rung.base} RP</p>
            </div>
          );
        })}
      </div>

      <p className="mt-3.5 text-[13px] leading-relaxed text-muted-foreground">
        Measured against {season.label.toLowerCase()}.{' '}
        {!rank.isApex ? (
          <>
            Next rung in <strong className="font-semibold text-foreground">{rank.remaining} RP</strong> ·
            about {reviewsForRp(rank.remaining)} reviews. The ladder resets when the season does.
          </>
        ) : (
          <>Top of the ladder. Holding it for ninety days is the hard part.</>
        )}
      </p>
    </section>
  );
}

// ── the board ───────────────────────────────────────────────────────────────

function SeasonBoard({
  season,
  board,
  mine,
}: {
  season: { label: string };
  board: { position: number; userId: string; name: string; xp: number; isMe: boolean; rank: Rank }[];
  mine: { position: number };
}) {
  return (
    <section className="card">
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="t-tagline">Season board</h3>
        <span className="t-fine text-muted-foreground">Resets with the season</span>
      </header>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        Everybody on this board started {season.label.toLowerCase()} on Bronze III. Ordered by XP earned
        inside the window.
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
              className={cn('flex items-center gap-3 py-2.5', row.isMe && '-mx-2 rounded-md bg-secondary px-2')}
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
                <span className={cn('block truncate text-[15px]', row.isMe && 'font-bold')}>{row.name}</span>
                <span className="block truncate text-[12px]" style={{ color: tierColor(row.rank.tier) }}>
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
  );
}

// ── the showcase ────────────────────────────────────────────────────────────

type HistoryRow = {
  seasonNumber: number;
  rank: Rank;
  reviews: number;
  reward: SeasonReward;
  rewardClaimedAt: string | null;
  endedAt: string;
};

function Showcase({
  history,
  claiming,
  onClaim,
}: {
  history: HistoryRow[];
  claiming: number | null;
  onClaim: (seasonNumber: number) => void;
}) {
  return (
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
          Nothing to show yet — no season has closed since your first ten reviews. When one does, the rank
          you hold on its last day is recorded here with the reward that tier earns.
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
                  onClick={() => onClaim(row.seasonNumber)}
                >
                  {claiming === row.seasonNumber ? 'Claiming…' : 'Claim'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── the record ──────────────────────────────────────────────────────────────

function YourRecord({ lifetimeRank, totalXp }: { lifetimeRank: Rank; totalXp: number }) {
  return (
    <section className="card">
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="t-tagline">Your record</h3>
        <span className="num text-[13px] text-muted-foreground">
          <NumberTicker value={totalXp} /> XP all time
        </span>
      </header>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        Every review you have ever done, run through the same ladder. It is not your rank — that resets
        each season — but it is the one number that only ever goes up.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-border px-4 py-3.5">
        <RankCrest rank={lifetimeRank} size={48} showProgress={false} animate={false} />
        <div className="min-w-0 flex-1">
          <p className="t-caption-s">Peak standing</p>
          <p className="t-strong mt-0.5" style={{ color: tierColor(lifetimeRank.tier) }}>
            {lifetimeRank.label}
          </p>
        </div>
        <span className="num text-[13px] text-muted-foreground">
          <NumberTicker value={lifetimeRank.points} /> RP lifetime
        </span>
      </div>
    </section>
  );
}

// ── what each tier pays ─────────────────────────────────────────────────────

function SeasonRewards({
  rewards,
}: {
  rewards: { tier: Tier; name: string; reward: SeasonReward }[];
}) {
  return (
    <section className="card">
      <h3 className="t-tagline">Season rewards</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        Paid on the tier you finish in, not the division — so a season never ends one rung short of the
        next tier for nothing.
      </p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {rewards.map((row) => (
          <li key={row.tier} className="flex items-start gap-2.5 rounded-md border border-border px-3.5 py-3">
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
      <Link href="/review" className="btn btn-primary mt-4 gap-2 sm:w-auto">
        Earn this season&apos;s rank
        <Icon name="next" size={16} />
      </Link>
    </section>
  );
}