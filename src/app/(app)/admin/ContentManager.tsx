'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icons';
import { Notice } from '@/components/Notice';
import { MergeTopics, type TopicOption } from '@/components/content/MergeTopics';

type Topic = TopicOption & { description: string | null; visibility: string; ownerId: string | null; subjectId: string; subjectName: string | null };
type Lesson = { id: string; title: string; detailedMd: string; summaryMd: string | null; specRefs: string | null };
type Answer = { id: string; text: string; isPrimary: boolean; keywords: { required: boolean; phrase: string; synonyms?: string[] }[] | null; minPoints: number | null };
type Card = {
  id: string; kind: 'cloze' | 'flashcard' | 'mcq'; lessonId: string | null;
  textWithBlank: string | null; prompt: string | null; question: string | null;
  options: { id: string; text: string }[] | null; correctOptionId?: string | null;
  explanationMd: string | null; answers: Answer[];
};
type TopicTree = { topic: Topic; mayEdit: boolean; lessons: Lesson[]; cards: Card[] };

const VISIBILITY_GLYPH: Record<string, 'publish' | 'schedule' | 'private'> = {
  public: 'publish',
  pending_review: 'schedule',
  private: 'private',
};

/**
 * Content manager — every topic, its tree, and the two operations that decide
 * whether anyone can actually study it.
 *
 * It browses by *tree*, not by list of titles: a row states how many questions
 * and note sets it holds, because "public topic, zero cards" is the failure this
 * screen exists to make visible. Publishing here cascades to the lessons and
 * cards, so a topic marked public is one a student can answer questions in.
 */
