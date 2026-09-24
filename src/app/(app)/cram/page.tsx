'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Icon } from '@/components/ui/icons';
import { PageHeader } from '@/components/PageHeader';
import { Notice } from '@/components/Notice';
import { NumberTicker } from '@/components/ui/motion/number-ticker';
import { SPRING, transition } from '@/lib/motion';
import { sessionSummary } from '@/lib/profile';
import PageSkeleton from '@/components/PageSkeleton';

type CramTopic = { id: string; name: string; visibility: string; subjectId: string; cardCount: number };
type Note = { topicId: string; title: string; contentMd: string; specRefs: string };
type QueueCard = {
  id: string;
  kind: 'cloze' | 'flashcard' | 'mcq';
  topicName: string;
  subjectName: string;
  textWithBlank: string | null;
  prompt: string | null;
  question: string | null;
  options: { id: string; text: string }[] | null;
};
type ReviewResult = {
  verdict: { correct: boolean; feedbackKind: string; note?: string; matchedPhrases?: string[]; missedPhrases?: string[] };
  primaryAnswer?: string;
  modelAnswer?: string;
  explanation?: string;
  xpAwarded: number;
  newAchievements: { id: string; name: string; icon: string }[];
};

const KIND_LABEL: Record<QueueCard['kind'], string> = {
  cloze: 'Fill the blank',
  flashcard: 'Flashcard',
  mcq: 'Multiple choice',
};

/**
 * Cram — deliberate practice with the schedule left alone.
 *
 * The picker states the bargain plainly (notes shown, questions capped, nothing
 * rescheduled), because that distinction between cram and review is the whole
 * reason the mode exists and it was previously buried in a subtitle.
 *
 * Notes open as a disclosure above the questions so you can read the summary
 * and drill in the same screen without losing your place.
 */
