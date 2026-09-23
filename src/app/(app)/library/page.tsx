'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Topic = { id: string; name: string; visibility: string; subjectId: string };
type Subject = { id: string; name: string };
type CardDraft = { kind: 'cloze' | 'flashcard' | 'mcq'; textWithBlank: string; prompt: string; question: string; answers: string; options: string; correctIdx: number };

const emptyCard = (kind: CardDraft['kind']): CardDraft => ({ kind, textWithBlank: '', prompt: '', question: '', answers: '', options: '', correctIdx: 0 });

export default function LibraryPage() {
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // create form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonBody, setLessonBody] = useState('');
  const [lessonSummary, setLessonSummary] = useState('');
  const [specRefs, setSpecRefs] = useState('');
  const [cards, setCards] = useState<CardDraft[]>([]);
  const [publish, setPublish] = useState(false);

  // import state
  const [file, setFile] = useState<File | null>(null);
  const [importKind, setImportKind] = useState<'tsv' | 'csv' | 'anki_tsv'>('tsv');
  const [importTopic, setImportTopic] = useState('');
  const [importReport, setImportReport] = useState<string | null>(null);

  // class join
  const [classCode, setClassCode] = useState('');

  const load = () => api.get<{ topics: Topic[] }>('/api/v1/content?mine=1').then((d) => setTopics(d.topics)).catch(() => setTopics([]));
  useEffect(() => {
    load();
    api.get<{ subjects: Subject[] }>('/api/v1/auth/subjects-public').then((d) => setSubjects(d.subjects)).catch(() => undefined);
  }, []);

  const createTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setMessage('');
    try {
      const payload = {
        subjectId: subjectId || subjects[0]?.id,
        name, description, publish,
        lessons: lessonTitle ? [{ title: lessonTitle, detailedMd: lessonBody, summaryMd: lessonSummary, specRefs }] : [],
        cards: cards.map((c) => ({
          kind: c.kind,
          textWithBlank: c.textWithBlank || undefined,
          prompt: c.prompt || undefined,
          question: c.question || undefined,
          answers: c.kind === 'mcq' ? undefined : c.answers.split('|').map((s) => s.trim()).filter(Boolean),
          options: c.kind === 'mcq' ? c.options.split('\n').map((s) => s.trim()).filter(Boolean) : undefined,
          correctIdx: c.kind === 'mcq' ? c.correctIdx : undefined,
        })).filter((c) => c.textWithBlank || c.prompt || c.question),
      };
      await api.post('/api/v1/content', payload);
      setMessage(publish ? 'Topic submitted for developer review.' : 'Topic saved privately.');
      setName(''); setDescription(''); setLessonTitle(''); setLessonBody(''); setLessonSummary(''); setSpecRefs(''); setCards([]); setPublish(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create.');
    }
  };

  const doImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setMessage(''); setImportReport(null);
    if (!file) return;
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('kind', importKind);
      form.set('topicName', importTopic || file.name.replace(/\.[^.]+$/, ''));
      const d = await api.upload<{ created: number; failed: number; errors: { row: number; message: string }[] }>('/api/v1/import', form);
      setImportReport(`Imported ${d.created} cards${d.failed ? `, ${d.failed} rows failed` : ''}.`);
      if (d.errors.length) setImportReport((prev) => `${prev}\nFirst errors: ${d.errors.slice(0, 3).map((x) => `row ${x.row}: ${x.message}`).join('; ')}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    }
  };

  const joinClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setMessage('');
    try {
      const d = await api.post<{ class: { name: string } }>('/api/v1/classes/join', { code: classCode });
      setMessage(`Joined class “${d.class.name}”.`);
      setClassCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join.');
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">My content</h1>
        <p className="text-sm text-muted">Create topics, import decks (Anki/CSV/TSV), join classes. Everything is stored server-side in your private area.</p>
      </header>

      {message && <p className="rounded-xl bg-good/10 px-3 py-2 text-sm text-good">{message}</p>}
      {error && <p className="rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}

      <section className="card">
        <h2 className="font-semibold">Create a topic</h2>
        <form onSubmit={createTopic} className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Topic name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Photosynthesis" />
            </div>
            <div>
              <label className="label">Subject</label>
              <select className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Description</label>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this topic covers" />
          </div>
          <details className="rounded-xl border border-edge px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">Add notes (lesson)</summary>
            <div className="mt-3 space-y-3">
              <input className="input" value={lessonTitle} onChange={(e) => setLessonTitle(e.target.value)} placeholder="Lesson title" />
              <textarea className="input min-h-[110px]" value={lessonBody} onChange={(e) => setLessonBody(e.target.value)} placeholder={'Detailed notes (markdown-ish):\n## Heading\n- bullet **bold**'} />
              <textarea className="input min-h-[60px]" value={lessonSummary} onChange={(e) => setLessonSummary(e.target.value)} placeholder="Summary notes (shown in cram/summary view)" />
              <input className="input" value={specRefs} onChange={(e) => setSpecRefs(e.target.value)} placeholder="Spec refs e.g. 4.1.1.1; 4.1.1.2" />
            </div>
          </details>
          <details className="rounded-xl border border-edge px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">Add cards ({cards.length})</summary>
            <div className="mt-3 space-y-3">
              {cards.map((c, i) => (
                <div key={i} className="rounded-xl bg-edge/30 p-3">
                  <div className="flex items-center justify-between">
                    <select className="input !w-36" value={c.kind} onChange={(e) => setCards((prev) => prev.map((x, j) => (j === i ? { ...emptyCard(e.target.value as CardDraft['kind']) } : x)))}>
                      <option value="cloze">Cloze</option>
                      <option value="flashcard">Flashcard</option>
                      <option value="mcq">Multiple choice</option>
                    </select>
                    <button type="button" className="text-xs text-bad" onClick={() => setCards((prev) => prev.filter((_, j) => j !== i))}>Remove</button>
                  </div>
                  {c.kind === 'cloze' && (
                    <input className="input mt-2" value={c.textWithBlank} onChange={(e) => setCards((prev) => prev.map((x, j) => (j === i ? { ...x, textWithBlank: e.target.value } : x)))}
                      placeholder="The powerhouse is the ____" />
                  )}
                  {c.kind === 'flashcard' && (
                    <input className="input mt-2" value={c.prompt} onChange={(e) => setCards((prev) => prev.map((x, j) => (j === i ? { ...x, prompt: e.target.value } : x)))}
                      placeholder="Question prompt" />
                  )}
                  {c.kind === 'mcq' && (
                    <>
                      <input className="input mt-2" value={c.question} onChange={(e) => setCards((prev) => prev.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))}
                        placeholder="Question" />
                      <textarea className="input mt-2" value={c.options} onChange={(e) => setCards((prev) => prev.map((x, j) => (j === i ? { ...x, options: e.target.value } : x)))}
                        placeholder={'One option per line'} />
                      <input type="number" min={0} className="input mt-2 !w-28" value={c.correctIdx} onChange={(e) => setCards((prev) => prev.map((x, j) => (j === i ? { ...x, correctIdx: Number(e.target.value) } : x)))} />
                    </>
                  )}
                  {c.kind !== 'mcq' && (
                    <input className="input mt-2" value={c.answers} onChange={(e) => setCards((prev) => prev.map((x, j) => (j === i ? { ...x, answers: e.target.value } : x)))}
                      placeholder={c.kind === 'cloze' ? 'Accepted answers separated by |' : 'Model answer (use | for alternatives)'} />
                  )}
                </div>
              ))}
              <button type="button" className="btn-ghost text-xs" onClick={() => setCards((prev) => [...prev, emptyCard('cloze')])}>+ Add card</button>
            </div>
          </details>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
            Submit for public publishing (developer review required)
          </label>
          <button type="submit" className="btn-primary">Create topic</button>
        </form>
      </section>

      <section className="card">
        <h2 className="font-semibold">Import deck</h2>
        <p className="mt-1 text-xs text-muted">
          Anki TSV exports, CSV or TSV (<code>front,back</code> rows). Also understands <code>cloze: Stem with ____ | answer</code> lines.
        </p>
        <form onSubmit={doImport} className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">File</label>
              <input type="file" accept=".csv,.tsv,.txt,.apkg-tsv" className="input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
            </div>
            <div>
              <label className="label">Format</label>
              <select className="input" value={importKind} onChange={(e) => setImportKind(e.target.value as typeof importKind)}>
                <option value="tsv">TSV / Anki export</option>
                <option value="csv">CSV</option>
                <option value="anki_tsv">Anki TSV</option>
              </select>
            </div>
          </div>
          <input className="input" value={importTopic} onChange={(e) => setImportTopic(e.target.value)} placeholder="Topic name for imported cards" />
          <button type="submit" className="btn-primary" disabled={!file}>Import</button>
          {importReport && <pre className="whitespace-pre-wrap rounded-xl bg-edge/40 px-3 py-2 text-xs">{importReport}</pre>}
        </form>
      </section>

      <section className="card">
        <h2 className="font-semibold">Join a class</h2>
        <form onSubmit={joinClass} className="mt-3 flex gap-2">
          <input className="input uppercase tracking-widest" value={classCode} onChange={(e) => setClassCode(e.target.value.toUpperCase())} maxLength={6} placeholder="ABC123" required />
          <button type="submit" className="btn-primary shrink-0">Join</button>
        </form>
      </section>

      <section className="card">
        <h2 className="font-semibold">My topics</h2>
        {!topics && <p className="mt-2 text-sm text-muted">Loading…</p>}
        {topics?.length === 0 && <p className="mt-2 text-sm text-muted">Nothing yet — create or import above.</p>}
        <div className="mt-3 space-y-2">
          {topics?.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-xl border border-edge px-4 py-2.5 text-sm">
              <span className="font-medium">{t.name}</span>
              <span className={`chip ${t.visibility === 'public' ? '!text-good' : t.visibility === 'pending_review' ? '!text-accent' : ''}`}>
                {t.visibility.replace('_', ' ')}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
