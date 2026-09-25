'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useMe } from '@/lib/useMe';
import { useRanked } from '@/lib/useRanked';
import { Icon, achievementIcon } from '@/components/ui/icons';
import { RankCrest } from '@/components/ui/rank-crest';
import { TilePanel } from '@/components/ui/tile';
import { Confetti, type ConfettiRef } from '@/components/ui/confetti';
import { NumberTicker } from '@/components/ui/number-ticker';
import { SPRING, transition } from '@/lib/motion';
import { emptyQueueLine, sessionSummary } from '@/lib/profile';
import { rankChange, reviewsForRp, type Rank } from '@/domain/ranked';
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
  mcq: 'Choose one',
};

/**
 * Daily review — the loop the whole product exists for.
 *
 * **The one design rule this screen follows:** green means you are earning
 * something. Everything you press *inside* a session is green with a flat bottom
 * lip that compresses under your thumb (docs/DESIGN-DUOLINGO.md), and every
 * action that navigates *away* from the session is ink. That single split is
 * what makes a review feel like a game round rather than a form, and it is why
 * the old `btn btn-primary` blue-on-everything version read as flat.
 *
 * The rest is the loop itself, unchanged and now much quieter: one card, one
 * question at display size, one uppercase action, and a verdict that lands as a
 * full-width band — green with a check, or red with the model answer. Enter
 * advances, so a session can be run without the mouse. Confetti is MagicUI's,
 * fired from a ref; it is the only celebratory effect in the app and it is
 * reserved for a correct answer and for a promotion.
 */
