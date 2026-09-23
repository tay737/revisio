'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type ExamQuestion = { id: string; kind: 'mcq' | 'free_response'; questionMd: string; marks: number; options: { id: string; text: string }[] | null; board: string; sourceYear: number | null };
type Attempt = { id: string; topicIds: string[]; score: number; maxScore: number; createdAt: string; detail?: { questionId: string; awarded: number; marks: number; correct: boolean }[] };
type ExamInfo = { topics: { id: string; name: string }[]; questionsAvailable: number; attempts: Attempt[] };

export default function ExamPage() {
  const [info, setInfo] = useState<ExamInfo | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [count, setCount] = useState(5);
  const [paper, setPaper] = useState<ExamQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ score: number; maxScore: number; percentage: number; detail: { questionId: string; awarded: number; marks: number; correct: boolean; feedback: string }[]; xpAwarded: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadInfo = () => api.get<ExamInfo>('/api/v1/exam').then(setInfo).catch(() => setInfo(null));
  useEffect(() => { loadInfo(); }, []);

  const buildPaper = async () => {
    setBusy(true); setError('');
    try {
      const d = await api.post<{ paper: ExamQuestion[] }>('/api/v1/exam', { topicIds: [...picked], questionCount: count });
      setPaper(d.paper);
      setAnswers({});
      setResult(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to build paper.');
    } finally {
      setBusy(false);
    }
  };

  const submitPaper = async () => {
    if (!paper) return;
    setBusy(true);
    try {
      const payload = paper.map((q) => ({ questionId: q.id, answer: answers[q.id], selectedOptionId: answers[q.id] }));
      const d = await api.post<NonNullable<typeof result>>('/api/v1/exam', { topicIds: [...picked], answers: payload });
      setResult(d);
      loadInfo();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit.');
    } finally {
      setBusy(false);
    }
  };

  if (!info) return <div className="animate-pulse text-muted">Loading…</div>;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Exam simulator</h1>
        <p className="text-sm text-muted">Past-paper style questions, marked against the mark scheme.</p>
      </header>

      {!paper && (
        <div className="card space-y-4">
          <div>
            <span className="label">Topics</span>
            <div className="flex flex-wrap gap-2">
              {info.topics.map((t) => (
                <button key={t.id} onClick={() => setPicked((p) => { const n = new Set(p); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })}
                  className={`chip !px-3 !py-1.5 ${picked.has(t.id) ? '!border-accent !bg-accent/10 !text-accent' : ''}`}>
                  {t.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="label">Questions: {count}</span>
            <input type="range" min={3} max={15} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full accent-[var(--c-accent)]" />
          </div>
          <button className="btn-primary w-full" disabled={picked.size === 0 || busy} onClick={buildPaper}>Generate paper</button>
          {error && <p className="rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
          {info.questionsAvailable === 0 && <p className="text-sm text-muted">No exam questions have been uploaded yet — ask your teacher, or check back soon.</p>}
        </div>
      )}

      {paper && !result && (
        <div className="space-y-3">
          {paper.map((q, i) => (
            <div key={q.id} className="card">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Question {i + 1} · {q.marks} mark{q.marks > 1 ? 's' : ''}{q.sourceYear ? ` · ${q.board} ${q.sourceYear}` : ''}</span>
              </div>
              <p className="mt-2 font-medium">{q.questionMd}</p>
              {q.kind === 'mcq' ? (
                <div className="mt-3 space-y-2">
                  {q.options?.map((o) => (
                    <button key={o.id} onClick={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))}
                      className={`w-full rounded-xl border px-4 py-2.5 text-left text-sm font-medium ${answers[q.id] === o.id ? 'border-accent bg-accent/10 text-accent' : 'border-edge'}`}>
                      {o.text}
                    </button>
                  ))}
                </div>
              ) : (
                <textarea className="input mt-3 min-h-[90px]" placeholder="Write your answer…" value={answers[q.id] ?? ''} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />
              )}
            </div>
          ))}
          <button className="btn-primary w-full" disabled={busy} onClick={submitPaper}>Submit paper for marking</button>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="card text-center">
            <div className="text-4xl font-bold">{result.percentage}%</div>
            <p className="text-sm text-muted">{result.score} / {result.maxScore} marks · +{result.xpAwarded} XP</p>
          </div>
          {result.detail.map((d, i) => (
            <div key={d.questionId} className={`card ${d.correct ? 'border-good/40' : 'border-bad/40'}`}>
              <div className="flex justify-between text-sm font-semibold">
                <span>Q{i + 1}</span>
                <span className={d.correct ? 'text-good' : 'text-bad'}>{d.awarded}/{d.marks}</span>
              </div>
              <p className="mt-1 text-sm text-muted">{d.feedback}</p>
            </div>
          ))}
          <button className="btn-ghost w-full" onClick={() => { setPaper(null); setResult(null); }}>New paper</button>
        </div>
      )}

      {info.attempts.length > 0 && !paper && (
        <section className="card">
          <h2 className="font-semibold">Past attempts</h2>
          <div className="mt-3 space-y-2">
            {info.attempts.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-xl border border-edge px-4 py-2.5 text-sm">
                <span>{new Date(a.createdAt).toLocaleDateString()}</span>
                <span className="font-semibold">{a.score}/{a.maxScore} ({a.maxScore ? Math.round((a.score / a.maxScore) * 100) : 0}%)</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
