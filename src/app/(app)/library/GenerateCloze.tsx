'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { Icon } from '@/components/ui/icons';
import { Notice } from '@/components/Notice';

type TopicOption = { id: string; name: string; subjectName: string };
type Proposal = { answer: string; textWithBlank: string; lessonTitle?: string; keep: boolean };

/**
 * Cloze generation, with the author in charge.
 *
 * The generator reads a topic's notes and proposes fill-the-blank questions
 * ranked by recall value. Nothing is written until the author approves: each
 * proposal can be kept, edited, or discarded, and only kept ones insert.
 * A repeated run keeps finding fresh sentences — the pipeline cools down
 * sentences and answers it has already used, and it never proposes a blank
 * the topic already asks for.
 */
export function GenerateCloze({ topics, onDone }: { topics: TopicOption[]; onDone: (message: string) => void }) {
  const [topicId, setTopicId] = useState('');
  const [count, setCount] = useState(10);
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [inserting, setInserting] = useState(false);
  const [error, setError] = useState('');

  const picked = topics.find((t) => t.id === topicId) ?? null;

  const generate = async () => {
    if (!topicId) return;
    setBusy(true);
    setError('');
    try {
      const d = await api.patch<{ proposals: Omit<Proposal, 'keep'>[] }>('/api/v1/content', {
        action: 'generate_cloze',
        topicId,
        count,
      });
      setProposals(d.proposals.map((p) => ({ ...p, keep: true })));
      if (d.proposals.length === 0) {
        setError('No new questions came out of these notes. Add more prose to the topic, or the notes may already be fully asked.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed.');
    } finally {
      setBusy(false);
    }
  };

  const patch = (i: number, next: Partial<Proposal>) =>
    setProposals((prev) => prev?.map((p, j) => (j === i ? { ...p, ...next } : p)) ?? null);

  const insert = async () => {
    if (!proposals) return;
    const keepers = proposals.filter((p) => p.keep && p.textWithBlank.includes('____') && p.answer.trim());
    if (keepers.length === 0) return;
    setInserting(true);
    setError('');
    try {
      const d = await api.patch<{ inserted: number }>('/api/v1/content', {
        action: 'insert_cloze',
        topicId,
        proposals: keepers.map((p) => ({ answer: p.answer, textWithBlank: p.textWithBlank, lessonTitle: p.lessonTitle })),
      });
      onDone(
        d.inserted === keepers.length
          ? `${d.inserted} ${d.inserted === 1 ? 'question' : 'questions'} added to “${picked?.name}”.`
          : `${d.inserted} added — ${keepers.length - d.inserted} were already in the topic and were skipped.`,
      );
      setProposals(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Insert failed.');
    } finally {
      setInserting(false);
    }
  };

  const kept = proposals?.filter((p) => p.keep && p.textWithBlank.includes('____') && p.answer.trim()).length ?? 0;

  return (
    <div className="space-y-4">
      <Notice tone="bad" show={Boolean(error)}>{error}</Notice>

      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div>
          <label className="label" htmlFor="gen-topic">Topic</label>
          <select id="gen-topic" className="input" value={topicId} onChange={(e) => { setTopicId(e.target.value); setProposals(null); setError(''); }}>
            <option value="">Choose a topic…</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>{t.subjectName ? `${t.subjectName} — ${t.name}` : t.name}</option>
            ))}
          </select>
          <p className="t-caption mt-1.5 text-muted-foreground">
            {picked
              ? picked.subjectName
                ? `Reading the notes of “${picked.name}” in ${picked.subjectName}.`
                : `Reading the notes of “${picked.name}”.`
              : 'Questions are proposed from the topic’s own notes.'}
          </p>
        </div>
        <div>
          <label className="label" htmlFor="gen-count">How many — {count}</label>
          <input
            id="gen-count"
            type="range"
            min={5}
            max={30}
            step={5}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="w-full sm:w-44"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-secondary" disabled={!topicId || busy} onClick={generate}>
          <Icon name="rocket" size={16} />
          {busy ? 'Reading the notes…' : 'Propose questions'}
        </button>
        {proposals && kept > 0 && (
          <button type="button" className="btn btn-primary" disabled={inserting} onClick={insert}>
            {inserting ? 'Adding…' : `Add ${kept} ${kept === 1 ? 'question' : 'questions'}`}
          </button>
        )}
      </div>

      {proposals && proposals.length > 0 && (
        <div className="space-y-2">
          {proposals.map((p, i) => (
            <div key={`${i}-${p.answer}`} className={`inset px-4 py-3 ${p.keep ? '' : 'opacity-55'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <input
                    className="input text-[14px]"
                    value={p.textWithBlank}
                    onChange={(e) => patch(i, { textWithBlank: e.target.value })}
                    aria-label="Question text"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <label className="t-caption text-muted-foreground" htmlFor={`ans-${i}`}>Answer</label>
                    <input
                      id={`ans-${i}`}
                      className="input w-44 text-[14px]"
                      value={p.answer}
                      onChange={(e) => patch(i, { answer: e.target.value })}
                    />
                    {p.lessonTitle && <span className="chip shrink-0">{p.lessonTitle}</span>}
                  </div>
                </div>
                <button
                  type="button"
                  aria-pressed={p.keep}
                  aria-label={p.keep ? 'Discard this proposal' : 'Keep this proposal'}
                  onClick={() => patch(i, { keep: !p.keep })}
                  className={`btn btn-ghost btn-sm shrink-0 ${p.keep ? 'text-good-strong' : ''}`}
                >
                  <Icon name={p.keep ? 'correct' : 'close'} size={15} />
                  {p.keep ? 'Keeping' : 'Discarded'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {proposals && proposals.length > 0 && (
        <p className="t-caption text-muted-foreground">
          Edit any question before adding it. The blank is <span className="font-mono">____</span>; the answer is what
          fills it.
        </p>
      )}
    </div>
  );
}
