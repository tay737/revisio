'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { DashboardCardSkeleton } from '@/components/dashboard/DashboardCardSkeleton';
import { Icon } from '@/components/ui/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ui/field';
import { useMe } from '@/lib/useMe';

type Reflection = { score?: number; maxScore?: number; note?: string; reflectedAt?: string };

type ExamPlan = {
  id: string;
  title: string;
  examDate: string;
  status: 'active' | 'completed' | 'archived';
  daysLeft: number;
  topicsTotal: number;
  topicsRemaining: number;
  perDayNeeded: number;
  onTrack: boolean;
  dailyTarget: number;
  subjectId: string | null;
  weakestTopics: { id: string; name: string; remaining: number }[];
  reflection: Reflection | null;
};

/** Local-calendar check: the server clamps daysLeft at 0, so "the exam was
 *  yesterday" has to be read off the date itself. */
function examPassed(plan: ExamPlan): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${plan.examDate}T00:00:00`) < today;
}

/** examDate is a plain calendar date — render it as one, not an ISO string.
 *  UTC noon so no timezone can slide it to the previous day. */
function examDateLabel(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  const sameYear = d.getUTCFullYear() === new Date().getUTCFullYear();
  return d.toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' as const }),
  });
}

/**
 * Exam countdown (#17) — the nearest active plan's deadline, pace and weakest
 * topics, with a compact create form when the student has none. A visible
 * date is the retention hook: it turns "someday" revision into a schedule.
 *
 * Self-contained fetch like ChallengesCard: renders nothing on error, and the
 * create form only appears for students (the plan is a learner object).
 */
export function ExamPlanCard() {
  const { me } = useMe();
  const [plans, setPlans] = useState<ExamPlan[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ExamPlan | null>(null);
  const [title, setTitle] = useState('');
  const [examDate, setExamDate] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [dailyTarget, setDailyTarget] = useState('10');
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [score, setScore] = useState('');
  const [maxScore, setMaxScore] = useState('');
  const [note, setNote] = useState('');
  const [reflectBusy, setReflectBusy] = useState(false);
  const [reflectError, setReflectError] = useState('');

  const load = () => {
    setLoadError(false);
    api.get<{ plans: ExamPlan[] }>('/api/v1/exam-plans')
      .then((d) => setPlans(d.plans.filter((p) => p.status === 'active')))
      .catch(() => {
        setPlans(null);
        setLoadError(true);
      });
  };
  useEffect(load, []);

  if (me?.role !== 'student') return null;
  if (plans === null) {
    if (loadError) {
      return (
        <Card>
          <h2 className="t-strong">Exam countdown</h2>
          <p className="t-caption mt-2 text-muted-foreground">
            We couldn’t load your exam plans. Check your connection and try again.
          </p>
          <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={load}>
            Try again
          </Button>
        </Card>
      );
    }
    return <DashboardCardSkeleton />;
  }

  const upcoming = plans
    .filter((p) => !examPassed(p))
    .sort((a, b) => a.daysLeft - b.daysLeft);
  const plan = upcoming[0] ?? null;
  // The most recent plan whose exam date has passed still sits 'active' until
  // the student reflects — that is the post-exam prompt (#17).
  const pastPlan = plans
    .filter(examPassed)
    .sort((a, b) => b.examDate.localeCompare(a.examDate))[0] ?? null;

  const reflect = async () => {
    if (!pastPlan) return;
    setReflectBusy(true);
    setReflectError('');
    try {
      await api.post(`/api/v1/exam-plans/${pastPlan.id}/reflect`, {
        score: score.trim() === '' ? undefined : Number(score),
        maxScore: maxScore.trim() === '' ? undefined : Number(maxScore),
        note: note.trim() === '' ? undefined : note.trim(),
      });
      setScore('');
      setMaxScore('');
      setNote('');
      load();
    } catch (e) {
      setReflectError(e instanceof Error ? e.message : 'Could not save the reflection.');
    } finally {
      setReflectBusy(false);
    }
  };

  const resetForm = () => {
    setCreating(false);
    setEditing(null);
    setTitle('');
    setExamDate('');
    setSubjectId('');
    setDailyTarget('10');
    setError('');
  };

  const startEdit = (p: ExamPlan) => {
    setEditing(p);
    setCreating(false);
    setTitle(p.title);
    setExamDate(p.examDate.slice(0, 10));
    setSubjectId(p.subjectId ?? '');
    setDailyTarget(String(p.dailyTarget));
    setError('');
  };

  const save = async () => {
    setBusy(true);
    setError('');
    const body = {
      title: title.trim(),
      examDate,
      subjectId: subjectId || null,
      dailyTarget: Number(dailyTarget) || 10,
    };
    try {
      if (editing) {
        await api.patch(`/api/v1/exam-plans/${editing.id}`, body);
      } else {
        await api.post('/api/v1/exam-plans', body);
      }
      resetForm();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the plan.');
    } finally {
      setBusy(false);
    }
  };

  // DELETE archives the plan server-side, which also drops it from the
  // examCountdown reminder candidates — the countdown truly stops.
  const remove = async (id: string) => {
    setBusy(true);
    setError('');
    try {
      await api.del(`/api/v1/exam-plans/${id}`);
      setConfirmRemove(null);
      resetForm();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the plan.');
      setConfirmRemove(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="t-strong">Exam countdown</h2>
        {plan && (
          <Badge variant="chip">{plan.daysLeft === 0 ? 'Today' : `${plan.daysLeft}d left`}</Badge>
        )}
      </div>

      {editing || creating ? (
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => { e.preventDefault(); void save(); }}
        >
          <Field icon="exam" label="Exam or test" htmlFor="examPlanTitle">
            <Input
              id="examPlanTitle"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="GCSE Maths — Paper 1"
              maxLength={120}
              required
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field icon="clock" label="Date" htmlFor="examPlanDate">
              <>
                <Input
                  id="examPlanDate"
                  type="date"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  required
                />
                <p className="t-fine mt-1 text-muted-foreground">Today or later — the countdown starts the day you save it.</p>
              </>
            </Field>
            <Field icon="target" label="Daily target (topics)" htmlFor="examPlanTarget">
              <>
                <Input
                  id="examPlanTarget"
                  type="number"
                  min={1}
                  max={50}
                  value={dailyTarget}
                  onChange={(e) => setDailyTarget(e.target.value)}
                />
                <p className="t-fine mt-1 text-muted-foreground">How many topics a day you can realistically give it. Revisio compares this with what the date needs.</p>
              </>
            </Field>
          </div>
          {me.subjects.length > 0 && (
            <Field icon="topic" label="Subject (optional)" htmlFor="examPlanSubject">
              <select
                id="examPlanSubject"
                name="examPlanSubject"
                autoComplete="off"
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 t-body"
              >
                <option value="">Whole syllabus</option>
                {me.subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <p className="t-fine mt-1 text-muted-foreground">Narrow it to one subject, or leave it open.</p>
            </Field>
          )}
          {error && <p className="t-caption text-destructive-ink">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy || !title.trim() || !examDate}>
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Start the countdown'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
              {editing ? 'Cancel' : 'Not now'}
            </Button>
          </div>
        </form>
      ) : plan ? (
        <div className="mt-3">
          <p className="t-body font-medium">{plan.title}</p>
          <p className="t-caption mt-1 text-muted-foreground">
            {plan.daysLeft === 0
              ? 'The exam is today.'
              : `${plan.daysLeft} ${plan.daysLeft === 1 ? 'day' : 'days'} to go · ${plan.topicsRemaining} of ${plan.topicsTotal} topics still open`}
          </p>
          <p className="t-fine mt-1 text-muted-foreground">
            {plan.perDayNeeded > 0
              ? `About ${plan.perDayNeeded} topics a day keeps you on pace${plan.onTrack ? ' — you are on track.' : '.'}`
              : 'Every topic is mastered. Well ahead of the date.'}
          </p>
          {plan.weakestTopics.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {plan.weakestTopics.map((t) => (
                <Badge variant="chip-soft" key={t.id}>
                  {t.name} · {t.remaining} left
                </Badge>
              ))}
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => startEdit(plan)}>
              Edit
            </Button>
            {confirmRemove === plan.id ? (
              <>
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void remove(plan.id)}>
                  {busy ? 'Removing…' : 'Yes, remove it'}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmRemove(null)}>
                  Keep it
                </Button>
              </>
            ) : (
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmRemove(plan.id)}>
                Remove plan
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <p className="t-caption text-muted-foreground">
            Pick an exam date and Revisio paces your topics to it — how many a day, what is left, where you are weakest.
          </p>
          <Button variant="secondary" size="sm" className="mt-3 gap-1.5" onClick={() => { setEditing(null); setCreating(true); }}>
            <Icon name="add" size={14} />
            Set an exam date
          </Button>
        </div>
      )}

      {plan && !editing && (
        <p className="t-fine mt-3 border-t border-border pt-3 text-muted-foreground">
          A date makes the queue personal.{' '}
          <Link href="/cram" className="text-foreground underline underline-offset-4">
            Cram mode
          </Link>{' '}
          focuses the next session.
        </p>
      )}

      {pastPlan && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="flex items-center justify-between gap-3">
            <p className="t-strong">The exam is over</p>
            {confirmRemove === pastPlan.id ? (
              <span className="flex items-center gap-1.5">
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void remove(pastPlan.id)}>
                  {busy ? 'Removing…' : 'Yes, remove it'}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmRemove(null)}>
                  Keep it
                </Button>
              </span>
            ) : (
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmRemove(pastPlan.id)}>
                Remove plan
              </Button>
            )}
          </div>
          <p className="t-caption mt-1 text-muted-foreground">
            {pastPlan.title} — sat {examDateLabel(pastPlan.examDate)}. A minute of honesty here is what makes the next countdown smarter.
          </p>
          {pastPlan.reflection ? (
            <p className="t-caption mt-2 text-muted-foreground">
              {pastPlan.reflection.score !== undefined
                ? `You logged ${pastPlan.reflection.score}${pastPlan.reflection.maxScore ? `/${pastPlan.reflection.maxScore}` : ''}. `
                : 'Reflection saved. '}
              {pastPlan.reflection.note
                ? `“${pastPlan.reflection.note.length > 140 ? `${pastPlan.reflection.note.slice(0, 140)}…` : pastPlan.reflection.note}”`
                : ''}
            </p>
          ) : (
            <form
              className="mt-3 space-y-3"
              onSubmit={(e) => { e.preventDefault(); void reflect(); }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field icon="target" label="Score (optional)" htmlFor="reflectScore">
                  <Input
                    id="reflectScore"
                    type="number"
                    min={0}
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                    placeholder="72"
                  />
                </Field>
                <Field icon="gauge" label="Out of (optional)" htmlFor="reflectMax">
                  <Input
                    id="reflectMax"
                    type="number"
                    min={1}
                    value={maxScore}
                    onChange={(e) => setMaxScore(e.target.value)}
                    placeholder="100"
                  />
                </Field>
              </div>
              <Field icon="notes" label="What helped, what didn't (optional)" htmlFor="reflectNote">
                <Textarea
                  id="reflectNote"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Cram mode the week before worked. Wish I'd started the essay topics earlier."
                  maxLength={2000}
                  rows={3}
                />
              </Field>
              {reflectError && <p className="t-caption text-destructive-ink">{reflectError}</p>}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" size="sm" disabled={reflectBusy}>
                  {reflectBusy ? 'Saving…' : 'Save reflection'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={reflectBusy}
                  onClick={() => {
                    setReflectBusy(true);
                    api.post(`/api/v1/exam-plans/${pastPlan.id}/reflect`, {})
                      .then(load)
                      .catch(() => setReflectError('Could not close the plan.'))
                      .finally(() => setReflectBusy(false));
                  }}
                >
                  Just close it
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </Card>
  );
}
