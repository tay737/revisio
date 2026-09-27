'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icons';
import { Notice } from '@/components/Notice';

type Concept = { id: string; name: string; category: string; description: string };
type Subject = { id: string; name: string; mathsEnabled: boolean };
type LibraryTopic = { id: string; name: string; subjectId: string };
type MathSet = { id: string; topicId: string; title: string; description: string; concepts: string[]; defaultCount: number; defaultDifficulty: string };

/**
 * Author maths question sets.
 *
 * A set pins generator concepts to a topic — the questions themselves are
 * never written or stored, they are generated at practice time from the
 * concept list and a difficulty. Only subjects with maths practice enabled
 * accept sets.
 */
export function MathsSets({ topics, onDone }: { topics: LibraryTopic[]; onDone: (message: string) => void }) {
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState('');
  const [topicId, setTopicId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard' | 'mixed'>('mixed');
  const [count, setCount] = useState(10);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [mySets, setMySets] = useState<MathSet[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ concepts: Concept[] }>('/api/v1/maths').then((d) => setConcepts(d.concepts)).catch(() => undefined);
    api.get<{ subjects: Subject[] }>('/api/v1/subjects').then((d) => setSubjects(d.subjects.filter((s) => s.mathsEnabled))).catch(() => undefined);
  }, []);

  const loadSets = (sid: string) => {
    if (!sid) return setMySets([]);
    api.get<{ mySets: MathSet[] }>(`/api/v1/maths?subjectId=${sid}`).then((d) => setMySets(d.mySets)).catch(() => setMySets([]));
  };

  const subjectTopics = useMemo(
    () => (subjectId ? topics.filter((t) => t.subjectId === subjectId) : []),
    [topics, subjectId],
  );

  const byCategory = useMemo(() => {
    const groups = new Map<string, Concept[]>();
    for (const c of concepts) {
      const list = groups.get(c.category) ?? [];
      list.push(c);
      groups.set(c.category, list);
    }
    return [...groups.entries()];
  }, [concepts]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/api/v1/maths', {
        action: 'create_set',
        topicId,
        title,
        description,
        concepts: [...picked],
        defaultDifficulty: difficulty,
        defaultCount: count,
      });
      onDone(`“${title}” saved. Students practising this topic will now be offered it.`);
      setTitle('');
      setDescription('');
      setPicked(new Set());
      loadSets(subjectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That set did not save.');
    } finally {
      setBusy(false);
    }
  };

  const removeSet = async (set: MathSet) => {
    setBusy(true);
    setError('');
    try {
      await api.del(`/api/v1/maths?setId=${set.id}`);
      onDone(`“${set.title}” removed.`);
      loadSets(subjectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That set did not delete.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {subjects.length === 0 ? (
        <p className="t-caption text-muted-foreground">
          No subject has maths practice yet — a developer switches it on per subject in Admin.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="maths-subject">Subject (maths enabled)</label>
              <select
                id="maths-subject"
                className="input"
                value={subjectId}
                onChange={(e) => {
                  setSubjectId(e.target.value);
                  setTopicId('');
                  loadSets(e.target.value);
                }}
              >
                <option value="">Choose…</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="maths-topic">Topic</label>
              <select id="maths-topic" className="input" value={topicId} onChange={(e) => setTopicId(e.target.value)} disabled={!subjectId}>
                <option value="">Choose…</option>
                {subjectTopics.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="maths-title">Set title</label>
              <input id="maths-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Brackets and equations" required />
            </div>
            <div>
              <label className="label" htmlFor="maths-desc">One line about it</label>
              <input id="maths-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
            </div>
          </div>

          <div>
            <span className="label">Concepts in this set ({picked.size})</span>
            <div className="max-h-64 space-y-3 overflow-y-auto rounded-[11px] border border-border/70 p-3">
              {byCategory.map(([category, list]) => (
                <div key={category}>
                  <span className="t-eyebrow">{category}</span>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {list.map((c) => {
                      const on = picked.has(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          aria-pressed={on}
                          title={c.description}
                          onClick={() =>
                            setPicked((p) => {
                              const n = new Set(p);
                              if (n.has(c.id)) n.delete(c.id);
                              else n.add(c.id);
                              return n;
                            })
                          }
                          className={`chip transition-colors duration-150 ${on ? 'chip-active' : ''}`}
                        >
                          {on && <Icon name="correct" size={12} />}
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="label">Default difficulty</span>
              <div className="flex gap-1 rounded-[11px] border border-border/70 bg-card/60 p-1">
                {(['easy', 'medium', 'hard', 'mixed'] as const).map((d) => (
                  <button key={d} type="button" onClick={() => setDifficulty(d)} aria-pressed={difficulty === d} className={`segment flex-1 capitalize ${difficulty === d ? 'segment-active' : ''}`}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label" htmlFor="maths-count">Default questions — {count}</label>
              <input id="maths-count" type="range" min={5} max={30} step={5} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full" />
            </div>
          </div>

          <Notice tone="bad" show={Boolean(error)}>{error}</Notice>

          <Button type="submit" disabled={busy || !topicId || !title.trim() || picked.size === 0}>
            <Icon name="add" size={16} />
            {busy ? 'Saving…' : 'Save set'}
          </Button>
        </form>
      )}

      {mySets.length > 0 && (
        <div className="space-y-2">
          <span className="label">Your sets in this subject</span>
          {mySets.map((s) => (
            <div key={s.id} className="inset flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <span className="t-strong">{s.title}</span>
                <span className="t-caption mt-0.5 block text-muted-foreground">
                  {s.concepts.length} concepts · default {s.defaultCount} questions · {s.defaultDifficulty}
                </span>
              </div>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => removeSet(s)}>
                <Icon name="remove" size={14} />
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
