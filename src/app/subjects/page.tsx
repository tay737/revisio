import Link from 'next/link';
import type { Metadata } from 'next';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { subjects, topics } from '@/db/schema';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icons';
import { buttonVariants } from '@/lib/button-variants';

/**
 * Public subject index — /subjects.
 *
 * The indexable front door to the catalogue: every official subject with its
 * public topic count, so a search for "GCSE biology revision" lands on a page
 * that names what is actually inside rather than a marketing claim. Private
 * and user-owned subjects are excluded — this page is also the sitemap's
 * subject source, so anything listed here must be safe to show signed out.
 */
export const metadata: Metadata = {
  title: 'Subjects · Revisio',
  description:
    'Every subject on Revisio — spaced-repetition notes and review queues for GCSE, A-level and university.',
};

export const dynamic = 'force-dynamic';

export default async function SubjectsPage() {
  const rows = await db
    .select({
      id: subjects.id,
      name: subjects.name,
      slug: subjects.slug,
      description: subjects.description,
      topicCount: sql<number>`count(${topics.id})::int`,
    })
    .from(subjects)
    .leftJoin(
      topics,
      and(eq(topics.subjectId, subjects.id), eq(topics.visibility, 'public')),
    )
    .where(isNull(subjects.ownerId))
    .groupBy(subjects.id)
    .orderBy(subjects.name);

  return (
    <div className="mx-auto w-full max-w-[880px] px-4 py-10 sm:px-6">
      <header className="max-w-xl">
        <p className="t-eyebrow">Catalogue</p>
        <h1 className="t-display mt-2">Subjects</h1>
        <p className="t-body mt-3 text-muted-foreground">
          Notes and review queues, built around the topics your course actually covers.
        </p>
      </header>

      {rows.length === 0 ? (
        <Card className="mt-8 p-6 text-center">
          <p className="t-body text-muted-foreground">No subjects are published yet.</p>
        </Card>
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {rows.map((s) => (
            <li key={s.id}>
              <Link href={`/subjects/${s.slug}`} className="block h-full">
                <Card className="flex h-full flex-col p-5 transition-colors hover:border-foreground/30">
                  <h2 className="t-strong">{s.name}</h2>
                  {s.description && (
                    <p className="mt-1.5 line-clamp-2 t-caption text-muted-foreground">{s.description}</p>
                  )}
                  <p className="t-fine mt-auto pt-4 text-muted-foreground">
                    {s.topicCount} {s.topicCount === 1 ? 'topic' : 'topics'}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-border pt-6">
        <Link href="/register" className={buttonVariants({ variant: 'primary' })}>
          Start free
          <Icon name="next" size={16} />
        </Link>
        <Link href="/" className={buttonVariants({ variant: 'ghost' })}>
          What is Revisio?
        </Link>
      </div>
    </div>
  );
}
