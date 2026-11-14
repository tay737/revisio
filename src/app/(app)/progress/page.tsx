'use client';

import { Suspense, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { api, downloadFile } from '@/lib/api';
import { useMe } from '@/lib/useMe';
import { useRanked, type RankedScope } from '@/lib/useRanked';
import { Icon, achievementIcon } from '@/components/ui/icons';
import { RankCrest } from '@/components/ui/rank-crest';
import { NumberTicker } from '@/components/ui/number-ticker';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Notice } from '@/components/Notice';
import { RankStrip } from '@/components/rank/RankStrip';
import { LobbyTable } from '@/components/rank/LobbyTable';
import { RankView } from '@/components/rank/RankView';
import { SPRING, cappedDelay } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { lobbyLine } from '@/lib/profile';
import { formFor } from '@/domain/ranked';
import PageSkeleton from '@/components/PageSkeleton';
import { StrengthTab } from '@/components/insights/StrengthTab';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

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

/**
 * Four tabs, because there is one rank.
 *
 * "Ladder" and "Season" were separate once, and the split was the bug: both
 * drew the same thirty rungs through the same engine, differing only in which
 * XP total fed it, so the app shipped two implementations of one idea and a
 * paragraph explaining the difference. The rank is seasonal now, so the two
 * views are one view.
 */
const VIEWS = [
  { id: 'rank', label: 'Rank' },
  { id: 'lobby', label: 'This week' },
  { id: 'board', label: 'XP' },
  { id: 'strength', label: 'Strength' },
] as const;

type View = (typeof VIEWS)[number]['id'];

const SCOPES = ['daily', 'weekly', 'monthly'] as const;

/** The tab named by `?view=`, falling back to the ladder it always opened on. */
function viewFromParam(value: string | null): View {
  return VIEWS.some((v) => v.id === value) ? (value as View) : 'rank';
}

/** The XP board's window from `?scope=`, falling back to the week. */
function scopeFromParam(value: string | null): RankedScope {
  return SCOPES.includes(value as (typeof SCOPES)[number]) ? (value as RankedScope) : 'weekly';
}

