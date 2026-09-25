'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icons';
import { Notice } from '@/components/Notice';

type Subject = { id: string; name: string };
type Kind = 'cloze' | 'flashcard' | 'mcq';

type Draft = {
  kind: Kind;
  textWithBlank: string;
  prompt: string;
  question: string;
  answers: string;
  options: string;
  correctIdx: number;
};

const blank = (kind: Kind): Draft => ({
  kind,
  textWithBlank: '',
  prompt: '',
  question: '',
  answers: '',
  options: '',
  correctIdx: 0,
});

/**
 * Write a topic from scratch: notes and the questions that test them, in one
 * place, so they arrive together. Importing is the other way in, and attaching
 * an import to a topic written here is what keeps the two halves of a subject
 * in the same place.
 */
export function ComposeTopic({ subjects, onCreated }: { subjects: Subject[]; onCreated: (message: string) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [lesson, setLesson] = useState({ title: '', detailedMd: '', summaryMd: '', specRefs: '' });
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [publish, setPublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const patch = (i: number, next: Partial<Draft>) => setDrafts((prev) => prev.map((d, j) => (j === i ? { ...d, ...next } : d)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/api/v1/content', {
        subjectId: subjectId || subjects[0]?.id,
        name,
        description,
        publish,
        lessons: lesson.title ? [lesson] : [],
        cards: drafts
          .map((d) => ({
            kind: d.kind,
            textWithBlank: d.textWithBlank || undefined,
            prompt: d.prompt || undefined,
            question: d.question || undefined,
            answers: d.kind === 'mcq' ? undefined : d.answers.split('|').map((s) => s.trim()).filter(Boolean),
            options: d.kind === 'mcq' ? d.options.split('\n').map((s) => s.trim()).filter(Boolean) : undefined,
            correctIdx: d.kind === 'mcq' ? d.correctIdx : undefined,
          }))
          .filter((c) => c.textWithBlank || c.prompt || c.question),
      });
      onCreated(publish ? 'Sent for review.' : 'Saved to your topics.');
      setName('');
      setDescription('');
      setLesson({ title: '', detailedMd: '', summaryMd: '', specRefs: '' });
      setDrafts([]);
      setPublish(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That topic did not save.');
    } finally {
      setBusy(false);
    }
  };

  /** Open whichever section is missing, so the form is never a wall of fields. */
  const missingNotes = !lesson.title;
  const missingQuestions = drafts.length === 0;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <label className="label" htmlFor="topic-name">
            Topic
          </label>
          <input
            id="topic-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Pattern recognition"
          />
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="topic-subject">
            Subject
          </label>
          <select id="topic-subject" className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="topic-desc">
          One line about it
        </label>
        <input
          id="topic-desc"
          className="input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional"
        />
      </div>

      <details className="inset px-4 py-3" open={missingNotes}>
        <summary className="flex cursor-pointer items-center gap-2 text-[14px] font-semibold leading-snug">
          <Icon name="notes" size={15} />
          Notes
          <span className="chip ml-1">{lesson.title ? '1' : '0'}</span>
          <Icon name="collapse" size={14} className="ml-auto text-muted-foreground" />
        </summary>
        <div className="mt-3 space-y-3">
          <input
            className="input"
            value={lesson.title}
            onChange={(e) => setLesson({ ...lesson, title: e.target.value })}
            placeholder="Where I read this from"
          />
          <textarea
            className="input min-h-[120px]"
            value={lesson.detailedMd}
            onChange={(e) => setLesson({ ...lesson, detailedMd: e.target.value })}
            placeholder={'## Heading\n- a point worth remembering'}
          />
          <textarea
            className="input min-h-[70px]"
            value={lesson.summaryMd}
            onChange={(e) => setLesson({ ...lesson, summaryMd: e.target.value })}
            placeholder="Summary — the version cram shows you"
          />
          <input
            className="input"
            value={lesson.specRefs}
            onChange={(e) => setLesson({ ...lesson, specRefs: e.target.value })}
            placeholder="Spec references, e.g. 1.1.1"
          />
        </div>
      </details>

      <details className="inset px-4 py-3" open={missingQuestions && !missingNotes}>
        <summary className="flex cursor-pointer items-center gap-2 text-[14px] font-semibold leading-snug">
          <Icon name="target" size={15} />
          Questions
          <span className="chip ml-1">{drafts.length}</span>
          <Icon name="collapse" size={14} className="ml-auto text-muted-foreground" />
        </summary>
        <div className="mt-3 space-y-3">
          {drafts.map((d, i) => (
            <div key={i} className="inset space-y-2.5 p-3.5">
              <div className="flex items-center gap-2">
                <select
                  className="input max-w-[170px]"
                  value={d.kind}
                  onChange={(e) => patch(i, blank(e.target.value as Kind))}
                  aria-label="Question type"
                >
                  <option value="cloze">Fill the blank</option>
                  <option value="flashcard">Flashcard</option>
                  <option value="mcq">Multiple choice</option>
                </select>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() => setDrafts((prev) => prev.filter((_, j) => j !== i))}
                >
                  <Icon name="remove" size={14} />
                  Remove
                </Button>
              </div>

              {d.kind === 'cloze' && (
                <input
                  className="input"
                  value={d.textWithBlank}
                  onChange={(e) => patch(i, { textWithBlank: e.target.value })}
                  placeholder="The powerhouse of the cell is the ____"
                />
              )}
              {d.kind === 'flashcard' && (
                <input
                  className="input"
                  value={d.prompt}
                  onChange={(e) => patch(i, { prompt: e.target.value })}
                  placeholder="What should you be able to answer?"
                />
              )}
              {d.kind === 'mcq' && (
                <>
                  <input
                    className="input"
                    value={d.question}
                    onChange={(e) => patch(i, { question: e.target.value })}
                    placeholder="Question"
                  />
                  <textarea
                    className="input min-h-[80px]"
                    value={d.options}
                    onChange={(e) => patch(i, { options: e.target.value })}
                    placeholder="One option per line"
                  />
                  <label className="label" htmlFor={`correct-${i}`}>
                    Correct option — count from 0
                  </label>
                  <input
                    id={`correct-${i}`}
                    type="number"
                    min={0}
                    className="input max-w-[110px]"
                    value={d.correctIdx}
                    onChange={(e) => patch(i, { correctIdx: Number(e.target.value) })}
                  />
                </>
              )}
              {d.kind !== 'mcq' && (
                <input
                  className="input"
                  value={d.answers}
                  onChange={(e) => patch(i, { answers: e.target.value })}
                  placeholder={d.kind === 'cloze' ? 'Accepted answers, separated by |' : 'Model answer'}
                />
              )}
            </div>
          ))}
          <Button type="button" variant="secondary" size="sm" onClick={() => setDrafts((p) => [...p, blank('cloze')])}>
            <Icon name="add" size={15} />
            Add a question
          </Button>
        </div>
      </details>

      <label className="flex items-start gap-2.5">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-[rgb(var(--foreground))]"
          checked={publish}
          onChange={(e) => setPublish(e.target.checked)}
        />
        <span className="t-caption">
          Submit for students to see
          <span className="mt-0.5 block text-muted-foreground">Someone checks it before it goes out.</span>
        </span>
      </label>

      <Notice tone="bad" show={Boolean(error)}>
        {error}
      </Notice>

      <Button type="submit" disabled={busy || !name}>
        <Icon name={publish ? 'publish' : 'add'} size={16} />
        {busy ? 'Saving…' : publish ? 'Submit for review' : 'Save topic'}
      </Button>
    </form>
  );
}