export function ContentManager() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [open, setOpen] = useState<TopicTree | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [query, setQuery] = useState('');

  const load = useCallback(
    () => api.get<{ topics: Topic[] }>('/api/v1/content?mine=1').then((r) => setTopics(r.topics)).catch((e) => setErr(e.message)),
    [],
  );
  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    setErr('');
    setNote('');
    try {
      await fn();
      if (msg) setNote(msg);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const openTopic = (id: string) => run(async () => setOpen(await api.get<TopicTree>(`/api/v1/content?topicId=${id}`)), '');

  const setVisibility = (topicId: string, visibility: 'public' | 'private') =>
    run(async () => {
      const res = await api.patch<{ cards: number; lessons: number }>('/api/v1/content', { topicId, visibility });
      await load();
      if (open?.topic.id === topicId) await openTopic(topicId);
      setNote(visibility === 'public' ? `Published — ${res.cards} questions went with it.` : 'Withdrawn.');
    }, '');

  /* ── topic ── */
  const saveTopic = () =>
    run(() => api.patch('/api/v1/content', { topicId: open!.topic.id, name: open!.topic.name, description: open!.topic.description ?? '' }), 'Topic saved.');

  const deleteTopic = () =>
    run(async () => { await api.del(`/api/v1/content?topicId=${open!.topic.id}`); setOpen(null); load(); }, 'Topic deleted.');

  /* ── lesson ── */
  const saveLesson = (l: Lesson) =>
    run(() => api.patch('/api/v1/content', { lessonId: l.id, title: l.title, detailedMd: l.detailedMd, summaryMd: l.summaryMd ?? '', specRefs: l.specRefs ?? '' }), 'Note set saved.');

  const deleteLesson = (id: string) => run(async () => { await api.del(`/api/v1/content?lessonId=${id}`); await openTopic(open!.topic.id); }, 'Note set deleted.');

  /* ── card ── */
  const saveCard = (c: Card) => {
    const body: Record<string, unknown> = { cardId: c.id, explanationMd: c.explanationMd ?? '' };
    if (c.kind === 'cloze') {
      body.textWithBlank = c.textWithBlank ?? '';
      body.answers = c.answers.map((a) => a.text);
    }
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
    return run(() => api.patch('/api/v1/content', body), 'Question saved.');
  };

  const deleteCard = (id: string) => run(async () => { await api.del(`/api/v1/content?cardId=${id}`); await openTopic(open!.topic.id); }, 'Question deleted.');

  const patchOpen = (fn: (t: TopicTree) => void) => {
    if (!open) return;
    const next = structuredClone(open);
    fn(next);
    setOpen(next);
  };

  const visible = query.trim()
    ? topics.filter((t) => `${t.name} ${t.subjectName ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()))
    : topics;

  return (
    <div className="space-y-4">
      <Notice tone="good" show={Boolean(note)}>{note}</Notice>
      <Notice tone="bad" show={Boolean(err)}>{err}</Notice>

      {!open ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input sm:max-w-xs"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by topic or subject"
              aria-label="Filter topics"
            />
            <span className="chip">
              {visible.length} of {topics.length}
            </span>
          </div>

          <div className="space-y-2">
            {visible.map((t) => (
              <div key={t.id} className="inset flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                {/* `w-full` on a phone so the meta line gets its own row instead
                    of being squeezed into a column beside two buttons. */}
                <button type="button" onClick={() => openTopic(t.id)} className="w-full min-w-0 text-left sm:w-auto sm:flex-1">
                  <span className="t-strong flex flex-wrap items-center gap-2">
                    {/* Two lines rather than one truncated one: an admin scanning
                        for a syllabus section needs the number, not “1.1.3 …”. */}
                    <span className="line-clamp-2">{t.name}</span>
                    <span className={`chip shrink-0 ${t.visibility === 'public' ? 'chip-active' : ''}`}>
                      <Icon name={VISIBILITY_GLYPH[t.visibility] ?? 'private'} size={12} />
                      {t.visibility.replace('_', ' ')}
                    </span>
                  </span>
                  <span className="t-caption mt-0.5 flex flex-wrap items-center gap-x-2 text-muted-foreground">
                    <span>{t.subjectName ?? 'No subject'}</span>
                    <span>·</span>
                    <span className={t.cardCount === 0 ? 'text-destructive' : undefined}>
                      {t.cardCount} {t.cardCount === 1 ? 'question' : 'questions'}
                    </span>
                    <span>·</span>
                    <span className={t.lessonCount === 0 ? 'text-destructive' : undefined}>
                      {t.lessonCount} note {t.lessonCount === 1 ? 'set' : 'sets'}
                    </span>
                  </span>
                </button>
                <Button variant="ghost" size="sm" onClick={() => openTopic(t.id)}>
                  <Icon name="expand" size={14} />
                  Open
                </Button>
                <Button
                  variant={t.visibility === 'public' ? 'ghost' : 'secondary'}
                  size="sm"
                  disabled={busy}
                  onClick={() => setVisibility(t.id, t.visibility === 'public' ? 'private' : 'public')}
                >
                  <Icon name={t.visibility === 'public' ? 'unpublish' : 'publish'} size={14} />
                  {t.visibility === 'public' ? 'Withdraw' : 'Publish'}
                </Button>
              </div>
            ))}
            {visible.length === 0 && <p className="t-caption text-muted-foreground">Nothing matches that filter.</p>}
          </div>

          <details className="inset px-4 py-3">
            <summary className="flex cursor-pointer items-center gap-2 text-[14px] font-semibold leading-snug">
              <Icon name="merge" size={15} />
              Merge two topics
              <Icon name="collapse" size={14} className="ml-auto text-muted-foreground" />
            </summary>
            <div className="mt-4">
              <MergeTopics topics={topics} onMerged={(m) => { setNote(m); setOpen(null); load(); }} />
            </div>
          </details>
        </>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setOpen(null); load(); }}>
              <Icon name="collapse" size={14} className="rotate-90" />
              All topics
            </Button>
            <Button
              variant={open.topic.visibility === 'public' ? 'ghost' : 'secondary'}
              size="sm"
              disabled={busy}
              onClick={() => setVisibility(open.topic.id, open.topic.visibility === 'public' ? 'private' : 'public')}
            >
              <Icon name={open.topic.visibility === 'public' ? 'unpublish' : 'publish'} size={14} />
              {open.topic.visibility === 'public' ? 'Withdraw' : 'Publish'}
            </Button>
            <Button variant="danger" size="sm" className="ml-auto" onClick={deleteTopic} disabled={busy}>
              <Icon name="remove" size={14} />
              Delete topic
            </Button>
          </div>

          <div className="card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="t-strong">Topic</h3>
              <span className="t-caption text-muted-foreground">
                {open.cards.length} questions · {open.lessons.length} note {open.lessons.length === 1 ? 'set' : 'sets'}
              </span>
            </div>
            <div>
              <label className="label" htmlFor="cm-name">Name</label>
              <input id="cm-name" className="input" value={open.topic.name} onChange={(e) => patchOpen((t) => { t.topic.name = e.target.value; })} />
            </div>
            <div>
              <label className="label" htmlFor="cm-desc">Description</label>
              <textarea id="cm-desc" className="input" rows={2} value={open.topic.description ?? ''} onChange={(e) => patchOpen((t) => { t.topic.description = e.target.value; })} />
            </div>
            <Button size="sm" onClick={saveTopic} disabled={busy}>Save topic</Button>
          </div>

          {open.lessons.map((l, i) => (
            <div key={l.id} className="card space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="t-strong">Note set {i + 1}</h3>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => saveLesson(l)} disabled={busy}>Save</Button>
                  <Button size="sm" variant="danger" onClick={() => deleteLesson(l.id)} disabled={busy}>Delete</Button>
                </div>
              </div>
              <div>
                <label className="label" htmlFor={`l-title-${l.id}`}>Title</label>
                <input id={`l-title-${l.id}`} className="input" value={l.title} onChange={(e) => patchOpen((t) => { t.lessons[i].title = e.target.value; })} />
              </div>
              <div>
                <label className="label" htmlFor={`l-detail-${l.id}`}>Detailed notes</label>
                <textarea id={`l-detail-${l.id}`} className="input t-fine min-h-[120px] font-mono" rows={6} value={l.detailedMd} onChange={(e) => patchOpen((t) => { t.lessons[i].detailedMd = e.target.value; })} />
              </div>
              <div>
                <label className="label" htmlFor={`l-sum-${l.id}`}>Summary notes</label>
                <textarea id={`l-sum-${l.id}`} className="input t-fine min-h-[72px] font-mono" rows={3} value={l.summaryMd ?? ''} onChange={(e) => patchOpen((t) => { t.lessons[i].summaryMd = e.target.value; })} />
              </div>
              <div>
                <label className="label" htmlFor={`l-spec-${l.id}`}>Spec references</label>
                <input id={`l-spec-${l.id}`} className="input" value={l.specRefs ?? ''} onChange={(e) => patchOpen((t) => { t.lessons[i].specRefs = e.target.value; })} />
              </div>
            </div>
          ))}

          {open.cards.map((c, ci) => (
            <div key={c.id} className="card space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="t-strong capitalize">{c.kind} question</h3>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => saveCard(c)} disabled={busy}>Save</Button>
                  <Button size="sm" variant="danger" onClick={() => deleteCard(c.id)} disabled={busy}>Delete</Button>
                </div>
              </div>

              {c.kind === 'cloze' && (
                <>
                  <div>
                    <label className="label" htmlFor={`c-text-${c.id}`}>Sentence — ____ marks the blank</label>
                    <input id={`c-text-${c.id}`} className="input" value={c.textWithBlank ?? ''} onChange={(e) => patchOpen((t) => { t.cards[ci].textWithBlank = e.target.value; })} />
                  </div>
                  <div>
                    <label className="label" htmlFor={`c-ans-${c.id}`}>Accepted answers — one per line</label>
                    <textarea
                      id={`c-ans-${c.id}`}
                      className="input"
                      rows={2}
                      value={c.answers.map((a) => a.text).join('\n')}
                      onChange={(e) =>
                        patchOpen((t) => {
                          t.cards[ci].answers = e.target.value
                            .split('\n')
                            .filter(Boolean)
                            .map((text, i) => ({ id: `tmp-${i}`, text, isPrimary: i === 0, keywords: null, minPoints: null }));
                        })
                      }
                    />
                  </div>
                </>
              )}

              {c.kind === 'flashcard' && (
                <>
                  <div>
                    <label className="label" htmlFor={`c-prompt-${c.id}`}>Prompt</label>
                    <textarea id={`c-prompt-${c.id}`} className="input" rows={2} value={c.prompt ?? ''} onChange={(e) => patchOpen((t) => { t.cards[ci].prompt = e.target.value; })} />
                  </div>
                  <div>
                    <label className="label" htmlFor={`c-model-${c.id}`}>Model answer</label>
                    <textarea
                      id={`c-model-${c.id}`}
                      className="input"
                      rows={2}
                      value={c.answers[0]?.text ?? ''}
                      onChange={(e) =>
                        patchOpen((t) => {
                          const cur = t.cards[ci].answers[0];
                          t.cards[ci].answers = [{ id: cur?.id ?? 'tmp', text: e.target.value, isPrimary: true, keywords: cur?.keywords ?? null, minPoints: cur?.minPoints ?? null }];
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor={`c-kw-${c.id}`}>Key points — one per line, * to require</label>
                    <textarea
                      id={`c-kw-${c.id}`}
                      className="input"
                      rows={3}
                      value={(c.answers[0]?.keywords ?? []).map((k) => `${k.required ? '*' : ''}${k.phrase}`).join('\n')}
                      onChange={(e) =>
                        patchOpen((t) => {
                          const keywords = e.target.value
                            .split('\n')
                            .filter(Boolean)
                            .map((line) => ({ required: line.startsWith('*'), phrase: line.replace(/^\*/, '').trim() }));
                          const cur = t.cards[ci].answers[0];
                          t.cards[ci].answers = [{ id: cur?.id ?? 'tmp', text: cur?.text ?? '', isPrimary: true, keywords, minPoints: cur?.minPoints ?? null }];
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor={`c-min-${c.id}`}>Key points needed — 0 means keyword mode</label>
                    <input
                      id={`c-min-${c.id}`}
                      type="number"
                      min={0}
                      className="input max-w-[110px]"
                      value={c.answers[0]?.minPoints ?? 0}
                      onChange={(e) =>
                        patchOpen((t) => {
                          const cur = t.cards[ci].answers[0];
                          t.cards[ci].answers = [{ id: cur?.id ?? 'tmp', text: cur?.text ?? '', isPrimary: true, keywords: cur?.keywords ?? null, minPoints: Number(e.target.value) || 0 }];
                        })
                      }
                    />
                  </div>
                </>
              )}

              {c.kind === 'mcq' && (
                <>
                  <div>
                    <label className="label" htmlFor={`c-q-${c.id}`}>Question</label>
                    <textarea id={`c-q-${c.id}`} className="input" rows={2} value={c.question ?? ''} onChange={(e) => patchOpen((t) => { t.cards[ci].question = e.target.value; })} />
                  </div>
                  <div className="space-y-2">
                    <span className="label">Options — tick the correct one</span>
                    {(c.options ?? []).map((o, oi) => (
                      <div key={o.id} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`correct-${c.id}`}
                          checked={c.correctOptionId === o.id}
                          onChange={() => patchOpen((t) => { t.cards[ci].correctOptionId = o.id; })}
                          aria-label={`Option ${oi + 1} is correct`}
                          className="accent-[rgb(var(--foreground))]"
                        />
                        <input className="input" value={o.text} onChange={(e) => patchOpen((t) => { t.cards[ci].options![oi].text = e.target.value; })} />
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div>
                <label className="label" htmlFor={`c-exp-${c.id}`}>Shown after answering</label>
                <input id={`c-exp-${c.id}`} className="input" value={c.explanationMd ?? ''} onChange={(e) => patchOpen((t) => { t.cards[ci].explanationMd = e.target.value; })} />
              </div>
            </div>
          ))}

          {open.cards.length === 0 && (
            <Notice tone="note" show>
              This topic has no questions yet. Import a deck into it from My content, or merge another topic in.
            </Notice>
          )}
        </div>
      )}
    </div>
  );
}