function RankPage() {
  const { me } = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const viewParam = params.get('view');
  const scopeParam = params.get('scope');
  // Which window the XP board counts — also a choice worth a link, so it rides
  // in the URL next to the tab rather than resetting on reload.
  const [scope, setScope] = useState<RankedScope>(() => scopeFromParam(scopeParam));
  // The tab lives in the URL. "This week" and "Strength" were reachable only by
  // clicking: the tab was local state, so a link could not open one, a reload
  // dropped you back on the ladder, and Back left the page instead of stepping
  // between tabs. `rank` is the default, so it stays out of the URL rather than
  // being written into it.
  const [view, setView] = useState<View>(() => viewFromParam(viewParam));
  const { ranked, loading } = useRanked(scope);
  const [optOut, setOptOut] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (me) setOptOut(me.leaderboardOptOut);
  }, [me]);

  // Back/forward and any link that arrives with a `?view=` move the tab too.
  useEffect(() => {
    setView(viewFromParam(viewParam));
  }, [viewParam]);

  useEffect(() => {
    setScope(scopeFromParam(scopeParam));
  }, [scopeParam]);

  /** Write one selection into the URL, leaving the rest of the query alone. */
  const writeParam = (key: 'view' | 'scope', value: string | null) => {
    const search = new URLSearchParams(params.toString());
    if (value === null) search.delete(key);
    else search.set(key, value);
    const query = search.toString();
    // Shallow replace: a switch must not refetch or scroll back to the top.
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const selectView = (next: View) => {
    setView(next);
    writeParam('view', next === 'rank' ? null : next);
  };

  const selectScope = (next: RankedScope) => {
    setScope(next);
    writeParam('scope', next === 'weekly' ? null : next);
  };

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
      {/* The screen's own h1: the black RankStrip band is the page's visual
          header, but axe (and a screen reader's heading list) need one heading
          that says where you are — same pattern as the auth screens. */}
      <h1 className="sr-only">Rank</h1>
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
            season={data.season}
          />

          <Tabs value={view} onValueChange={(next) => selectView(next as View)}>
            {/* Four tabs share one row. `px-2` on the narrowest screens is not
                cosmetic: at `px-4` the four labels need more width than a 320px
                phone has, and "This week" wraps to two lines and breaks the
                pill's height. `truncate` is the backstop for a longer locale. */}
            <TabsList className="h-11 w-full rounded-pill bg-secondary p-1 sm:w-auto">
              {VIEWS.map((v) => (
                <TabsTrigger
                  key={v.id}
                  value={v.id}
                  className="h-11 min-w-0 flex-1 truncate rounded-pill px-2 t-caption font-semibold data-[active]:bg-card data-[active]:text-foreground sm:h-9 sm:flex-none sm:px-4"
                >
                  {v.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* The clock, the ladder, the board, the seasons you have finished
                and the record that survives them — one rank, one screen. */}
            <TabsContent value="rank" className="mt-4">
              <RankView
                data={{
                  rank: data.rank,
                  placement: data.placement,
                  form,
                  lifetimeRank: data.lifetimeRank,
                  totalXp: ranked?.me.totalXp ?? 0,
                }}
              />
            </TabsContent>

            {/* The learner's own insights — the same renderer the staff sheet
                uses, pointed at yourself. Fetches only when this tab is open. */}
            <TabsContent value="strength" className="mt-4">
              <StrengthTab />
            </TabsContent>

            <TabsContent value="lobby" className="mt-4">
              <Card as="section">
                <header className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="t-tagline">{data.rank.label} lobby</h2>
                    <p className="t-caption text-muted-foreground">{data.week.rangeLabel}</p>
                  </div>
                  <Badge variant="quiet" className="num shrink-0">
                    {data.week.daysLeft === 1 ? 'Last day' : `${data.week.daysLeft} days left`}
                  </Badge>
                </header>

                <p className="mt-3 t-caption leading-relaxed text-muted-foreground">
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
                  <span className="num shrink-0 t-fine text-muted-foreground">
                    {100 - data.week.percentElapsed}% left
                  </span>
                </div>

                <div className="mt-4">
                  {optOut ? (
                    <div className="flex items-start gap-3 rounded-md bg-secondary p-3.5">
                      <Icon name="private" size={17} className="mt-0.5 shrink-0" />
                      <p className="t-caption leading-snug">
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
              </Card>
            </TabsContent>

            <TabsContent value="board" className="mt-4">
              <Card as="section">
                <header className="flex items-center justify-between gap-3">
                  <h2 className="t-tagline">XP board</h2>
                  {/* A pressed-state button is only meaningful with the question
                      it answers attached; the three chips read as "daily" on
                      their own otherwise. */}
                  <div className="flex gap-1.5" role="group" aria-label="XP board window">
                    {(['daily', 'weekly', 'monthly'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => selectScope(s)}
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
                          'num w-6 shrink-0 text-center t-caption',
                          row.isMe ? 'font-bold' : 'text-muted-foreground',
                        )}
                      >
                        {row.rank}
                      </span>
                      <span className={cn('min-w-0 flex-1 truncate t-body', row.isMe && 'font-bold')}>
                        {row.isMe || !row.userId ? (
                          row.isMe ? 'You' : row.name
                        ) : (
                          <Link href={`/u/${row.userId}?from=/progress`} className="underline-offset-4 hover:underline">
                            {row.name}
                          </Link>
                        )}
                      </span>
                      <span className="num shrink-0 t-caption text-muted-foreground">
                        <NumberTicker value={row.xp} /> XP
                      </span>
                    </motion.li>
                  ))}
                </ol>

                {ranked?.board.length === 0 && (
                  <p className="mt-3 t-caption text-muted-foreground">
                    Nobody has logged XP this {scope}. One review puts you on the board.
                  </p>
                )}

                <button
                  type="button"
                  onClick={toggleOptOut}
                  className="mt-3 t-caption font-medium underline underline-offset-4"
                >
                  {optOut ? 'Join the boards' : 'Hide me from the boards'}
                </button>
              </Card>
            </TabsContent>
          </Tabs>

          {/* ── Achievements ───────────────────────────────────────────────── */}
          <Card as="section">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="t-tagline">Achievements</h2>
              <span className="num t-caption text-muted-foreground">
                {unlocked}/{ranked?.achievements.length}
              </span>
            </div>
            <p className="mt-1 t-caption text-muted-foreground">
              Permanent — a rank can slip, these cannot.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {ranked?.achievements.map((a, i) => (
                
                  <div key={a.id}
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
                      <div className="t-fine text-muted-foreground">{a.description}</div>
                    </div>
                    {a.unlocked && (
                      <Icon name="checked" size={16} className="ml-auto shrink-0 text-foreground" />
                    )}
                  </div>
                
              ))}
            </div>
          </Card>
        </>
      )}

      {/* ── Transcript ─────────────────────────────────────────────────────── */}
      <Card as="section">
        <h2 className="t-tagline">Transcript</h2>
        <p className="mt-1 t-caption text-muted-foreground">
          Your full history — share it with a teacher, or keep it.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" onClick={() => exportAs('csv')} variant="secondary" size="sm" className="gap-2">
            <Icon name="download" size={15} />
            CSV
          </Button>
          <Button type="button" onClick={() => exportAs('json')} variant="ghost" className="gap-2">
            <Icon name="download" size={15} />
            JSON
          </Button>
        </div>
      </Card>
    </div>
  );
}

/** `useSearchParams` suspends, so this route keeps a boundary around it the
 *  same way /review and /cram do. */
export default function RankRoute() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RankPage />
    </Suspense>
  );
}
