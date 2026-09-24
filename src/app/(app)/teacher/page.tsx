'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useMe } from '@/lib/useMe';
import { Icon } from '@/components/ui/icons';
import { PageHeader } from '@/components/PageHeader';
import { Notice } from '@/components/Notice';
import { BlurFade } from '@/components/ui/motion/blur-fade';
import { SPRING } from '@/lib/motion';
import { motion } from 'framer-motion';
import PageSkeleton from '@/components/PageSkeleton';

type Roster = {
  userId: string;
  name: string;
  email: string;
  reviews7d: number;
  xp7d: number;
  streak: number;
  masteryPct: number;
};
type Klass = { id: string; name: string; joinCode: string; roster: Roster[] };
type TeacherData = { classes: Klass[]; subjects: { id: string; name: string }[] };

/**
 * Teaching — classes, join codes and how each student is doing.
 *
 * The roster is the point of this page, so it now reads as data rather than as
 * a list of names: streak and mastery each carry a glyph, mastery is a metered
 * bar, and the columns are labelled. A teacher scanning ten rows should not
 * have to parse prose to find the student who has stopped.
 */
export default function TeacherPage() {
  const { me, loading } = useMe();
  const [data, setData] = useState<TeacherData | null>(null);
  const [className, setClassName] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [myTopics, setMyTopics] = useState<{ id: string; name: string; visibility: string }[]>([]);

  const load = () =>
    api
      .get<TeacherData>('/api/v1/teacher')
      .then(setData)
      .catch((e) => setError(e.message));

  useEffect(() => {
    if (!loading && me && me.role !== 'student') {
      load();
      api
        .get<{ topics: { id: string; name: string; visibility: string }[] }>('/api/v1/content?mine=1')
        .then((d) => setMyTopics(d.topics))
        .catch(() => undefined);
    }
  }, [me, loading]);

  if (loading) return <PageSkeleton />;

  if (!me || me.role === 'student') {
    return (
      <div className="card p-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-bad/10 text-bad">
          <Icon name="private" size={22} />
        </span>
        <h1 className="t-tagline mt-4">Teachers only</h1>
        <p className="t-caption mt-2 text-muted">
          This page manages classes and rosters. Student accounts do not have access to it.
        </p>
      </div>
    );
  }

  const post = async (body: Record<string, unknown>, okMsg: string) => {
    setError('');
    setMessage('');
    try {
      await api.post('/api/v1/teacher', body);
      setMessage(okMsg);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That action did not go through.');
    }
  };

  const unpublished = myTopics.filter((t) => t.visibility !== 'public');

  return (
    <div className="space-y-6">
      <PageHeader
        icon="teacher"
        title="Teaching"
        subtitle="Create classes, share join codes, and see how your students are actually doing — the data they agreed to share by joining."
      />

      <Notice tone="good">{message}</Notice>
      <Notice tone="bad">{error}</Notice>

      {/* ── Create a class ───────────────────────────────────────────────── */}
      <section className="card">
        <h2 className="t-strong">New class</h2>
        <p className="t-caption mt-1 text-muted">
          You will get a six-character code to hand out. You can rotate it if it spreads further than you want.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            className="input flex-1 sm:min-w-[200px]"
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            placeholder="10B Biology"
            aria-label="Class name"
          />
          <select
            className="input sm:max-w-[220px]"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            aria-label="Subject"
          >
            <option value="">Subject…</option>
            {data?.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-primary shrink-0 gap-2"
            disabled={!className}
            onClick={() =>
              post(
                { action: 'create_class', name: className, subjectId: subjectId || data?.subjects[0]?.id },
                'Class created — share the join code.',
              ).then(() => setClassName(''))
            }
          >
            <Icon name="add" size={17} />
            Create
          </button>
        </div>
      </section>

      {/* ── Classes ──────────────────────────────────────────────────────── */}
      {data?.classes.length === 0 && (
        <div className="card p-8 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-accent/10 text-accent">
            <Icon name="class" size={22} />
          </span>
          <h2 className="t-tagline mt-4">No classes yet</h2>
          <p className="t-caption mt-2 text-muted">
            Create one above, share the code, and students appear here as they join.
          </p>
        </div>
      )}

      {data?.classes.map((c, ci) => (
        <BlurFade key={c.id} delay={Math.min(ci * 0.05, 0.2)}>
          <section className="card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-accent/10 text-accent">
                  <Icon name="class" size={17} />
                </span>
                <div>
                  <h2 className="t-strong">{c.name}</h2>
                  <p className="t-caption text-muted">
                    {c.roster.length} {c.roster.length === 1 ? 'student' : 'students'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <code className="rounded-lg bg-edge/50 px-3 py-1.5 font-mono text-[14px] font-semibold tracking-[0.2em]">
                  {c.joinCode}
                </code>
                <button
                  type="button"
                  className="btn-ghost gap-1.5"
                  onClick={() => post({ action: 'rotate_code', classId: c.id }, 'New code generated. The old one no longer works.')}
                >
                  <Icon name="rotate" size={14} />
                  Rotate
                </button>
              </div>
            </div>

            {c.roster.length === 0 ? (
              <p className="t-caption mt-4 text-muted">
                Nobody has joined yet. Share the code above and they will show up here.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left">
                  <caption className="sr-only">Class roster with weekly activity and mastery</caption>
                  <thead>
                    <tr className="t-eyebrow">
                      <th scope="col" className="pb-2 pr-3 font-semibold">Student</th>
                      <th scope="col" className="pb-2 pr-3 font-semibold">Reviews (7d)</th>
                      <th scope="col" className="pb-2 pr-3 font-semibold">XP (7d)</th>
                      <th scope="col" className="pb-2 pr-3 font-semibold">Streak</th>
                      <th scope="col" className="pb-2 font-semibold">Mastery</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.roster.map((r) => (
                      <tr key={r.userId} className="border-t border-edge/60">
                        <td className="py-3 pr-3">
                          <div className="t-strong">{r.name}</div>
                          <div className="t-fine text-muted">{r.email}</div>
                        </td>
                        <td className="py-3 pr-3 tabular-nums">{r.reviews7d}</td>
                        <td className="py-3 pr-3 tabular-nums">{r.xp7d}</td>
                        <td className="py-3 pr-3">
                          <span className="flex items-center gap-1.5 tabular-nums">
                            <Icon
                              name="streak"
                              size={14}
                              className={r.streak > 0 ? 'text-accent' : 'text-muted'}
                            />
                            {r.streak}d
                          </span>
                        </td>
                        <td className="py-3">
                          <span className="flex items-center gap-2.5">
                            <span className="meter w-16">
                              <motion.span
                                className="block h-full rounded-full bg-accent"
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.max(0, Math.min(100, r.masteryPct))}%` }}
                                transition={SPRING.meter}
                              />
                            </span>
                            <span className="t-fine w-9 tabular-nums text-muted">{Math.round(r.masteryPct)}%</span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </BlurFade>
      ))}

      {/* ── Publishing ───────────────────────────────────────────────────── */}
      <section className="card">
        <h2 className="t-strong">Publish content</h2>
        <p className="t-caption mt-1 text-muted">
          Staff topics go public immediately — there is no review queue for teacher accounts.
        </p>
        {unpublished.length === 0 ? (
          <p className="t-caption mt-3 text-muted">
            {myTopics.length === 0
              ? 'Create topics in My content first, then publish them from here.'
              : 'Everything you have written is already public. Nothing waiting.'}
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {unpublished.map((t) => (
              <div key={t.id} className="inset flex items-center justify-between gap-3 px-4 py-3">
                <span className="t-strong flex min-w-0 items-center gap-2">
                  <Icon name="topic" size={15} className="shrink-0 text-accent" />
                  <span className="truncate">{t.name}</span>
                  <span className="chip shrink-0 capitalize">{t.visibility.replace('_', ' ')}</span>
                </span>
                <button
                  type="button"
                  className="btn-ghost shrink-0 gap-1.5"
                  onClick={() => post({ action: 'create_public_topic', topicId: t.id }, 'Published — students can find it now.')}
                >
                  <Icon name="publish" size={14} />
                  Publish
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── New subject ──────────────────────────────────────────────────── */}
      <section className="card">
        <h2 className="t-strong">New subject</h2>
        <p className="t-caption mt-1 text-muted">Subjects group topics — one per course, usually.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            className="input flex-1 sm:min-w-[200px]"
            value={newSubject}
            onChange={(e) => setNewSubject(e.target.value)}
            placeholder="Chemistry"
            aria-label="Subject name"
          />
          <button
            type="button"
            className="btn-primary shrink-0 gap-2"
            disabled={!newSubject}
            onClick={() => post({ action: 'create_subject', name: newSubject }, 'Subject created.').then(() => setNewSubject(''))}
          >
            <Icon name="add" size={17} />
            Create
          </button>
        </div>
      </section>
    </div>
  );
}
