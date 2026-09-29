'use client';

import { useEffect, useState } from 'react';
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

  useEffect(() => {
    api
      .get<{ subjects: Subject[] }>('/api/v1/subjects')
      .then((d) => setSubjects(d.subjects))
      .catch(() => setSubjects([]));
  }, []);

  const follow = async (subject: Subject) => {
    setBusy(subject.id);
    try {
      await api.post('/api/v1/subjects', { subjectId: subject.id });
      setSubjects((prev) => prev?.map((x) => (x.id === subject.id ? { ...x, enrolled: true } : x)) ?? prev);
    } finally {
      setBusy(null);
    }
  };

  if (!subjects) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <PageHeader icon="learn" title="Learn" subtitle="Pick a subject to see its topics, notes and specification." />

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

      <ul className="space-y-3">
        {subjects.map((s, i) => (
          <BlurFade key={s.id} delay={Math.min(i * 0.04, 0.24)}>
            <li className="card p-0">
              {/* Link-first: the whole card navigates, the Follow control is a
                  sibling action — never a button inside a button. */}
              <div className="flex w-full items-center gap-3 p-5">
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
                <span className="chip shrink-0">
                  {s.topicCount} {s.topicCount === 1 ? 'topic' : 'topics'}
                </span>
                {!s.enrolled ? (
                  <button
                    type="button"
                    onClick={() => follow(s)}
                    disabled={busy === s.id}
                    className="btn btn-secondary btn-sm shrink-0"
                  >
                    {busy === s.id ? 'Adding…' : 'Follow'}
                  </button>
                ) : (
                  <Link
                    href={`/learn/${s.id}`}
                    className="btn btn-primary btn-sm shrink-0"
                    aria-label={`Open ${s.name}`}
                  >
                    Open
                  </Link>
                )}
              </div>
            </li>
          </BlurFade>
        ))}
      </ul>
    </div>
  );
}
