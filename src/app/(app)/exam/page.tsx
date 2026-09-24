'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '@/lib/api';
import { Icon } from '@/components/ui/icons';
import { PageHeader } from '@/components/PageHeader';
import { Notice } from '@/components/Notice';
import { BlurFade } from '@/components/ui/motion/blur-fade';
import { NumberTicker } from '@/components/ui/motion/number-ticker';
import { CanvasConfetti, useCelebration } from '@/components/ui/motion/celebrate';
import { SPRING } from '@/lib/motion';
import PageSkeleton from '@/components/PageSkeleton';

type ExamQuestion = {
  id: string;
  kind: 'mcq' | 'free_response';
  questionMd: string;
  marks: number;
  options: { id: string; text: string }[] | null;
  board: string;
  sourceYear: number | null;
};
type Attempt = {
  id: string;
  topicIds: string[];
  score: number;
  maxScore: number;
  createdAt: string;
};
type ExamInfo = { topics: { id: string; name: string }[]; questionsAvailable: number; attempts: Attempt[] };
type Marked = {
  score: number;
  maxScore: number;
  percentage: number;
  detail: { questionId: string; awarded: number; marks: number; correct: boolean; feedback: string }[];
  xpAwarded: number;
};

/**
 * Exam simulator.
 *
 * Behaviour is unchanged; the presentation now reflects what an exam actually
 * is. The paper is a numbered deck (sticky counter, per-question marks in the
 * header), unanswered questions are visible at a glance, and the result leads
 * with the percentage rather than the raw fraction — that is the number a
 * student actually wants first.
 */
