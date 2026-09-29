'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { motion } from 'motion/react';
import { api } from '@/lib/api';
import { Icon } from '@/components/ui/icons';
import { BlurFade } from '@/components/ui/blur-fade';
import { SPRING } from '@/lib/motion';
import PageSkeleton from '@/components/PageSkeleton';
import { unitFromTopic, topicSortKey, type Topic } from './shared';

/**
 * The subject screen — the stable home the old pull-out list never gave a
 * subject. Everything about one subject lives here: its specification at the
 * top (built from the lessons' spec references, so it is always in sync with
 * the notes) and its topics beneath, grouped by spec unit with their study
 * actions. The notes themselves live one click deeper, on a topic's own page.
 */
export default function SubjectScreen() {
  const params = useParams<{ subjectId: string }>();
  const subjectId = params?.subjectId;
  const [subject, setSubject] = useState<{ name: string; description: string; enrolled: boolean } | null>(null);
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [specsOpen, setSpecsOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!subjectId) return;
    api
      .get<{ subjects: { id: string; name: string; description: string; enrolled: boolean }[] }>('/api/v1/subjects')
      .then((d) => setSubject(d.subjects.find((s) => s.id === subjectId) ?? null))
      .catch(() => setFailed(true));
    api
      .get<{ topics: Topic[] }>(`/api/v1/content?subjectId=${subjectId}`)
      .then((d) => setTopics(d.topics))
      .catch(() => setTopics([]));
  }, [subjectId]);

  if (!subjectId || failed || (topics && subject === null)) {
    return (
      <div className="card p-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
          <Icon name="learn" size={22} />
        </span>
        <h2 className="t-tagline mt-4">Subject not found</h2>
        <p className="t-caption mt-2 text-muted-foreground">It may have been withdrawn, or the link is wrong.</p>
        <Link href="/learn" className="btn btn-primary mt-5 inline-flex">
          Back to Learn
        </Link>
      </div>
    );
  }

  if (!subject || !topics) return <PageSkeleton />;

  const specMap = new Map<string, { refs: string[]; topics: Topic[] }>();
  for (const t of [...topics].sort(topicSortKey)) {
    const unit = unitFromTopic(t);
    const entry = specMap.get(unit) ?? { refs: [], topics: [] };
    entry.topics.push(t);
    for (const ref of t.specRefs) if (!entry.refs.includes(ref)) entry.refs.push(ref);
    specMap.set(unit, entry);
  }
  const specUnits = [...specMap.entries()].sort((a, b) => topicSortKey(a[0], b[0]));
  const specCount = [...specMap.values()].reduce((n, u) => n + u.refs.length, 0);
  const orderedTopics = [...topics].sort(topicSortKey);

  return (
    <div className="space-y-6">
      {/* Breadcrumb navigation is the Escape hatch from this screen; the
          h1 owns the subject's name. */}
      <nav aria-label="Breadcrumb">
        <Link
          href="/learn"
          className="inline-flex items-center gap-1.5 t-caption text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          <Icon name="expand" size={14} className="rotate-180" />
          All subjects
        </Link>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <h1 className="t-title">{subject.name}</h1>
          <p className="mt-1 text-[14px] leading-snug text-muted-foreground">{subject.description}</p>
        </div>
        <span className="chip shrink-0">
          {topics.length} {topics.length === 1 ? 'topic' : 'topics'} · {specCount} spec refs
        </span>
      </header>

      {/* ── Specification ────────────────────────────────────────────────
          Derived from the lessons' spec_refs — one owner, no second list to
          drift. Collapsed by default so it informs without pushing the topic
          list below the fold. */}
      {specCount > 0 && (
        <section aria-labelledby="specs-heading" className="card p-0">
          <button
            type="button"
            onClick={() => setSpecsOpen((v) => !v)}
            aria-expanded={specsOpen}
            aria-controls="specs-body"
            className="flex w-full items-center gap-3 p-5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary">
              <Icon name="spec" size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="t-strong block" id="specs-heading">
                Specification
              </span>
              <span className="t-caption mt-0.5 block text-muted-foreground">
                {specCount} references across {topics.length} topics — from the notes themselves
              </span>
            </span>
            <motion.span
              animate={{ rotate: specsOpen ? 90 : 0 }}
              transition={SPRING.press}
              className="shrink-0 text-muted-foreground"
            >
              <Icon name="expand" size={16} />
            </motion.span>
          </button>
          <motion.div
            initial={false}
            animate={{ height: specsOpen ? 'auto' : 0, opacity: specsOpen ? 1 : 0 }}
            transition={SPRING.soft}
            className="overflow-hidden"
          >
            <div id="specs-body" className="border-t border-border/70 px-5 py-4">
              <dl className="space-y-4">
                {specUnits.map(([unit, entry]) => (
                  <div key={unit}>
                    <dt className="t-strong">Unit {unit}</dt>
                    <dd className="mt-1.5 flex flex-wrap gap-1.5">
                      {entry.refs.map((ref) => (
                        <span key={ref} className="chip chip-soft">
                          {ref}
                        </span>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </motion.div>
        </section>
      )}

      <section aria-labelledby="topics-heading" className="space-y-4">
        <h2 id="topics-heading" className="t-tagline">
          Topics
        </h2>
        {topics.length === 0 && (
          <p className="t-caption text-muted-foreground">No topics under this subject yet.</p>
        )}
        <ul className="space-y-2">
          {orderedTopics.map((t, ti) => (
            <li key={t.id} className="inset overflow-hidden">
              <BlurFade delay={Math.min(ti * 0.04, 0.2)}>
                <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
                      <Link
                        href={`/learn/${subjectId}/${t.id}`}
                        className="flex min-w-0 flex-1 items-center gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="t-strong block">{t.name}</span>
                          {t.description && (
                            <span className="t-caption mt-0.5 block text-muted-foreground">{t.description}</span>
                          )}
                          {t.specRefs.length > 0 && (
                            <span className="t-caption-s mt-1 block text-muted-foreground">
                              {t.specRefs.slice(0, 4).join(' · ')}
                              {t.specRefs.length > 4 ? ` · +${t.specRefs.length - 4}` : ''}
                            </span>
                          )}
                        </span>
                        <span className="chip shrink-0">
                          {t.lessons ?? 0} {(t.lessons ?? 0) === 1 ? 'note' : 'notes'} · {t.cards ?? 0}{' '}
                          {(t.cards ?? 0) === 1 ? 'question' : 'questions'}
                        </span>
                      </Link>
                      <div className="flex gap-2">
                        <Link
                          href={`/review?topic=${t.id}`}
                          className="btn btn-primary btn-sm"
                          aria-label={`Learn ${t.name}`}
                        >
                          <Icon name="learn" size={14} />
                          Learn
                        </Link>
                        <Link
                          href={`/cram?topic=${t.id}`}
                          className="btn btn-secondary btn-sm"
                          aria-label={`Cram ${t.name}`}
                        >
                          <Icon name="cram" size={14} />
                          Cram
                        </Link>
                      </div>
                </div>
              </BlurFade>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
