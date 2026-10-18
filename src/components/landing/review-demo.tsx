'use client';

import { useId, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { NumberTicker } from '@/components/ui/number-ticker';
import { Icon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

/**
 * A working cloze review, sized for the landing page.
 *
 * It runs the real loop in miniature: read a sentence with a blank, type the
 * answer, check it, earn XP on a correct answer, and move on. Nothing is sent
 * anywhere. The answer check is a normalised string match, which is the same
 * rule the product uses for a clean cloze.
 */

type Card = { topic: string; prompt: string; answer: string; alternates?: string[] };

const CARDS: Card[] = [
  {
    topic: 'Biology · Enzymes',
    prompt: 'An enzyme lowers the activation energy by binding to its ___.',
    answer: 'substrate',
  },
  {
    topic: 'Physics · Forces',
    prompt: 'The SI unit of force is the ___.',
    answer: 'newton',
  },
  {
    topic: 'Chemistry · Bonding',
    prompt: 'Atoms that share electrons form a ___ bond.',
    answer: 'covalent',
  },
];

const XP_PER_CORRECT = 12;

function normalise(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isCorrect(card: Card, input: string): boolean {
  const given = normalise(input);
  if (!given) return false;
  return [card.answer, ...(card.alternates ?? [])].some((a) => normalise(a) === given);
}

export function ReviewDemo() {
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState('');
  const [result, setResult] = useState<null | 'correct' | 'wrong'>(null);
  const [xp, setXp] = useState(0);
  const [streak, setStreak] = useState(0);
  const [done, setDone] = useState(false);
  const inputId = useId();
  const feedbackId = useId();

  const card = CARDS[index];
  const answered = result !== null;

  function check(e?: FormEvent) {
    e?.preventDefault();
    if (answered) return;
    if (!value.trim()) return;
    if (isCorrect(card, value)) {
      setResult('correct');
      setXp((x) => x + XP_PER_CORRECT);
      setStreak((s) => s + 1);
    } else {
      setResult('wrong');
      setStreak(0);
    }
  }

  function next() {
    if (index + 1 >= CARDS.length) {
      setDone(true);
      return;
    }
    setIndex((i) => i + 1);
    setValue('');
    setResult(null);
  }

  function restart() {
    setIndex(0);
    setValue('');
    setResult(null);
    setXp(0);
    setStreak(0);
    setDone(false);
  }

  const progressPct = Math.round(((done ? CARDS.length : index + (answered ? 1 : 0)) / CARDS.length) * 100);

  return (
    <div className="relative w-full">
      <div className="card relative overflow-hidden !p-5 shadow-[var(--shadow-card)]">
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
          <span className="badge badge-quiet">
            <Icon name="notes" size={13} />
            Fill the blank
          </span>
          <span className="text-[12px] text-muted-foreground">{done ? 'Session complete' : card.topic}</span>
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
              <p className="t-display-sm">Three in a row. Nice.</p>
              <p className="mt-2 text-[15px] text-muted-foreground">
                You earned <span className="num text-foreground">{xp}</span> XP in one sitting.
              </p>
              <button type="button" onClick={restart} className="btn btn-secondary mt-5">
                Try again
              </button>
            </motion.div>
          ) : (
            <motion.form
              key={index}
              onSubmit={check}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <label htmlFor={inputId} className="mt-4 block text-[19px] font-bold leading-snug">
                {card.prompt.split('___').map((part, i, arr) => (
                  <span key={i}>
                    {part}
                    {i < arr.length - 1 && (
                      <span className="mx-1 inline-block min-w-[5rem] border-b-2 border-border-strong align-baseline">
                        {result === 'correct' ? (
                          <span className="text-good-strong">{card.answer}</span>
                        ) : result === 'wrong' ? (
                          <span className="text-destructive-ink">{card.answer}</span>
                        ) : null}
                      </span>
                    )}
                  </span>
                ))}
              </label>

              <input
                id={inputId}
                type="text"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={value}
                disabled={answered}
                onChange={(e) => setValue(e.target.value)}
                aria-describedby={feedbackId}
                aria-invalid={result === 'wrong' || undefined}
                placeholder="Type your answer"
                className={cn(
                  'mt-4 flex min-h-[46px] w-full items-center rounded-sm border-2 bg-transparent px-3.5 text-[15px] outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring',
                  result === 'correct' && 'border-good',
                  result === 'wrong' && 'border-destructive-ink',
                  !result && 'border-border focus:border-border-strong',
                )}
              />

              <div id={feedbackId} aria-live="polite" className="mt-2 min-h-[20px] text-[13px]">
                {result === 'correct' && <span className="font-semibold text-good-strong">Correct. +{XP_PER_CORRECT} XP</span>}
                {result === 'wrong' && (
                  <span className="text-destructive-ink">
                    Not quite. The answer is <strong>{card.answer}</strong>.
                  </span>
                )}
              </div>

              {answered ? (
                <button type="button" onClick={next} className="btn btn-primary mt-2 w-full gap-2">
                  {index + 1 >= CARDS.length ? 'Finish' : 'Next card'}
                  <Icon name="next" size={17} />
                </button>
              ) : (
                <button type="submit" disabled={!value.trim()} className="btn btn-good mt-2 w-full disabled:opacity-40">
                  Check
                </button>
              )}
            </motion.form>
          )}
        </AnimatePresence>

        <div className="mt-4 flex items-center justify-between text-[12px] text-muted-foreground">
          <span className="num">
            {Math.min(index + 1, CARDS.length)} / {CARDS.length}
          </span>
          <span className="flex items-center gap-2">
            {streak > 1 && <span className="badge badge-gold">{streak} in a row</span>}
            <span className="badge badge-gold">
              +<NumberTicker value={xp} />
              {' '}XP
            </span>
          </span>
        </div>
      </div>

      <p className="mt-3 text-center text-[12px] text-muted-foreground">Try it. This is the real review loop.</p>
    </div>
  );
}
