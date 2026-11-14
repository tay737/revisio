'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { api } from '@/lib/api';
import { Icon } from '@/components/ui/icons';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/ui/empty-state';
import { Notice } from '@/components/Notice';
import { Markdown } from '@/components/Markdown';
import { NumberTicker } from '@/components/ui/number-ticker';
import { SPRING, transition } from '@/lib/motion';
import PageSkeleton from '@/components/PageSkeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Concept = { id: string; name: string; category: string; description: string };
type Subject = { id: string; name: string; mathsEnabled: boolean };
type PracticeTopic = { id: string; name: string; description: string; sets: { id: string; title: string; conceptCount: number; defaultCount: number; defaultDifficulty: string }[] };
type Question = { questionId: string; conceptId: string; conceptName: string; difficulty: 'easy' | 'medium' | 'hard'; marks: number; prompt: string };
type MarkResult = { questionId: string; correct: boolean; answer: string; solution: string; marks: number };

type Phase =
  | { kind: 'pick' }
  | { kind: 'run' }
  | { kind: 'done' };

/**
 * Practice — the standalone maths tool.
 *
 * This page is deliberately outside the review loop: nothing answered here is
 * scheduled, logged or worth XP. It is a generator a student opens on demand —
 * pick the topics, choose how hard, answer, read the worked solution. The
 * session lives entirely on this page: the server deals ids, and marks each
 * answer by re-deriving the question from its id.
 */
