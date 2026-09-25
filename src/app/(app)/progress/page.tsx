'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api, downloadFile } from '@/lib/api';
import { useMe } from '@/lib/useMe';
import { useRanked, type RankedScope } from '@/lib/useRanked';
import { Icon, achievementIcon } from '@/components/ui/icons';
import { RankCrest } from '@/components/ui/rank-crest';
import { Notice } from '@/components/Notice';
import { NumberTicker } from '@/components/ui/motion/number-ticker';
import { StaggerGroup, StaggerItem } from '@/components/ui/motion/stagger';
import { RankStrip } from '@/components/rank/RankStrip';
import { LobbyTable } from '@/components/rank/LobbyTable';
import { cappedDelay, railVariants, SPRING } from '@/lib/motion';
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
 * This page carries the whole ranked system, and it is deliberately organised
 * the way a competitive game puts its progress screen together:
 *
 *   • **The scoreboard first.** A near-black tile with the crest, the rank, the
 *     points and the next rung named. It is the same panel the dashboard shows,
 *     from the same hook, so the two can never disagree.
 *   • **Three views, one at a time.** The ladder (the persistent rank), the
 *     weekly lobby (the promotion/demotion stake), and the raw XP board that
 *     was already here. Each is a tap away rather than stacked, because a
 *     three-column wall of numbers is what made the old page unreadable.
 *   • **Honest empty states.** A lobby with unclaimed seats says so; a ladder
 *     you have not started says "placement" rather than pretending you are
 *     Bronze III.
 */

type View = 'rank' | 'lobby' | 'board';

const VIEWS: { id: View; label: string; icon: 'rank' | 'league' | 'progress' }[] = [
  { id: 'rank', label: 'Ladder', icon: 'rank' },
  { id: 'lobby', label: 'This week', icon: 'league' },
  { id: 'board', label: 'XP board', icon: 'progress' },
];

