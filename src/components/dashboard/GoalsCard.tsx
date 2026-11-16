'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/AuthForm';
import { Progress } from '@/components/ui/progress';
import { useMe } from '@/lib/useMe';

type GoalKind = 'reviews' | 'correct' | 'xp' | 'streak' | 'topics_mastered' | 'exam_score';

type Goal = {
  id: string;
  kind: GoalKind;
  title: string;
  target: number;
  deadline: string | null;
  progress: number;
  completed: boolean;
};

const KINDS: { value: GoalKind; label: string; unit: string }[] = [
  { value: 'reviews', label: 'Reviews', unit: 'cards reviewed' },
  { value: 'correct', label: 'Correct answers', unit: 'correct answers' },
  { value: 'xp', label: 'XP', unit: 'XP earned' },
  { value: 'streak', label: 'Day streak', unit: 'days in a row' },
  { value: 'topics_mastered', label: 'Topics mastered', unit: 'topics fully mastered' },
  { value: 'exam_score', label: 'Exam score', unit: 'best exam score, %' },
];

const kindMeta = (kind: GoalKind) => KINDS.find((k) => k.value === kind) ?? KINDS[0];

type FormState = {
  id: string | null;
  title: string;
  kind: GoalKind;
  target: string;
  deadline: string;
};

const emptyForm: FormState = { id: null, title: '', kind: 'reviews', target: '', deadline: '' };

/**
 * Personal goals (#13) — the student's own targets, with live progress the
 * server recomputes on every read. Create, edit, delete; completion is
 * automatic when progress crosses the target (XP + notification already fire
 * server-side), so there is deliberately no "mark done" button.
 *
 * Self-contained fetch like ChallengesCard: renders nothing on error, and the
 * whole card is student-only — goals are a learner object.
 */
export function GoalsCard() {
  const { me } = useMe();
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    api.get<{ goals: Goal[] }>('/api/v1/goals')
      .then((d) => setGoals(d.goals))
      .catch(() => setGoals([]));
  };
  useEffect(load, []);

  if (me?.role !== 'student' || goals === null) return null;

  const open = goals.filter((g) => !g.completed);
  const done = goals.filter((g) => g.completed);

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setError('');
    const body = {
      title: form.title.trim(),
      target: Number(form.target),
      deadline: form.deadline || null,
      ...(form.id ? {} : { kind: form.kind }),
    };
    try {
      const d = form.id
        ? await api.patch<{ goals: Goal[] }>(`/api/v1/goals/${form.id}`, body)
        : await api.post<{ goals: Goal[] }>('/api/v1/goals', body);
      setGoals(d.goals);
      setForm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the goal.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      const d = await api.del<{ goals: Goal[] }>(`/api/v1/goals/${id}`);
      setGoals(d.goals);
      setConfirmId(null);
    } catch {
      setError('Could not delete the goal.');
    } finally {
      setBusy(false);
    }
  };

  const goalRow = (g: Goal) => {
    const meta = kindMeta(g.kind);
    const pct = Math.min(100, (g.progress / Math.max(1, g.target)) * 100);
    return (
      <li key={g.id} className="flex items-center gap-3">
        <span
          className={
            g.completed
              ? 'grid h-7 w-7 shrink-0 place-items-center rounded-full bg-good-soft text-good-strong'
              : 'grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground'
          }
          aria-hidden="true"
        >
          <Icon name={g.completed ? 'correct' : 'target'} size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className={`t-caption-s truncate ${g.completed ? 'text-muted-foreground line-through' : ''}`}>
              {g.title}
            </span>
            <span className="num t-fine shrink-0 text-muted-foreground">
              {Math.min(g.progress, g.target)}/{g.target}
            </span>
          </div>
          <Progress value={pct} className="mt-1" />
          <p className="t-fine mt-1 text-muted-foreground">
            {meta.unit}
            {g.deadline ? ` · by ${g.deadline}` : ''}
          </p>
        </div>
        {!g.completed && confirmId !== g.id && (
          <span className="flex shrink-0 gap-0.5">
            <button
              type="button"
              aria-label={`Edit ${g.title}`}
              onClick={() =>
                setForm({ id: g.id, title: g.title, kind: g.kind, target: String(g.target), deadline: g.deadline ?? '' })
              }
              className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Icon name="edit" size={14} />
            </button>
            <button
              type="button"
              aria-label={`Delete ${g.title}`}
              onClick={() => setConfirmId(g.id)}
              className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive-ink"
            >
              <Icon name="remove" size={14} />
            </button>
          </span>
        )}
        {confirmId === g.id && (
          <span className="flex shrink-0 items-center gap-1.5">
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void remove(g.id)}>
              Delete
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmId(null)}>
              Keep
            </Button>
          </span>
        )}
      </li>
    );
  };

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="t-strong">Goals</h2>
        {goals.length > 0 && (
          <span className="t-fine text-muted-foreground">
            {done.length} of {goals.length} done
          </span>
        )}
      </div>

      {form ? (
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => { e.preventDefault(); void save(); }}
        >
          <Field icon="target" label="Goal" htmlFor="goalTitle">
            <Input
              id="goalTitle"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="100 reviews this month"
              maxLength={120}
              required
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field icon="spec" label="Counts" htmlFor="goalKind">
              <select
                id="goalKind"
                value={form.kind}
                disabled={form.id !== null}
                onChange={(e) => setForm({ ...form, kind: e.target.value as GoalKind })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 t-body disabled:opacity-60"
              >
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </select>
            </Field>
            <Field icon="gauge" label="Target" htmlFor="goalTarget">
              <Input
                id="goalTarget"
                type="number"
                min={1}
                max={1000000}
                value={form.target}
                onChange={(e) => setForm({ ...form, target: e.target.value })}
                required
              />
            </Field>
          </div>
          <Field icon="clock" label="Deadline (optional)" htmlFor="goalDeadline">
            <Input
              id="goalDeadline"
              type="date"
              value={form.deadline}
              onChange={(e) => setForm({ ...form, deadline: e.target.value })}
            />
          </Field>
          <p className="t-fine text-muted-foreground">
            {kindMeta(form.kind).unit}
            {form.id ? ' · the kind cannot change once set' : ''}
          </p>
          {error && <p className="t-caption text-destructive-ink">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy || !form.title.trim() || !Number(form.target)}>
              {busy ? 'Saving…' : form.id ? 'Save goal' : 'Add goal'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setForm(null); setError(''); }}>
              Cancel
            </Button>
          </div>
        </form>
      ) : goals.length === 0 ? (
        <div className="mt-3">
          <p className="t-caption text-muted-foreground">
            Set something to aim at — Revisio counts it live and pays out when you land it.
          </p>
          <Button variant="secondary" size="sm" className="mt-3 gap-1.5" onClick={() => setForm({ ...emptyForm })}>
            <Icon name="add" size={14} />
            New goal
          </Button>
        </div>
      ) : (
        <div className="mt-3">
          {open.length > 0 && <ul className="space-y-2.5">{open.map(goalRow)}</ul>}
          {done.length > 0 && (
            <>
              {open.length > 0 && <p className="t-fine mb-2 mt-4 text-muted-foreground">Done</p>}
              <ul className="space-y-2.5">{done.map(goalRow)}</ul>
            </>
          )}
          <Button
            variant="secondary"
            size="sm"
            className="mt-3 gap-1.5"
            onClick={() => setForm({ ...emptyForm })}
          >
            <Icon name="add" size={14} />
            New goal
          </Button>
        </div>
      )}
    </Card>
  );
}
