'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { api, downloadFile } from '@/lib/api';
import { useMe } from '@/lib/useMe';
import { useRanked, type RankedScope } from '@/lib/useRanked';
import { Icon, achievementIcon } from '@/components/ui/icons';
import { RankCrest } from '@/components/ui/rank-crest';
import { NumberTicker } from '@/components/ui/number-ticker';
import { BlurFade } from '@/components/ui/blur-fade';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Notice } from '@/components/Notice';
import { RankStrip } from '@/components/rank/RankStrip';
import { LobbyTable } from '@/components/rank/LobbyTable';
import { SPRING, cappedDelay } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { lobbyLine } from '@/lib/profile';
import {
  DIVISION_LABEL,
  DIVISION_SPAN,
  RANK_LADDER,
  TIER_ORDER,
  formFor,
  rankFor,
  reviewsForRp,
  tierName,
  type Rank,
} from '@/domain/ranked';
import PageSkeleton from '@/components/PageSkeleton';

/**
 * Rank — the competitive hub.
 *
 * Organised the way a competitive game puts its progress screen together:
 *
 *   • **The scoreboard first.** The same near-black band and the same data the
 *     dashboard shows, from the same hook, so the two cannot disagree.
 *   • **Three views, one at a time.** The ladder, the weekly lobby and the raw
 *     XP ledger are now **tabs** (shadcn's `Tabs`, on Base UI) rather than a
 *     three-column wall with hand-rolled pill toggles — which is both less code
 *     and better behaviour, because the primitive brings roving focus and the
 *     keyboard semantics that the buttons I had written did not.
 *   • **Short copy.** Every paragraph that explained the mechanic to an adult who
 *     had already seen a leaderboard is gone; what is left states policy.
 *   • **Honest empty states.** A lobby with unclaimed seats says so; a learner
 *     still in placement is told that rather than shown a fake Bronze III.
 */

const VIEWS = [
  { id: 'ladder', label: 'Ladder' },
  { id: 'lobby', label: 'This week' },
  { id: 'board', label: 'XP' },
] as const;

type View = (typeof VIEWS)[number]['id'];

