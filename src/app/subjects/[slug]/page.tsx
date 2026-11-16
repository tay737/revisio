import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { examPapers, subjects, topics } from '@/db/schema';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icons';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/lib/button-variants';

/**
 * Public subject page — /subjects/<slug>.
 *
 * One indexable page per official subject: what it covers (public topics),
 * which exam boards the stored papers come from, and a straight path to
 * sign-up. User-owned and pending-review content never reaches this page —
 * the same visibility rules the app applies to signed-out visitors apply
 * here, so the page cannot leak a private subject by guessing a slug.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const [subject] = await db
    .select({ name: subjects.name, description: subjects.description })
    .from(subjects)
    .where(and(eq(subjects.slug, params.slug), isNull(subjects.ownerId)))
    .limit(1);
  if (!subject) return { title: 'Subject · Revisio' };
  return {
    title: `${subject.name} · Revisio`,
    description:
      subject.description ||
      `${subject.name} notes and spaced-repetition review on Revisio.`,
  };
}

export default async function SubjectPage({ params }: { params: { slug: string } }) {
  const [subject] = await db
    .select()
    .from(subjects)
    .where(and(eq(subjects.slug, params.slug), isNull(subjects.ownerId)))
    .limit(1);
  if (!subject) notFound();

  const topicRows = await db
    .select({ name: topics.name })
    .from(topics)
    .where(and(eq(topics.subjectId, subject.id), eq(topics.visibility, 'public')))
    .orderBy(topics.position, topics.name);

  const boardRows = await db
    .selectDistinct({ board: examPapers.board })
    .from(examPapers)
    .where(and(eq(examPapers.subjectId, subject.id), eq(examPapers.visibility, 'public')));
  const boards = boardRows.map((r) => r.board).filter(Boolean).sort();

  return (
    <div className="mx-auto w-full max-w-[880px] px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb" className="t-fine text-muted-foreground">
        <Link href="/subjects" className="underline underline-offset-4 hover:text-foreground">
          Subjects
        </Link>
        <span aria-hidden="true"> / </span>
        <span>{subject.name}</span>
      </nav>

      <header className="mt-4 max-w-xl">
        <h1 className="t-display">{subject.name}</h1>
        {subject.description && (
          <p className="t-body mt-3 text-muted-foreground">{subject.description}</p>
        )}
      </header>

      {boards.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="t-fine text-muted-foreground">Exam boards</span>
          {boards.map((b) => (
            <Badge variant="chip" key={b}>
              {b}
            </Badge>
          ))}
        </div>
      )}

      <section className="mt-8">
        <h2 className="t-tagline">
          {topicRows.length} {topicRows.length === 1 ? 'topic' : 'topics'}
        </h2>
        {topicRows.length === 0 ? (
          <Card className="mt-3 p-6 text-center">
            <p className="t-body text-muted-foreground">
              Notes for this subject are still being written.
            </p>
          </Card>
        ) : (
          <Card className="mt-3 divide-y divide-border p-0">
            <ul>
              {topicRows.map((t) => (
                <li key={t.name} className="flex items-center gap-3 px-5 py-3.5">
                  <Icon name="learn" size={16} className="shrink-0 text-muted-foreground" />
                  <span className="t-body">{t.name}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link href="/register" className={buttonVariants({ variant: 'primary' })}>
          Start revising {subject.name}
          <Icon name="next" size={16} />
        </Link>
        <Link href="/" className={buttonVariants({ variant: 'ghost' })}>
          What is Revisio?
        </Link>
      </div>
    </div>
  );
}