export default function ExamPage() {
  const [info, setInfo] = useState<ExamInfo | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [count, setCount] = useState(5);
  const [paper, setPaper] = useState<ExamQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Marked | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { ref: confettiRef, celebrate } = useCelebration();

  const loadInfo = () =>
    api
      .get<ExamInfo>('/api/v1/exam')
      .then(setInfo)
      .catch(() => setInfo(null));

  useEffect(() => {
    loadInfo();
  }, []);

  const buildPaper = async () => {
    setBusy(true);
    setError('');
    try {
      const d = await api.post<{ paper: ExamQuestion[] }>('/api/v1/exam', {
        topicIds: [...picked],
        questionCount: count,
      });
      setPaper(d.paper);
      setAnswers({});
      setResult(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not build that paper.');
    } finally {
      setBusy(false);
    }
  };

  const submitPaper = async () => {
    if (!paper) return;
    setBusy(true);
    setError('');
    try {
      const payload = paper.map((q) => ({
        questionId: q.id,
        answer: answers[q.id],
        selectedOptionId: answers[q.id],
      }));
      const d = await api.post<Marked>('/api/v1/exam', { topicIds: [...picked], answers: payload });
      setResult(d);
      if (d.percentage >= 80) celebrate({ count: 80 });
      loadInfo();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not mark that paper.');
    } finally {
      setBusy(false);
    }
  };

  if (!info) return <PageSkeleton />;

  const answeredCount = paper ? paper.filter((q) => (answers[q.id] ?? '').trim()).length : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        icon="exam"
        title="Exam simulator"
        subtitle="Past-paper questions marked against the mark scheme, so the feedback reads the way a marker would write it."
        actions={
          result && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setPaper(null);
                setResult(null);
              }}
            >
              New paper
            </button>
          )
        }
      />

      <Notice tone="bad">{error}</Notice>

      {/* ── Builder ──────────────────────────────────────────────────────── */}
      {!paper && (
        <div className="card space-y-5">
          <div>
            <span className="label">Topics in this paper</span>
            {info.topics.length === 0 ? (
              <p className="t-caption text-muted">No exam topics are available on this deployment yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {info.topics.map((t) => {
                  const on = picked.has(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setPicked((p) => {
                          const next = new Set(p);
                          if (next.has(t.id)) next.delete(t.id);
                          else next.add(t.id);
                          return next;
                        })
                      }
                      className={`chip transition-colors duration-150 ${on ? 'chip-active' : ''}`}
                    >
                      {on && <Icon name="correct" size={13} />}
                      {t.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="label" htmlFor="exam-count">
              Questions — {count}
            </label>
            <input
              id="exam-count"
              type="range"
              min={3}
              max={15}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-full accent-[rgb(var(--c-accent))]"
            />
            <p className="t-caption mt-1.5 text-muted">
              {info.questionsAvailable === 0
                ? 'No exam questions have been uploaded yet — ask your teacher, or check back soon.'
                : `${info.questionsAvailable} ${info.questionsAvailable === 1 ? 'question is' : 'questions are'} available across your topics.`}
            </p>
          </div>

          <button
            className="btn-primary w-full gap-2"
            disabled={picked.size === 0 || busy || info.questionsAvailable === 0}
            onClick={buildPaper}
          >
            <Icon name="start" size={18} />
            {busy ? 'Building…' : 'Generate paper'}
          </button>
        </div>
      )}

      {/* ── Paper ────────────────────────────────────────────────────────── */}
      {paper && !result && (
        <div className="space-y-3">
          <div className="glass-bar sticky top-[52px] z-10 -mx-4 flex items-center justify-between border-b border-edge/70 px-4 py-2.5 md:-mx-6 md:px-6">
            <span className="t-caption text-muted">
              <span className="tabular-nums font-semibold text-ink">{answeredCount}</span> of{' '}
              <span className="tabular-nums">{paper.length}</span> answered
            </span>
            <span className="chip">
              <Icon name="spec" size={13} className="text-accent" />
              <span className="tabular-nums">
                {paper.reduce((sum, q) => sum + q.marks, 0)} marks
              </span>
            </span>
          </div>

          {paper.map((q, i) => (
            <BlurFade key={q.id} delay={Math.min(i * 0.04, 0.2)}>
              <div className="card">
                <div className="flex items-center justify-between text-[14px] leading-[1.43] tracking-[-0.224px] text-muted">
                  <span className="flex items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-accent/10 text-[12px] font-semibold text-accent">
                      {i + 1}
                    </span>
                    {q.marks} {q.marks === 1 ? 'mark' : 'marks'}
                  </span>
                  {q.sourceYear && (
                    <span className="chip">
                      {q.board} {q.sourceYear}
                    </span>
                  )}
                </div>

                <p className="t-body mt-3 font-normal">{q.questionMd}</p>

                {q.kind === 'mcq' ? (
                  <div className="mt-3 space-y-2">
                    {q.options?.map((o) => (
                      <motion.button
                        key={o.id}
                        type="button"
                        whileTap={{ scale: 0.99 }}
                        onClick={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))}
                        aria-pressed={answers[q.id] === o.id}
                        className={`option ${answers[q.id] === o.id ? 'option-selected font-semibold' : 'hover:bg-edge/20'}`}
                      >
                        {o.text}
                      </motion.button>
                    ))}
                  </div>
                ) : (
                  <textarea
                    className="input mt-3 min-h-[110px]"
                    placeholder="Write your answer the way you would under timed conditions."
                    value={answers[q.id] ?? ''}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    aria-label={`Answer for question ${i + 1}`}
                  />
                )}
              </div>
            </BlurFade>
          ))}

          <button className="btn-primary w-full" disabled={busy} onClick={submitPaper}>
            {busy ? 'Marking…' : 'Submit for marking'}
          </button>
        </div>
      )}

      {/* ── Result ───────────────────────────────────────────────────────── */}
      {result && (
        <div className="relative space-y-4">
          <CanvasConfetti ref={confettiRef} />
          <div className="card p-8 text-center">
            <div className="text-[56px] font-semibold leading-[1.07] tracking-[-0.28px]">
              <NumberTicker value={result.percentage} suffix="%" />
            </div>
            <p className="t-body mt-2 text-muted">
              {result.score} of {result.maxScore} marks
              {result.xpAwarded > 0 && ` · +${result.xpAwarded} XP`}
            </p>
            <p className="t-caption mt-1 text-muted">
              {result.percentage >= 80
                ? 'That is a strong paper. The remainder is worth a look while the marking is fresh.'
                : result.percentage >= 50
                  ? 'A solid pass. Read the feedback below before you move on.'
                  : 'Worth re-reading the notes on the questions you lost marks on.'}
            </p>
          </div>

          {result.detail.map((d, i) => (
            <div
              key={d.questionId}
              className={`card border-l-2 ${d.correct ? 'border-l-good' : 'border-l-bad'}`}
            >
              <div className="flex items-center justify-between">
                <span className="t-caption text-muted">Question {i + 1}</span>
                <span
                  className={`t-caption-s tabular-nums ${d.correct ? 'text-good' : 'text-bad'}`}
                >
                  {d.awarded}/{d.marks}
                </span>
              </div>
              <p className="t-caption mt-2 text-ink">{d.feedback}</p>
            </div>
          ))}

          <button
            type="button"
            className="btn-secondary w-full"
            onClick={() => {
              setPaper(null);
              setResult(null);
            }}
          >
            Build another paper
          </button>
        </div>
      )}

      {/* ── Past attempts ────────────────────────────────────────────────── */}
      {info.attempts.length > 0 && !paper && (
        <section className="card">
          <h2 className="t-strong">Past papers</h2>
          <p className="t-caption mt-1 text-muted">Every paper you have sat, most recent first.</p>
          <div className="mt-3 space-y-2">
            {info.attempts.map((a) => {
              const pct = a.maxScore ? Math.round((a.score / a.maxScore) * 100) : 0;
              return (
                <div key={a.id} className="inset flex items-center gap-3 px-4 py-3">
                  <span className="t-caption text-muted">
                    {new Date(a.createdAt).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                  <span className="ml-auto flex items-center gap-3">
                    <span className="meter w-16">
                      <motion.span
                        className="block h-full rounded-full bg-accent"
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={SPRING.meter}
                      />
                    </span>
                    <span className="t-caption-s w-10 text-right tabular-nums">{pct}%</span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
