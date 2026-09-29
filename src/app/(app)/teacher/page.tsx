'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useMe } from '@/lib/useMe';
import { Icon } from '@/components/ui/icons';
import { PageHeader } from '@/components/PageHeader';
import { Notice } from '@/components/Notice';
import { BlurFade } from '@/components/ui/blur-fade';
import { SPRING } from '@/lib/motion';
import { motion } from 'motion/react';
import PageSkeleton from '@/components/PageSkeleton';
import { toast } from 'sonner';

/**
 * Copy a join code and say so. The code stays on screen, so the failure path is
 * recoverable by hand — which is why it is allowed to fail out loud instead of
 * silently.
 */
async function copyCode(code: string) {
  try {
    await navigator.clipboard.writeText(code);
    toast.success(`Join code ${code} copied`);
  } catch {
    toast.error('Copy blocked — select the code and copy it manually.');
  }
}

type Roster = {
  userId: string;
  name: string;
  email: string;
  reviews7d: number;
  xp7d: number;
  streak: number;
  masteryPct: number;
};
type Klass = { id: string; name: string; joinCode: string; subjectId: string; roster: Roster[] };
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
  // Per-class editing state: which card is being renamed, the draft name, and
  // the email box for adding a student directly (no join code needed).
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [inviteFor, setInviteFor] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [myTopics, setMyTopics] = useState<{ id: string; name: string; visibility: string; cardCount?: number; lessonCount?: number }[]>([]);

  const load = () =>
    api
      .get<TeacherData>('/api/v1/teacher')
      .then(setData)
      .catch((e) => setError(e.message));

  useEffect(() => {
    if (!loading && me && me.role !== 'student') {
      load();
      api
        .get<{ topics: { id: string; name: string; visibility: string; cardCount?: number; lessonCount?: number }[] }>('/api/v1/content?mine=1')
        .then((d) => setMyTopics(d.topics))
        .catch(() => undefined);
    }
  }, [me, loading]);

  /** Re-read the topic list after a publish so the chips stay truthful. */
  const reloadTopics = () =>
    api
      .get<{ topics: { id: string; name: string; visibility: string; cardCount?: number; lessonCount?: number }[] }>('/api/v1/content?mine=1')
      .then((d) => setMyTopics(d.topics))
      .catch(() => undefined);

  if (loading) return <PageSkeleton />;

  if (!me || me.role === 'student') {
    return (
      <div className="card p-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-destructive/10 text-destructive">
          <Icon name="private" size={22} />
        </span>
        <h1 className="t-tagline mt-4">Teachers only</h1>
        <p className="t-caption mt-2 text-muted-foreground">
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

  return (
    <div className="space-y-6">
      <PageHeader
        icon="teacher"
        title="Teaching"
        subtitle="Classes, join codes, progress."
      />


      <Notice tone="good">{message}</Notice>
      <Notice tone="bad">{error}</Notice>

      {/* ── Create a class ───────────────────────────────────────────────── */}
      <section className="card">
        <h2 className="t-strong">New class</h2>
        <p className="t-caption mt-1 text-muted-foreground">
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
            className="btn btn-primary shrink-0 gap-2"
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
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
            <Icon name="class" size={22} />
          </span>
          <h2 className="t-tagline mt-4">No classes yet</h2>
          <p className="t-caption mt-2 text-muted-foreground">
            Create one above, share the code, and students appear here as they join.
          </p>
        </div>
      )}

      {data?.classes.map((c, ci) => (
        <BlurFade key={c.id} delay={Math.min(ci * 0.05, 0.2)}>
          <section className="card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary">
                  <Icon name="class" size={17} />
                </span>
                <div>
                  <h2 className="t-strong">{c.name}</h2>
                  <p className="t-caption text-muted-foreground">
                    {c.roster.length} {c.roster.length === 1 ? 'student' : 'students'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded-md bg-secondary px-3 py-1.5 font-mono text-[14px] font-semibold tracking-[0.2em]">
                  {c.joinCode}
                </code>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm gap-1.5"
                  onClick={() => copyCode(c.joinCode)}
                  aria-label={`Copy join code ${c.joinCode}`}
                >
                  <Icon name="notes" size={14} />
                  Copy
                </button>
                <button
                  type="button"
                  className="btn btn-ghost gap-1.5"
                  onClick={() => post({ action: 'rotate_code', classId: c.id }, 'New code generated. The old one no longer works.')}
                >
                  <Icon name="rotate" size={14} />
                  Rotate
                </button>
                <button
                  type="button"
                  className="btn btn-ghost gap-1.5"
                  aria-expanded={renamingId === c.id}
                  onClick={() => {
                    if (renamingId === c.id) {
                      setRenamingId(null);
                    } else {
                      setRenamingId(c.id);
                      setRenameDraft(c.name);
                    }
                  }}
                >
                  <Icon name="edit" size={14} />
                  Rename
                </button>
                <button
                  type="button"
                  className="btn btn-ghost gap-1.5"
                  aria-expanded={inviteFor === c.id}
                  onClick={() => {
                    if (inviteFor === c.id) {
                      setInviteFor(null);
                    } else {
                      setInviteFor(c.id);
                      setInviteEmail('');
                    }
                  }}
                >
                  <Icon name="add" size={14} />
                  Add student
                </button>
                <button
                  type="button"
                  className="btn btn-ghost gap-1.5 text-destructive"
                  onClick={() => {
                    if (window.confirm(`Delete "${c.name}"? Its ${c.roster.length} ${c.roster.length === 1 ? 'student' : 'students'} lose the class; their questions and XP are untouched.`)) {
                      void post({ action: 'delete_class', classId: c.id }, `Class "${c.name}" deleted.`);
                    }
                  }}
                >
                  <Icon name="remove" size={14} />
                  Delete
                </button>
              </div>
            </div>

            {renamingId === c.id && (
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  className="input flex-1 sm:min-w-[200px]"
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  aria-label="New class name"
                  maxLength={80}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm shrink-0"
                  disabled={!renameDraft.trim()}
                  onClick={() =>
                    void post({ action: 'rename_class', classId: c.id, name: renameDraft.trim() }, 'Class renamed.').then(() => setRenamingId(null))
                  }
                >
                  Save
                </button>
              </div>
            )}

            {inviteFor === c.id && (
              <form
                className="mt-3 flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!inviteEmail.trim()) return;
                  void post({ action: 'add_class_member', classId: c.id, email: inviteEmail.trim() }, `${inviteEmail.trim()} added to ${c.name}.`).then(() => {
                    setInviteEmail('');
                    setInviteFor(null);
                  });
                }}
              >
                <input
                  type="email"
                  className="input flex-1 sm:min-w-[200px]"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="student@school.org"
                  aria-label="Student email"
                  required
                />
                <button type="submit" className="btn btn-primary btn-sm shrink-0">
                  Add to class
                </button>
              </form>
            )}

            {/* A class belongs to a subject; switching it here keeps the
                dashboard grouping truthful without recreating the class. */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="t-fine text-muted-foreground" htmlFor={`subject-${c.id}`}>
                Subject
              </label>
              <select
                id={`subject-${c.id}`}
                className="input max-w-[220px]"
                value={c.subjectId}
                onChange={(e) => post({ action: 'set_class_subject', classId: c.id, subjectId: e.target.value }, 'Subject updated.')}
              >
                <option value="">No subject</option>
                {data?.subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {c.roster.length === 0 ? (
              <p className="t-caption mt-4 text-muted-foreground">
                Nobody has joined yet. Share the code above and they will show up here.
              </p>
            ) : (
              // A roster is a list of people, and a five-column table is the
              // worst possible presentation of one on a phone: it forces a
              // horizontal scroll inside a card to read a single row. Each
              // student is one block that wraps — identity, weekly activity,
              // then mastery on its own line — with the same information.
              <ul className="mt-3 divide-y divide-border">
                {c.roster.map((r) => (
                  <li key={r.userId} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-semibold">{r.name}</div>
                      <div className="truncate text-[12px] text-muted-foreground">{r.email}</div>
                    </div>

                    <div className="num flex items-center gap-3.5 text-[13px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Icon
                          name="streak"
                          size={13}
                          className={r.streak > 0 ? 'text-streak' : undefined}
                        />
                        {r.streak}d
                      </span>
                      <span>{r.reviews7d} rev</span>
                      <span>{r.xp7d} XP</span>
                    </div>

                    <div className="flex w-full items-center gap-2.5 sm:w-44">
                      <span className="meter h-1.5 flex-1">
                        <motion.span
                          className="meter-fill block"
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.max(0, Math.min(100, r.masteryPct))}%` }}
                          transition={SPRING.meter}
                        />
                      </span>
                      <span className="num w-10 text-right text-[12px] text-muted-foreground">
                        {Math.round(r.masteryPct)}%
                      </span>
                      <button
                        type="button"
                        title={`Remove ${r.name} from ${c.name}`}
                        aria-label={`Remove ${r.name} from ${c.name}`}
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => {
                          if (window.confirm(`Remove ${r.name} from ${c.name}? They can rejoin with the code.`)) {
                            void post({ action: 'remove_class_member', classId: c.id, userId: r.userId }, `${r.name} removed from ${c.name}.`);
                          }
                        }}
                      >
                        <Icon name="close" size={12} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </BlurFade>
      ))}

      {/* ── Publishing ───────────────────────────────────────────────────── */}
      <section className="card">
        <div className="flex items-center justify-between gap-3">
          <h2 className="t-strong">Content</h2>
          <span className="chip">{myTopics.length} topic{myTopics.length === 1 ? '' : 's'}</span>
        </div>
        <p className="t-caption mt-1 text-muted-foreground">
          Staff topics go public immediately, and the questions inside go with them.
        </p>
        {myTopics.length === 0 ? (
          <p className="t-caption mt-3 text-muted-foreground">
            Nothing written yet — start in <Link href="/library" className="text-primary hover:underline">My content</Link>.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {myTopics.map((t) => {
              const live = t.visibility === 'public';
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-semibold">{t.name}</span>
                      <span className={`chip shrink-0 ${live ? 'chip-active' : ''}`}>
                        <Icon name={live ? 'publish' : t.visibility === 'pending_review' ? 'schedule' : 'private'} size={12} />
                        {live ? 'public' : t.visibility.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="num mt-0.5 text-[12px] text-muted-foreground">
                      <span className={(t.cardCount ?? 0) === 0 ? 'text-destructive' : undefined}>{t.cardCount ?? 0} questions</span>
                      <span className="mx-1.5">·</span>
                      <span className={(t.lessonCount ?? 0) === 0 ? 'text-destructive' : undefined}>{t.lessonCount ?? 0} note {(t.lessonCount ?? 0) === 1 ? 'set' : 'sets'}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={live ? 'btn btn-ghost shrink-0 gap-1.5' : 'btn btn-secondary btn-sm shrink-0 gap-1.5'}
                    onClick={() =>
                      post(
                        { action: 'set_topic_visibility', topicId: t.id, visibility: live ? 'private' : 'public' },
                        live ? `${t.name} withdrawn.` : `${t.name} is live — questions included.`,
                      ).then(reloadTopics)
                    }
                  >
                    <Icon name={live ? 'unpublish' : 'publish'} size={14} />
                    {live ? 'Withdraw' : 'Publish'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── New subject ──────────────────────────────────────────────────── */}
      <section className="card">
        <h2 className="t-strong">New subject</h2>
        <p className="t-caption mt-1 text-muted-foreground">Subjects group topics — one per course, usually.</p>
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
            className="btn btn-primary shrink-0 gap-2"
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
