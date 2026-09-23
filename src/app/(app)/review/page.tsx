'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '@/lib/api';
import Link from 'next/link';

type QueueCard = {
  id: string;
  kind: 'cloze' | 'flashcard' | 'mcq';
  topicName: string;
  subjectName: string;
  textWithBlank: string | null;
  prompt: string | null;
  question: string | null;
  options: { id: string; text: string }[] | null;
  stage: string;
};

type Verdict = {
  correct: boolean;
  feedbackKind: string;
  note?: string;
  matchedPhrases?: string[];
  missedPhrases?: string[];
};

type ReviewResult = {
  verdict: Verdict;
  primaryAnswer?: string;
  modelAnswer?: string;
  explanation?: string;
  xpAwarded: number;
  totalXp: number;
  level: number;
  streak: number;
  newAchievements: { id: string; name: string; icon: string; description: string }[];
};

const KIND_LABEL: Record<QueueCard['kind'], string> = {
  cloze: 'Fill the blank',
  flashcard: 'Flashcard',
  mcq: 'Multiple choice',
};

export default function ReviewPage() {
  const [queue, setQueue] = useState<QueueCard[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sessionXp, setSessionXp] = useState(0);
  const [done, setDone] = useState(0);
  const startRef = useRef<number>(Date.now());

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ queue: QueueCard[] }>('/api/v1/queue/today?limit=20');
      setQueue(data.queue);
      setIdx(0);
      setSessionXp(0);
      setDone(0);
      startRef.current = Date.now();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load queue.');
      setQueue([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const card = queue?.[idx] ?? null;
  const progress = useMemo(() => (queue && queue.length > 0 ? Math.round((done / queue.length) * 100) : 0), [done, queue]);

  const submit = useCallback(async () => {
    if (!card || busy || result) return;
    setBusy(true);
    setError('');
    try {
      const body =
        card.kind === 'mcq'
          ? { cardId: card.id, selectedOptionId: selected ?? '' }
          : { cardId: card.id, answer: input };
      const res = await api.post<ReviewResult>('/api/v1/reviews', { ...body, durationMs: Date.now() - startRef.current, mode: 'daily' });
      setResult(res);
      setSessionXp((x) => x + res.xpAwarded);
      setDone((d) => d + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed.');
    } finally {
      setBusy(false);
    }
  }, [card, busy, result, selected, input]);

  const next = useCallback(() => {
    setResult(null);
    setInput('');
    setSelected(null);
    startRef.current = Date.now();
    setIdx((i) => i + 1);
  }, []);

  if (queue === null) return <div className="animate-pulse text-muted">Loading queue…</div>;

  if (queue.length === 0) {
    return (
      <div className="card mx-auto max-w-md text-center">
        <div className="text-4xl">🎉</div>
        <h1 className="mt-3 text-xl font-bold">Nothing due right now</h1>
        <p className="mt-1 text-sm text-muted">Your schedule is clear. Cram a topic or learn something new — or come back tomorrow.</p>
        <div className="mt-4 flex justify-center gap-2">
          <Link href="/cram" className="btn-ghost">Cram</Link>
          <Link href="/learn" className="btn-primary">Learn</Link>
        </div>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="card mx-auto max-w-md text-center">
        <div className="text-4xl">🏁</div>
        <h1 className="mt-3 text-xl font-bold">Session complete</h1>
        <p className="mt-1 text-sm text-muted">+{sessionXp} XP earned. Streak secured.</p>
        <div className="mt-4 flex justify-center gap-2">
          <button onClick={load} className="btn-ghost">Load more</button>
          <Link href="/dashboard" className="btn-primary">Dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 flex items-center justify-between text-sm text-muted">
        <span>{done} / {queue.length}</span>
        <span className="chip">⚡ {sessionXp} XP this session</span>
      </div>
      <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-edge">
        <motion.div className="h-full bg-accent" animate={{ width: `${progress}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={card.id + String(result ? 'r' : 'q')}
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }}
          transition={{ duration: 0.18 }}>
          <div className="card">
            <div className="flex items-center justify-between text-xs text-muted">
              <span className="chip">{KIND_LABEL[card.kind]}</span>
              <span>{card.subjectName} · {card.topicName}</span>
            </div>

            <div className="mt-4 text-lg font-medium leading-relaxed">
              {card.kind === 'cloze' && <ClozePrompt text={card.textWithBlank ?? ''} answer={(result && card.kind === 'cloze' ? result.primaryAnswer : null) ?? null} />}
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
                <p className="text-center text-xs text-muted">One attempt only.</p>
              </div>
            )}

            {!result && card.kind !== 'mcq' && (
              <form className="mt-5" onSubmit={(e) => { e.preventDefault(); submit(); }}>
                {card.kind === 'cloze' ? (
                  <input
                    type="text"
                    className="input h-12 text-base"
                    placeholder="Type the missing word…"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    autoFocus
                    enterKeyHint="done"
                  />
                ) : (
                  <textarea
                    className="input min-h-[90px]"
                    placeholder="Write your answer…"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    autoFocus
                  />
                )}
                <button type="submit" className="btn-primary mt-3 w-full" disabled={!input.trim() || busy}>Check answer</button>
                {card.kind === 'cloze' && <p className="mt-1.5 text-center text-xs text-muted">Press Enter to check ↵</p>}
              </form>
            )}

            {result && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-5 overflow-hidden">
                <VerdictPanel result={result} kind={card.kind} />
                <button onClick={next} className="btn-primary mt-4 w-full">Next card →</button>
              </motion.div>
            )}

            {error && <p className="mt-3 rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function ClozePrompt({ text, answer }: { text: string; answer: string | null }) {
  const [before, after] = text.split('____');
  return (
    <span>
      {before}
      <span className={`mx-1 inline-block min-w-[6rem] border-b-2 px-2 text-center font-semibold ${answer === null ? 'border-accent text-accent' : answer ? 'border-good text-good' : 'border-bad text-bad'}`}>
        {answer ?? '\u00A0'.repeat(8)}
      </span>
      {after}
    </span>
  );
}

function VerdictPanel({ result, kind }: { result: ReviewResult; kind: QueueCard['kind'] }) {
  const { verdict } = result;
  const good = verdict.correct;
  const tone = good ? (verdict.feedbackKind === 'correct' ? 'bg-good/10 text-good' : 'bg-good/10 text-good') : 'bg-bad/10 text-bad';
  return (
    <div className={`rounded-xl px-4 py-3 text-sm ${tone}`}>
      <div className="font-semibold">
        {!good && 'Incorrect'}
        {good && verdict.feedbackKind === 'correct' && 'Correct'}
        {good && verdict.feedbackKind !== 'correct' && 'Correct — with a nudge'}
        {result.xpAwarded > 0 && <span className="ml-2 font-normal opacity-80">+{result.xpAwarded} XP</span>}
      </div>
      {verdict.note && <p className="mt-1">{verdict.note}</p>}
      {kind === 'flashcard' && result.modelAnswer && (
        <div className="mt-2 rounded-lg bg-panel/70 px-3 py-2">
          <span className="text-xs font-semibold uppercase text-muted">Model answer</span>
          <p className="mt-0.5">{result.modelAnswer}</p>
        </div>
      )}
      {verdict.matchedPhrases && verdict.matchedPhrases.length > 0 && (
        <p className="mt-2 text-xs">Covered: {verdict.matchedPhrases.join(', ')}</p>
      )}
      {verdict.missedPhrases && verdict.missedPhrases.length > 0 && (
        <p className="mt-1 text-xs">Missed: {verdict.missedPhrases.join(', ')}</p>
      )}
      {result.explanation && (
        <div className="mt-2 rounded-lg bg-panel/70 px-3 py-2">
          <span className="text-xs font-semibold uppercase text-muted">Why</span>
          <p className="mt-0.5">{result.explanation}</p>
        </div>
      )}
      {result.newAchievements.map((a) => (
        <motion.div key={a.id} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mt-2 rounded-lg bg-accent/10 px-3 py-2 text-accent">
          {a.icon} Achievement unlocked: <strong>{a.name}</strong>
        </motion.div>
      ))}
    </div>
  );
}
