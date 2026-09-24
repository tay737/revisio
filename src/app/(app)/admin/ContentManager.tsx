'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icons';

type Topic = { id: string; name: string; description: string | null; visibility: string; ownerId: string | null; subjectId: string };
type Lesson = { id: string; title: string; detailedMd: string; summaryMd: string | null; specRefs: string | null };
type Answer = { id: string; text: string; isPrimary: boolean; keywords: { required: boolean; phrase: string; synonyms?: string[] }[] | null; minPoints: number | null };
type Card = {
  id: string; kind: 'cloze' | 'flashcard' | 'mcq'; lessonId: string | null;
  textWithBlank: string | null; prompt: string | null; question: string | null;
  options: { id: string; text: string }[] | null; correctOptionId?: string | null;
  explanationMd: string | null; answers: Answer[];
};
type TopicTree = { topic: Topic; mayEdit: boolean; lessons: Lesson[]; cards: Card[] };

// Both come from globals.css so these fields match every other form in the app.
const input = 'input';
const label = 'label';

export function ContentManager() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [open, setOpen] = useState<TopicTree | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');

  const load = () => api.get<{ topics: Topic[] }>('/api/v1/content?mine=1').then((r) => setTopics(r.topics)).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true); setErr(''); setNote('');
    try { await fn(); setNote(msg); } catch (e) { setErr(e instanceof Error ? e.message : 'Failed.'); } finally { setBusy(false); }
  };

  const openTopic = (id: string) =>
    run(async () => setOpen(await api.get<TopicTree>(`/api/v1/content?topicId=${id}`)), '');

  /* ── topic ── */
  const saveTopic = () =>
    run(() => api.patch('/api/v1/content', { topicId: open!.topic.id, name: open!.topic.name, description: open!.topic.description ?? '' }), 'Topic saved.');

  const deleteTopic = () =>
    run(async () => { await api.del(`/api/v1/content?topicId=${open!.topic.id}`); setOpen(null); load(); }, 'Topic deleted.');

  /* ── lesson ── */
  const saveLesson = (l: Lesson) =>
    run(() => api.patch('/api/v1/content', { lessonId: l.id, title: l.title, detailedMd: l.detailedMd, summaryMd: l.summaryMd ?? '', specRefs: l.specRefs ?? '' }), 'Lesson saved.');

  const deleteLesson = (id: string) =>
    run(async () => { await api.del(`/api/v1/content?lessonId=${id}`); await openTopic(open!.topic.id); }, 'Lesson deleted.');

  /* ── card ── */
  const saveCard = (c: Card) => {
    const body: Record<string, unknown> = { cardId: c.id, explanationMd: c.explanationMd ?? '' };
    if (c.kind === 'cloze') { body.textWithBlank = c.textWithBlank ?? ''; body.answers = c.answers.map((a) => a.text); }
    if (c.kind === 'flashcard') {
      body.prompt = c.prompt ?? '';
      body.answers = [c.answers[0]?.text ?? ''];
      body.keywords = c.answers[0]?.keywords ?? [];
      body.minPoints = c.answers[0]?.minPoints ?? undefined;
    }
    if (c.kind === 'mcq') {
      body.question = c.question ?? '';
      body.options = (c.options ?? []).map((o) => o.text);
      const idx = (c.options ?? []).findIndex((o) => o.id === c.correctOptionId);
      body.correctIdx = idx >= 0 ? idx : 0;
    }
    return run(() => api.patch('/api/v1/content', body), 'Card saved.');
  };

  const deleteCard = (id: string) =>
    run(async () => { await api.del(`/api/v1/content?cardId=${id}`); await openTopic(open!.topic.id); }, 'Card deleted.');

  const patchOpen = (fn: (t: TopicTree) => void) => {
    if (!open) return;
    const next = structuredClone(open);
    fn(next);
    setOpen(next);
  };

  return (
    <div className="space-y-4">
      {note && <p className="t-caption rounded-[11px] bg-good/10 px-3 py-2.5 text-good">{note}</p>}
      {err && <p className="t-caption rounded-[11px] bg-bad/10 px-3 py-2.5 text-bad">{err}</p>}

      {!open ? (
        <div className="space-y-2">
          {topics.length === 0 && <p className="t-caption text-muted">No topics yet — create them in My content or Teaching.</p>}
          {topics.map((t) => (
            <motion.button
              key={t.id}
              layout
              onClick={() => openTopic(t.id)}
              className="inset flex w-full items-center justify-between px-4 py-3 text-left transition-colors duration-150 hover:border-accent/50"
            >
              <span className="flex items-center gap-2">
                <span className="t-strong">{t.name}</span>
                <span className={`chip capitalize ${t.visibility === 'public' ? 'chip-active' : ''}`}>
                  {t.visibility.replace('_', ' ')}
                </span>
              </span>
              <span className="t-caption flex items-center gap-1 text-muted">
                Edit
                <Icon name="expand" size={14} />
              </span>
            </motion.button>
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => { setOpen(null); load(); }}>
              <Icon name="collapse" size={14} className="rotate-90" />
              All topics
            </Button>
            <Button variant="danger" size="sm" onClick={deleteTopic} disabled={busy}>Delete topic</Button>
          </div>

          {/* topic fields */}
          <div className="card space-y-3">
            <h3 className="t-strong">Topic</h3>
            <div><label className={label}>Name</label>
              <input className={input} value={open.topic.name} onChange={(e) => patchOpen((t) => { t.topic.name = e.target.value; })} /></div>
            <div><label className={label}>Description</label>
              <textarea className={input} rows={2} value={open.topic.description ?? ''} onChange={(e) => patchOpen((t) => { t.topic.description = e.target.value; })} /></div>
            <Button size="sm" onClick={saveTopic} disabled={busy}>Save topic</Button>
          </div>

          {/* lessons */}
          {open.lessons.map((l, i) => (
            <div key={l.id} className="card space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="t-strong">Lesson {i + 1}</h3>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => saveLesson(l)} disabled={busy}>Save</Button>
                  <Button size="sm" variant="danger" onClick={() => deleteLesson(l.id)} disabled={busy}>Delete</Button>
                </div>
              </div>
              <div><label className={label}>Title</label>
                <input className={input} value={l.title} onChange={(e) => patchOpen((t) => { t.lessons[i].title = e.target.value; })} /></div>
              <div><label className={label}>Detailed notes (markdown)</label>
                <textarea className={`${input} t-fine min-h-[120px] font-mono`} rows={6} value={l.detailedMd} onChange={(e) => patchOpen((t) => { t.lessons[i].detailedMd = e.target.value; })} /></div>
              <div><label className={label}>Summary notes (markdown)</label>
                <textarea className={`${input} t-fine min-h-[72px] font-mono`} rows={3} value={l.summaryMd ?? ''} onChange={(e) => patchOpen((t) => { t.lessons[i].summaryMd = e.target.value; })} /></div>
              <div><label className={label}>Specification references</label>
                <input className={input} value={l.specRefs ?? ''} onChange={(e) => patchOpen((t) => { t.lessons[i].specRefs = e.target.value; })} /></div>
            </div>
          ))}

          {/* cards */}
          {open.cards.map((c, ci) => (
            <div key={c.id} className="card space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="t-strong capitalize">{c.kind} card</h3>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => saveCard(c)} disabled={busy}>Save</Button>
                  <Button size="sm" variant="danger" onClick={() => deleteCard(c.id)} disabled={busy}>Delete</Button>
                </div>
              </div>

              {c.kind === 'cloze' && (
                <>
                  <div><label className={label}>Sentence (use ____ for the blank)</label>
                    <input className={input} value={c.textWithBlank ?? ''} onChange={(e) => patchOpen((t) => { t.cards[ci].textWithBlank = e.target.value; })} /></div>
                  <div><label className={label}>Accepted answers (one per line)</label>
                    <textarea className={input} rows={2} value={c.answers.map((a) => a.text).join('\n')}
                      onChange={(e) => patchOpen((t) => { t.cards[ci].answers = e.target.value.split('\n').filter(Boolean).map((text, i) => ({ id: `tmp-${i}`, text, isPrimary: i === 0, keywords: null, minPoints: null })); })} /></div>
                </>
              )}

              {c.kind === 'flashcard' && (
                <>
                  <div><label className={label}>Prompt</label>
                    <textarea className={input} rows={2} value={c.prompt ?? ''} onChange={(e) => patchOpen((t) => { t.cards[ci].prompt = e.target.value; })} /></div>
                  <div><label className={label}>Model answer</label>
                    <textarea className={input} rows={2} value={c.answers[0]?.text ?? ''} onChange={(e) => patchOpen((t) => {
                      const cur = t.cards[ci].answers[0];
                      t.cards[ci].answers = [{ id: cur?.id ?? 'tmp', text: e.target.value, isPrimary: true, keywords: cur?.keywords ?? null, minPoints: cur?.minPoints ?? null }];
                    })} /></div>
                  <div><label className={label}>Keywords — one per line, prefix * for required</label>
                    <textarea className={input} rows={3} value={(c.answers[0]?.keywords ?? []).map((k) => `${k.required ? '*' : ''}${k.phrase}`).join('\n')}
                      onChange={(e) => patchOpen((t) => {
                        const kws = e.target.value.split('\n').filter(Boolean).map((line) => ({
                          required: line.startsWith('*'),
                          phrase: line.replace(/^\*/, '').trim(),
                        }));
                        const cur = t.cards[ci].answers[0];
                        t.cards[ci].answers = [{ id: cur?.id ?? 'tmp', text: cur?.text ?? '', isPrimary: true, keywords: kws, minPoints: cur?.minPoints ?? null }];
                      })} /></div>
                  <div><label className={label}>Minimum key points (0 = keyword mode)</label>
                    <input type="number" min={0} className={input} value={c.answers[0]?.minPoints ?? 0}
                      onChange={(e) => patchOpen((t) => {
                        const cur = t.cards[ci].answers[0];
                        t.cards[ci].answers = [{ id: cur?.id ?? 'tmp', text: cur?.text ?? '', isPrimary: true, keywords: cur?.keywords ?? null, minPoints: Number(e.target.value) || 0 }];
                      })} /></div>
                </>
              )}

              {c.kind === 'mcq' && (
                <>
                  <div><label className={label}>Question</label>
                    <textarea className={input} rows={2} value={c.question ?? ''} onChange={(e) => patchOpen((t) => { t.cards[ci].question = e.target.value; })} /></div>
                  <div className="space-y-2">
                    <label className={label}>Options — tick the correct one</label>
                    {(c.options ?? []).map((o, oi) => (
                      <div key={o.id} className="flex items-center gap-2">
                        <input type="radio" name={`correct-${c.id}`} checked={c.correctOptionId === o.id}
                          onChange={() => patchOpen((t) => { t.cards[ci].correctOptionId = o.id; })} className="accent-accent" />
                        <input className={input} value={o.text}
                          onChange={(e) => patchOpen((t) => { t.cards[ci].options![oi].text = e.target.value; })} />
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div><label className={label}>Explanation shown after answering</label>
                <input className={input} value={c.explanationMd ?? ''} onChange={(e) => patchOpen((t) => { t.cards[ci].explanationMd = e.target.value; })} /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
