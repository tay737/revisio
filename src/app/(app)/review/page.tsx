'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useMe } from '@/lib/useMe';
import { Icon, achievementIcon } from '@/components/ui/icons';
import { CanvasConfetti, useCelebration } from '@/components/ui/motion/celebrate';
import { NumberTicker } from '@/components/ui/motion/number-ticker';
import { SPRING, transition } from '@/lib/motion';
import { emptyQueueLine, sessionSummary } from '@/lib/profile';
import PageSkeleton from '@/components/PageSkeleton';

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

/**
 * Daily review.
 *
 * The loop is: read → answer → verdict → next, and every part of it now says
 * something. The header shows how much is left, the card is a glass pane with
 * the previous one cross-fading out beneath it, a correct answer gets a short
 * confetti burst (the only place in the app that earns one), and Enter advances
 * so a session can be run without touching the mouse.
 */
export default function ReviewPage() {
  // Sharing the shell's cache entry lets the empty state quote a real streak.
  const { me } = useMe();
  const [queue, setQueue] = useState<QueueCard[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sessionXp, setSessionXp] = useState(0);
  const [done, setDone] = useState(0);
  const [correct, setCorrect] = useState(0);
  const startRef = useRef<number>(Date.now());
  const { ref: confettiRef, celebrate } = useCelebration();

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await api.get<{ queue: QueueCard[] }>('/api/v1/queue/today?limit=20');
      setQueue(data.queue);
      setIdx(0);
      setSessionXp(0);
      setDone(0);
      setCorrect(0);
      setResult(null);
      setInput('');
      setSelected(null);
      startRef.current = Date.now();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load your queue.');
      setQueue([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const card = queue?.[idx] ?? null;
  const progress = useMemo(
    () => (queue && queue.length > 0 ? Math.round((done / queue.length) * 100) : 0),
    [done, queue],
  );

  const submit = useCallback(async () => {
    if (!card || busy || result) return;
    setBusy(true);
    setError('');
    try {
      const body =
        card.kind === 'mcq'
          ? { cardId: card.id, selectedOptionId: selected ?? '' }
          : { cardId: card.id, answer: input };
      const res = await api.post<ReviewResult>('/api/v1/reviews', {
        ...body,
        durationMs: Date.now() - startRef.current,
        mode: 'daily',
      });
      setResult(res);
      setSessionXp((x) => x + res.xpAwarded);
      setDone((d) => d + 1);
      if (res.verdict.correct) {
        setCorrect((c) => c + 1);
        // Small, off-centre burst — a reward, not a firework display.
        celebrate({ origin: { x: 0.5, y: 0.46 }, count: 46 });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That answer didn’t reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  }, [card, busy, result, selected, input, celebrate]);

  const next = useCallback(() => {
    setResult(null);
    setInput('');
    setSelected(null);
    setError('');
    startRef.current = Date.now();
    setIdx((i) => i + 1);
  }, []);

  // Enter advances once a verdict is on screen, so a session can be keyboard-only.
  useEffect(() => {
    if (!result) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [result, next]);

  if (queue === null) return <PageSkeleton variant="reader" />;

  if (queue.length === 0) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-good/10 text-good">
          <Icon name="reviewed" size={22} />
        </span>
        <h1 className="t-tagline mt-4">Nothing due right now</h1>
        <p className="t-caption mt-2 text-muted">{emptyQueueLine(0, me?.gamification.streak ?? 0)}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Link href="/cram" className="btn-secondary">Cram a topic</Link>
          <Link href="/learn" className="btn-primary">Read ahead</Link>
        </div>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="relative card mx-auto max-w-md p-8 text-center">
        <CanvasConfetti ref={confettiRef} />
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-accent/10 text-accent">
          <Icon name="checked" size={22} />
        </span>
        <h1 className="t-tagline mt-4">Session complete</h1>
        <p className="t-body mt-2 text-muted">{sessionSummary(correct, done)}</p>
        <div className="mt-3 flex items-center justify-center gap-2">
          <span className="chip">
            <Icon name="xp" size={14} className="text-accent" />
            <span className="tabular-nums">+{sessionXp}</span> XP this session
          </span>
        </div>
        <div className="mt-5 flex justify-center gap-2">
          <button onClick={load} className="btn-secondary">Load more</button>
          <Link href="/dashboard" className="btn-primary">Back to today</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-3 flex items-center justify-between">
        <span className="t-caption tabular-nums text-muted">
          {done} <span className="text-edge">/</span> {queue.length}
        </span>
        <span className="chip">
          <Icon name="xp" size={14} className="text-accent" />
          <NumberTicker value={sessionXp} className="tabular-nums" />
          <span>XP</span>
        </span>
      </div>

      <div className="meter mb-5">
        <motion.div
          className="h-full rounded-full bg-accent"
          animate={{ width: `${progress}%` }}
          transition={SPRING.meter}
        />
      </div>

      <div className="relative">
        <CanvasConfetti ref={confettiRef} />
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
                <span className="t-caption truncate text-muted">
                  {card.subjectName} · {card.topicName}
                </span>
              </div>

              <div className="mt-5 text-[21px] font-normal leading-[1.4]">
                {card.kind === 'cloze' && (
                  <ClozePrompt
                    text={card.textWithBlank ?? ''}
                    answer={result && card.kind === 'cloze' ? (result.primaryAnswer ?? null) : null}
                    revealed={!!result}
                  />
                )}
                {card.kind === 'flashcard' && card.prompt}
                {card.kind === 'mcq' && card.question}
              </div>

              {/* ── Answering ─────────────────────────────────────────────── */}
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
                  <p className="t-caption text-center text-muted">One attempt — that’s the point.</p>
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
                  {card.kind === 'cloze' ? (
                    <input
                      type="text"
                      className="input"
                      placeholder="Type the missing word…"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      autoFocus
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      enterKeyHint="done"
                      aria-label="Your answer"
                    />
                  ) : (
                    <textarea
                      className="input min-h-[110px]"
                      placeholder="Write what you remember — the marking looks for key ideas, not exact wording."
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      autoFocus
                      aria-label="Your answer"
                    />
                  )}
                  <button type="submit" className="btn-primary mt-3 w-full" disabled={!input.trim() || busy}>
                    {busy ? 'Marking…' : 'Check answer'}
                  </button>
                  {card.kind === 'cloze' && (
                    <p className="t-caption mt-2 text-center text-muted">Press Enter to check</p>
                  )}
                </form>
              )}

              {/* ── Verdict ──────────────────────────────────────────────── */}
              {result && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  transition={SPRING.soft}
                  className="mt-5 overflow-hidden"
                >
                  <VerdictPanel result={result} kind={card.kind} />
                  <button onClick={next} className="btn-primary mt-4 w-full gap-2">
                    Next card
                    <Icon name="next" size={17} />
                  </button>
                  <p className="t-caption mt-2 text-center text-muted">Press Enter for the next one</p>
                </motion.div>
              )}

              {error && (
                <p className="t-caption mt-3 rounded-[11px] bg-bad/10 px-3 py-2 text-bad" role="alert">
                  {error}
                </p>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/** The blank in a cloze prompt. Fills with the answer once the verdict lands. */
function ClozePrompt({ text, answer, revealed }: { text: string; answer: string | null; revealed: boolean }) {
  const [before, after] = text.split('____');
  return (
    <span>
      {before}
      <span
        className={`mx-1 inline-block min-w-[6rem] border-b-2 px-2 text-center font-semibold ${
          !revealed ? 'border-accent text-accent' : answer ? 'border-good text-good' : 'border-bad text-bad'
        }`}
      >
        {answer ?? '\u00A0'.repeat(8)}
      </span>
      {after}
    </span>
  );
}

/**
 * The verdict. Correct answers get a tinted panel with a check; wrong ones get
 * the model answer and, when the grader found the phrases you did hit, the
 * partial credit is spelled out rather than implied.
 */
function VerdictPanel({ result, kind }: { result: ReviewResult; kind: QueueCard['kind'] }) {
  const { verdict } = result;
  const good = verdict.correct;
  const softened = verdict.feedbackKind !== 'correct' && good;

  return (
    <div className={`rounded-[11px] px-4 py-3.5 ${good ? 'bg-good/10' : 'bg-bad/10'}`}>
      <div className={`flex items-center gap-2 text-[17px] font-semibold ${good ? 'text-good' : 'text-bad'}`}>
        <Icon name={good ? 'reviewed' : 'close'} size={18} />
        {good ? (softened ? 'Correct — with a nudge' : 'Correct') : 'Not quite'}
        {result.xpAwarded > 0 && (
          <span className="ml-auto t-caption font-normal text-muted">+{result.xpAwarded} XP</span>
        )}
      </div>

      {verdict.note && <p className="t-caption mt-2 text-ink">{verdict.note}</p>}

      {verdict.matchedPhrases && verdict.matchedPhrases.length > 0 && (
        <p className="t-caption mt-2 text-muted">
          <span className="font-semibold text-good">You had: </span>
          {verdict.matchedPhrases.join(', ')}
        </p>
      )}
      {verdict.missedPhrases && verdict.missedPhrases.length > 0 && (
        <p className="t-caption mt-1 text-muted">
          <span className="font-semibold text-bad">Missing: </span>
          {verdict.missedPhrases.join(', ')}
        </p>
      )}

      {kind === 'flashcard' && result.modelAnswer && (
        <div className="inset mt-2.5 px-3 py-2">
          <span className="t-micro uppercase tracking-[0.08em] text-muted">Model answer</span>
          <p className="t-caption mt-0.5 text-ink">{result.modelAnswer}</p>
        </div>
      )}

      {result.explanation && (
        <div className="inset mt-2.5 px-3 py-2">
          <span className="t-micro uppercase tracking-[0.08em] text-muted">Why</span>
          <p className="t-caption mt-0.5 text-ink">{result.explanation}</p>
        </div>
      )}

      {result.newAchievements.map((a) => (
        <motion.div
          key={a.id}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={SPRING.soft}
          className="mt-2.5 flex items-center gap-2 rounded-[11px] bg-accent/10 px-3 py-2 text-accent"
        >
          <Icon name={achievementIcon(a.id, a.icon)} size={16} />
          <span className="t-caption">
            Achievement unlocked — <strong className="font-semibold">{a.name}</strong>
          </span>
        </motion.div>
      ))}
    </div>
  );
}