export default function RankPage() {
  const { me } = useMe();
  const [scope, setScope] = useState<RankedScope>('weekly');
  const [view, setView] = useState<View>('rank');
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
      setNote(next ? 'You are off the boards. Your rank and RP are untouched.' : 'You are back on the boards.');
    } catch (e) {
      setOptOut(!next);
      setError(e instanceof Error ? e.message : 'We could not change that setting.');
    }
  };

  const exportAs = (format: 'csv' | 'json') =>
    downloadFile(`/api/v1/exports?format=${format}`, `revisio-transcript.${format}`);

  if (loading && !ranked) return <PageSkeleton />;

  const ranked_ = ranked?.ranked;
  const form = me ? formFor(me.today.reviewed, me.today.correct) : null;

  return (
    <div className="space-y-5">
      <Notice tone="accent">{note}</Notice>
      <Notice tone="bad">{error}</Notice>

      {ranked_ && (
        <>
          <RankStrip
            rank={ranked_.rank}
            lobby={ranked_.lobby}
            week={ranked_.week}
            placement={ranked_.placement}
            xpThisWeek={ranked_.xpThisWeek}
          />

          {/* ── View switch ─────────────────────────────────────────────── */}
          <div className="flex flex-col gap-3">
            <div className="relative flex gap-1 self-start rounded-full border border-edge/80 bg-panel/70 p-1 backdrop-blur">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setView(v.id)}
                  aria-pressed={view === v.id}
                  className={cn(
                    'relative inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[14px] leading-[1.29] tracking-[-0.224px] transition-colors duration-200',
                    view === v.id ? 'text-accent' : 'text-muted hover:text-ink',
                  )}
                >
                  {view === v.id && (
                    <motion.span
                      layoutId="rank-view-pill"
                      className="absolute inset-0 rounded-full bg-accent/12"
                      transition={SPRING.layout}
                    />
                  )}
                  <Icon name={v.icon} size={15} className="relative" strokeWidth={view === v.id ? 2.25 : 1.75} />
                  <span className={cn('relative', view === v.id && 'font-semibold')}>{v.label}</span>
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={view}
                variants={railVariants}
                custom={1}
                initial="enter"
                animate="center"
                exit="exit"
              >
                {view === 'rank' && (
                  <LadderView
                    rank={ranked_.rank}
                    placement={ranked_.placement}
                    form={form}
                  />
                )}

                {view === 'lobby' && (
                  <section className="card">
                    <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <h2 className="display-tight t-tagline">Weekly lobby</h2>
                        <p className="t-caption mt-1 text-muted">{ranked_.week.rangeLabel}</p>
                      </div>
                      <div className="text-right">
                        <p className="t-caption-s tabular-nums">
                          {ranked_.week.daysLeft === 1 ? 'Last day' : `${ranked_.week.daysLeft} days left`}
                        </p>
                        <p className="t-fine mt-0.5 text-muted">Lobbies reset every Monday</p>
                      </div>
                    </header>

                    <p className="t-body mb-4 max-w-2xl text-muted">
                      {lobbyLine({
                        zone: ranked_.lobby.zone,
                        position: ranked_.lobby.position,
                        size: ranked_.lobby.size,
                        daysLeft: ranked_.week.daysLeft,
                        rankLabel: ranked_.rank.label,
                      })}
                    </p>

                    {/* Week elapsed — the clock the whole lobby runs on. */}
                    <div className="mb-5 flex items-center gap-3">
                      <div className="meter h-1.5 flex-1">
                        <motion.div
                          className="h-full rounded-full bg-ink/60"
                          initial={{ width: 0 }}
                          animate={{ width: `${ranked_.week.percentElapsed}%` }}
                          transition={SPRING.meter}
                        />
                      </div>
                      <span className="t-fine shrink-0 text-muted">{100 - ranked_.week.percentElapsed}% of the week left</span>
                    </div>

                    {optOut ? (
                      <div className="flex items-start gap-3 rounded-[11px] bg-sink/60 p-4">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
                          <Icon name="private" size={17} />
                        </span>
                        <p className="t-caption text-muted">
                          You are opted out, so your name is hidden from everyone else&apos;s lobby. Your RP and rank
                          still move exactly as normal.{' '}
                          <button type="button" onClick={toggleOptOut} className="text-accent hover:underline">
                            Rejoin the boards
                          </button>
                        </p>
                      </div>
                    ) : (
                      <LobbyTable lobby={ranked_.lobby} />
                    )}
                  </section>
                )}

                {view === 'board' && (
                  <section className="card">
                    <header className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="display-tight t-tagline">XP board</h2>
                        <p className="t-caption mt-1 text-muted">
                          Raw XP, which is what moves your rank. The lobby is the competition; this is the ledger.
                        </p>
                      </div>
                      <div className="flex gap-1 rounded-full border border-edge/80 bg-panel/70 p-1">
                        {(['daily', 'weekly', 'monthly'] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setScope(s)}
                            aria-pressed={scope === s}
                            className={cn(
                              'relative rounded-full px-3.5 py-1.5 text-[14px] capitalize transition-colors duration-200',
                              scope === s ? 'text-accent' : 'text-muted hover:text-ink',
                            )}
                          >
                            {scope === s && (
                              <motion.span
                                layoutId="board-scope-pill"
                                className="absolute inset-0 rounded-full bg-accent/12"
                                transition={SPRING.layout}
                              />
                            )}
                            <span className="relative">{s}</span>
                          </button>
                        ))}
                      </div>
                    </header>

                    <ol className="mt-4 space-y-0.5">
                      {ranked?.board.map((row, i) => (
                        <motion.li
                          key={`${row.rank}-${row.name}`}
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
                              row.isMe ? 'font-semibold text-accent' : i < 3 ? 'text-ink' : 'text-muted',
                            )}
                          >
                            {row.rank}
                          </span>
                          <span className={cn('min-w-0 flex-1 truncate text-[17px]', row.isMe && 'font-semibold text-accent')}>
                            {row.name}
                          </span>
                          <span className="t-caption shrink-0 tabular-nums text-muted">
                            <NumberTicker value={row.xp} /> XP
                          </span>
                        </motion.li>
                      ))}
                      {ranked?.board.length === 0 && (
                        <p className="t-caption mt-2 text-muted">
                          Nobody has logged XP this {scope === 'daily' ? 'day' : scope === 'weekly' ? 'week' : 'month'} yet.
                          One review puts you on the board.
                        </p>
                      )}
                    </ol>

                    <button
                      type="button"
                      onClick={toggleOptOut}
                      className="t-caption mt-4 text-accent hover:underline"
                    >
                      {optOut ? 'Join the boards' : 'Hide me from the boards'}
                    </button>
                  </section>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* ── Achievements ─────────────────────────────────────────────── */}
          <section className="card">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="display-tight t-tagline">Achievements</h2>
              <span className="t-caption tabular-nums text-muted">
                {ranked?.achievements.filter((a) => a.unlocked).length} of {ranked?.achievements.length}
              </span>
            </div>
            <p className="t-caption mt-1 text-muted">
              Optional, permanent, and separate from your rank — a rank can slip, these cannot.
            </p>
            <StaggerGroup className="mt-4 grid gap-2 sm:grid-cols-2" stagger={0.04} inView>
              {ranked?.achievements.map((a) => (
                <StaggerItem key={a.id} step="scale">
                  <div
                    className={cn(
                      'flex items-center gap-3 rounded-[11px] border px-3.5 py-3',
                      a.unlocked ? 'border-accent/40 bg-accent/5' : 'border-edge/70',
                    )}
                  >
                    <span
                      className={cn(
                        'grid h-9 w-9 shrink-0 place-items-center rounded-full',
                        a.unlocked ? 'bg-accent/10 text-accent' : 'bg-sink text-muted',
                      )}
                    >
                      <Icon name={achievementIcon(a.id, a.icon)} size={17} />
                    </span>
                    <div className="min-w-0">
                      <div className={cn('t-caption-s', !a.unlocked && 'text-muted')}>{a.name}</div>
                      <div className="t-caption text-muted">{a.description}</div>
                    </div>
                    {a.unlocked && <Icon name="checked" size={16} className="ml-auto shrink-0 text-accent" />}
                  </div>
                </StaggerItem>
              ))}
            </StaggerGroup>
          </section>
        </>
      )}

      {/* ── Transcript ───────────────────────────────────────────────────── */}
      <section className="card">
        <h2 className="display-tight t-tagline">Transcript</h2>
        <p className="t-caption mt-1 text-muted">
          Everything you have covered, your strongest topics and the ones that need work — share it with a teacher or
          keep it for yourself.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => exportAs('csv')} className="btn-secondary gap-2">
            <Icon name="download" size={16} />
            Download CSV
          </button>
          <button type="button" onClick={() => exportAs('json')} className="btn-ghost gap-2">
            <Icon name="download" size={15} />
            Download JSON
          </button>
        </div>
      </section>
    </div>
  );
}