export default function ReviewPage() {
  // Sharing the shell's cache entries lets the empty state quote a real streak
  // and lets the session report know the rank it started from.
  const { me, refresh: refreshMe } = useMe();
  const { refresh: refreshRanked } = useRanked('weekly');
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
  // The rank report needs both ends of the session: the XP held before the first
  // card and after the last. Both come off the server's own totals rather than
  // being accumulated locally, so the report cannot disagree with `/me`.
  const [startXp, setStartXp] = useState<number | null>(null);
  const [latestXp, setLatestXp] = useState<number | null>(null);
  const startRef = useRef<number>(Date.now());
  const confettiRef = useRef<ConfettiRef>(null);

  /** One burst helper, so every celebration in this file is the same gesture. */
  const burst = useCallback((particleCount: number, y = 0.5) => {
    void confettiRef.current?.fire({
      particleCount,
      spread: 70,
      origin: { x: 0.5, y },
      startVelocity: 34,
      scalar: 0.9,
      disableForReducedMotion: true,
    });
  }, []);

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await api.get<{ queue: QueueCard[] }>('/api/v1/queue/today?limit=20');
      setQueue(data.queue);
      setIdx(0);
      setSessionXp(0);
      setDone(0);
      setCorrect(0);
      setStartXp(null);
      setLatestXp(null);
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
      setStartXp((s) => s ?? Math.max(0, res.totalXp - res.xpAwarded));
      setLatestXp(res.totalXp);
      setDone((d) => d + 1);
      if (res.verdict.correct) {
        setCorrect((c) => c + 1);
        burst(46, 0.46); // small and off-centre: a reward, not a firework display
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That answer didn’t reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  }, [card, busy, result, selected, input, burst]);

  const next = useCallback(() => {
    setResult(null);
    setInput('');
    setSelected(null);
    setError('');
    startRef.current = Date.now();
    setIdx((i) => i + 1);
  }, []);

  // The session has ended: the rank report is on screen, so the caches the
  // shell, the dashboard and the Rank page read are now stale. Refreshing here
  // (rather than on a timer) lands XP in the same moment it is earned.
  const finished = queue !== null && queue.length > 0 && !card;
  const change =
    finished && startXp !== null && latestXp !== null ? rankChange(startXp, latestXp) : null;

  useEffect(() => {
    if (!finished) return;
    refreshMe();
    refreshRanked();
  }, [finished, refreshMe, refreshRanked]);

  // A promotion outranks the per-card flicker: a full, slow burst.
  useEffect(() => {
    if (change?.promoted) burst(140, 0.3);
  }, [change?.promoted, burst]);

  // Enter advances once a verdict is on screen, so a session is keyboard-only.
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
      <div className="card mx-auto max-w-md p-7 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-good-soft text-good-pressed">
          <Icon name="reviewed" size={22} />
        </span>
        <h1 className="t-display-sm mt-4">Nothing due</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
          {emptyQueueLine(0, me?.gamification.streak ?? 0)}
        </p>
        <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
          <Link href="/cram" className="btn btn-secondary">
            Cram a topic
          </Link>
          <Link href="/learn" className="btn btn-primary">
            Read ahead
          </Link>
        </div>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="relative mx-auto max-w-xl">
        <Confetti ref={confettiRef} className="pointer-events-none absolute inset-0 z-10" />
        <SessionReport
          correct={correct}
          done={done}
          sessionXp={sessionXp}
          change={change}
          onAgain={load}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <Confetti ref={confettiRef} className="pointer-events-none fixed inset-0 z-[60]" />

      {/* The session's own progress readout. Green, because you are earning. */}
      <div className="mb-2 flex items-center justify-between">
        <span className="num text-[13px] font-semibold text-muted-foreground">
          {done} / {queue.length}
        </span>
        <span className="badge badge-quiet num">
          <Icon name="xp" size={12} />+{sessionXp} XP
        </span>
      </div>

      <div className="meter mb-4 h-2">
        <motion.div
          className="meter-fill"
          animate={{ width: `${progress}%` }}
          transition={SPRING.meter}
        />
      </div>

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
              <span className="badge badge-quiet">
                <Icon
                  name={card.kind === 'cloze' ? 'notes' : card.kind === 'mcq' ? 'target' : 'learn'}
                  size={13}
                />
                {KIND_LABEL[card.kind]}
              </span>
              <span className="truncate text-[12px] text-muted-foreground">
                {card.subjectName} · {card.topicName}
              </span>
            </div>

            <div className="mt-5 text-[20px] font-bold leading-[1.35] sm:text-[22px]">
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

            {/* ── Answering ───────────────────────────────────────────────── */}
            {!result && card.kind === 'mcq' && (
              <div className="mt-5 space-y-2.5">
                {card.options?.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setSelected(o.id)}
                    className={`option ${selected === o.id ? 'option-selected font-bold' : ''}`}
                  >
                    <span className="flex-1">{o.text}</span>
                    {selected === o.id && <Icon name="reviewed" size={18} />}
                  </button>
                ))}
                <button
                  className="btn btn-good btn-lg mt-1.5 gap-2"
                  disabled={!selected || busy}
                  onClick={submit}
                >
                  {busy ? 'Marking…' : 'Check'}
                </button>
                <p className="text-center text-[12px] text-muted-foreground">One attempt only</p>
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
                    placeholder="Type the missing word"
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
                    placeholder="What do you remember? Key ideas count, not wording."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    autoFocus
                    aria-label="Your answer"
                  />
                )}
                <button type="submit" className="btn btn-good btn-lg mt-3" disabled={!input.trim() || busy}>
                  {busy ? 'Marking…' : 'Check'}
                </button>
                {card.kind === 'cloze' && (
                  <p className="mt-2 text-center text-[12px] text-muted-foreground">Enter to check</p>
                )}
              </form>
            )}

            {/* ── Verdict ────────────────────────────────────────────────── */}
            {result && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                transition={SPRING.soft}
                className="overflow-hidden"
              >
                <VerdictPanel result={result} kind={card.kind} />
                <button onClick={next} className="btn btn-primary btn-lg mt-3 gap-2">
                  Continue
                  <Icon name="next" size={17} />
                </button>
                <p className="mt-2 text-center text-[12px] text-muted-foreground">Enter for next</p>
              </motion.div>
            )}

            {error && (
              <p
                className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-[13px] text-destructive"
                role="alert"
              >
                {error}
              </p>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/**
 * The session report — where the work lands.
 *
 * This is the moment the ranked system exists for: a session ends and the
 * numbers have to *move*. It is a near-black band because it is the headline,
 * and it names the rank rather than shoving a bar at you: "Promoted to Silver II"
 * is a sentence you can repeat, and a bar filling by four percent is not.
 *
 * Promotion gets the crest, the animation and the confetti. Staying put gets the
 * exact distance to the next rung, because "40 RP short" is a reason to come back
 * tomorrow and "good job" is not.
 */
function SessionReport({
  correct,
  done,
  sessionXp,
  change,
  onAgain,
}: {
  correct: number;
  done: number;
  sessionXp: number;
  change: ReturnType<typeof rankChange> | null;
  onAgain: () => void;
}) {
  const rank: Rank | null = change?.after ?? null;

  return (
    <TilePanel tone="dark" className="text-center">
      {rank && (
        <motion.div
          className="mx-auto w-fit"
          initial={{ scale: 0.7, opacity: 0, rotate: -6 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={SPRING.pop}
        >
          <RankCrest rank={rank} size={92} />
        </motion.div>
      )}

      <h1 className="t-display mt-4">
        {change?.promoted ? `Promoted to ${change.after.label}` : 'Session complete'}
      </h1>

      <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-muted-foreground">
        {change?.promoted
          ? change.tierChanged
            ? `${correct} of ${done} correct — and that carried you into a new tier. Everything above this is harder, and worth more.`
            : `${correct} of ${done} correct, and the crest moved with it.`
          : sessionSummary(correct, done)}
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <span className="chip num">
          <Icon name="xp" size={14} className="text-gold" />+{sessionXp} XP
        </span>
        <span className="chip num">
          <Icon name="reviewed" size={14} className="text-good" />
          {correct}/{done}
        </span>
        {rank && (
          <span className="chip num">
            <Icon name="rank" size={14} className="text-muted-foreground" />
            {rank.points.toLocaleString()} RP
          </span>
        )}
      </div>

      {rank && !rank.isApex && (
        <p className="mt-3 text-[13px] text-muted-foreground">
          {rank.remaining} RP to the next rung · about {reviewsForRp(rank.remaining)} more reviews.
        </p>
      )}

      <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
        <button onClick={onAgain} className="btn btn-ghost">
          Load more
        </button>
        <Link href="/progress" className="btn btn-primary gap-2">
          See the ladder
          <Icon name="next" size={16} />
        </Link>
      </div>
    </TilePanel>
  );
}

/** The blank in a cloze prompt. Fills with the answer once the verdict lands. */
function ClozePrompt({ text, answer, revealed }: { text: string; answer: string | null; revealed: boolean }) {
  const [before, after] = text.split('____');
  return (
    <span>
      {before}
      <span
        className={`mx-1 inline-block min-w-[6rem] border-b-2 px-2 text-center font-bold ${
          !revealed
            ? 'border-border-strong text-muted-foreground'
            : answer
              ? 'border-good text-good-pressed'
              : 'border-destructive text-destructive'
        }`}
      >
        {answer ?? '\u00A0'.repeat(8)}
      </span>
      {after}
    </span>
  );
}

/**
 * The verdict.
 *
 * Correct answers get the green wash from the Duolingo component set; wrong ones
 * get the cardinal wash, the model answer, and — when the grader found phrases
 * the learner did hit — the partial credit spelled out rather than implied.
 */
function VerdictPanel({ result, kind }: { result: ReviewResult; kind: QueueCard['kind'] }) {
  const { verdict } = result;
  const good = verdict.correct;
  const softened = verdict.feedbackKind !== 'correct' && good;

  return (
    <div
      aria-live="polite"
      className={`mt-5 rounded-md px-4 py-3.5 ${good ? 'bg-good-soft' : 'bg-destructive/10'}`}
    >
      <div
        className={`flex items-center gap-2.5 text-[17px] font-bold ${
          good ? 'text-good-pressed' : 'text-destructive'
        }`}
      >
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${
            good ? 'bg-good text-white' : 'bg-destructive text-white'
          }`}
        >
          <Icon name={good ? 'correct' : 'close'} size={16} strokeWidth={3} />
        </span>
        {good ? (softened ? 'Correct — with a nudge' : 'Correct') : 'Not quite'}
        {result.xpAwarded > 0 && (
          <span className="num ml-auto text-[13px] font-semibold text-good-pressed">
            +{result.xpAwarded} XP
          </span>
        )}
      </div>

      {verdict.note && <p className="mt-2 text-[14px] text-foreground">{verdict.note}</p>}

      {verdict.matchedPhrases && verdict.matchedPhrases.length > 0 && (
        <p className="mt-2 text-[13px] text-foreground">
          <span className="font-bold">You had: </span>
          {verdict.matchedPhrases.join(', ')}
        </p>
      )}
      {verdict.missedPhrases && verdict.missedPhrases.length > 0 && (
        <p className="mt-1 text-[13px] text-foreground">
          <span className="font-bold text-destructive">Missing: </span>
          {verdict.missedPhrases.join(', ')}
        </p>
      )}

      {kind === 'flashcard' && result.modelAnswer && (
        <div className="mt-2.5 rounded-md bg-card/70 px-3 py-2">
          <span className="t-eyebrow">Model answer</span>
          <p className="mt-0.5 text-[14px] text-foreground">{result.modelAnswer}</p>
        </div>
      )}

      {result.explanation && (
        <div className="mt-2.5 rounded-md bg-card/70 px-3 py-2">
          <span className="t-eyebrow">Why</span>
          <p className="mt-0.5 text-[14px] text-foreground">{result.explanation}</p>
        </div>
      )}

      {result.newAchievements.map((a) => (
        <motion.div
          key={a.id}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={SPRING.soft}
          className="mt-2.5 flex items-center gap-2 rounded-md bg-card/70 px-3 py-2"
        >
          <Icon name={achievementIcon(a.id, a.icon)} size={16} className="text-gold" />
          <span className="text-[13px] font-semibold">{a.name} unlocked</span>
        </motion.div>
      ))}
    </div>
  );
}
