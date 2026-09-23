'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { api, downloadFile } from '@/lib/api';
import { useSession } from '@/lib/useSession';

type Gam = {
  scope: string;
  board: { rank: number; name: string; xp: number; isMe: boolean }[];
  me: { rank: number | null; xpThisWeek: number; league: string; leagueMeta: { name: string; icon: string; color: string }; totalXp: number; level: number };
  achievements: { id: string; name: string; description: string; icon: string; unlocked: boolean }[];
};

export default function ProgressPage() {
  const { user } = useSession();
  const [scope, setScope] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [data, setData] = useState<Gam | null>(null);
  const [optOut, setOptOut] = useState<boolean | null>(null);

  useEffect(() => {
    api.get<Gam>(`/api/v1/gamification?scope=${scope}`).then(setData).catch(() => setData(null));
  }, [scope]);

  useEffect(() => {
    if (user) setOptOut((user as unknown as { leaderboardOptOut?: boolean }).leaderboardOptOut ?? false);
  }, [user]);

  const toggleOptOut = async () => {
    const next = !optOut;
    setOptOut(next);
    await api.patch('/api/v1/me', { leaderboardOptOut: next });
  };

  const exportAs = (format: 'csv' | 'json') => downloadFile(`/api/v1/exports?format=${format}`, `transcript.${format}`);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Progress</h1>
          <p className="text-sm text-muted">XP, leagues and achievements — all optional, all yours.</p>
        </div>
        <div className="flex gap-1 rounded-xl border border-edge p-1 text-xs">
          {(['daily', 'weekly', 'monthly'] as const).map((s) => (
            <button key={s} onClick={() => setScope(s)}
              className={`rounded-lg px-3 py-1.5 font-medium capitalize ${scope === s ? 'bg-accent/10 text-accent' : 'text-muted'}`}>
              {s}
            </button>
          ))}
        </div>
      </header>

      {data && (
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="card text-center">
            <div className="text-xs uppercase text-muted">League</div>
            <div className="mt-1 text-xl font-bold" style={{ color: data.me.leagueMeta.color }}>
              {data.me.leagueMeta.icon} {data.me.leagueMeta.name}
            </div>
          </div>
          <div className="card text-center">
            <div className="text-xs uppercase text-muted">Rank</div>
            <div className="mt-1 text-xl font-bold">{data.me.rank ? `#${data.me.rank}` : '—'}</div>
          </div>
          <div className="card text-center">
            <div className="text-xs uppercase text-muted">Total XP</div>
            <div className="mt-1 text-xl font-bold">{data.me.totalXp}</div>
          </div>
        </section>
      )}

      {data && (
        <section className="card">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold capitalize">{scope} leaderboard</h2>
            <button onClick={toggleOptOut} className="text-xs text-muted underline hover:text-ink">
              {optOut ? 'Join leaderboard' : 'Opt out of leaderboards'}
            </button>
          </div>
          {optOut ? (
            <p className="mt-3 text-sm text-muted">You&apos;re opted out — your XP still counts, your name stays off the board.</p>
          ) : (
            <ol className="mt-3 space-y-1.5">
              {data.board.map((row) => (
                <motion.li key={row.rank} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${row.isMe ? 'bg-accent/10 font-semibold text-accent' : 'hover:bg-edge/30'}`}>
                  <span className="w-7 text-center font-bold">{row.rank <= 3 ? ['🥇', '🥈', '🥉'][row.rank - 1] : row.rank}</span>
                  <span className="flex-1 truncate">{row.name}</span>
                  <span className="tabular-nums text-muted">{row.xp} XP</span>
                </motion.li>
              ))}
              {data.board.length === 0 && <p className="text-sm text-muted">No one has earned XP this {scope === 'weekly' ? 'week' : scope} yet. Be first.</p>}
            </ol>
          )}
        </section>
      )}

      {data && (
        <section className="card">
          <h2 className="font-semibold">Achievements</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {data.achievements.map((a) => (
              <div key={a.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${a.unlocked ? 'border-accent/40 bg-accent/5' : 'border-edge opacity-50'}`}>
                <span className="text-xl">{a.icon}</span>
                <div>
                  <div className="text-sm font-semibold">{a.name}</div>
                  <div className="text-xs text-muted">{a.description}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <h2 className="font-semibold">Transcript</h2>
        <p className="mt-1 text-sm text-muted">Export everything you&apos;ve covered, your strongest and weakest topics — share with a teacher or keep for yourself.</p>
        <div className="mt-3 flex gap-2">
          <button onClick={() => exportAs('csv')} className="btn-ghost text-xs">Download CSV</button>
          <button onClick={() => exportAs('json')} className="btn-ghost text-xs">Download JSON</button>
        </div>
      </section>
    </div>
  );
}
