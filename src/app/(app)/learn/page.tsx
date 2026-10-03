'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Icon } from '@/components/ui/icons';
import { PageHeader } from '@/components/PageHeader';
import { BlurFade } from '@/components/ui/blur-fade';
import PageSkeleton from '@/components/PageSkeleton';

type Subject = {
  id: string;
  name: string;
  description: string;
  enrolled: boolean;
  topicCount: number;
};

/**
 * Learn — the catalogue.
 *
 * A subject is a place, not an accordion. The old page folded the whole
 * subject → topic → notes tree into one pull-out list, which collapsed under
 * its own length: everything was the same component, nothing had a stable
 * home, and the notes rendered inside whatever height was left. Now this page
 * is only the choice of subject — a bounded, link-first list — and each
 * subject gets a real screen with its specification and its topics.
 */
export default function LearnPage() {
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    api
      .get<{ subjects: Subject[] }>('/api/v1/subjects')
      .then((d) => setSubjects(d.subjects))
      .catch(() => setSubjects([]));
  }, []);

  // Client-side filter, deliberately: the catalogue is a few dozen subjects at
  // most and the payload is already on the device, so a round trip would buy
  // nothing but latency. This narrows by name and description.
  const visible = useMemo(() => {
    if (!subjects) return null;
    const q = query.trim().toLowerCase();
    if (!q) return subjects;
    return subjects.filter(
      (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
    );
  }, [subjects, query]);

  const follow = async (subject: Subject) => {
    setBusy(subject.id);
    try {
      await api.post('/api/v1/subjects', { subjectId: subject.id });
      setSubjects((prev) => prev?.map((x) => (x.id === subject.id ? { ...x, enrolled: true } : x)) ?? prev);
    } finally {
      setBusy(null);
    }
  };

  if (!subjects || !visible) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <PageHeader icon="learn" title="Learn" subtitle="Pick a subject to see its topics, notes and specification." />

      {subjects.length > 3 && (
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
            <Icon name="search" size={17} />
          </span>
          <input
            type="search"
            className="input pl-11"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search subjects…"
            aria-label="Search subjects"
          />
        </div>
      )}

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

      {visible.length === 0 && subjects.length > 0 && (
        <div className="card p-6 text-center">
          <p className="t-strong">Nothing matches “{query}”</p>
          <p className="t-caption mt-1 text-muted-foreground">Try a shorter piece of the name.</p>
          <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={() => setQuery('')}>
            Clear the search
          </button>
        </div>
      )}

      <div className="space-y-3">
        {visible.map((s, i) => (
          <BlurFade key={s.id} delay={Math.min(i * 0.04, 0.24)}>
            <div className="card p-0">
              {/* Link-first: the whole card navigates, the Follow control is a
                  sibling action — never a button inside a button. On a phone
                  the info and the actions are two rows; the one-line lockup was
                  squeezing every subject description into a sliver. */}
              <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
                <Link
                  href={`/learn/${s.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary">
                    <Icon name="topic" size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="t-strong block">{s.name}</span>
                    <span className="t-caption mt-0.5 block text-muted-foreground">{s.description}</span>
                  </span>
                </Link>
                <div className="flex shrink-0 items-center gap-2 pl-[52px] sm:pl-0">
                  <span className="chip">
                    {s.topicCount} {s.topicCount === 1 ? 'topic' : 'topics'}
                  </span>
                  {!s.enrolled ? (
                    <button
                      type="button"
                      onClick={() => follow(s)}
                      disabled={busy === s.id}
                      className="btn btn-secondary btn-sm"
                    >
                      {busy === s.id ? 'Adding…' : 'Follow'}
                    </button>
                  ) : (
                    <Link
                      href={`/learn/${s.id}`}
                      className="btn btn-primary btn-sm"
                      aria-label={`Open ${s.name}`}
                    >
                      Open
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </BlurFade>
        ))}
      </div>
    </div>
  );
}
