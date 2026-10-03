'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { motion, useReducedMotion } from 'motion/react';
import { api } from '@/lib/api';
import { Icon } from '@/components/ui/icons';
import { BlurFade } from '@/components/ui/blur-fade';
import { ScrollProgress } from '@/components/ui/scroll-progress';
import PageSkeleton from '@/components/PageSkeleton';
import { PageHeader } from '@/components/PageHeader';
import { Markdown } from '@/components/Markdown';
import { SPRING } from '@/lib/motion';

type Lesson = { id: string; title: string; detailedMd: string; summaryMd: string; specRefs: string };

type TopicMeta = { name: string; description: string };

/**
 * The topic reading screen — the "separate window" for learning a subject.
 *
 * One topic, its notes, nothing else: the old page buried prose inside a
 * two-deep accordion where the reading surface was whatever height the
 * animation left. Here each lesson is a section with its spec reference as an
 * eyebrow, a detailed/summary density toggle (persisted, keyboard-operable),
 * and Learn/Cram in the header where the decision to study happens.
 */
export default function TopicScreen() {
  const params = useParams<{ subjectId: string; topicId: string }>();
  const subjectId = params?.subjectId;
  const topicId = params?.topicId;
  const [meta, setMeta] = useState<TopicMeta | null>(null);
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [density, setDensity] = useState<'detailed' | 'summary'>('detailed');
  const [failed, setFailed] = useState(false);
  const firstPaint = useRef(true);
  const reduce = useReducedMotion();

  // Density follows the account preference where one exists, then persists
  // locally so a choice made while reading survives the next topic.
  useEffect(() => {
    if (!topicId) return;
    let alive = true;
    api
      .get<{ topic: TopicMeta }>('/api/v1/content?topicId=' + topicId)
      .then((d) => {
        if (alive) setMeta({ name: d.topic.name, description: d.topic.description });
      })
      .catch(() => setFailed(true));
    api
      .get<{ lessons: Lesson[] }>('/api/v1/lessons?topicId=' + topicId)
      .then((d) => {
        if (alive) setLessons(d.lessons);
      })
      .catch(() => setFailed(true));
    return () => {
      alive = false;
    };
  }, [topicId]);

  // Density has one owner: the account preference (`prefs.noteDensity`). The
  // localStorage copy is a *cache* for first paint only — it means the choice
  // is visible before /me answers and on signed-out views, but the value the
  // learner set in Settings is what wins once the account arrives. Writing a
  // change here goes through the same PATCH /me helper Settings uses, so Learn,
  // Cram, Settings and both phones agree from now on.
  useEffect(() => {
    const cached = window.localStorage.getItem('revisio.noteDensity');
    if (cached === 'detailed' || cached === 'summary') setDensity(cached);
    api
      .get<{ prefs?: { noteDensity?: 'detailed' | 'summary' } | null }>('/api/v1/me')
      .then((d) => {
        const owned = d.prefs?.noteDensity;
        if (owned === 'detailed' || owned === 'summary') {
          setDensity(owned);
          window.localStorage.setItem('revisio.noteDensity', owned);
        }
      })
      .catch(() => undefined); // signed-out or offline: the cache stands
  }, []);

  useEffect(() => {
    if (firstPaint.current) {
      firstPaint.current = false;
      return;
    }
    window.localStorage.setItem('revisio.noteDensity', density);
    void api.patch('/api/v1/me', { prefs: { noteDensity: density } }).catch(() => undefined);
  }, [density]);

  if (!topicId || failed) {
    return (
      <div className="card p-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
          <Icon name="notes" size={22} />
        </span>
        <h2 className="t-tagline mt-4">Topic not found</h2>
        <p className="t-caption mt-2 text-muted-foreground">It may be private, withdrawn, or the link is wrong.</p>
        <Link href={subjectId ? `/learn/${subjectId}` : '/learn'} className="btn btn-primary mt-5 inline-flex">
          Back
        </Link>
      </div>
    );
  }

  if (!meta || !lessons) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <ScrollProgress className="h-0.5 !bg-none bg-foreground" />

      <nav aria-label="Breadcrumb">
        <Link
          href={`/learn/${subjectId}`}
          className="inline-flex items-center gap-1.5 t-caption text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          <Icon name="expand" size={14} className="rotate-180" />
          {meta.name || 'Subject'}
        </Link>
      </nav>

      <PageHeader
        icon="notes"
        title={meta.name}
        subtitle={meta.description || undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-[11px] border border-border/70 bg-card/60 p-1 backdrop-blur">
              {(['detailed', 'summary'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDensity(d)}
                  aria-pressed={density === d}
                  className={`segment ${density === d ? 'segment-active' : ''}`}
                >
                  {d === 'detailed' ? 'Detailed' : 'Summary'}
                </button>
              ))}
            </div>
            <Link
              href={`/review?topic=${topicId}`}
              className="btn btn-primary btn-sm self-stretch"
              aria-label={`Learn ${meta.name}`}
            >
              <Icon name="learn" size={14} />
              Learn
            </Link>
            <Link
              href={`/cram?topic=${topicId}`}
              className="btn btn-secondary btn-sm self-stretch"
              aria-label={`Cram ${meta.name}`}
            >
              <Icon name="cram" size={14} />
              Cram
            </Link>
          </div>
        }
      />

      {lessons.length === 0 && (
        <div className="card p-8 text-center">
          <h2 className="t-tagline">No notes written for this topic yet</h2>
          <p className="t-caption mt-2 text-muted-foreground">Check back once the topic has been published.</p>
        </div>
      )}

      <div className="space-y-8">
        {lessons.map((l, i) => (
          <BlurFade key={l.id} delay={reduce ? 0 : Math.min(i * 0.05, 0.2)}>
            <motion.section
              aria-labelledby={`lesson-${i}-heading`}
              animate={{ opacity: 1, y: 0 }}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              transition={SPRING.soft}
              className="card p-5 sm:p-6"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id={`lesson-${i}-heading`} className="t-tagline">
                  {l.title}
                </h2>
                {l.specRefs && (
                  <span className="chip chip-soft shrink-0">
                    <Icon name="spec" size={12} />
                    {l.specRefs}
                  </span>
                )}
              </div>
              <Markdown
                text={(density === 'detailed' ? l.detailedMd : l.summaryMd) || l.detailedMd}
                className="mt-3"
              />
            </motion.section>
          </BlurFade>
        ))}
      </div>
    </div>
  );
}
