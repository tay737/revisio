import { NextRequest } from 'next/server';
import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { cardUserStates, cards, examAttempts, subjects, topics } from '@/db/schema';
import { ApiError, requireUser, route } from '@/services/api';

function csvEscape(s: string): string {
  return `"${String(s).replace(/"/g, '""')}"`;
}

/** GET /exports?format=csv|json — transcript: per-topic coverage + mastery,
 *  strongest/weakest areas, exam history. CSV opens in Excel/Sheets. */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const format = (req.nextUrl.searchParams.get('format') ?? 'csv').toLowerCase();
  if (!['csv', 'json'].includes(format)) throw new ApiError(400, 'bad_request', 'format must be csv or json');

  const topicRows = await db
    .select({ id: topics.id, name: topics.name, subjectId: topics.subjectId, subjectName: subjects.name })
    .from(topics)
    .innerJoin(subjects, eq(topics.subjectId, subjects.id))
    .where(eq(topics.visibility, 'public'));
  const topicIds = topicRows.map((t) => t.id);
  const cardRows = topicIds.length
    ? await db.select({ id: cards.id, topicId: cards.topicId }).from(cards).where(inArray(cards.topicId, topicIds))
    : [];
  const stateRows = await db
    .select({ cardId: cardUserStates.cardId, stage: cardUserStates.stage })
    .from(cardUserStates)
    .where(eq(cardUserStates.userId, user.id));
  const stateByCard = new Map(stateRows.map((s) => [s.cardId, s.stage]));

  const perTopic = topicRows.map((t) => {
    const tCards = cardRows.filter((c) => c.topicId === t.id);
    const stages = tCards.map((c) => stateByCard.get(c.id));
    const seen = stages.filter((s) => s !== undefined);
    const mastered = seen.filter((s) => s === 'mastered').length;
    const masteryPct = seen.length ? Math.round((mastered / seen.length) * 100) : 0;
    return {
      subject: t.subjectName,
      topic: t.name,
      cardsTotal: tCards.length,
      cardsSeen: seen.length,
      cardsMastered: mastered,
      coveragePct: tCards.length ? Math.round((seen.length / tCards.length) * 100) : 0,
      masteryPct,
    };
  });

  const attempts = await db.select().from(examAttempts).where(eq(examAttempts.userId, user.id)).orderBy(desc(examAttempts.createdAt)).limit(50);
  const covered = perTopic.filter((t) => t.cardsSeen > 0);
  const transcript = {
    student: { name: user.name, email: user.email, generatedAt: new Date().toISOString() },
    topics: perTopic,
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
  const lines = perTopic.map((t) => [t.subject, t.topic, t.cardsTotal, t.cardsSeen, t.cardsMastered, t.coveragePct, t.masteryPct].map((v) => csvEscape(String(v))).join(','));
  const csv = [header, ...lines].join('\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="transcript-${user.name.replace(/\W+/g, '-').toLowerCase()}.csv"`,
    },
  });
});
