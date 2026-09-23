'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '@/lib/api';

type CramTopic = { id: string; name: string; visibility: string; subjectId: string; cardCount: number };
type Note = { topicId: string; title: string; contentMd: string; specRefs: string };
type QueueCard = {
  id: string; kind: 'cloze' | 'flashcard' | 'mcq'; topicName: string; subjectName: string;
  textWithBlank: string | null; prompt: string | null; question: string | null;
  options: { id: string; text: string }[] | null;
};
type ReviewResult = {
  verdict: { correct: boolean; feedbackKind: string; note?: string; matchedPhrases?: string[]; missedPhrases?: string[] };
  primaryAnswer?: string; modelAnswer?: string; explanation?: string;
  xpAwarded: number;
  newAchievements: { id: string; name: string; icon: string }[];
};

export default function CramPage() {
  const [topics, setTopics] = useState<CramTopic[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [density, setDensity] = useState<'detailed' | 'summary'>('detailed');
  const [maxPerTopic, setMaxPerTopic] = useState(10);
  const [session, setSession] = useState<{ sessionId: string; noteDensityLabel: string; notes: Note[]; queue: QueueCard[] } | null>(null);

  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const startRef = useRef(Date.now());

  useEffect(() => {
    api.get<{ topics: CramTopic[] }>('/api/v1/cram').then((d) => setTopics(d.topics)).catch(() => setTopics([]));
  }, []);

  const start = async () => {
    if (picked.size === 0) return;
    const d = await api.post<{ sessionId: string; noteDensity: string; notes: Note[]; queue: QueueCard[] }>('/api/v1/cram', {
      topicIds: [...picked], maxPerTopic, noteDensity: density,
    });
    setSession({ ...d, noteDensityLabel: d.noteDensity });
    setIdx(0);
    setScore({ correct: 0, total: 0 });
    startRef.current = Date.now();
  };

  const card = session?.queue[idx] ?? null;

  const submit = useCallback(async () => {
    if (!card || busy || result) return;
    setBusy(true);
    try {
      const body = card.kind === 'mcq' ? { cardId: card.id, selectedOptionId: selected ?? '' } : { cardId: card.id, answer: input };
      const res = await api.post<ReviewResult>('/api/v1/reviews', { ...body, durationMs: Date.now() - startRef.current, mode: 'cram', sessionId: session?.sessionId });
      setResult(res);
      setScore((s) => ({ correct: s.correct + (res.verdict.correct ? 1 : 0), total: s.total + 1 }));
    } finally {
      setBusy(false);
    }
  }, [card, busy, result, selected, input, session]);

  const next = () => {
    setResult(null);
    setInput('');
    setSelected(null);
    startRef.current = Date.now();
    setIdx((i) => i + 1);
  };

  if (!topics) return <div className="animate-pulse text-muted">Loading…</div>;

  // ── session runner ──────────────────────────────────────────────────────────
  if (session) {
    if (!card) {
      return (
        <div className="card mx-auto max-w-md text-center">
          <div className="text-4xl">⚡</div>
          <h1 className="mt-3 text-xl font-bold">Cram complete</h1>
          <p className="mt-1 text-sm text-muted">{score.correct}/{score.total} correct — cram reviews don&apos;t affect your SRS schedule.</p>
          <button onClick={() => { setSession(null); setPicked(new Set()); }} className="btn-primary mt-4">Cram something else</button>
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <div className="flex items-center justify-between text-sm text-muted">
          <span>{idx + 1} / {session.queue.length}</span>
          <span className="chip">{score.correct}/{score.total} correct</span>
        </div>
        {session.notes.length > 0 && (
          <details className="rounded-2xl border border-edge bg-panel px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">📖 Review notes ({session.noteDensityLabel})</summary>
            <div className="mt-2 space-y-2">
              {session.notes.map((n: Note) => (
                <details key={n.topicId + n.title} className="rounded-xl bg-edge/30 px-3 py-2">
                  <summary className="cursor-pointer text-sm font-medium">{n.title}</summary>
                  <pre className="mt-2 whitespace-pre-wrap text-sm text-muted">{n.contentMd}</pre>
                </details>
              ))}
            </div>
          </details>
        )}
        <AnimatePresence mode="wait">
          <motion.div key={card.id + String(!!result)} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.15 }}>
            <div className="card">
              <div className="flex items-center justify-between text-xs text-muted">
                <span className="chip">{card.kind === 'cloze' ? 'Fill the blank' : card.kind === 'flashcard' ? 'Flashcard' : 'Multiple choice'}</span>
                <span>{card.topicName}</span>
              </div>
              <div className="mt-4 text-lg font-medium leading-relaxed">
                {card.kind === 'cloze' && (card.textWithBlank ?? '').replace('____', '______')}
                {card.kind === 'flashcard' && card.prompt}
                {card.kind === 'mcq' && card.question}
              </div>

              {!result && card.kind === 'mcq' && (
                <div className="mt-5 space-y-2">
                  {card.options?.map((o) => (
                    <button key={o.id} onClick={() => setSelected(o.id)}
                      className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all ${selected === o.id ? 'border-accent bg-accent/10 text-accent' : 'border-edge hover:bg-edge/30'}`}>
                      {o.text}
                    </button>
                  ))}
                  <button className="btn-primary mt-2 w-full" disabled={!selected || busy} onClick={submit}>Check answer</button>
                </div>
              )}

              {!result && card.kind !== 'mcq' && (
                <form className="mt-5" onSubmit={(e) => { e.preventDefault(); submit(); }}>
                  <textarea className="input min-h-[80px]" placeholder="Your answer…" value={input} onChange={(e) => setInput(e.target.value)} autoFocus />
                  <button type="submit" className="btn-primary mt-3 w-full" disabled={!input.trim() || busy}>Check answer</button>
                </form>
              )}

              {result && (
                <div className={`mt-5 rounded-xl px-4 py-3 text-sm ${result.verdict.correct ? 'bg-good/10 text-good' : 'bg-bad/10 text-bad'}`}>
                  <div className="font-semibold">{result.verdict.correct ? 'Correct' : 'Not quite'}{result.xpAwarded ? ` · +${result.xpAwarded} XP` : ''}</div>
                  {result.verdict.note && <p className="mt-1">{result.verdict.note}</p>}
                  {result.modelAnswer && <p className="mt-2 rounded-lg bg-panel/70 px-3 py-2">Model: {result.modelAnswer}</p>}
                  <button onClick={next} className="btn-primary mt-4 w-full">Next →</button>
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  // ── picker ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Cram</h1>
        <p className="text-sm text-muted">Exam tomorrow? Pick topics, skim notes, drill questions. Your schedule stays untouched.</p>
      </header>

      <div className="card space-y-4">
        <div>
          <span className="label">Topics</span>
          <div className="flex flex-wrap gap-2">
            {topics.filter((t) => t.cardCount > 0).map((t) => (
              <button key={t.id}
                onClick={() => setPicked((p) => { const n = new Set(p); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })}
                className={`chip !px-3 !py-1.5 transition-colors ${picked.has(t.id) ? '!border-accent !bg-accent/10 !text-accent' : ''}`}>
                {t.name} ({t.cardCount})
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className="label">Notes to show</span>
            <div className="flex gap-2 text-sm">
              {(['detailed', 'summary'] as const).map((d) => (
                <button key={d} onClick={() => setDensity(d)}
                  className={`flex-1 rounded-xl border px-3 py-2 font-medium capitalize ${density === d ? 'border-accent bg-accent/10 text-accent' : 'border-edge'}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="label">Max questions per topic: {maxPerTopic}</span>
            <input type="range" min={5} max={30} step={5} value={maxPerTopic} onChange={(e) => setMaxPerTopic(Number(e.target.value))} className="w-full accent-[var(--c-accent)]" />
          </div>
        </div>

        <button className="btn-primary w-full" disabled={picked.size === 0} onClick={start}>
          Start cram session
        </button>
      </div>
    </div>
  );
}
