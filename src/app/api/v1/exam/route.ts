import { NextRequest } from 'next/server';
import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { examAttempts, examQuestions, topics } from '@/db/schema';
import { ApiError, ok, requireUser, route } from '@/services/api';
import { submitExam } from '@/services/study';

/** GET /exam?subjectId= — question pool summary + my attempts */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const subjectId = req.nextUrl.searchParams.get('subjectId');

  const topicsPool = subjectId
    ? await db.select({ id: topics.id, name: topics.name }).from(topics).where(eq(topics.subjectId, subjectId))
    : await db.select({ id: topics.id, name: topics.name }).from(topics);
  const topicIds = topicsPool.map((t) => t.id);
  const count = topicIds.length
    ? (await db.select({ id: examQuestions.id }).from(examQuestions).where(inArray(examQuestions.topicId, topicIds))).length
    : 0;
  const attempts = await db.select().from(examAttempts).where(eq(examAttempts.userId, user.id)).orderBy(desc(examAttempts.createdAt)).limit(20);
  return ok({ topics: topicsPool, questionsAvailable: count, attempts });
});

/** POST /exam { topicIds, answers } — build a paper or submit answers.
 *  No topicIds+answers → build paper (returns questions, no mark scheme).
 *  With answers → mark server-side and store the attempt. */
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const body = (await req.json()) as {
    topicIds?: string[];
    questionCount?: number;
    answers?: { questionId: string; answer?: string; selectedOptionId?: string }[];
  };

  if (!body.topicIds?.length) throw new ApiError(400, 'bad_request', 'topicIds required');
  const ownedTopics = await db
    .select({ id: topics.id, name: topics.name })
    .from(topics)
    .where(inArray(topics.id, body.topicIds));
  if (ownedTopics.length === 0) throw new ApiError(404, 'not_found', 'Topics not found.');

  if (!body.answers) {
    const paper = await buildPaper(user.id, body.topicIds, body.questionCount ?? 5);
    return ok({ paper, topics: ownedTopics });
  }

  const result = await submitExam(user.id, body.topicIds, body.answers);
  return ok({
    score: result.score,
    maxScore: result.maxScore,
    percentage: result.maxScore ? Math.round((result.score / result.maxScore) * 100) : 0,
    detail: result.detail,
    xpAwarded: result.xpAwarded,
  });
});

async function buildPaper(userId: string, topicIds: string[], questionCount: number) {
  const { buildExam } = await import('@/services/study');
  const qs = await buildExam(userId, topicIds, questionCount);
  if (qs.length === 0) throw new ApiError(404, 'not_found', 'No exam questions available for these topics yet.');
  return qs;
}