/**
 * The ladder — every rung in the game, with your position marked.
 *
 * A rank means nothing without the rungs above it, so this view always shows
 * the whole climb: five tier bars showing how much of each tier is banked, then
 * the fifteen rungs as a scrollable rail that centres itself on your rank. The
 * rungs you have not reached are drawn in the muted tone with the identical
 * crest — same shape, no colour — which is the only way to show a fifteen-rank
 * ladder inside a one-accent system.
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
    <div className="space-y-5">
      {/* Tier progress — the long arc of the climb, on one line. */}
      <section className="card">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="display-tight t-tagline">Tier progress</h2>
          <span className="t-caption tabular-nums text-muted">
            <NumberTicker value={rank.points} /> RP total
          </span>
        </div>

        <div className="mt-4 flex gap-1.5">
          {tiers.map((t) => {
            const isCurrent = t.tier === rank.tier;
            const cleared = rank.points >= t.base + t.total;
            return (
              <div key={t.tier} className="flex-1">
                <div
                  className={cn(
                    'h-1.5 overflow-hidden rounded-full',
                    isCurrent ? 'meter-accent' : 'bg-edge/50',
                  )}
                >
                  <motion.div
                    className="h-full rounded-full bg-accent"
                    initial={{ width: 0 }}
                    animate={{ width: `${t.percent}%` }}
                    transition={SPRING.meter}
                  />
                </div>
                <p
                  className={cn(
                    't-micro mt-1.5 truncate',
                    isCurrent ? 'text-accent' : cleared ? 'text-ink' : 'text-muted',
                  )}
                >
                  {tierName(t.tier)}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-edge/70 pt-4">
          <span className="t-caption flex items-center gap-1.5 text-muted">
            <Icon name="form" size={14} className="text-accent" />
            Form
            <strong className="font-semibold text-ink">{form?.label ?? '—'}</strong>
          </span>
          <span className="t-caption flex-1 text-muted">{form?.detail}</span>
        </div>
      </section>

      {/* The ladder itself. */}
      <section className="card">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="display-tight t-tagline">The ladder</h2>
          <span className="t-caption text-muted">
            {placement.placing
              ? `Placement game ${placement.done} of ${placement.target}`
              : `${RANK_LADDER.length} ranks · ${rank.label} now`}
          </span>
        </div>

        <div className="rail mt-5">
          {RANK_LADDER.map((rung) => {
            const rungRank = rankFor(rung.base);
            const isCurrent = rung.index === rank.index;
            const reached = rung.index <= rank.index;
            return (
              <div
                key={rung.index}
                ref={isCurrent ? activeRef : undefined}
                className="w-[104px] shrink-0"
              >
                <div
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-[18px] border px-3 py-4 text-center transition-colors duration-200',
                    isCurrent
                      ? 'border-accent/60 bg-accent/8'
                      : reached
                        ? 'border-edge/70'
                        : 'border-edge/40',
                  )}
                >
                  <RankCrest rank={rungRank} size={44} showProgress={false} muted={!reached} animate={false} />
                  <div>
                    <p className={cn('t-caption-s', reached ? 'text-ink' : 'text-muted', isCurrent && 'text-accent')}>
                      {DIVISION_LABEL[rung.division]}
                    </p>
                    <p className="t-micro mt-0.5 text-muted">{tierName(rung.tier)}</p>
                  </div>
                  <p className="t-micro tabular-nums text-muted">{rung.base} RP</p>
                  {isCurrent && (
                    <span className="t-micro rounded-full bg-accent/15 px-2 py-0.5 text-accent">You</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {!rank.isApex && (
          <p className="t-caption mt-4 text-muted">
            Next rung in {rank.remaining} RP — about {reviewsForRp(rank.remaining)} more correct reviews. Keep an eye on
            your form: accuracy is what makes RP arrive quickly.
          </p>
        )}
      </section>

      {/* The one piece of policy a learner actually needs stated in words. */}
      <p className="t-fine px-1 text-muted">
        Rank is earned from lifetime XP and never resets. The weekly lobby only decides where you sit inside your tier,
        so a bad week costs you position, not progress.
      </p>
    </div>
  );
}
