'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';

type Subject = { id: string; name: string; description: string; enrolled: boolean; topicCount: number };
type Topic = { id: string; name: string; description: string; visibility: string };
type Lesson = { id: string; title: string; detailedMd: string; summaryMd: string; specRefs: string };

export default function LearnPage() {
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [openSubject, setOpenSubject] = useState<string | null>(null);
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [openTopic, setOpenTopic] = useState<string | null>(null);
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [density, setDensity] = useState<'detailed' | 'summary'>('detailed');

  useEffect(() => {
    api.get<{ subjects: Subject[] }>('/api/v1/subjects').then((d) => setSubjects(d.subjects)).catch(() => setSubjects([]));
  }, []);

  const openTopics = async (subjectId: string) => {
    setOpenSubject(subjectId);
    setTopics(null);
    setOpenTopic(null);
    try {
      const d = await api.get<{ topics: Topic[] }>(`/api/v1/content?subjectId=${subjectId}`);
      setTopics(d.topics);
    } catch {
      setTopics([]);
    }
  };

  const openLessons = async (topicId: string) => {
    setOpenTopic(topicId);
    setLessons(null);
    try {
      const d = await api.get<{ lessons: Lesson[] }>(`/api/v1/lessons?topicId=${topicId}`);
      setLessons(d.lessons);
    } catch {
      setLessons([]);
    }
  };

  if (!subjects) return <div className="animate-pulse text-muted">Loading…</div>;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Learn</h1>
        <p className="text-sm text-muted">Notes tied to the specification. Switch between detailed and summary views.</p>
      </header>

      <div className="space-y-3">
        {subjects.map((s) => (
          <div key={s.id} className="card">
            <button className="flex w-full items-center justify-between text-left" onClick={() => (openSubject === s.id ? setOpenSubject(null) : openTopics(s.id))}>
              <div>
                <h3 className="font-semibold">{s.name}</h3>
                <p className="text-sm text-muted">{s.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="chip">{s.topicCount} topics</span>
                {!s.enrolled && (
                  <span className="btn-ghost !px-3 !py-1 text-xs"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await api.post('/api/v1/subjects', { subjectId: s.id });
                      setSubjects((prev) => prev!.map((x) => (x.id === s.id ? { ...x, enrolled: true } : x)));
                    }}>
                    Enroll
                  </span>
                )}
                <span>{openSubject === s.id ? '▾' : '▸'}</span>
              </div>
            </button>

            {openSubject === s.id && (
              <div className="mt-4 space-y-2 border-t border-edge pt-4">
                {!topics && <p className="text-sm text-muted">Loading topics…</p>}
                {topics?.length === 0 && <p className="text-sm text-muted">No topics yet.</p>}
                {topics?.map((t) => (
                  <div key={t.id} className="rounded-xl border border-edge">
                    <button className="flex w-full items-center justify-between px-4 py-3 text-left" onClick={() => (openTopic === t.id ? setOpenTopic(null) : openLessons(t.id))}>
                      <div>
                        <span className="font-medium">{t.name}</span>
                        {t.visibility === 'private' && <span className="chip ml-2">private</span>}
                        <p className="text-sm text-muted">{t.description}</p>
                      </div>
                      <Link href={`/cram?topic=${t.id}`} className="btn-ghost !px-3 !py-1 text-xs" onClick={(e) => e.stopPropagation()}>Cram</Link>
                    </button>

                    {openTopic === t.id && (
                      <div className="space-y-3 border-t border-edge px-4 py-4">
                        <div className="flex justify-end gap-1 text-xs">
                          {(['detailed', 'summary'] as const).map((d) => (
                            <button key={d} onClick={() => setDensity(d)}
                              className={`rounded-lg px-2.5 py-1 font-medium capitalize ${density === d ? 'bg-accent/10 text-accent' : 'text-muted'}`}>
                              {d} notes
                            </button>
                          ))}
                        </div>
                        {!lessons && <p className="text-sm text-muted">Loading lessons…</p>}
                        {lessons?.length === 0 && <p className="text-sm text-muted">No lessons yet.</p>}
                        {lessons?.map((l) => (
                          <article key={l.id} className="rounded-xl bg-edge/30 p-4">
                            <div className="flex items-center justify-between">
                              <h4 className="font-semibold">{l.title}</h4>
                              {l.specRefs && <span className="chip">Spec {l.specRefs}</span>}
                            </div>
                            <Markdownish text={(density === 'detailed' ? l.detailedMd : l.summaryMd) || l.detailedMd} />
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Minimal markdown-ish renderer: headings, bold, lists, blockquotes. */
function Markdownish({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="mt-3 space-y-1.5 text-sm leading-relaxed">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;
        const bold = (s: string) => s.split(/\*\*(.+?)\*\*/g).map((part, j) => (j % 2 === 1 ? <strong key={j}>{part}</strong> : part));
        const italic = (node: React.ReactNode) => node; // keep simple
        if (line.startsWith('### ')) return <h5 key={i} className="pt-1 font-bold">{bold(line.slice(4))}</h5>;
        if (line.startsWith('## ')) return <h4 key={i} className="pt-1 text-base font-bold">{bold(line.slice(3))}</h4>;
        if (line.startsWith('# ')) return <h3 key={i} className="pt-1 text-lg font-bold">{bold(line.slice(2))}</h3>;
        if (line.startsWith('> ')) return <blockquote key={i} className="border-l-2 border-accent/50 pl-3 text-muted">{bold(line.slice(2))}</blockquote>;
        if (/^[-*] /.test(line)) return <li key={i} className="ml-4 list-disc">{bold(line.slice(2))}</li>;
        if (/^\d+\. /.test(line)) return <li key={i} className="ml-4 list-decimal">{bold(line.replace(/^\d+\. /, ''))}</li>;
        return <p key={i}>{italic(bold(line))}</p>;
      })}
    </div>
  );
}