export default function RankPage() {
  const { me } = useMe();
  const [scope, setScope] = useState<RankedScope>('weekly');
  const [view, setView] = useState<View>('ladder');
  const { ranked, loading } = useRanked(scope);
  const [optOut, setOptOut] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (me) setOptOut(me.leaderboardOptOut);
  }, [me]);

  const toggleOptOut = async () => {
    const next = !optOut;
    setOptOut(next);
    setError('');
    try {
      await api.patch('/api/v1/me', { leaderboardOptOut: next });
      setNote(next ? 'You are off the boards. Your rank is untouched.' : 'You are back on the boards.');
    } catch (e) {
      setOptOut(!next);
      setError(e instanceof Error ? e.message : 'We could not change that setting.');
    }
  };

  const exportAs = (format: 'csv' | 'json') =>
    downloadFile(`/api/v1/exports?format=${format}`, `revisio-transcript.${format}`);

  if (loading && !ranked) return <PageSkeleton />;

  const data = ranked?.ranked;
  const form = me ? formFor(me.today.reviewed, me.today.correct) : null;
  const unlocked = ranked?.achievements.filter((a) => a.unlocked).length ?? 0;

  return (
    <div className="space-y-4">
      <Notice tone="note" show={!!note}>
        {note}
      </Notice>
      <Notice tone="bad" show={!!error}>
        {error}
      </Notice>

      {data && (
        <>
          <RankStrip
            rank={data.rank}
            lobby={data.lobby}
            week={data.week}
            placement={data.placement}
            xpThisWeek={data.xpThisWeek}
          />

          <Tabs value={view} onValueChange={(next) => setView(next as View)}>
            <TabsList className="h-11 w-full rounded-pill bg-secondary p-1 sm:w-auto">
              {VIEWS.map((v) => (
                <TabsTrigger
                  key={v.id}
                  value={v.id}
                  className="h-9 flex-1 rounded-pill px-4 text-[14px] font-semibold data-[active]:bg-card data-[active]:text-foreground sm:flex-none"
                >
                  {v.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="ladder" className="mt-4">
              <LadderView rank={data.rank} placement={data.placement} form={form} />
            </TabsContent>

            <TabsContent value="lobby" className="mt-4">
              <section className="card">
                <header className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="t-tagline">{data.rank.label} lobby</h2>
                    <p className="text-[13px] text-muted-foreground">{data.week.rangeLabel}</p>
                  </div>
                  <span className="badge badge-quiet num shrink-0">
                    {data.week.daysLeft === 1 ? 'Last day' : `${data.week.daysLeft} days left`}
                  </span>
                </header>

                <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
                  {lobbyLine({
                    zone: data.lobby.zone,
                    position: data.lobby.position,
                    size: data.lobby.size,
                    daysLeft: data.week.daysLeft,
                    rankLabel: data.rank.label,
                  })}
                </p>

                {/* The clock the whole lobby runs on. */}
                <div className="mt-4 flex items-center gap-3">
                  <div className="meter h-1.5 flex-1">
                    <motion.div
                      className="meter-fill"
                      initial={{ width: 0 }}
                      animate={{ width: `${data.week.percentElapsed}%` }}
                      transition={SPRING.meter}
                    />
                  </div>
                  <span className="num shrink-0 text-[12px] text-muted-foreground">
                    {100 - data.week.percentElapsed}% left
                  </span>
                </div>

                <div className="mt-4">
                  {optOut ? (
                    <div className="flex items-start gap-3 rounded-md bg-secondary p-3.5">
                      <Icon name="private" size={17} className="mt-0.5 shrink-0" />
                      <p className="text-[14px] leading-snug">
                        Your name is hidden. Your RP still moves.{' '}
                        <button
                          type="button"
                          onClick={toggleOptOut}
                          className="font-semibold underline underline-offset-4"
                        >
                          Rejoin
                        </button>
                      </p>
                    </div>
                  ) : (
                    <LobbyTable lobby={data.lobby} />
                  )}
                </div>
              </section>
            </TabsContent>

            <TabsContent value="board" className="mt-4">
              <section className="card">
                <header className="flex items-center justify-between gap-3">
                  <h2 className="t-tagline">XP board</h2>
                  <div className="flex gap-1.5">
                    {(['daily', 'weekly', 'monthly'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setScope(s)}
                        aria-pressed={scope === s}
                        className={cn('chip capitalize', scope === s && 'chip-active')}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </header>

                <ol className="mt-4 divide-y divide-border">
                  {ranked?.board.map((row, i) => (
                    <motion.li
                      key={`${row.rank}-${row.name}`}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ ...SPRING.settle, delay: cappedDelay(i, 0.02, 0.24) }}
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
                        {row.rank}
                      </span>
                      <span className={cn('min-w-0 flex-1 truncate text-[15px]', row.isMe && 'font-bold')}>
                        {row.isMe ? 'You' : row.name}
                      </span>
                      <span className="num shrink-0 text-[14px] text-muted-foreground">
                        <NumberTicker value={row.xp} /> XP
                      </span>
                    </motion.li>
                  ))}
                </ol>

                {ranked?.board.length === 0 && (
                  <p className="mt-3 text-[14px] text-muted-foreground">
                    Nobody has logged XP this {scope}. One review puts you on the board.
                  </p>
                )}

                <button
                  type="button"
                  onClick={toggleOptOut}
                  className="mt-3 text-[14px] font-medium underline underline-offset-4"
                >
                  {optOut ? 'Join the boards' : 'Hide me from the boards'}
                </button>
              </section>
            </TabsContent>
          </Tabs>

          {/* ── Achievements ───────────────────────────────────────────────── */}
          <section className="card">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="t-tagline">Achievements</h2>
              <span className="num text-[13px] text-muted-foreground">
                {unlocked}/{ranked?.achievements.length}
              </span>
            </div>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Permanent — a rank can slip, these cannot.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {ranked?.achievements.map((a, i) => (
                <BlurFade key={a.id} delay={cappedDelay(i, 0.03, 0.3)}>
                  <div
                    className={cn(
                      'flex items-center gap-3 rounded-md border px-3.5 py-3',
                      a.unlocked ? 'border-gold/60 bg-gold/10' : 'border-border',
                    )}
                  >
                    <span
                      className={cn(
                        'grid h-9 w-9 shrink-0 place-items-center rounded-full',
                        a.unlocked ? 'bg-gold/25 text-foreground' : 'bg-secondary text-muted-foreground',
                      )}
                    >
                      <Icon name={achievementIcon(a.id, a.icon)} size={17} />
                    </span>
                    <div className="min-w-0">
                      <div className={cn('t-caption-s', !a.unlocked && 'text-muted-foreground')}>
                        {a.name}
                      </div>
                      <div className="text-[12px] text-muted-foreground">{a.description}</div>
                    </div>
                    {a.unlocked && (
                      <Icon name="checked" size={16} className="ml-auto shrink-0 text-foreground" />
                    )}
                  </div>
                </BlurFade>
              ))}
            </div>
          </section>
        </>
      )}

      {/* ── Transcript ─────────────────────────────────────────────────────── */}
      <section className="card">
        <h2 className="t-tagline">Transcript</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Your full history — share it with a teacher, or keep it.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => exportAs('csv')} className="btn btn-secondary btn-sm gap-2">
            <Icon name="download" size={15} />
            CSV
          </button>
          <button type="button" onClick={() => exportAs('json')} className="btn btn-ghost gap-2">
            <Icon name="download" size={15} />
            JSON
          </button>
        </div>
      </section>
    </div>
  );
}

/**
 * The ladder — every rung in the game, with your position marked.
 *
 * A rank means nothing without the rungs above it, so this view always shows the
 * whole climb: five tier bars for how much of each tier is banked, then the
 * fifteen rungs as a rail that centres itself on your rank. Rungs you have not
 * reached are drawn with the identical crest in the muted tone — same shape, no
 * colour — which is the only way to show a fifteen-rank ladder inside a
 * one-colour system.
 */
function LadderView({
  rank,
  placement,
  form,
}: {
  rank: Rank;
  placement: { placing: boolean; done: number; target: number };
  form: { form: string; label: string; detail: string } | null;
}) {
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [rank.index]);

  const tiers = useMemo(() => {
    return TIER_ORDER.map((tier) => {
      const base = RANK_LADDER.find((r) => r.tier === tier)!.base;
      const total = DIVISION_SPAN[tier] * 3;
      const earned = Math.max(0, Math.min(total, rank.points - base));
      return { tier, base, total, earned, percent: Math.round((earned / total) * 100) };
    });
  }, [rank.points]);

  return (
    <div className="space-y-4">
      <section className="card">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="t-tagline">Tier progress</h2>
          <span className="num text-[13px] text-muted-foreground">
            <NumberTicker value={rank.points} /> RP
          </span>
        </div>

        <div className="mt-4 flex gap-1.5">
          {tiers.map((t) => {
            const isCurrent = t.tier === rank.tier;
            const cleared = rank.points >= t.base + t.total;
            return (
              <div key={t.tier} className="min-w-0 flex-1">
                <div className="meter h-2">
                  <motion.div
                    className={cn('h-full rounded-pill', cleared || isCurrent ? 'meter-fill' : 'bg-border-strong')}
                    initial={{ width: 0 }}
                    animate={{ width: `${t.percent}%` }}
                    transition={SPRING.meter}
                  />
                </div>
                <p
                  className={cn(
                    'mt-1.5 truncate text-[10px] font-bold uppercase tracking-[0.06em]',
                    isCurrent ? 'text-foreground' : 'text-muted-foreground',
                  )}
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

      <section className="card">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="t-tagline">The ladder</h2>
          <span className="num text-[13px] text-muted-foreground">
            {placement.placing
              ? `Placement ${placement.done}/${placement.target}`
              : `${RANK_LADDER.length} ranks`}
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
                <p
                  className={cn(
                    'text-[13px] font-semibold',
                    reached ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {DIVISION_LABEL[rung.division]}
                </p>
                <p className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                  {tierName(rung.tier)}
                </p>
                <p className="num text-[10px] text-muted-foreground">{rung.base} RP</p>
              </div>
            );
          })}
        </div>

        {!rank.isApex && (
          <p className="mt-3.5 text-[13px] text-muted-foreground">
            Next rung in {rank.remaining} RP · about {reviewsForRp(rank.remaining)} reviews.
          </p>
        )}
      </section>

      <p className="px-1 text-[12px] leading-relaxed text-muted-foreground">
        Rank comes from lifetime XP and never resets. The weekly lobby only decides where you sit inside
        your tier — a bad week costs you position, not progress.
      </p>
    </div>
  );
}
