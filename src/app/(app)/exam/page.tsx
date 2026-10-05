'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { api } from '@/lib/api';
import { Icon } from '@/components/ui/icons';
import { PageHeader } from '@/components/PageHeader';
import { Notice } from '@/components/Notice';
import { BlurFade } from '@/components/ui/blur-fade';
import { NumberTicker } from '@/components/ui/number-ticker';
import { Confetti, type ConfettiRef } from '@/components/ui/confetti';
import { SPRING } from '@/lib/motion';
import PageSkeleton from '@/components/PageSkeleton';
import { Markdown } from '@/components/Markdown';

type AoSplit = { ao: string; marks: number };
type ExamQuestion = {
  id: string;
  kind: 'mcq' | 'free_response';
  questionMd: string;
  marks: number;
  options: { id: string; text: string }[] | null;
  board: string;
  sourceYear: number | null;
  aoSplit: AoSplit[] | null;
  qwcMarks: number;
  questionRef: string;
  specRefs: string;
};
type StoredPaper = {
  id: string;
  title: string;
  kind: 'question_paper' | 'mark_scheme' | 'formulae_sheet' | 'other';
  board: string;
  series: string;
  paperCode: string;
  totalMarks: number | null;
  durationMinutes: number | null;
};
type Attempt = {
  id: string;
  topicIds: string[];
  score: number;
  maxScore: number;
  createdAt: string;
};
type PaperDoc = {
  id: string;
  title: string;
  kind: string;
  contentMd: string;
  board: string;
  series: string;
  paperCode: string;
  totalMarks: number | null;
  durationMinutes: number | null;
};

const AO_EXPLAINER: Record<string, { label: string; description: string }> = {
  AO1: {
    label: 'Knowledge & understanding',
    description:
      'Recall marks. Awarded for stating accurate facts, definitions and terms — naming the thing correctly. No context needed: a correct fact is a mark even in isolation.',
  },
  AO2: {
    label: 'Application',
    description:
      'Application marks. Awarded for using knowledge in the scenario given — the answer must refer to the context (the club, the college, the data), not just state general theory.',
  },
  AO3: {
    label: 'Analysis & evaluation',
    description:
      'Reasoning marks. Awarded for chains of reasoning: weighing options, drawing conclusions, making justified judgements. "This means… therefore… which affects the business because…"',
  },
};

const PAPER_KIND_LABEL: Record<string, string> = {
  question_paper: 'Question paper',
  mark_scheme: 'Mark scheme',
  formulae_sheet: 'Formulae sheet',
  other: 'Document',
};

/**
 * One-sentence revision directive from the AO profile: name the weakest
 * objective and say what practising it means. Ties only when every objective
 * scored the same — in that case say the honest thing.
 */
function aoDirective(profile: { ao: string; percentage: number }[]): string {
  const sorted = [...profile].sort((a, b) => a.percentage - b.percentage);
  const weakest = sorted[0];
  const strongest = sorted[sorted.length - 1];
  const label = (ao: string) => AO_EXPLAINER[ao]?.label.toLowerCase() ?? ao;
  if (sorted.length > 1 && weakest.percentage === strongest.percentage) {
    return 'Every objective scored the same — revise the questions you lost, whatever kind of mark they were.';
  }
  if (weakest.percentage >= strongest.percentage - 10) {
    return `Marks are spread evenly across objectives. Revise from the per-question breakdown below.`;
  }
  return `Your weakest objective is ${weakest.ao} (${label(weakest.ao)}) at ${weakest.percentage}% — ${
    weakest.ao === 'AO1'
      ? 're-read the notes for the facts and definitions you were expected to state.'
      : weakest.ao === 'AO2'
        ? 'practise tying your answers to the scenario — every point should name the business, person or data in the question.'
        : 'practise finishing answers with a reasoned judgement: weigh both sides, then decide.'
  }`;
}

type Marked = {
  score: number;
  maxScore: number;
  percentage: number;
  detail: {
    questionId: string;
    awarded: number;
    marks: number;
    correct: boolean;
    feedback: string;
    userAnswer?: string;
    questionRef: string;
    aoSplit: AoSplit[] | null;
    modelAnswerMd: string;
    markSchemeMd: string;
    markingNotesMd: string;
    qwcMarks: number;
    matchedPhrases: string[];
    missedPhrases: string[];
  }[];
  xpAwarded: number;
  aoProfile: { ao: string; awarded: number; available: number; percentage: number }[] | null;
};
type ExamInfo = { topics: { id: string; name: string }[]; questionsAvailable: number; papers: StoredPaper[]; attempts: Attempt[] };

