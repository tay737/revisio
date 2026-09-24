'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { api, downloadFile } from '@/lib/api';
import { useMe } from '@/lib/useMe';
import { Icon, achievementIcon, leagueIcon } from '@/components/ui/icons';
import { PageHeader } from '@/components/PageHeader';
import { Notice } from '@/components/Notice';
import { BlurFade } from '@/components/ui/motion/blur-fade';
import { NumberTicker } from '@/components/ui/motion/number-ticker';
import { StaggerGroup, StaggerItem } from '@/components/ui/motion/stagger';
import { SPRING } from '@/lib/motion';
import PageSkeleton from '@/components/PageSkeleton';

type Gam = {
  scope: string;
  board: { rank: number; name: string; xp: number; isMe: boolean }[];
  me: {
    rank: number | null;
    xpThisWeek: number;
    league: string;
    leagueMeta: { name: string; icon: string; color: string };
    totalXp: number;
    level: number;
  };
  achievements: { id: string; name: string; description: string; icon: string; unlocked: boolean; unlockedAt: string | null }[];
};

/**
 * Progress — XP, leagues, achievements and the transcript.
 *
 * Two things were off-spec before. First, the league name was painted with a
 * per-tier hex colour (`LEAGUE_META[tier].color`), which introduced four extra
 * accents into a one-accent system; leagues now differ by glyph and by name.
 * Second, the top three rows used medal emoji. Rank is communicated by the
 * numeral and by weight instead, so the only colour on the board is the
 * learner's own row.
 *
 * The opt-out copy is deliberately plain: gamification is optional and the page
 * should not make leaving feel like a loss.
 */
