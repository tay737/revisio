'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icons';
import { Notice } from '@/components/Notice';
import type { TopicOption } from '@/components/content/MergeTopics';

type Subject = { id: string; name: string };
type ImportResponse = { created: number; failed: number; attached: boolean; topicName: string; errors: { row: number; message: string }[]; message?: string };

/**
 * Import a deck — into a topic that already exists, or a new one.
 *
 * The choice is the point of the panel. Importing used to only ever create a
 * new topic, which is how the questions for a subject ended up divorced from
 * its notes: the deck arrived in its own private topic and nothing could put it
 * beside the writing it belonged to.
 */
export function ImportDeck({
  topics,
  subjects,
  onImported,
  onChanged,
}: {
  topics: TopicOption[];
  subjects: Subject[];
  onImported: (message: string) => void;
  onChanged: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<'tsv' | 'csv' | 'anki_tsv'>('tsv');
  const [mode, setMode] = useState<'existing' | 'new'>(topics.length ? 'existing' : 'new');
  const [topicId, setTopicId] = useState('');
  const [name, setName] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [publish, setPublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState('');

  const ready = Boolean(file) && (mode === 'existing' ? Boolean(topicId) : Boolean(name.trim()));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError('');
    setReport('');
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('kind', kind);
      if (mode === 'existing') form.set('topicId', topicId);
      else {
        form.set('topicName', name.trim());
        form.set('subjectId', subjectId || subjects[0]?.id || '');
        if (publish) form.set('publish', 'true');
      }
      const res = await api.upload<ImportResponse>('/api/v1/import', form);
      const where = res.attached ? `into “${res.topicName}”` : `as “${res.topicName}”`;
      setReport(
        `${res.created} ${res.created === 1 ? 'question' : 'questions'} added ${where}.` +
          (res.failed ? ` ${res.failed} ${res.failed === 1 ? 'row' : 'rows'} skipped.` : ''),
      );
      setFile(null);
      setName('');
      onImported('');
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That import did not go through.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <label className="label" htmlFor="import-file">
            File
          </label>
          <input
            id="import-file"
            type="file"
            accept=".csv,.tsv,.txt"
            className="input py-2.5"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setReport('');
            }}
          />
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="import-format">
            Format
          </label>
          <select id="import-format" className="input" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="tsv">TSV / Anki export</option>
            <option value="csv">CSV</option>
            <option value="anki_tsv">Anki TSV</option>
          </select>
        </div>
      </div>

      <div>
        <span className="label">Where should these questions go?</span>
        <div className="flex gap-1 rounded-[11px] border border-border/70 bg-card/60 p-1">
          {(
            [
              ['existing', 'Into a topic I have'],
              ['new', 'Into a new topic'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              disabled={value === 'existing' && topics.length === 0}
              onClick={() => setMode(value)}
              className={`segment flex-1 ${mode === value ? 'segment-active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'existing' ? (
        <div>
          <label className="label" htmlFor="import-target">
            Attach to
          </label>
          <select id="import-target" className="input" value={topicId} onChange={(e) => setTopicId(e.target.value)}>
            <option value="">Pick a topic…</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.cardCount !== undefined ? ` — ${t.cardCount} questions, ${t.lessonCount ?? 0} note ${(t.lessonCount ?? 0) === 1 ? 'set' : 'sets'}` : ''}
              </option>
            ))}
          </select>
          <p className="t-caption mt-1.5 text-muted-foreground">
            The notes in that topic stay where they are, and the questions land beside them.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <label className="label" htmlFor="import-name">
              Topic name
            </label>
            <input
              id="import-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Defaults to the file name"
            />
          </div>
          <div className="min-w-0">
            <label className="label" htmlFor="import-subject">
              Subject
            </label>
            <select id="import-subject" className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {mode === 'new' && (
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
      )}

      <details className="inset px-4 py-3">
        <summary className="flex cursor-pointer items-center gap-2 text-[14px] font-semibold leading-snug">
          <Icon name="notes" size={15} />
          What a file can look like
          <Icon name="collapse" size={14} className="ml-auto text-muted-foreground" />
        </summary>
        <ul className="t-caption mt-3 space-y-1.5 font-mono text-muted-foreground">
          <li>question&lt;tab&gt;answer</li>
          <li>cloze: The cell&apos;s powerhouse is the ____ | mitochondrion</li>
          <li>mcq: Which organelle…?; Ribosome; *Mitochondrion; Nucleus</li>
        </ul>
        <p className="t-caption mt-2 text-muted-foreground">
          <code>*</code> marks the correct option, or end the row with <code>| 1</code>.
        </p>
      </details>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!ready || busy}>
          <Icon name="upload" size={16} />
          {busy ? 'Importing…' : 'Import'}
        </Button>
        {report && <span className="t-caption text-good-pressed">{report}</span>}
      </div>

      <Notice tone="bad" show={Boolean(error)}>
        {error}
      </Notice>
    </form>
  );
}