/**
 * Exam simulator.
 *
 * Behaviour is unchanged; the presentation now reflects what an exam actually
 * is. The paper is a numbered deck (sticky counter, per-question marks in the
 * header), unanswered questions are visible at a glance, and the result leads
 * with the percentage rather than the raw fraction — that is the number a
 * student actually wants first.
 *
 * The result also teaches how the marks were awarded: each question shows its
 * AO split, the key points hit and missed, the mark scheme, and a model answer
 * to compare against — so a student learns why marks are given, not just what
 * they scored. The board's own stored papers, mark schemes and formulae sheets
 * sit below the builder, readable in place.
 */
export default function ExamPage() {
  const [info, setInfo] = useState<ExamInfo | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [count, setCount] = useState(5);
  const [paper, setPaper] = useState<ExamQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Marked | null>(null);
  const [openDoc, setOpenDoc] = useState<string | null>(null);
  const [doc, setDoc] = useState<PaperDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confettiRef = useRef<ConfettiRef>(null);
  const resultHeadingRef = useRef<HTMLDivElement>(null);

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

  const openPaperDoc = async (paper: StoredPaper) => {
    setOpenDoc(paper.id);
    setDoc(null);
    try {
      const d = await api.get<{ paper: PaperDoc }>(`/api/v1/exam?paperId=${paper.id}`);
      setDoc(d.paper);
    } catch {
      setDoc(null);
      setOpenDoc(null);
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
      if (d.percentage >= 80) {
        void confettiRef.current?.fire({
          particleCount: 80,
          spread: 70,
          origin: { x: 0.5, y: 0.4 },
          disableForReducedMotion: true,
        });
      }
      // The submitted form unmounts, which would leave keyboard and screen-reader
      // users at the top of the page with no announcement — move focus to the
      // result and let the live region read the score.
      requestAnimationFrame(() => resultHeadingRef.current?.focus());
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
        subtitle="Marked against the mark scheme."
        actions={
          result && (
            <button
              type="button"
              className="btn btn-secondary"
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
              <p className="t-caption text-muted-foreground">No exam topics are available on this deployment yet.</p>
            ) : (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Topics in this paper">
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
              className="w-full"
            />
            <p className="t-caption mt-1.5 text-muted-foreground">
              {info.questionsAvailable === 0
                ? 'No exam questions have been uploaded yet — ask your teacher, or check back soon.'
                : `${info.questionsAvailable} ${info.questionsAvailable === 1 ? 'question is' : 'questions are'} available across your topics.`}
            </p>
          </div>

          <button
            className="btn btn-primary w-full gap-2"
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
          <div className="glass-bar sticky top-[52px] z-10 -mx-4 flex items-center justify-between border-b border-border/70 px-4 py-2.5 md:-mx-6 md:px-6">
            <span className="t-caption text-muted-foreground" role="status">
              <span className="sr-only">Answered </span>
              <span className="tabular-nums font-semibold text-foreground">{answeredCount}</span> of{' '}
              <span className="tabular-nums">{paper.length}</span> answered
            </span>
            <span className="chip">
              <Icon name="spec" size={13} className="text-primary" />
              <span className="tabular-nums">
                {paper.reduce((sum, q) => sum + q.marks, 0)} marks
              </span>
            </span>
          </div>

          {paper.map((q, i) => (
            <BlurFade key={q.id} delay={Math.min(i * 0.04, 0.2)}>
              <div className="card">
                <div className="flex items-center justify-between text-[14px] leading-[1.43] tracking-[-0.224px] text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-[12px] font-semibold text-primary">
                      {i + 1}
                    </span>
                    {q.marks} {q.marks === 1 ? 'mark' : 'marks'}
                    {q.qwcMarks > 0 && <span className="tabular-nums">+ {q.qwcMarks} QWC</span>}
                  </span>
                  {q.sourceYear && (
                    <span className="chip">
                      {q.board} {q.sourceYear}
                    </span>
                  )}
                </div>

                <Markdown text={q.questionMd} className="mt-3" />

                {(q.aoSplit?.length || q.qwcMarks > 0) && (
                  <p className="t-caption mt-2 text-muted-foreground">
                    {q.aoSplit?.map((a) => `${a.ao} ${a.marks}`).join(' · ')}
                    {q.aoSplit?.length && q.qwcMarks > 0 ? ' · ' : ''}
                    {q.qwcMarks > 0 && `${q.qwcMarks} QWC`}
                  </p>
                )}

                {q.kind === 'mcq' ? (
                  <div className="mt-3 space-y-2">
                    {q.options?.map((o) => (
                      <motion.button
                        key={o.id}
                        type="button"
                        whileTap={{ scale: 0.99 }}
                        onClick={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))}
                        aria-pressed={answers[q.id] === o.id}
                        className={`option ${answers[q.id] === o.id ? 'option-selected font-semibold' : 'hover:bg-border/20'}`}
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

          <button className="btn btn-primary w-full" disabled={busy} onClick={submitPaper}>
            {busy ? 'Marking…' : 'Submit for marking'}
          </button>
        </div>
      )}

      {/* ── Result ───────────────────────────────────────────────────────── */}
      {result && (
        <div className="relative space-y-4">
          <Confetti ref={confettiRef} className="pointer-events-none fixed inset-0 z-[60]" />
          <div className="card p-8 text-center" tabIndex={-1} ref={resultHeadingRef}>
            <div className="t-num" role="status">
              <span className="sr-only">You scored </span>
              <NumberTicker value={result.percentage} className="num" />%
            </div>
            <p className="t-body mt-2 text-muted-foreground">
              {result.score} of {result.maxScore} marks
              {result.xpAwarded > 0 && ` · +${result.xpAwarded} XP`}
            </p>
            <p className="t-caption mt-1 text-muted-foreground">
              {result.percentage >= 80
                ? 'That is a strong paper. The remainder is worth a look while the marking is fresh.'
                : result.percentage >= 50
                  ? 'A solid pass. Read the feedback below before you move on.'
                  : 'Worth re-reading the notes on the questions you lost marks on.'}
            </p>
          </div>

          {result.detail.map((d, i) => (
            <ResultDetail key={d.questionId} d={d} index={i} />
          ))}

          {result.aoProfile && result.aoProfile.length > 0 && (
            <div className="card space-y-2">
              <div className="flex items-baseline justify-between">
                <h2 className="t-strong">Where the marks went</h2>
                <span className="t-caption text-muted-foreground">marks earned by assessment objective</span>
              </div>
              {result.aoProfile.map((row) => {
                const guide = AO_EXPLAINER[row.ao];
                return (
                  <div key={row.ao} className="inset px-3 py-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="t-caption font-semibold">
                        {row.ao} — {guide?.label ?? 'Assessment objective'}
                      </span>
                      <span className="t-caption-s tabular-nums text-muted-foreground">
                        {row.awarded}/{row.available} · {row.percentage}%
                      </span>
                    </div>
                    {guide && <p className="t-fine mt-0.5 text-muted-foreground">{guide.description}</p>}
                  </div>
                );
              })}
              <p className="t-caption text-muted-foreground">
                {aoDirective(result.aoProfile)}
              </p>
            </div>
          )}

          <button
            type="button"
            className="btn btn-secondary w-full"
            onClick={() => {
              setPaper(null);
              setResult(null);
            }}
          >
            Build another paper
          </button>
        </div>
      )}

      {/* ── Stored board papers ─────────────────────────────────────────── */}
      {!paper && info.papers.length > 0 && (
        <section className="card">
          <h2 className="t-strong">Real papers &amp; mark schemes</h2>
          <p className="t-caption mt-1 text-muted-foreground">
            The board's own documents, extracted from the originals. The mark scheme is the most honest revision guide
            there is — read it beside the notes.
          </p>
          <div className="mt-3 space-y-2">
            {info.papers.map((p) => {
              const open = openDoc === p.id;
              return (
                <div key={p.id} className="inset px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`chip ${p.kind === 'question_paper' ? 'chip-active' : ''}`}>
                      {PAPER_KIND_LABEL[p.kind] ?? 'Document'}
                    </span>
                    <span className="t-strong min-w-0 flex-1 truncate">{p.title}</span>
                    {p.totalMarks != null && (
                      <span className="t-caption-s tabular-nums text-muted-foreground">{p.totalMarks} marks</span>
                    )}
                    <button
                      type="button"
                      aria-expanded={open}
                      className="btn btn-ghost btn-sm shrink-0 gap-1.5"
                      onClick={() => (open ? setOpenDoc(null) : void openPaperDoc(p))}
                    >
                      <Icon name={open ? 'collapse' : 'expand'} size={14} />
                      {open ? 'Hide' : 'Open'}
                    </button>
                  </div>
                  {(p.series || p.paperCode || p.durationMinutes) && (
                    <p className="t-caption mt-1 text-muted-foreground">
                      {[p.board, p.series, p.paperCode, p.durationMinutes ? `${p.durationMinutes} min` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}
                  {open && (
                    <div className="mt-3 border-t border-border/60 pt-3">
                      {doc === null ? (
                        <p className="t-caption text-muted-foreground" role="status">
                          Loading…
                        </p>
                      ) : (
                        <Markdown text={doc.contentMd} className="text-[14px]" />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Past attempts ────────────────────────────────────────────────── */}
      {info.attempts.length > 0 && !paper && (
        <section className="card">
          <h2 className="t-strong">Your attempts</h2>
          <p className="t-caption mt-1 text-muted-foreground">Every paper you have sat, most recent first.</p>
          <div className="mt-3 space-y-2">
            {info.attempts.map((a) => {
              const pct = a.maxScore ? Math.round((a.score / a.maxScore) * 100) : 0;
              return (
                <div key={a.id} className="inset flex items-center gap-3 px-4 py-3">
                  <span className="t-caption text-muted-foreground">
                    {new Date(a.createdAt).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                  <span className="ml-auto flex items-center gap-3">
                    <span className="meter w-16">
                      <motion.span
                        className="block h-full rounded-full bg-primary"
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

/**
 * One marked question in the result list: score, AO split with a plain-English
 * explanation of what that objective pays for, the key points hit and missed,
 * and (in a details disclosure) the mark scheme and a model answer to compare
 * against. The disclosure keeps the result scannable while making the full
 * marking material one tap away — reading it is the point of the review.
 */
function ResultDetail({ d, index }: { d: Marked['detail'][number]; index: number }) {
  const [open, setOpen] = useState(false);
  const label = d.questionRef ? `Question ${d.questionRef}` : `Question ${index + 1}`;
  const total = d.marks + (d.qwcMarks ?? 0);
  return (
    <div className={`card border-l-2 ${d.correct ? 'border-l-good' : 'border-l-bad'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="t-caption text-muted-foreground">{label}</span>
        <span className={`t-caption-s tabular-nums ${d.correct ? 'text-good-strong' : 'text-destructive-ink'}`}>
          {d.awarded}/{total}
        </span>
      </div>
      <p className="t-caption mt-2 text-foreground">{d.feedback}</p>

      {d.matchedPhrases.length > 0 && (
        <p className="t-caption mt-2">
          <span className="text-muted-foreground">Points covered: </span>
          {d.matchedPhrases.map((p, i) => (
            <Fragment key={i}>
              {i > 0 && ' · '}
              <span className="text-good">{p}</span>
            </Fragment>
          ))}
        </p>
      )}
      {d.missedPhrases.length > 0 && (
        <p className="t-caption mt-1">
          <span className="text-muted-foreground">Missing for more marks: </span>
          {d.missedPhrases.slice(0, 5).map((p, i) => (
            <Fragment key={i}>
              {i > 0 && ' · '}
              <span className="text-foreground">{p}</span>
            </Fragment>
          ))}
        </p>
      )}

      {d.aoSplit && d.aoSplit.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <span className="t-micro uppercase tracking-[0.08em] text-muted-foreground">Where the marks live</span>
          {d.aoSplit.map((a) => {
            const guide = AO_EXPLAINER[a.ao];
            return (
              <div key={a.ao} className="inset px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="t-caption font-semibold">
                    {a.ao} — {guide?.label ?? 'Assessment objective'}
                  </span>
                  <span className="t-caption-s shrink-0 tabular-nums text-muted-foreground">
                    {a.marks} {a.marks === 1 ? 'mark' : 'marks'}
                  </span>
                </div>
                {guide && <p className="t-fine mt-0.5 text-muted-foreground">{guide.description}</p>}
              </div>
            );
          })}
          {d.qwcMarks > 0 && (
            <p className="t-caption text-muted-foreground">
              Plus {d.qwcMarks} QWC {d.qwcMarks === 1 ? 'mark' : 'marks'} for quality of written communication — clear
              structure, controlled grammar, and the subject's technical terms used properly.
            </p>
          )}
        </div>
      )}

      {(d.markSchemeMd || d.modelAnswerMd || d.markingNotesMd) && (
        <div className="mt-3">
          <button type="button" aria-expanded={open} className="btn btn-ghost btn-sm gap-1.5" onClick={() => setOpen(!open)}>
            <Icon name={open ? 'collapse' : 'expand'} size={13} />
            {open ? 'Hide marking material' : 'Mark scheme & model answer'}
          </button>
          {open && (
            <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
              {d.markingNotesMd && (
                <div>
                  <span className="t-micro uppercase tracking-[0.08em] text-muted-foreground">How an examiner marks this</span>
                  <Markdown text={d.markingNotesMd} className="mt-1 text-[14px]" />
                </div>
              )}
              {d.markSchemeMd && (
                <div>
                  <span className="t-micro uppercase tracking-[0.08em] text-muted-foreground">Mark scheme</span>
                  <Markdown text={d.markSchemeMd} className="mt-1 text-[14px] text-muted-foreground" />
                </div>
              )}
              {d.modelAnswerMd && (
                <div>
                  <span className="t-micro uppercase tracking-[0.08em] text-muted-foreground">Model answer</span>
                  <Markdown text={d.modelAnswerMd} className="mt-1 text-[14px]" />
                </div>
              )}
              {d.userAnswer && (
                <div>
                  <span className="t-micro uppercase tracking-[0.08em] text-muted-foreground">Your answer</span>
                  <p className="t-caption mt-1 whitespace-pre-wrap text-foreground">{d.userAnswer}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