export default function PracticePage() {
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [catalogue, setCatalogue] = useState<Concept[]>([]);
  const [topics, setTopics] = useState<PracticeTopic[] | null>(null);
  const [pickedTopics, setPickedTopics] = useState<Set<string>>(new Set());
  const [pickedConcepts, setPickedConcepts] = useState<Set<string>>(new Set());
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard' | 'mixed'>('mixed');
  const [count, setCount] = useState(10);
  const [phase, setPhase] = useState<Phase>({ kind: 'pick' });
  const [paper, setPaper] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState('');
  const [result, setResult] = useState<MarkResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [log, setLog] = useState<{ q: Question; r: MarkResult }[]>([]);
  const [xp, setXp] = useState<{ xpAwarded: number; capped: boolean } | null>(null);

  const loadSubjects = useCallback(() => {
    api
      .get<{ subjects: Subject[] }>('/api/v1/subjects')
      .then((d) => {
        setSubjects(d.subjects);
        const enabled = d.subjects.filter((s) => s.mathsEnabled);
        if (enabled.length === 1) setSubjectId(enabled[0].id);
      })
      .catch(() => setSubjects([]));
  }, []);

  useEffect(loadSubjects, [loadSubjects]);

  // Topics + catalogue arrive together when a subject is chosen.
  useEffect(() => {
    if (!subjectId) return;
    setTopics(null);
    setPickedTopics(new Set());
    api
      .get<{ concepts: Concept[]; topics: PracticeTopic[] }>(`/api/v1/maths?subjectId=${subjectId}`)
      .then((d) => {
        setCatalogue(d.concepts);
        setTopics(d.topics);
      })
      .catch(() => {
        setCatalogue([]);
        setTopics([]);
      });
  }, [subjectId]);

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const d = await api.post<{ paper: Question[]; count: number }>('/api/v1/maths', {
        action: 'start',
        topicIds: [...pickedTopics],
        conceptIds: pickedConcepts.size > 0 ? [...pickedConcepts] : undefined,
        difficulty,
        count,
      });
      setPaper(d.paper);
      setIdx(0);
      setLog([]);
      setInput('');
      setResult(null);
      setPhase({ kind: 'run' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not start that session.');
    } finally {
      setBusy(false);
    }
  };

  const question = paper[idx] ?? null;

  const submit = async () => {
    if (!question || busy || result) return;
    setBusy(true);
    setError('');
    try {
      const d = await api.post<{ results: MarkResult[] }>('/api/v1/maths', {
        action: 'mark',
        answers: [{ questionId: question.questionId, answer: input }],
      });
      const r = d.results[0];
      setResult(r);
      setLog((l) => [...l, { q: question, r }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That answer did not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    if (idx + 1 >= paper.length) {
      setPhase({ kind: 'done' });
      // Practice XP: the session is complete and marked — award once, here.
      // This touches XP and the league week only; it never writes a review
      // log or moves the SRS schedule.
      const correct = log.filter((l) => l.r.correct).length;
      const marks = log.reduce((n, l) => n + (l.r.correct ? l.r.marks : 0), 0);
      const maxMarks = log.reduce((n, l) => n + l.r.marks, 0);
      api
        .post<{ xpAwarded: number; capped: boolean }>('/api/v1/maths', {
          action: 'award_xp',
          marks,
          maxMarks,
          correct,
          total: log.length,
        })
        .then((d) => setXp({ xpAwarded: d.xpAwarded, capped: d.capped }))
        .catch(() => setXp(null));
      return;
    }
    setIdx((i) => i + 1);
    setInput('');
    setResult(null);
    setError('');
  };

  const restart = () => {
    setPhase({ kind: 'pick' });
    setPaper([]);
    setIdx(0);
    setInput('');
    setResult(null);
    setLog([]);
    setXp(null);
  };

  const score = useMemo(() => {
    const correct = log.filter((l) => l.r.correct).length;
    const marks = log.reduce((n, l) => n + (l.r.correct ? l.r.marks : 0), 0);
    const maxMarks = log.reduce((n, l) => n + l.r.marks, 0);
    return { correct, marks, maxMarks };
  }, [log]);

  if (subjects === null) return <PageSkeleton />;

  const mathsSubjects = subjects.filter((s) => s.mathsEnabled);

  /* ── session runner ──────────────────────────────────────────────────── */
  if (phase.kind === 'run' && question) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <div className="flex items-center justify-between">
          <span className="t-caption tabular-nums text-muted-foreground">
            {idx + 1} <span className="text-border">/</span> {paper.length}
          </span>
          <Badge variant="chip">
            <Icon name="correct" size={14} className="text-foreground" />
            <NumberTicker value={score.correct} className="tabular-nums" />
            <span>/ {log.length} correct</span>
          </Badge>
        </div>
        <div className="meter">
          <motion.div className="h-full rounded-full bg-primary" animate={{ width: `${(idx / paper.length) * 100}%` }} transition={SPRING.meter} />
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={question.questionId + (result ? ':v' : ':q')}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={transition.quick}
          >
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant="chip-active">{question.conceptName}</Badge>
                <span className="flex items-center gap-2">
                  <Badge variant="chip" className="capitalize">{question.difficulty}</Badge>
                  <span className="t-caption tabular-nums text-muted-foreground">{question.marks} {question.marks === 1 ? 'mark' : 'marks'}</span>
                </span>
              </div>

              <Markdown text={question.prompt} className="mt-5 t-lead [&_p]:leading-snug" />

              {!result && (
                <form
                  className="mt-5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submit();
                  }}
                >
                  <Input
                    type="text"
                    className="t-lead-airy"
                    placeholder="Type your answer"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    autoFocus
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    enterKeyHint="done"
                    aria-label="Your answer"
                  />
                  <Button type="submit" variant="good" size="lg" className="mt-3 w-full" disabled={!input.trim() || busy}>
                    {busy ? 'Marking…' : 'Check answer'}
                  </Button>
                  <p className="mt-2 text-center t-fine text-muted-foreground">Fractions like 3/4, or expressions like 2x+6, all mark.</p>
                </form>
              )}

              {result && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={SPRING.soft} className="overflow-hidden">
                  <div className={`mt-5 rounded-[11px] px-4 py-3.5 ${result.correct ? 'bg-good-soft' : 'bg-destructive/10'}`}>
                    <div className={`flex items-center gap-2 t-lead-airy font-semibold ${result.correct ? 'text-good-strong' : 'text-destructive-ink'}`}>
                      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-white ${result.correct ? 'bg-good' : 'bg-destructive'}`}>
                        <Icon name={result.correct ? 'correct' : 'close'} size={16} strokeWidth={3} />
                      </span>
                      {result.correct ? 'Correct' : 'Not quite'}
                      <span className="t-caption ml-auto font-normal text-muted-foreground tabular-nums">
                        {result.marks} {result.marks === 1 ? 'mark' : 'marks'}
                      </span>
                    </div>
                    {!result.correct && (
                      <div className="inset mt-2.5 px-3 py-2">
                        <span className="t-micro uppercase tracking-[0.08em] text-muted-foreground">Answer</span>
                        <p className="t-caption mt-0.5 text-foreground">{result.answer}</p>
                      </div>
                    )}
                    <div className="inset mt-2.5 px-3 py-2">
                      <span className="t-micro uppercase tracking-[0.08em] text-muted-foreground">Worked solution</span>
                      <Markdown text={result.solution} className="mt-1 t-caption" />
                    </div>
                    <Button onClick={next} variant="primary" className="mt-4 w-full gap-2">
                      {idx + 1 >= paper.length ? 'See results' : 'Next'}
                      <Icon name="next" size={17} />
                    </Button>
                  </div>
                </motion.div>
              )}

              <Notice tone="bad" className="mt-3">{error}</Notice>
            </Card>
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  /* ── session report ──────────────────────────────────────────────────── */
  if (phase.kind === 'done') {
    const pct = score.maxMarks > 0 ? Math.round((score.marks / score.maxMarks) * 100) : 0;
    const missed = log.filter((l) => !l.r.correct);
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Card className="p-8 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-secondary">
            <Icon name="target" size={22} />
          </span>
          <h1 className="t-tagline mt-4">Practice complete</h1>
          <div className="t-display-md num mt-2">
            <NumberTicker value={pct} />%
          </div>
          <p className="t-body mt-1 text-muted-foreground">
            {score.correct} of {log.length} correct · {score.marks} of {score.maxMarks} marks
          </p>
          <p className="t-caption mt-1 text-muted-foreground">Practice never touches your review schedule.</p>
          {xp && xp.xpAwarded > 0 && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 t-caption font-semibold">
              <Icon name="xp" size={14} />
              +{xp.xpAwarded} XP
              {xp.capped && <span className="font-normal text-muted-foreground">· capped this hour</span>}
            </p>
          )}
          <div className="mt-5 flex justify-center gap-2">
            <Button type="button" variant="primary" onClick={restart}>
              New session
            </Button>
          </div>
        </Card>

        {missed.length > 0 && (
          <Card as="section">
            <h2 className="t-strong">Worth another look</h2>
            <p className="t-caption mt-1 text-muted-foreground">The ones that went wrong, with their worked solutions.</p>
            <div className="mt-3 space-y-3">
              {missed.map(({ q, r }) => (
                <div key={q.questionId} className="inset px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="chip">{q.conceptName}</Badge>
                    <span className="t-caption-s text-muted-foreground">Answer: <span className="font-semibold text-foreground">{r.answer}</span></span>
                  </div>
                  <Markdown text={q.prompt} className="mt-2 t-body" />
                  <Markdown text={r.solution} className="mt-1 t-caption text-muted-foreground" />
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    );
  }

  /* ── picker ──────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-6">
      <PageHeader icon="practice" title="Practice" subtitle="Generate maths questions. Your schedule stays out of it." />

      {mathsSubjects.length === 0 ? (
        <EmptyState
          icon="practice"
          title="No subject has maths practice yet"
          body="A developer or teacher turns maths practice on per subject. Once one has it, its topics appear here."
        />
      ) : (
        <Card className="space-y-5">
          <div>
            <Label>Subject</Label>
            <div className="flex flex-wrap gap-2">
              {mathsSubjects.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={subjectId === s.id}
                  onClick={() => setSubjectId(s.id)}
                  className={`chip transition-colors duration-150 ${subjectId === s.id ? 'chip-active' : ''}`}
                >
                  {subjectId === s.id && <Icon name="correct" size={13} />}
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          {subjectId && (
            <>
              <div>
                <Label>Topics</Label>
                {topics === null && <p className="t-caption text-muted-foreground">Loading…</p>}
                {topics?.length === 0 && <p className="t-caption text-muted-foreground">No topics reach you in this subject yet.</p>}
                <div className="flex flex-wrap gap-2">
                  {topics?.map((t) => {
                    const on = pickedTopics.has(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setPickedTopics((p) => {
                            const n = new Set(p);
                            if (n.has(t.id)) n.delete(t.id);
                            else n.add(t.id);
                            return n;
                          })
                        }
                        className={`chip transition-colors duration-150 ${on ? 'chip-active' : ''}`}
                      >
                        {on && <Icon name="correct" size={13} />}
                        {t.name}
                        {t.sets.length > 0 && <span className="text-muted-foreground">{t.sets.length}</span>}
                      </button>
                    );
                  })}
                </div>
                <p className="t-caption mt-1.5 text-muted-foreground">
                  {pickedTopics.size === 0 ? 'No topic selected — questions come from every concept.' : 'Question sets a teacher pinned to these topics are counted.'}
                </p>
              </div>

              <details className="inset px-4 py-3">
                <summary className="flex cursor-pointer items-center gap-2 t-caption font-semibold">
                  <Icon name="filter" size={15} />
                  Focus concepts
                  <Badge variant="chip" className="ml-1">{pickedConcepts.size || 'all'}</Badge>
                  <Icon name="collapse" size={14} className="ml-auto text-muted-foreground" />
                </summary>
                <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
                  {catalogue.map((c) => {
                    const on = pickedConcepts.has(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setPickedConcepts((p) => {
                            const n = new Set(p);
                            if (n.has(c.id)) n.delete(c.id);
                            else n.add(c.id);
                            return n;
                          })
                        }
                        className={`flex items-start gap-2 rounded-[11px] border px-3 py-2 text-left transition-colors duration-150 ${on ? 'border-foreground bg-secondary' : 'border-border/70 hover:bg-border/20'}`}
                      >
                        <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-[4px] border ${on ? 'border-foreground bg-foreground text-background' : 'border-border-strong'}`}>
                          {on && <Icon name="correct" size={11} strokeWidth={3} />}
                        </span>
                        <span className="min-w-0">
                          <span className="t-caption block font-semibold text-foreground">{c.name}</span>
                          <span className="t-fine block truncate text-muted-foreground">{c.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </details>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <Label>Difficulty</Label>
                  <div className="flex gap-1 rounded-[11px] border border-border/70 bg-card/60 p-1">
                    {(['easy', 'medium', 'hard', 'mixed'] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDifficulty(d)}
                        aria-pressed={difficulty === d}
                        className={`segment flex-1 capitalize ${difficulty === d ? 'segment-active' : ''}`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label htmlFor="practice-count">
                    Questions — {count}
                  </Label>
                  <input id="practice-count" type="range" min={5} max={30} step={5} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full" />
                </div>
              </div>

              <Button variant="primary" className="w-full gap-2" disabled={busy} onClick={start}>
                <Icon name="start" size={18} />
                {busy ? 'Generating…' : 'Generate questions'}
              </Button>
            </>
          )}
        </Card>
      )}

      <Notice tone="bad">{error}</Notice>

      <p className="t-caption text-center text-muted-foreground">
        Looking for your spaced reviews? That is <Link href="/review" className="text-foreground underline underline-offset-4">Review</Link> — practice here never changes it.
      </p>
    </div>
  );
}
