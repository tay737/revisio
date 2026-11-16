'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { api, ApiClientError } from '@/lib/api';
import { Icon } from '@/components/ui/icons';
import { Notice } from '@/components/Notice';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { InlineConfirm } from '@/components/ui/inline-confirm';

type TopicOption = { id: string; name: string; subjectName?: string | null };
type Assignment = {
  id: string;
  topicId: string;
  topicName: string;
  dueDate: string | null;
  noteDensity: 'light' | 'standard' | 'deep';
  required: boolean;
  note: string;
  createdAt: string;
};
type PulseCard = {
  cardId: string; kind: string; prompt: string | null; topicId: string; topicName: string;
  reviews: number; missRatePct: number; avgDurationMs: number; lapses: number;
};
type PulseAssignment = {
  id: string; topicId: string; topicName: string; dueDate: string | null; required: boolean;
  cardCount: number; classAvgCompletionPct: number;
  roster: { userId: string; name: string; touched: number; total: number; completionPct: number }[];
};
type Pulse = { class: { id: string; name: string }; members: number; cards: PulseCard[]; assignments: PulseAssignment[] };

const DENSITY_LABEL = { light: 'Light notes', standard: 'Standard notes', deep: 'Deep notes' } as const;

function dueLabel(iso: string | null): string {
  if (!iso) return 'No deadline';
  // UTC-noon parse so the calendar date cannot slide a day either side.
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function duration(ms: number): string {
  if (ms <= 0) return '—';
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

/**
 * Assigned decks (#5) — a teacher pins a topic to a class with a deadline and
 * a required flag. Students need nothing new: required assignments already
 * reorder their queue server-side, so this panel is purely the teacher's
 * side of the contract.
 */
export function AssignmentsPanel({ classId }: { classId: string }) {
  const { data, mutate } = useSWR<{ assignments: Assignment[] }>(`/api/v1/classes/assignments?classId=${classId}`, api.get, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  // `?editable=1` mirrors the actual edit right — staff publish with
  // ownerId NULL, so the mine-list would hide their own topics here too.
  const { data: topicData } = useSWR<{ topics: TopicOption[] }>('/api/v1/content?editable=1', api.get, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  const topics = topicData?.topics ?? [];
  const assignments = data?.assignments ?? [];

  const [topicId, setTopicId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [density, setDensity] = useState<'light' | 'standard' | 'deep'>('standard');
  const [required, setRequired] = useState(true);
  const [note, setNote] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note2, setNote2] = useState('');

  const reset = () => {
    setTopicId(''); setDueDate(''); setDensity('standard'); setRequired(true); setNote(''); setEditingId(null); setError('');
  };

  const fail = (e: unknown) => setError(e instanceof ApiClientError ? e.message : e instanceof Error ? e.message : 'That did not go through.');

  const save = async () => {
    setBusy(true);
    setError('');
    setNote2('');
    try {
      const body = { topicId, dueDate: dueDate || null, noteDensity: density, required, note: note.trim() };
      if (editingId) {
        const { topicId: _t, ...patch } = body;
        await api.patch(`/api/v1/classes/assignments/${editingId}`, patch);
        setNote2('Assignment updated.');
      } else {
        await api.post('/api/v1/classes/assignments', { classId, ...body });
        setNote2('Deck assigned.');
      }
      reset();
      await mutate();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (a: Assignment) => {
    setEditingId(a.id);
    setTopicId(a.topicId);
    setDueDate(a.dueDate ?? '');
    setDensity(a.noteDensity);
    setRequired(a.required);
    setNote(a.note);
    setError('');
  };

  const remove = async (id: string) => {
    setError('');
    try {
      await api.del(`/api/v1/classes/assignments/${id}`);
      if (editingId === id) reset();
      await mutate();
    } catch (e) {
      fail(e);
    }
  };

  return (
    <div className="mt-4 border-t border-border/60 pt-4">
      <h3 className="t-strong">Assigned decks</h3>
      <p className="t-caption mt-1 text-muted-foreground">
        Pin a topic with a deadline. Required decks move to the front of each student's queue; optional ones are a nudge, not an order.
      </p>
      <Notice tone="bad" show={!!error}>{error}</Notice>
      <Notice tone="good" show={!!note2}>{note2}</Notice>

      {assignments.length > 0 && (
        <ul className="mt-3 divide-y divide-border/60">
          {assignments.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
              <div className="min-w-0 flex-1">
                <span className="t-caption font-semibold">{a.topicName}</span>
                <span className="ml-2 t-fine text-muted-foreground">
                  {dueLabel(a.dueDate)} · {DENSITY_LABEL[a.noteDensity].toLowerCase()}
                  {a.note && ` · “${a.note}”`}
                </span>
              </div>
              <Badge variant="chip" className="num shrink-0">{a.required ? 'required' : 'optional'}</Badge>
              <span className="flex shrink-0 gap-1">
                <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => (editingId === a.id ? reset() : startEdit(a))}>
                  {editingId === a.id ? 'Cancel' : 'Edit'}
                </Button>
                <InlineConfirm
                  label="Remove"
                  icon="remove"
                  title={`Unassign “${a.topicName}”?`}
                  message="Students keep their progress; the deck just leaves their required queue."
                  confirmLabel="Unassign"
                  onConfirm={() => void remove(a.id)}
                />
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`assign-topic-${classId}`}>Topic</Label>
          <NativeSelect id={`assign-topic-${classId}`} className="mt-1" value={topicId} onChange={(e) => setTopicId(e.target.value)} disabled={!!editingId}>
            <option value="">Choose a topic…</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>{t.subjectName ? `${t.subjectName} — ${t.name}` : t.name}</option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <Label htmlFor={`assign-due-${classId}`}>Deadline</Label>
          <Input id={`assign-due-${classId}`} type="date" className="mt-1" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div>
          <Label htmlFor={`assign-density-${classId}`}>Note density</Label>
          <NativeSelect id={`assign-density-${classId}`} className="mt-1" value={density} onChange={(e) => setDensity(e.target.value as typeof density)}>
            <option value="light">Light notes</option>
            <option value="standard">Standard notes</option>
            <option value="deep">Deep notes</option>
          </NativeSelect>
        </div>
        <div>
          <Label htmlFor={`assign-note-${classId}`}>Note for students (optional)</Label>
          <Input id={`assign-note-${classId}`} className="mt-1" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Why this one, or what to focus on" />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex min-h-11 cursor-pointer items-center gap-2 t-caption">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="h-4 w-4 accent-primary" />
          Required — goes to the front of their queue
        </label>
        <Button type="button" variant="primary" size="sm" className="ml-auto" disabled={busy || !topicId} onClick={() => void save()}>
          {editingId ? 'Save changes' : 'Assign deck'}
        </Button>
      </div>
      {editingId && <p className="t-fine mt-1 text-muted-foreground">Editing an existing assignment — the topic itself cannot change; unassign and reassign to move it.</p>}
    </div>
  );
}

/**
 * Class pulse (#5) — how the roster is actually doing on the class's decks:
 * per-card struggle (reviews, miss rate, pace, lapses) and per-assignment
 * completion across every member. Teacher-only; the API 403s anyone else.
 */
export function PulsePanel({ classId }: { classId: string }) {
  const { data, isLoading } = useSWR<Pulse>(`/api/v1/teacher/class-pulse?classId=${classId}`, api.get, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  if (isLoading) return <p className="t-caption mt-4 text-muted-foreground">Reading the class…</p>;
  if (!data) return <p className="t-caption mt-4 text-muted-foreground">Pulse is unavailable right now.</p>;
  if (data.members === 0) {
    return <p className="t-caption mt-4 text-muted-foreground">Nobody has joined yet — the pulse fills in once students start reviewing.</p>;
  }

  return (
    <div className="mt-4 border-t border-border/60 pt-4">
      <h3 className="t-strong">Class pulse</h3>
      <p className="t-caption mt-1 text-muted-foreground">
        {data.members} {data.members === 1 ? 'student' : 'students'} · {data.cards.length} cards reviewed so far.
      </p>

      {data.assignments.length > 0 && (
        <div className="mt-3 space-y-3">
          <p className="t-caption font-semibold">Completion per assignment</p>
          {data.assignments.map((a) => (
            <div key={a.id} className="inset px-3 py-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="t-caption font-semibold">{a.topicName}</span>
                <span className="num t-fine text-muted-foreground">
                  {a.classAvgCompletionPct}% of {a.cardCount} cards · {dueLabel(a.dueDate)}{a.required ? ' · required' : ''}
                </span>
              </div>
              <ul className="mt-1.5 space-y-1">
                {a.roster.map((r) => (
                  <li key={r.userId} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate t-fine">{r.name}</span>
                    <span
                      className="meter h-1.5 w-20 shrink-0"
                      role="meter"
                      aria-label={`${r.name} completion`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={r.completionPct}
                    >
                      <span className="meter-fill block" style={{ width: `${Math.min(100, r.completionPct)}%` }} />
                    </span>
                    <span className="num w-14 shrink-0 text-right t-fine text-muted-foreground">{r.completionPct}%</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {data.cards.length > 0 && (
        <div className="mt-4">
          <p className="t-caption font-semibold">Hardest cards</p>
          <p className="t-fine mt-0.5 text-muted-foreground">Most-reviewed first. Miss rate is wrong answers over all reviews; pace is the average time per review.</p>
          <ul className="mt-2 divide-y divide-border/60">
            {data.cards.slice(0, 15).map((c) => (
              <li key={c.cardId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <Badge variant="chip" className="num shrink-0">{c.kind}</Badge>
                <span className="min-w-0 flex-1 truncate t-caption">{c.prompt ?? '(no prompt)'}</span>
                <span className="num shrink-0 t-fine text-muted-foreground">{c.reviews} rev</span>
                <span className={`num w-12 shrink-0 text-right t-fine ${c.missRatePct >= 50 ? 'text-destructive-ink' : 'text-muted-foreground'}`}>{c.missRatePct}% miss</span>
                <span className="num w-14 shrink-0 text-right t-fine text-muted-foreground">{duration(c.avgDurationMs)}</span>
                <span className="num w-12 shrink-0 text-right t-fine text-muted-foreground">{c.lapses} lapse{c.lapses === 1 ? '' : 's'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.cards.length === 0 && data.assignments.length === 0 && (
        <p className="t-caption mt-3 text-muted-foreground">Reviews will show up here once the class starts working through the decks.</p>
      )}
    </div>
  );
}
