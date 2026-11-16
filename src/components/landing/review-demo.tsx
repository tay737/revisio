'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { NumberTicker } from '@/components/ui/number-ticker';
import { Icon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { track } from '@/lib/analytics';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

/**
 * A working review, sized for the landing page — now running on the real
 * sample deck (#20): `GET /api/v1/sample` serves official public cards with
 * every answer field stripped, and `POST /api/v1/sample/grade` marks them
 * with the same domain graders the app uses. Nothing is persisted — no card
 * state, no XP, no user row.
 *
 * If the deck fetch fails or comes back empty, the built-in three-card set
 * takes over with a local normalised-match check, so the demo can never be
 * the thing that breaks the landing page.
 */

type SampleCard = {
  id: string;
  kind: 'cloze' | 'flashcard' | 'mcq';
  topicName: string;
  subjectName: string;
  textWithBlank: string | null;
  prompt: string | null;
  question: string | null;
  options: { id: string; text: string }[] | null;
};

type DemoCard = {
  id: string;
  kind: 'cloze' | 'flashcard' | 'mcq';
  topic: string;
  prompt: string;
  options?: { id: string; text: string }[];
  /** Fallback deck only: graded locally instead of calling /sample/grade. */
  localAnswer?: string;
  localAlternates?: string[];
};

const KIND_LABEL: Record<DemoCard['kind'], string> = {
  cloze: 'Fill the blank',
  flashcard: 'Flashcard',
  mcq: 'Choose one',
};

const FALLBACK: DemoCard[] = [
  {
    id: 'fallback-1',
    kind: 'cloze',
    topic: 'Biology · Enzymes',
    prompt: 'An enzyme lowers the activation energy by binding to its ___.',
    localAnswer: 'substrate',
  },
  {
    id: 'fallback-2',
    kind: 'cloze',
    topic: 'Physics · Forces',
    prompt: 'The SI unit of force is the ___.',
    localAnswer: 'newton',
  },
  {
    id: 'fallback-3',
    kind: 'cloze',
    topic: 'Chemistry · Bonding',
    prompt: 'Atoms that share electrons form a ___ bond.',
    localAnswer: 'covalent',
  },
];

const XP_PER_CORRECT = 12;

function normalise(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function toDemoCard(c: SampleCard): DemoCard | null {
  const topic = `${c.subjectName} · ${c.topicName}`;
  if (c.kind === 'cloze' && c.textWithBlank) {
    return { id: c.id, kind: 'cloze', topic, prompt: c.textWithBlank };
  }
  if (c.kind === 'flashcard' && c.prompt) {
    return { id: c.id, kind: 'flashcard', topic, prompt: c.prompt };
  }
  if (c.kind === 'mcq' && c.question && c.options && c.options.length > 0) {
    return { id: c.id, kind: 'mcq', topic, prompt: c.question, options: c.options };
  }
  return null;
}

type GradeOutcome = { correct: boolean; reveal: string | null; note: string | null };

async function grade(card: DemoCard, input: string, selectedOptionId: string | null): Promise<GradeOutcome> {
  if (card.localAnswer !== undefined) {
    const given = normalise(input);
    const options = [card.localAnswer, ...(card.localAlternates ?? [])].map(normalise);
    return { correct: !!given && options.includes(given), reveal: card.localAnswer, note: null };
  }
  const body =
    card.kind === 'mcq'
      ? { cardId: card.id, selectedOptionId }
      : { cardId: card.id, answer: input };
  const res = await fetch('/api/v1/sample/grade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`grade failed (${res.status})`);
  const d = (await res.json()) as {
    verdict?: { correct?: boolean; note?: string };
    primaryAnswer?: string | null;
    modelAnswer?: string | null;
  };
  return {
    correct: !!d.verdict?.correct,
    reveal: d.primaryAnswer ?? d.modelAnswer ?? null,
    note: d.verdict?.note ?? null,
  };
}

export function ReviewDemo() {
  const [deck, setDeck] = useState<DemoCard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<GradeOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [gradeError, setGradeError] = useState(false);
  const [xp, setXp] = useState(0);
  const [streak, setStreak] = useState(0);
  const [done, setDone] = useState(false);
  const inputId = useId();
  const feedbackId = useId();

  useEffect(() => {
    let live = true;
    fetch('/api/v1/sample')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { cards?: SampleCard[] } | null) => {
        if (!live) return;
        const cards = (d?.cards ?? []).map(toDemoCard).filter((c): c is DemoCard => c !== null);
        setDeck(cards.length > 0 ? cards : FALLBACK);
      })
      .catch(() => {
        if (live) setDeck(FALLBACK);
      });
    return () => {
      live = false;
    };
  }, []);

  const card = deck?.[index];
  const answered = result !== null;
  const canCheck = card?.kind === 'mcq' ? selected !== null : value.trim().length > 0;

  async function check(e?: FormEvent) {
    e?.preventDefault();
    if (!card || answered || busy || !canCheck) return;
    setBusy(true);
    setGradeError(false);
    try {
      const outcome = await grade(card, value, selected);
      setResult(outcome);
      if (outcome.correct) {
        setXp((x) => x + XP_PER_CORRECT);
        setStreak((s) => s + 1);
        track('demo_review_submit', { result: 'correct' });
      } else {
        setStreak(0);
        track('demo_review_submit', { result: 'wrong' });
      }
    } catch {
      // A failed grade must not trap the learner on the card — offer a retry.
      setGradeError(true);
    } finally {
      setBusy(false);
    }
  }

  function next() {
    if (!deck) return;
    if (index + 1 >= deck.length) {
      setDone(true);
      track('demo_review_complete');
      return;
    }
    setIndex((i) => i + 1);
    setValue('');
    setSelected(null);
    setResult(null);
    setGradeError(false);
  }

  function restart() {
    setIndex(0);
    setValue('');
    setSelected(null);
    setResult(null);
    setGradeError(false);
    setXp(0);
    setStreak(0);
    setDone(false);
  }

  const total = deck?.length ?? FALLBACK.length;
  const progressPct = Math.round(((done ? total : index + (answered ? 1 : 0)) / total) * 100);

  return (
    <div className="relative w-full">
      <Card className="relative overflow-hidden !p-5 shadow-[var(--shadow-card)]">
        {/* Progress along the top of the card, the same hairline the app shows. */}
        <div className="absolute inset-x-0 top-0 h-1 bg-secondary" aria-hidden>
          <motion.div
            className="h-full bg-foreground"
            initial={false}
            animate={{ width: `${progressPct}%` }}
            transition={{ type: 'spring', stiffness: 180, damping: 26 }}
          />
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <Badge variant="quiet">
            <Icon name={card?.kind === 'mcq' ? 'target' : card?.kind === 'flashcard' ? 'learn' : 'notes'} size={13} />
            {card ? KIND_LABEL[card.kind] : 'Loading'}
          </Badge>
          <span className="t-fine text-muted-foreground">{done ? 'Session complete' : (card?.topic ?? '')}</span>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {done ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
              className="mt-5 text-center"
            >
              <p className="t-display-sm">{total} cards. Nice.</p>
              <p className="mt-2 t-body text-muted-foreground">
                You earned <span className="num text-foreground">{xp}</span> XP in one sitting, on real cards from the
                public catalogue, graded by the same rules the app uses.
              </p>
              <Button variant="secondary" type="button" onClick={restart} className="mt-5">
                Try again
              </Button>
            </motion.div>
          ) : !card ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-5 space-y-3"
              aria-busy="true"
              aria-label="Loading a sample card"
            >
              <div className="skeleton h-6 w-4/5" />
              <div className="skeleton h-11 w-full" />
              <div className="skeleton h-11 w-full" />
            </motion.div>
          ) : (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              {card.kind === 'cloze' ? (
                <p className="t-tagline mt-4 leading-snug">
                  {card.prompt.split(/_{3,}/).map((part, i, arr) => (
                    <span key={i}>
                      {part}
                      {i < arr.length - 1 && (
                        <span className="mx-1 inline-block min-w-[5rem] whitespace-nowrap border-b-2 border-border-strong align-baseline">
                          {result?.reveal ? (
                            <span className={result.correct ? 'text-good-strong' : 'text-destructive-ink'}>
                              {result.reveal}
                            </span>
                          ) : null}
                        </span>
                      )}
                    </span>
                  ))}
                </p>
              ) : (
                <p className="t-tagline mt-4 leading-snug">{card.prompt}</p>
              )}

              {!answered && card.kind === 'mcq' && (
                <div className="mt-4 space-y-2">
                  {card.options?.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      aria-pressed={selected === o.id}
                      onClick={() => setSelected(o.id)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-md border px-3.5 py-3 t-body text-left transition-colors',
                        selected === o.id
                          ? 'border-foreground bg-secondary font-bold'
                          : 'border-border hover:border-border-strong',
                      )}
                    >
                      <span className="min-w-0 flex-1">{o.text}</span>
                      {selected === o.id && <Icon name="reviewed" size={16} />}
                    </button>
                  ))}
                </div>
              )}

              {!answered && card.kind !== 'mcq' && (
                <form onSubmit={check} className="mt-4">
                  <input
                    id={inputId}
                    type="text"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    aria-describedby={feedbackId}
                    aria-invalid={gradeError || undefined}
                    placeholder={card.kind === 'flashcard' ? 'What do you remember?' : 'Type your answer'}
                    className="flex min-h-[46px] w-full items-center rounded-sm border-2 border-border bg-transparent px-3.5 t-body outline-none transition-colors placeholder:text-muted-foreground focus:border-border-strong focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  {/* The disabled state used to be the green fill at 40% opacity,
                      which read as a broken control rather than "answer first".
                      The quiet variant is the honest waiting state. */}
                  <Button
                    type="submit"
                    variant={value.trim() ? 'good' : 'secondary'}
                    disabled={!value.trim() || busy}
                    className="mt-2 w-full"
                  >
                    {busy ? 'Marking…' : 'Check'}
                  </Button>
                </form>
              )}

              <div id={feedbackId} aria-live="polite" className="t-caption mt-2 min-h-[20px]">
                {answered && result?.correct && <span className="font-semibold text-good-strong">Correct. +{XP_PER_CORRECT} XP</span>}
                {answered && result && !result.correct && (
                  <span className="text-destructive-ink">
                    {result.reveal ? (
                      <>
                        Not quite. The answer is <strong>{result.reveal}</strong>.
                      </>
                    ) : (
                      (result.note ?? 'Not quite.')
                    )}
                  </span>
                )}
                {gradeError && (
                  <span className="text-destructive-ink">Couldn&apos;t mark that just now. Try Check again.</span>
                )}
              </div>

              {answered ? (
                <Button variant="primary" type="button" onClick={next} className="mt-2 w-full gap-2">
                  {index + 1 >= total ? 'Finish' : 'Next card'}
                  <Icon name="next" size={17} />
                </Button>
              ) : card.kind === 'mcq' ? (
                <Button
                  variant={selected ? 'good' : 'secondary'}
                  type="button"
                  disabled={!selected || busy}
                  onClick={() => void check()}
                  className="mt-2 w-full"
                >
                  {busy ? 'Marking…' : 'Check'}
                </Button>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-4 flex items-center justify-between t-fine text-muted-foreground">
          <span className="num">
            {done ? total : Math.min(index + 1, total)} / {total}
          </span>
          <span className="flex items-center gap-2">
            {streak > 1 && <Badge variant="gold">{streak} in a row</Badge>}
            <Badge variant="gold">
              +<NumberTicker value={xp} />
              {' '}XP
            </Badge>
          </span>
        </div>
      </Card>
    </div>
  );
}
