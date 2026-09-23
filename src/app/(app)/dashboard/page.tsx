'use client';

import Link from 'next/link';
import { api } from '@/lib/api';
import useSWR from 'swr';

type Me = {
  name: string;
  role: string;
  subjects: { id: string; name: string }[];
  gamification: { totalXp: number; level: number; intoLevel: number; forNext: number; streak: number; bestStreak: number };
  achievements: { id: string; name: string; icon: string; unlockedAt: string }[];
  today: { due: number; reviewed: number; correct: number };
};

export default function DashboardPage() {
  const { data, error, isLoading } = useSWR<Me>('/api/v1/me', api.get);

  if (isLoading) return <div className="animate-pulse text-muted">Loading…</div>;
  if (error || !data) return <p className="text-bad">Failed to load dashboard.</p>;

  const pct = data.gamification.forNext ? Math.min(100, Math.round((data.gamification.intoLevel / data.gamification.forNext) * 100)) : 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Hey {data.name.split(' ')[0]} 👋</h1>
        <p className="text-sm text-muted">{data.today.due > 0 ? `${data.today.due} cards due today — keep the 🔥 going.` : 'All caught up. Nice.'}</p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Due now" value={data.today.due} accent />
        <StatCard label="Reviewed today" value={data.today.reviewed} />
        <StatCard label="Streak" value={`${data.gamification.streak}d`} />
        <StatCard label="Level" value={data.gamification.level} />
      </section>

      <section className="card">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Level {data.gamification.level}</h2>
          <span className="text-xs text-muted">{data.gamification.intoLevel} / {data.gamification.forNext} XP</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-edge">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link href="/review" className="card group transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-2xl">🔁</div>
          <h3 className="mt-2 font-semibold group-hover:text-accent">Daily review</h3>
          <p className="text-sm text-muted">{data.today.due} cards scheduled for today.</p>
        </Link>
        <Link href="/cram" className="card group transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-2xl">⏱️</div>
          <h3 className="mt-2 font-semibold group-hover:text-accent">Cram a topic</h3>
          <p className="text-sm text-muted">Notes + rapid questions, schedule untouched.</p>
        </Link>
        <Link href="/learn" className="card group transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-2xl">📚</div>
          <h3 className="mt-2 font-semibold group-hover:text-accent">Learn content</h3>
          <p className="text-sm text-muted">Notes tied to the spec, with examples.</p>
        </Link>
        <Link href="/exam" className="card group transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-2xl">📄</div>
          <h3 className="mt-2 font-semibold group-hover:text-accent">Exam simulator</h3>
          <p className="text-sm text-muted">Past-paper style questions, marked instantly.</p>
        </Link>
      </section>

      {data.achievements.length > 0 && (
        <section className="card">
          <h2 className="font-semibold">Recent achievements</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.achievements.slice(0, 6).map((a) => (
              <span key={a.id} className="chip">{a.icon} {a.name}</span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className={`card ${accent && value ? 'ring-1 ring-accent/40' : ''}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent && value ? 'text-accent' : ''}`}>{value}</div>
    </div>
  );
}
