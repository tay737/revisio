'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/AuthForm';
import { useMe } from '@/lib/useMe';

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
  weakestTopics: { id: string; name: string; remaining: number }[];
};

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
  const [title, setTitle] = useState('');
  const [examDate, setExamDate] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [dailyTarget, setDailyTarget] = useState('10');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    api.get<{ plans: ExamPlan[] }>('/api/v1/exam-plans')
      .then((d) => setPlans(d.plans.filter((p) => p.status === 'active')))
      .catch(() => setPlans([]));
  };
  useEffect(load, []);

  if (me?.role !== 'student' || plans === null) return null;

  const plan = plans
    .filter((p) => p.daysLeft >= 0)
    .sort((a, b) => a.daysLeft - b.daysLeft)[0] ?? null;

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post('/api/v1/exam-plans', {
        title: title.trim(),
        examDate,
        subjectId: subjectId || null,
        dailyTarget: Number(dailyTarget) || 10,
      });
      setCreating(false);
      setTitle('');
      setExamDate('');
      setSubjectId('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the plan.');
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

      {plan ? (
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
        </div>
      ) : creating ? (
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => { e.preventDefault(); void create(); }}
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
              <Input
                id="examPlanDate"
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                required
              />
            </Field>
            <Field icon="target" label="Daily target (topics)" htmlFor="examPlanTarget">
              <Input
                id="examPlanTarget"
                type="number"
                min={1}
                max={50}
                value={dailyTarget}
                onChange={(e) => setDailyTarget(e.target.value)}
              />
            </Field>
          </div>
          {me.subjects.length > 0 && (
            <Field icon="topic" label="Subject (optional)" htmlFor="examPlanSubject">
              <select
                id="examPlanSubject"
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 t-body"
              >
                <option value="">Whole syllabus</option>
                {me.subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Field>
          )}
          {error && <p className="t-caption text-destructive-ink">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy || !title.trim() || !examDate}>
              {busy ? 'Saving…' : 'Start the countdown'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setCreating(false)}>
              Not now
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-3">
          <p className="t-caption text-muted-foreground">
            Pick an exam date and Revisio paces your topics to it — how many a day, what is left, where you are weakest.
          </p>
          <Button variant="secondary" size="sm" className="mt-3 gap-1.5" onClick={() => setCreating(true)}>
            <Icon name="add" size={14} />
            Set an exam date
          </Button>
        </div>
      )}

      {plan && (
        <p className="t-fine mt-3 border-t border-border pt-3 text-muted-foreground">
          A date makes the queue personal.{' '}
          <Link href="/cram" className="text-foreground underline underline-offset-4">
            Cram mode
          </Link>{' '}
          focuses the next session.
        </p>
      )}
    </Card>
  );
}