export default function ProgressPage() {
  const { me } = useMe();
  const [scope, setScope] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [data, setData] = useState<Gam | null>(null);
  const [loading, setLoading] = useState(true);
  const [optOut, setOptOut] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    api
      .get<Gam>(`/api/v1/gamification?scope=${scope}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [scope]);

  useEffect(() => {
    if (me) setOptOut(me.leaderboardOptOut);
  }, [me]);

  const toggleOptOut = async () => {
    const next = !optOut;
    setOptOut(next);
    setError('');
    try {
      await api.patch('/api/v1/me', { leaderboardOptOut: next });
      setNote(next ? 'You are off the boards. Your XP is still counted.' : 'You are back on the boards.');
    } catch (e) {
      setOptOut(!next);
      setError(e instanceof Error ? e.message : 'We could not change that setting.');
    }
  };

  const exportAs = (format: 'csv' | 'json') =>
    downloadFile(`/api/v1/exports?format=${format}`, `revisio-transcript.${format}`);

  if (loading && !data) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <PageHeader
        icon="progress"
        title="Progress"
        subtitle="Levels, leagues and achievements — all optional. Opt out of the boards at any time and nothing you have earned is lost."
        actions={
          <div className="flex gap-1 rounded-[11px] border border-edge/70 bg-panel/60 p-1 backdrop-blur">
            {(['daily', 'weekly', 'monthly'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                aria-pressed={scope === s}
                className={`segment capitalize ${scope === s ? 'segment-active' : ''}`}
              >
                {s}
              </button>
            ))}
          </div>
        }
      />

      <Notice tone="accent">{note}</Notice>
      <Notice tone="bad">{error}</Notice>

      {data && (
        <>
          {/* ── Summary ──────────────────────────────────────────────────── */}
          <StaggerGroup className="grid gap-3 sm:grid-cols-3" stagger={0.06}>
            <StaggerItem step="scale">
              <div className="card p-5">
                <div className="flex items-center gap-1.5 text-muted">
                  <Icon name={leagueIcon(data.me.league)} size={15} className="text-accent" />
                  <span className="t-caption">League</span>
                </div>
                <div className="t-tagline mt-1.5">{data.me.leagueMeta.name}</div>
                <p className="t-caption mt-1 text-muted">
                  {data.me.xpThisWeek} XP this week
                </p>
              </div>
            </StaggerItem>
            <StaggerItem step="scale">
              <div className="card p-5">
                <div className="flex items-center gap-1.5 text-muted">
                  <Icon name="rank" size={15} className="text-accent" />
                  <span className="t-caption">Your rank</span>
                </div>
                <div className="t-tagline mt-1.5 tabular-nums">
                  {data.me.rank ? <NumberTicker value={data.me.rank} suffix="" /> : '—'}
                </div>
                <p className="t-caption mt-1 text-muted">
                  {data.me.rank ? `among ${data.board.length} ranked this ${scope === 'daily' ? 'day' : scope === 'weekly' ? 'week' : 'month'}` : 'No ranking yet'}
                </p>
              </div>
            </StaggerItem>
            <StaggerItem step="scale">
              <div className="card p-5">
                <div className="flex items-center gap-1.5 text-muted">
                  <Icon name="xp" size={15} className="text-accent" />
                  <span className="t-caption">Total XP</span>
                </div>
                <div className="t-tagline mt-1.5">
                  <NumberTicker value={data.me.totalXp} />
                </div>
                <p className="t-caption mt-1 text-muted">Level {data.me.level}</p>
              </div>
            </StaggerItem>
          </StaggerGroup>

          {/* ── Leaderboard ──────────────────────────────────────────────── */}
          <section className="card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="t-strong capitalize">{scope} leaderboard</h2>
              <button
                type="button"
                onClick={toggleOptOut}
                className="t-caption text-accent hover:underline"
              >
                {optOut ? 'Join the leaderboard' : 'Opt out of leaderboards'}
              </button>
            </div>

            {optOut ? (
              <div className="mt-4 flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
                  <Icon name="private" size={17} />
                </span>
                <p className="t-caption text-muted">
                  You are opted out. Your XP still counts towards levels and achievements — your name simply
                  does not appear on anyone else&apos;s board.
                </p>
              </div>
            ) : (
              <ol className="mt-3 space-y-1">
                {data.board.map((row, i) => (
                  <motion.li
                    key={`${row.rank}-${row.name}`}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ ...SPRING.soft, delay: Math.min(i * 0.02, 0.3) }}
                    className={`flex items-center gap-3 rounded-[11px] px-3 py-2.5 ${
                      row.isMe ? 'bg-accent/10' : ''
                    }`}
                  >
                    <span
                      className={`w-7 shrink-0 text-center text-[14px] tabular-nums ${
                        row.rank <= 3 ? 'font-semibold text-accent' : 'text-muted'
                      }`}
                    >
                      {row.rank}
                    </span>
                    <span className={`min-w-0 flex-1 truncate text-[17px] ${row.isMe ? 'font-semibold text-accent' : ''}`}>
                      {row.name}
                      {row.isMe && <span className="t-caption ml-2 font-normal text-muted">you</span>}
                    </span>
                    <span className="t-caption shrink-0 tabular-nums text-muted">{row.xp} XP</span>
                  </motion.li>
                ))}
                {data.board.length === 0 && (
                  <p className="t-caption mt-2 text-muted">
                    Nobody has earned XP this {scope === 'daily' ? 'day' : scope === 'weekly' ? 'week' : 'month'} yet. A single review puts you on the board.
                  </p>
                )}
              </ol>
            )}
          </section>

          {/* ── Achievements ─────────────────────────────────────────────── */}
          <section className="card">
            <h2 className="t-strong">Achievements</h2>
            <p className="t-caption mt-1 text-muted">
              {data.achievements.filter((a) => a.unlocked).length} of {data.achievements.length} unlocked.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {data.achievements.map((a, i) => (
                <BlurFade key={a.id} delay={Math.min(i * 0.03, 0.2)}>
                  <div
                    className={`flex items-center gap-3 rounded-[11px] border px-3.5 py-3 ${
                      a.unlocked ? 'border-accent/40 bg-accent/5' : 'border-edge/70'
                    }`}
                  >
                    <span
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                        a.unlocked ? 'bg-accent/10 text-accent' : 'bg-edge/40 text-muted'
                      }`}
                    >
                      <Icon name={achievementIcon(a.id, a.icon)} size={17} />
                    </span>
                    <div className="min-w-0">
                      <div className={`t-caption-s ${a.unlocked ? '' : 'text-muted'}`}>{a.name}</div>
                      <div className="t-caption text-muted">{a.description}</div>
                    </div>
                    {a.unlocked && <Icon name="checked" size={16} className="ml-auto shrink-0 text-accent" />}
                  </div>
                </BlurFade>
              ))}
            </div>
          </section>
        </>
      )}

      {/* ── Transcript ───────────────────────────────────────────────────── */}
      <section className="card">
        <h2 className="t-strong">Transcript</h2>
        <p className="t-caption mt-1 text-muted">
          Everything you have covered, your strongest topics and the ones that need work — share it with a
          teacher or keep it for yourself.
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
