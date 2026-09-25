'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { api } from '@/lib/api';
import { Icon } from '@/components/ui/icons';
import { PageHeader } from '@/components/PageHeader';
import { BlurFade } from '@/components/ui/blur-fade';
import { SPRING } from '@/lib/motion';
import { ScrollProgress } from '@/components/ui/scroll-progress';
import PageSkeleton from '@/components/PageSkeleton';

type Subject = { id: string; name: string; description: string; enrolled: boolean; topicCount: number };
type Topic = { id: string; name: string; description: string; visibility: string };
type Lesson = { id: string; title: string; detailedMd: string; summaryMd: string; specRefs: string };

/**
 * Learn — the reading surface.
 *
 * Structure is unchanged (subject → topic → notes) but the hierarchy is now
 * legible at a glance: chevrons replace the ▾/▸ glyphs, the subject row carries
 * an enrolment state rather than a floating "Enroll" label, and the notes
 * render at the spec's 17px body size instead of 14px, which is what makes a
 * page of prose read as an article rather than a tooltip.
 *
 * Subjects are loaded once; topics and lessons load on demand and cache in
 * route state, so re-opening a subject does not refetch.
 */
export default function LearnPage() {
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [openSubject, setOpenSubject] = useState<string | null>(null);
  const [topicsBySubject, setTopicsBySubject] = useState<Record<string, Topic[]>>({});
  const [openTopic, setOpenTopic] = useState<string | null>(null);
  const [lessonsByTopic, setLessonsByTopic] = useState<Record<string, Lesson[]>>({});
  const [density, setDensity] = useState<'detailed' | 'summary'>('detailed');
  const [busyTopic, setBusyTopic] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ subjects: Subject[] }>('/api/v1/subjects')
      .then((d) => setSubjects(d.subjects))
      .catch(() => setSubjects([]));
  }, []);

  const toggleSubject = async (subjectId: string) => {
    if (openSubject === subjectId) {
      setOpenSubject(null);
      return;
    }
    setOpenSubject(subjectId);
    setOpenTopic(null);
    if (topicsBySubject[subjectId]) return;
    try {
      const d = await api.get<{ topics: Topic[] }>(`/api/v1/content?subjectId=${subjectId}`);
      setTopicsBySubject((prev) => ({ ...prev, [subjectId]: d.topics }));
    } catch {
      setTopicsBySubject((prev) => ({ ...prev, [subjectId]: [] }));
    }
  };

  const toggleTopic = async (topicId: string) => {
    if (openTopic === topicId) {
      setOpenTopic(null);
      return;
    }
    setOpenTopic(topicId);
    if (lessonsByTopic[topicId]) return;
    try {
      const d = await api.get<{ lessons: Lesson[] }>(`/api/v1/lessons?topicId=${topicId}`);
      setLessonsByTopic((prev) => ({ ...prev, [topicId]: d.lessons }));
    } catch {
      setLessonsByTopic((prev) => ({ ...prev, [topicId]: [] }));
    }
  };

  const enroll = async (subject: Subject) => {
    setBusyTopic(subject.id);
    try {
      await api.post('/api/v1/subjects', { subjectId: subject.id });
      setSubjects((prev) => prev?.map((x) => (x.id === subject.id ? { ...x, enrolled: true } : x)) ?? prev);
    } finally {
      setBusyTopic(null);
    }
  };

  if (!subjects) return <PageSkeleton />;

  const topics = openSubject ? topicsBySubject[openSubject] : undefined;

  return (
    <div className="space-y-6">
      {/* Reading progress on long notes. Magic UI ships this in its own brand
          gradient — four colours in a system that allows one, so it is
          overridden to ink. `!bg-none` is required: the gradient is a
          background-image and the colour alone would be painted over. */}
      <ScrollProgress className="h-0.5 !bg-none bg-foreground" />

      <PageHeader
        icon="learn"
        title="Learn"
        subtitle="Notes for every topic."
        actions={
          <div className="flex gap-1 rounded-[11px] border border-border/70 bg-card/60 p-1 backdrop-blur">
            {(['detailed', 'summary'] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDensity(d)}
                aria-pressed={density === d}
                className={`segment ${density === d ? 'segment-active' : ''}`}
              >
                {d}
              </button>
            ))}
          </div>
        }
      />

      {subjects.length === 0 && (
        <div className="card p-8 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
            <Icon name="library2" size={22} />
          </span>
          <h2 className="t-tagline mt-4">Nothing published yet</h2>
          <p className="t-caption mt-2 text-muted-foreground">
            No subjects are available on this deployment. Create your own in My content, or ask a teacher to publish one.
          </p>
          <Link href="/library" className="btn btn-primary mt-5 inline-flex">
            Go to My content
          </Link>
        </div>
      )}

      <div className="space-y-3">
        {subjects.map((s, i) => {
          const open = openSubject === s.id;
          return (
            <BlurFade key={s.id} delay={Math.min(i * 0.04, 0.24)}>
              <section className="card p-0">
                {/* Two real buttons side by side: the row toggles, "Follow"
                    subscribes. Nesting a second control inside the first was
                    invalid markup and broke keyboard use. */}
                <div className="flex w-full items-center gap-3 p-5">
                  <button
                    type="button"
                    onClick={() => toggleSubject(s.id)}
                    aria-expanded={open}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                      <Icon name="topic" size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="t-strong block">{s.name}</span>
                      <span className="t-caption mt-0.5 block text-muted-foreground">{s.description}</span>
                    </span>
                    <span className="chip shrink-0">
                      {s.topicCount} {s.topicCount === 1 ? 'topic' : 'topics'}
                    </span>
                    <motion.span
                      animate={{ rotate: open ? 90 : 0 }}
                      transition={SPRING.press}
                      className="shrink-0 text-muted-foreground"
                    >
                      <Icon name="expand" size={16} />
                    </motion.span>
                  </button>

                  {!s.enrolled && (
                    <button
                      type="button"
                      onClick={() => enroll(s)}
                      disabled={busyTopic === s.id}
                      className="btn btn-secondary btn-sm shrink-0"
                    >
                      {busyTopic === s.id ? 'Adding…' : 'Follow'}
                    </button>
                  )}
                </div>

                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={SPRING.soft}
                      className="overflow-hidden"
                    >
                      <div className="space-y-2 border-t border-border/70 px-5 py-4">
                        {topics === undefined && <p className="t-caption text-muted-foreground">Loading topics…</p>}
                        {topics?.length === 0 && (
                          <p className="t-caption text-muted-foreground">No topics under this subject yet.</p>
                        )}
                        {topics?.map((t) => {
                          const topicOpen = openTopic === t.id;
                          const lessons = lessonsByTopic[t.id];
                          return (
                            <div key={t.id} className="inset overflow-hidden">
                              {/* One column on a phone, one row on a laptop. Inline,
                                  the two actions squeezed the title into a sliver
                                  of one word per line and sat on top of it; the
                                  title now owns the full width and the actions
                                  get their own row of two equal targets. */}
                              <div className="px-4 py-3 sm:flex sm:items-center sm:gap-2 sm:pr-3 sm:py-0">
                                <button
                                  type="button"
                                  onClick={() => toggleTopic(t.id)}
                                  aria-expanded={topicOpen}
                                  className="flex w-full min-w-0 items-center gap-3 text-left sm:flex-1 sm:py-3"
                                >
                                  <motion.span animate={{ rotate: topicOpen ? 90 : 0 }} transition={SPRING.press} className="shrink-0 text-muted-foreground">
                                    <Icon name="expand" size={14} />
                                  </motion.span>
                                  <span className="min-w-0 flex-1">
                                    <span className="t-strong flex flex-wrap items-center gap-2">
                                      {t.name}
                                      {t.visibility === 'private' && (
                                        <span className="chip">
                                          <Icon name="private" size={12} />
                                          private
                                        </span>
                                      )}
                                    </span>
                                    {t.description && (
                                      <span className="t-caption mt-0.5 block text-muted-foreground">{t.description}</span>
                                    )}
                                  </span>
                                </button>
                                {/* Meeting a topic's questions for the first time is a
                                    different intention from cramming them, so it gets the
                                    ink button and the notes travel with it. */}
                                <div className="mt-3 flex gap-2 sm:mt-0 sm:shrink-0">
                                  <Link
                                    href={`/review?topic=${t.id}`}
                                    className="btn btn-primary btn-sm flex-1 justify-center gap-1.5 sm:flex-none"
                                  >
                                    <Icon name="learn" size={14} />
                                    Learn
                                  </Link>
                                  <Link
                                    href={`/cram?topic=${t.id}`}
                                    className="btn btn-secondary btn-sm flex-1 justify-center gap-1.5 sm:flex-none"
                                  >
                                    <Icon name="cram" size={14} />
                                    Cram
                                  </Link>
                                </div>
                              </div>

                              <AnimatePresence initial={false}>
                                {topicOpen && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={SPRING.soft}
                                    className="overflow-hidden"
                                  >
                                    <div className="space-y-3 border-t border-border/60 px-4 py-4">
                                      {lessons === undefined && <p className="t-caption text-muted-foreground">Loading notes…</p>}
                                      {lessons?.length === 0 && (
                                        <p className="t-caption text-muted-foreground">No notes written for this topic yet.</p>
                                      )}
                                      {lessons?.map((l) => (
                                        <article key={l.id}>
                                          <div className="flex flex-wrap items-center justify-between gap-2">
                                            <h4 className="t-strong">{l.title}</h4>
                                            {l.specRefs && (
                                              <span className="chip">
                                                <Icon name="spec" size={12} />
                                                {l.specRefs}
                                              </span>
                                            )}
                                          </div>
                                          <Markdownish
                                            text={(density === 'detailed' ? l.detailedMd : l.summaryMd) || l.detailedMd}
                                          />
                                        </article>
                                      ))}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>
            </BlurFade>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Minimal markdown renderer: headings, bold, lists, quotes.
 * Runs at the spec's 17px body size — notes are the one place in the product
 * where the reader is genuinely reading, so body copy matters most here.
 */
function Markdownish({ text }: { text: string }) {
  const lines = text.split('\n');
  const bold = (s: string) =>
    s.split(/\*\*(.+?)\*\*/g).map((part, j) => (j % 2 === 1 ? <strong key={j} className="font-semibold">{part}</strong> : part));

  return (
    <div className="t-body mt-3 space-y-2 text-foreground">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1.5" />;
        if (line.startsWith('### ')) return <h5 key={i} className="t-strong pt-1">{bold(line.slice(4))}</h5>;
        if (line.startsWith('## ')) return <h4 key={i} className="t-tagline pt-1">{bold(line.slice(3))}</h4>;
        if (line.startsWith('# ')) return <h3 key={i} className="t-display-md pt-1">{bold(line.slice(2))}</h3>;
        if (line.startsWith('> '))
          return (
            <blockquote key={i} className="border-l-2 border-primary/50 pl-3 text-muted-foreground">
              {bold(line.slice(2))}
            </blockquote>
          );
        if (/^[-*] /.test(line))
          return (
            <li key={i} className="ml-5 list-disc">
              {bold(line.slice(2))}
            </li>
          );
        if (/^\d+\. /.test(line))
          return (
            <li key={i} className="ml-5 list-decimal">
              {bold(line.replace(/^\d+\. /, ''))}
            </li>
          );
        return <p key={i}>{bold(line)}</p>;
      })}
    </div>
  );
}