export default function CramPage() {
  const [topics, setTopics] = useState<CramTopic[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [density, setDensity] = useState<'detailed' | 'summary'>('summary');
  const [maxPerTopic, setMaxPerTopic] = useState(10);
  const [session, setSession] = useState<{ sessionId: string; noteDensityLabel: string; notes: Note[]; queue: QueueCard[] } | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const startRef = useRef(Date.now());

  useEffect(() => {
    api
      .get<{ topics: CramTopic[] }>('/api/v1/cram')
      .then((d) => setTopics(d.topics))
      .catch(() => setTopics([]));
  }, []);

  const start = async () => {
    if (picked.size === 0) return;
    setStarting(true);
    setError('');
    try {
      const d = await api.post<{ sessionId: string; noteDensity: string; notes: Note[]; queue: QueueCard[] }>(
        '/api/v1/cram',
        { topicIds: [...picked], maxPerTopic, noteDensity: density },
      );
      setSession({ ...d, noteDensityLabel: d.noteDensity });
      setIdx(0);
      setScore({ correct: 0, total: 0 });
      setResult(null);
      setInput('');
      setSelected(null);
      startRef.current = Date.now();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not start that session.');
    } finally {
      setStarting(false);
    }
  };

  const card = session?.queue[idx] ?? null;

  const submit = useCallback(async () => {
    if (!card || busy || result) return;
    setBusy(true);
    setError('');
    try {
      const body =
        card.kind === 'mcq' ? { cardId: card.id, selectedOptionId: selected ?? '' } : { cardId: card.id, answer: input };
      const res = await api.post<ReviewResult>('/api/v1/reviews', {
        ...body,
        durationMs: Date.now() - startRef.current,
        mode: 'cram',
        sessionId: session?.sessionId,
      });
      setResult(res);
      setScore((s) => ({ correct: s.correct + (res.verdict.correct ? 1 : 0), total: s.total + 1 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That answer did not reach the server.');
    } finally {
      setBusy(false);
    }
  }, [card, busy, result, selected, input, session]);

  const next = () => {
    setResult(null);
    setInput('');
    setSelected(null);
    setError('');
    startRef.current = Date.now();
    setIdx((i) => i + 1);
  };

  if (!topics) return <PageSkeleton />;

  /* ── session complete ─────────────────────────────────────────────────── */
  if (session && !card) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-accent/10 text-accent">
          <Icon name="cram" size={22} />
        </span>
        <h1 className="t-tagline mt-4">Cram session done</h1>
        <p className="t-body mt-2 text-muted">{sessionSummary(score.correct, score.total)}</p>
        <p className="t-caption mt-2 text-muted">Nothing about your review schedule changed.</p>
        <div className="mt-5 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSession(null);
              setPicked(new Set());
            }}
            className="btn-secondary"
          >
            Cram something else
          </button>
          <Link href="/review" className="btn-primary">
            Back to reviews
          </Link>
        </div>
      </div>
    );
  }

  /* ── session runner ───────────────────────────────────────────────────── */
  if (session && card) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <div className="flex items-center justify-between">
          <span className="t-caption tabular-nums text-muted">
            {idx + 1} <span className="text-edge">/</span> {session.queue.length}
          </span>
          <span className="chip">
            <Icon name="target" size={14} className="text-accent" />
            <NumberTicker value={score.correct} className="tabular-nums" />
            <span>/ {score.total} correct</span>
          </span>
        </div>

        <div className="meter">
          <motion.div
            className="h-full rounded-full bg-accent"
            animate={{ width: `${session.queue.length ? (idx / session.queue.length) * 100 : 0}%` }}
            transition={SPRING.meter}
          />
        </div>

        {session.notes.length > 0 && (
          <details className="card p-0">
            <summary className="flex cursor-pointer items-center gap-2 px-5 py-4 text-[14px] font-semibold leading-[1.29] tracking-[-0.224px]">
              <Icon name="notes" size={16} className="text-accent" />
              Revision notes
              <span className="chip ml-1 capitalize">{session.noteDensityLabel}</span>
              <Icon name="collapse" size={15} className="ml-auto text-muted" />
            </summary>
            <div className="space-y-2 border-t border-edge/70 px-5 py-4">
              {session.notes.map((n) => (
                <details key={n.topicId + n.title} className="inset overflow-hidden">
                  <summary className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-[14px] font-semibold leading-[1.29] tracking-[-0.224px]">
                    <Icon name="learn" size={14} className="text-accent" />
                    {n.title}
                    {n.specRefs && <span className="chip ml-auto">{n.specRefs}</span>}
                  </summary>
                  <pre className="t-body whitespace-pre-wrap border-t border-edge/60 px-3 py-3 font-[inherit] text-ink">
                    {n.contentMd}
                  </pre>
                </details>
              ))}
            </div>
          </details>
        )}

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={card.id + (result ? ':verdict' : ':question')}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={transition.quick}
          >
            <div className="card">
              <div className="flex items-center justify-between gap-3">
                <span className="chip chip-active">
                  <Icon name={card.kind === 'cloze' ? 'notes' : card.kind === 'mcq' ? 'target' : 'learn'} size={13} />
                  {KIND_LABEL[card.kind]}
                </span>
                <span className="t-caption truncate text-muted">{card.topicName}</span>
              </div>

              <div className="mt-5 text-[21px] font-normal leading-[1.4]">
                {card.kind === 'cloze' && (card.textWithBlank ?? '').replace('____', '______')}
                {card.kind === 'flashcard' && card.prompt}
                {card.kind === 'mcq' && card.question}
              </div>

              {!result && card.kind === 'mcq' && (
                <div className="mt-5 space-y-2">
                  {card.options?.map((o) => (
                    <motion.button
                      key={o.id}
                      type="button"
                      whileTap={{ scale: 0.99 }}
                      onClick={() => setSelected(o.id)}
                      className={`option ${selected === o.id ? 'option-selected font-semibold' : 'hover:bg-edge/20'}`}
                    >
                      {o.text}
                    </motion.button>
                  ))}
                  <button className="btn-primary mt-2 w-full" disabled={!selected || busy} onClick={submit}>
                    {busy ? 'Marking…' : 'Check answer'}
                  </button>
                </div>
              )}

              {!result && card.kind !== 'mcq' && (
                <form
                  className="mt-5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submit();
                  }}
                >
                  <textarea
                    className="input min-h-[100px]"
                    placeholder="Write your answer…"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    autoFocus
                    aria-label="Your answer"
                  />
                  <button type="submit" className="btn-primary mt-3 w-full" disabled={!input.trim() || busy}>
                    {busy ? 'Marking…' : 'Check answer'}
                  </button>
                </form>
              )}

              {result && (
                <div className={`mt-5 rounded-[11px] px-4 py-3.5 ${result.verdict.correct ? 'bg-good/10' : 'bg-bad/10'}`}>
                  <div className={`flex items-center gap-2 text-[17px] font-semibold ${result.verdict.correct ? 'text-good' : 'text-bad'}`}>
                    <Icon name={result.verdict.correct ? 'reviewed' : 'close'} size={18} />
                    {result.verdict.correct ? 'Correct' : 'Not quite'}
                    {result.xpAwarded > 0 && <span className="t-caption ml-auto font-normal text-muted">+{result.xpAwarded} XP</span>}
                  </div>
                  {result.verdict.note && <p className="t-caption mt-2 text-ink">{result.verdict.note}</p>}
                  {result.modelAnswer && (
                    <div className="inset mt-2.5 px-3 py-2">
                      <span className="t-micro uppercase tracking-[0.08em] text-muted">Model answer</span>
                      <p className="t-caption mt-0.5 text-ink">{result.modelAnswer}</p>
                    </div>
                  )}
                  <button onClick={next} className="btn-primary mt-4 w-full gap-2">
                    Next
                    <Icon name="next" size={17} />
                  </button>
                </div>
              )}

              <Notice tone="bad" className="mt-3">{error}</Notice>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  /* ── picker ───────────────────────────────────────────────────────────── */
  const withCards = topics.filter((t) => t.cardCount > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        icon="cram"
        title="Cram"
        subtitle="Read the notes, then drill as many questions as you like. Cram reviews are logged but never reschedule your cards."
      />

      <div className="card space-y-5">
        <div>
          <span className="label">Topics</span>
          {withCards.length === 0 ? (
            <p className="t-caption text-muted">
              None of your topics have questions yet. <Link href="/library" className="text-accent hover:underline">Add some</Link> and they will show up here.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {withCards.map((t) => {
                const on = picked.has(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setPicked((p) => {
                        const nextSet = new Set(p);
                        if (nextSet.has(t.id)) nextSet.delete(t.id);
                        else nextSet.add(t.id);
                        return nextSet;
                      })
                    }
                    className={`chip transition-colors duration-150 ${on ? 'chip-active' : ''}`}
                  >
                    {on && <Icon name="correct" size={13} />}
                    {t.name}
                    <span className="text-muted">{t.cardCount}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <span className="label">Notes to show</span>
            <div className="flex gap-1 rounded-[11px] border border-edge/70 bg-panel/60 p-1">
              {(['summary', 'detailed'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDensity(d)}
                  aria-pressed={density === d}
                  className={`segment flex-1 capitalize ${density === d ? 'segment-active' : ''}`}
                >
                  {d}
                </button>
              ))}
            </div>
            <p className="t-caption mt-1.5 text-muted">
              Summary notes are the ones to skim five minutes before the exam.
            </p>
          </div>

          <div>
            <label className="label" htmlFor="max-per-topic">
              Questions per topic — {maxPerTopic}
            </label>
            <input
              id="max-per-topic"
              type="range"
              min={5}
              max={30}
              step={5}
              value={maxPerTopic}
              onChange={(e) => setMaxPerTopic(Number(e.target.value))}
              className="w-full accent-[rgb(var(--c-accent))]"
            />
            <p className="t-caption mt-1.5 text-muted">
              {picked.size > 0
                ? `Up to ${picked.size * maxPerTopic} questions across ${picked.size} ${picked.size === 1 ? 'topic' : 'topics'}.`
                : 'Pick at least one topic to begin.'}
            </p>
          </div>
        </div>

        <button className="btn-primary w-full gap-2" disabled={picked.size === 0 || starting} onClick={start}>
          <Icon name="start" size={18} />
          {starting ? 'Building your session…' : 'Start cram session'}
        </button>

        <Notice tone="bad">{error}</Notice>
      </div>
    </div>
  );
}
