'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Icon } from '@/components/ui/icons';
import { PageHeader } from '@/components/PageHeader';
import { Notice } from '@/components/Notice';
import { BlurFade } from '@/components/ui/motion/blur-fade';
import PageSkeleton from '@/components/PageSkeleton';

type Topic = { id: string; name: string; visibility: string; subjectId: string };
type Subject = { id: string; name: string };
type CardDraft = {
  kind: 'cloze' | 'flashcard' | 'mcq';
  textWithBlank: string;
  prompt: string;
  question: string;
  answers: string;
  options: string;
  correctIdx: number;
};

const emptyCard = (kind: CardDraft['kind']): CardDraft => ({
  kind,
  textWithBlank: '',
  prompt: '',
  question: '',
  answers: '',
  options: '',
  correctIdx: 0,
});

/**
 * My content — authoring, import and class joining for students and staff.
 *
 * The page is four independent jobs stacked on top of each other, so each now
 * announces itself with a glyph and a one-line explanation of what it is for.
 * The card builder keeps its compact shape but its fields carry labels instead
 * of relying on placeholder text (placeholders vanish the moment you type).
 */
export default function LibraryPage() {
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonBody, setLessonBody] = useState('');
  const [lessonSummary, setLessonSummary] = useState('');
  const [specRefs, setSpecRefs] = useState('');
  const [cards, setCards] = useState<CardDraft[]>([]);
  const [publish, setPublish] = useState(false);
  const [saving, setSaving] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [importKind, setImportKind] = useState<'tsv' | 'csv' | 'anki_tsv'>('tsv');
  const [importTopic, setImportTopic] = useState('');
  const [importReport, setImportReport] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const [classCode, setClassCode] = useState('');
  const [joining, setJoining] = useState(false);

  const load = () =>
    api
      .get<{ topics: Topic[] }>('/api/v1/content?mine=1')
      .then((d) => setTopics(d.topics))
      .catch(() => setTopics([]));

  useEffect(() => {
    load();
    api
      .get<{ subjects: Subject[] }>('/api/v1/auth/subjects-public')
      .then((d) => setSubjects(d.subjects))
      .catch(() => undefined);
  }, []);

  const createTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      await api.post('/api/v1/content', {
        subjectId: subjectId || subjects[0]?.id,
        name,
        description,
        publish,
        lessons: lessonTitle
          ? [{ title: lessonTitle, detailedMd: lessonBody, summaryMd: lessonSummary, specRefs }]
          : [],
        cards: cards
          .map((c) => ({
            kind: c.kind,
            textWithBlank: c.textWithBlank || undefined,
            prompt: c.prompt || undefined,
            question: c.question || undefined,
            answers: c.kind === 'mcq' ? undefined : c.answers.split('|').map((s) => s.trim()).filter(Boolean),
            options: c.kind === 'mcq' ? c.options.split('\n').map((s) => s.trim()).filter(Boolean) : undefined,
            correctIdx: c.kind === 'mcq' ? c.correctIdx : undefined,
          }))
          .filter((c) => c.textWithBlank || c.prompt || c.question),
      });
      setMessage(publish ? 'Sent for review. A developer will publish it shortly.' : 'Saved privately to your account.');
      setName('');
      setDescription('');
      setLessonTitle('');
      setLessonBody('');
      setLessonSummary('');
      setSpecRefs('');
      setCards([]);
      setPublish(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not save that topic.');
    } finally {
      setSaving(false);
    }
  };

  const doImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setImportReport(null);
    if (!file) return;
    setImporting(true);
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('kind', importKind);
      form.set('topicName', importTopic || file.name.replace(/\.[^.]+$/, ''));
      const d = await api.upload<{ created: number; failed: number; errors: { row: number; message: string }[] }>(
        '/api/v1/import',
        form,
      );
      setImportReport(
        `Imported ${d.created} ${d.created === 1 ? 'card' : 'cards'}${d.failed ? `, ${d.failed} rows failed` : ''}.` +
          (d.errors.length ? `\nFirst problems: ${d.errors.slice(0, 3).map((x) => `row ${x.row}: ${x.message}`).join('; ')}` : ''),
      );
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That import did not go through.');
    } finally {
      setImporting(false);
    }
  };

  const joinClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setJoining(true);
    try {
      const d = await api.post<{ class: { name: string } }>('/api/v1/classes/join', { code: classCode });
      setMessage(`Joined ${d.class.name}.`);
      setClassCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code did not match a class.');
    } finally {
      setJoining(false);
    }
  };

  const patchCard = (index: number, patch: Partial<CardDraft>) =>
    setCards((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  if (topics === null) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <PageHeader
        icon="library"
        title="My content"
        subtitle="Write your own topics and notes, import decks you already have, or join a class. Everything lives on the server, not in this browser."
      />

      <Notice tone="good">{message}</Notice>
      <Notice tone="bad">{error}</Notice>

      {/* ── Author a topic ───────────────────────────────────────────────── */}
      <section className="card">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
            <Icon name="add" size={17} />
          </span>
          <div>
            <h2 className="t-strong">Create a topic</h2>
            <p className="t-caption mt-1 text-muted">
              A topic is the unit the scheduler works in — notes plus the questions that test them.
            </p>
          </div>
        </div>

        <form onSubmit={createTopic} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="topic-name">Topic name</label>
              <input
                id="topic-name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Photosynthesis"
              />
            </div>
            <div>
              <label className="label" htmlFor="topic-subject">Subject</label>
              <select id="topic-subject" className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="topic-desc">Description</label>
            <input
              id="topic-desc"
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this topic covers"
            />
          </div>

          <details className="inset px-4 py-3">
            <summary className="flex cursor-pointer items-center gap-2 text-[14px] font-semibold leading-[1.29] tracking-[-0.224px]">
              <Icon name="notes" size={15} className="text-accent" />
              Add notes
              <span className="t-caption ml-auto text-muted">optional</span>
              <Icon name="collapse" size={14} className="text-muted" />
            </summary>
            <div className="mt-4 space-y-3">
              <input className="input" value={lessonTitle} onChange={(e) => setLessonTitle(e.target.value)} placeholder="Lesson title" />
              <textarea
                className="input min-h-[120px]"
                value={lessonBody}
                onChange={(e) => setLessonBody(e.target.value)}
                placeholder={'Detailed notes (markdown-ish):\n## Heading\n- bullet **bold**'}
              />
              <textarea
                className="input min-h-[70px]"
                value={lessonSummary}
                onChange={(e) => setLessonSummary(e.target.value)}
                placeholder="Summary notes — the ones cram mode shows"
              />
              <input className="input" value={specRefs} onChange={(e) => setSpecRefs(e.target.value)} placeholder="Spec refs, e.g. 4.1.1.1; 4.1.1.2" />
            </div>
          </details>

          <details className="inset px-4 py-3">
            <summary className="flex cursor-pointer items-center gap-2 text-[14px] font-semibold leading-[1.29] tracking-[-0.224px]">
              <Icon name="target" size={15} className="text-accent" />
              Add questions
              <span className="chip ml-1">{cards.length}</span>
              <Icon name="collapse" size={14} className="ml-auto text-muted" />
            </summary>
            <div className="mt-4 space-y-3">
              {cards.map((c, i) => (
                <div key={i} className="inset space-y-3 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <select
                      className="input max-w-[180px]"
                      value={c.kind}
                      onChange={(e) => patchCard(i, emptyCard(e.target.value as CardDraft['kind']))}
                      aria-label="Question type"
                    >
                      <option value="cloze">Fill the blank</option>
                      <option value="flashcard">Flashcard</option>
                      <option value="mcq">Multiple choice</option>
                    </select>
                    <button
                      type="button"
                      className="btn-danger gap-1.5"
                      onClick={() => setCards((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <Icon name="remove" size={14} />
                      Remove
                    </button>
                  </div>

                  {c.kind === 'cloze' && (
                    <input
                      className="input"
                      value={c.textWithBlank}
                      onChange={(e) => patchCard(i, { textWithBlank: e.target.value })}
                      placeholder="The powerhouse of the cell is the ____"
                    />
                  )}
                  {c.kind === 'flashcard' && (
                    <input
                      className="input"
                      value={c.prompt}
                      onChange={(e) => patchCard(i, { prompt: e.target.value })}
                      placeholder="Question prompt"
                    />
                  )}
                  {c.kind === 'mcq' && (
                    <>
                      <input
                        className="input"
                        value={c.question}
                        onChange={(e) => patchCard(i, { question: e.target.value })}
                        placeholder="Question"
                      />
                      <textarea
                        className="input min-h-[80px]"
                        value={c.options}
                        onChange={(e) => patchCard(i, { options: e.target.value })}
                        placeholder="One option per line"
                      />
                      <label className="label" htmlFor={`correct-${i}`}>
                        Which option is correct? (starting at 0)
                      </label>
                      <input
                        id={`correct-${i}`}
                        type="number"
                        min={0}
                        className="input max-w-[120px]"
                        value={c.correctIdx}
                        onChange={(e) => patchCard(i, { correctIdx: Number(e.target.value) })}
                      />
                    </>
                  )}
                  {c.kind !== 'mcq' && (
                    <input
                      className="input"
                      value={c.answers}
                      onChange={(e) => patchCard(i, { answers: e.target.value })}
                      placeholder={
                        c.kind === 'cloze'
                          ? 'Accepted answers, separated by |'
                          : 'Model answer (use | for alternatives)'
                      }
                    />
                  )}
                </div>
              ))}
              <button type="button" className="btn-secondary btn-sm gap-1.5" onClick={() => setCards((p) => [...p, emptyCard('cloze')])}>
                <Icon name="add" size={15} />
                Add a question
              </button>
            </div>
          </details>

          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={publish}
              onChange={(e) => setPublish(e.target.checked)}
              className="mt-1 h-4 w-4 accent-[rgb(var(--c-accent))]"
            />
            <span className="t-caption">
              Submit for public publishing
              <span className="block text-muted">A developer reviews it before it appears for anyone else.</span>
            </span>
          </label>

          <button type="submit" className="btn-primary gap-2" disabled={saving || !name}>
            <Icon name={publish ? 'publish' : 'learn'} size={17} />
            {saving ? 'Saving…' : publish ? 'Submit for review' : 'Save topic'}
          </button>
        </form>
      </section>

      {/* ── Import ───────────────────────────────────────────────────────── */}
      <section className="card">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
            <Icon name="upload" size={17} />
          </span>
          <div>
            <h2 className="t-strong">Import a deck</h2>
            <p className="t-caption mt-1 text-muted">
              Anki TSV exports, CSV or TSV with <code>front,back</code> rows. Cloze lines can be written as{' '}
              <code>cloze: Stem with ____ | answer</code>.
            </p>
          </div>
        </div>

        <form onSubmit={doImport} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="import-file">File</label>
              <input
                id="import-file"
                type="file"
                accept=".csv,.tsv,.txt"
                className="input py-2.5"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="import-format">Format</label>
              <select
                id="import-format"
                className="input"
                value={importKind}
                onChange={(e) => setImportKind(e.target.value as typeof importKind)}
              >
                <option value="tsv">TSV / Anki export</option>
                <option value="csv">CSV</option>
                <option value="anki_tsv">Anki TSV</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="import-topic">Topic for the imported cards</label>
            <input
              id="import-topic"
              className="input"
              value={importTopic}
              onChange={(e) => setImportTopic(e.target.value)}
              placeholder="Defaults to the file name"
            />
          </div>

          <button type="submit" className="btn-primary gap-2" disabled={!file || importing}>
            <Icon name="upload" size={17} />
            {importing ? 'Importing…' : 'Import'}
          </button>

          {importReport && (
            <pre className="t-caption whitespace-pre-wrap rounded-[11px] bg-edge/30 px-3 py-2.5">{importReport}</pre>
          )}
        </form>
      </section>

      {/* ── Join a class ─────────────────────────────────────────────────── */}
      <section className="card">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
            <Icon name="join" size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="t-strong">Join a class</h2>
            <p className="t-caption mt-1 text-muted">
              Your teacher&apos;s six-character code. Joining shares your review activity with them — nothing else.
            </p>
            <form onSubmit={joinClass} className="mt-3 flex flex-wrap gap-2">
              <input
                className="input uppercase tracking-[0.3em] sm:max-w-[220px]"
                value={classCode}
                onChange={(e) => setClassCode(e.target.value.toUpperCase())}
                maxLength={6}
                placeholder="ABC123"
                required
                aria-label="Class code"
              />
              <button type="submit" className="btn-primary shrink-0" disabled={joining || classCode.length < 6}>
                {joining ? 'Joining…' : 'Join'}
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* ── My topics ────────────────────────────────────────────────────── */}
      <section className="card">
        <h2 className="t-strong">Your topics</h2>
        {topics.length === 0 ? (
          <p className="t-caption mt-2 text-muted">
            Nothing here yet. Create one above, or import a deck you already have.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {topics.map((t, i) => (
              <BlurFade key={t.id} delay={Math.min(i * 0.03, 0.2)}>
                <div className="inset flex items-center justify-between gap-3 px-4 py-3">
                  <span className="t-strong flex items-center gap-2 truncate">
                    <Icon name="topic" size={15} className="shrink-0 text-accent" />
                    {t.name}
                  </span>
                  <span
                    className={`chip shrink-0 ${
                      t.visibility === 'public'
                        ? 'chip-active'
                        : t.visibility === 'pending_review'
                          ? 'border-accent/40 text-accent'
                          : ''
                    }`}
                  >
                    {t.visibility === 'public' && <Icon name="publish" size={12} />}
                    {t.visibility === 'pending_review' && <Icon name="schedule" size={12} />}
                    {t.visibility === 'private' && <Icon name="private" size={12} />}
                    {t.visibility.replace('_', ' ')}
                  </span>
                </div>
              </BlurFade>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
