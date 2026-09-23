'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useSession } from '@/lib/useSession';

type Roster = { userId: string; name: string; email: string; reviews7d: number; xp7d: number; streak: number; masteryPct: number };
type Klass = { id: string; name: string; joinCode: string; roster: Roster[] };
type TeacherData = { classes: Klass[]; subjects: { id: string; name: string }[] };

export default function TeacherPage() {
  const { user, loading } = useSession();
  const [data, setData] = useState<TeacherData | null>(null);
  const [className, setClassName] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [myTopics, setMyTopics] = useState<{ id: string; name: string; visibility: string }[]>([]);

  const load = () => api.get<TeacherData>('/api/v1/teacher').then(setData).catch((e) => setError(e.message));
  useEffect(() => {
    if (!loading && user && user.role !== 'student') {
      load();
      api.get<{ topics: { id: string; name: string; visibility: string }[] }>('/api/v1/content?mine=1').then((d) => setMyTopics(d.topics)).catch(() => undefined);
    }
  }, [user, loading]);

  if (!loading && (!user || user.role === 'student')) {
    return <p className="card text-sm text-bad">Teachers only.</p>;
  }

  const post = async (body: Record<string, unknown>, okMsg: string) => {
    setError(''); setMessage('');
    try {
      await api.post('/api/v1/teacher', body);
      setMessage(okMsg);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed.');
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Teacher dashboard</h1>
        <p className="text-sm text-muted">Classes, join codes and how your students are doing — their data, shared with you because they joined.</p>
      </header>

      {message && <p className="rounded-xl bg-good/10 px-3 py-2 text-sm text-good">{message}</p>}
      {error && <p className="rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}

      <section className="card space-y-3">
        <h2 className="font-semibold">Create class</h2>
        <div className="flex flex-wrap gap-2">
          <input className="input flex-1" value={className} onChange={(e) => setClassName(e.target.value)} placeholder="10B Biology" />
          <select className="input !w-44" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">Subject…</option>
            {data?.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button className="btn-primary" disabled={!className}
            onClick={() => post({ action: 'create_class', name: className, subjectId: subjectId || data?.subjects[0]?.id }, 'Class created — share the join code.').then(() => setClassName(''))}>
            Create
          </button>
        </div>
      </section>

      {data?.classes.map((c) => (
        <section key={c.id} className="card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{c.name}</h2>
            <div className="flex items-center gap-2">
              <code className="rounded-lg bg-edge/60 px-3 py-1.5 font-mono text-sm font-bold tracking-widest">{c.joinCode}</code>
              <button className="btn-ghost !px-3 !py-1 text-xs" onClick={() => post({ action: 'rotate_code', classId: c.id }, 'New code generated.')}>Rotate</button>
            </div>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2">Student</th>
                  <th className="py-2">Reviews (7d)</th>
                  <th className="py-2">XP (7d)</th>
                  <th className="py-2">Streak</th>
                  <th className="py-2">Mastery</th>
                </tr>
              </thead>
              <tbody>
                {c.roster.map((r) => (
                  <tr key={r.userId} className="border-t border-edge">
                    <td className="py-2.5">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-muted">{r.email}</div>
                    </td>
                    <td className="py-2.5">{r.reviews7d}</td>
                    <td className="py-2.5">{r.xp7d}</td>
                    <td className="py-2.5">🔥 {r.streak}d</td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-edge">
                          <div className="h-full rounded-full bg-accent" style={{ width: `${r.masteryPct}%` }} />
                        </div>
                        {r.masteryPct}%
                      </div>
                    </td>
                  </tr>
                ))}
                {c.roster.length === 0 && (
                  <tr><td colSpan={5} className="py-3 text-sm text-muted">No students yet — share the code {c.joinCode}.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section className="card">
        <h2 className="font-semibold">Publish content</h2>
        <p className="mt-1 text-sm text-muted">Topics you create become public immediately (staff accounts bypass review).</p>
        {myTopics.length === 0 && <p className="mt-2 text-sm text-muted">Create topics from “My content” first.</p>}
        <div className="mt-3 space-y-2">
          {myTopics.filter((t) => t.visibility !== 'public').map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-xl border border-edge px-4 py-2.5 text-sm">
              <span className="font-medium">{t.name} <span className="chip ml-2">{t.visibility.replace('_', ' ')}</span></span>
              <button className="btn-ghost !px-3 !py-1 text-xs" onClick={() => post({ action: 'create_public_topic', topicId: t.id }, 'Published.')}>Publish</button>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="font-semibold">New subject</h2>
        <div className="mt-3 flex gap-2">
          <input className="input flex-1" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="Chemistry" />
          <button className="btn-primary" disabled={!newSubject}
            onClick={() => post({ action: 'create_subject', name: newSubject }, 'Subject created.').then(() => setNewSubject(''))}>
            Create
          </button>
        </div>
      </section>
    </div>
  );
}
