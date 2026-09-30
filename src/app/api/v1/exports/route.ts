import { NextRequest } from 'next/server';
import { and, desc, eq, sql } from 'drizzle-orm';
import { readReplica } from '@/db/replica';
import { cardUserStates, cards, examAttempts, subjects, topics } from '@/db/schema';
import { ApiError, requireUser, route } from '@/services/api';

function csvEscape(s: string): string {
  return `"${String(s).replace(/"/g, '""')}"`;
}

/**
 * GET /exports?format=csv|json — transcript: per-topic coverage + mastery,
 * strongest/weakest areas, exam history. CSV opens in Excel/Sheets.
 *
 * The whole computation is one grouped query on the replica: the previous form
 * read every public topic row and every card row in the platform into the
 * function and joined them in JavaScript — linear in the entire content tree
 * on every transcript download, for one student's numbers. The join below is
 * scoped to this user's states; the totals count from indexes.
 */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const format = (req.nextUrl.searchParams.get('format') ?? 'csv').toLowerCase();
  if (!['csv', 'json'].includes(format)) throw new ApiError(400, 'bad_request', 'format must be csv or json');

  const perTopic = await readReplica((rdb) =>
    rdb
      .select({
        subject: subjects.name,
        topic: topics.name,
        cardsTotal: sql<number>`count(distinct ${cards.id})::int`,
        cardsSeen: sql<number>`count(distinct ${cardUserStates.cardId})::int`,
        cardsMastered: sql<number>`count(distinct case when ${cardUserStates.stage} = 'mastered' then ${cards.id} end)::int`,
      })
      .from(topics)
      .innerJoin(subjects, eq(topics.subjectId, subjects.id))
      .innerJoin(cards, eq(cards.topicId, topics.id))
      .leftJoin(cardUserStates, and(eq(cardUserStates.cardId, cards.id), eq(cardUserStates.userId, user.id)))
      // group by the topic id (the identity) plus the two names
      .where(eq(topics.visibility, 'public'))
      .groupBy(subjects.name, topics.id, topics.name),
  );

  const perTopicShaped = perTopic.map((t) => {
    const coveragePct = t.cardsTotal ? Math.round((t.cardsSeen / t.cardsTotal) * 100) : 0;
    const masteryPct = t.cardsSeen ? Math.round((t.cardsMastered / t.cardsSeen) * 100) : 0;
    return { ...t, coveragePct, masteryPct };
  });

  const attempts = await readReplica((rdb) =>
    rdb.select().from(examAttempts).where(eq(examAttempts.userId, user.id)).orderBy(desc(examAttempts.createdAt)).limit(50),
  );
  const covered = perTopicShaped.filter((t) => t.cardsSeen > 0);
  const transcript = {
    student: { name: user.name, email: user.email, generatedAt: new Date().toISOString() },
    topics: perTopicShaped,
    strongest: [...covered].sort((a, b) => b.masteryPct - a.masteryPct).slice(0, 5),
    weakest: [...covered].sort((a, b) => a.masteryPct - b.masteryPct).slice(0, 5),
    examAttempts: attempts.map((a) => ({
      topics: a.topicIds,
      score: a.score,
      maxScore: a.maxScore,
      percentage: a.maxScore ? Math.round((a.score / a.maxScore) * 100) : 0,
      at: a.createdAt,
    })),
  };

  if (format === 'json') return Response.json(transcript);

  const header = 'Subject,Topic,Cards,Seen,Mastered,Coverage %,Mastery %';
  const lines = perTopicShaped.map((t) => [t.subject, t.topic, t.cardsTotal, t.cardsSeen, t.cardsMastered, t.coveragePct, t.masteryPct].map((v) => csvEscape(String(v))).join(','));
  const csv = [header, ...lines].join('\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="transcript-${user.name.replace(/\W+/g, '-').toLowerCase()}.csv"`,
    },
  });
});
