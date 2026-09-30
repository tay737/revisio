import { NextRequest } from 'next/server';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { examAttempts, examQuestions, topics } from '@/db/schema';
import { ApiError, ok, requireUser, route } from '@/services/api';
import { getExamPaper, listExamPapers, submitExam } from '@/services/study';
import { topicReaches } from '@/services/visibility';

/**
 * The visibility filter for exam topic selection — the same rule as everywhere
 * else (services/visibility.ts). Without it, a user could enumerate any
 * private topic id and read another user's questions: the pool summary, the
 * built paper and the marking all accepted topic ids the caller had no right
 * to. `getExamPaper` already checked paper ownership; the topics did not.

/** GET /exam?subjectId= — question pool summary + stored papers + my attempts.
 *  GET /exam?paperId=… — one stored paper, verbatim. */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const paperId = req.nextUrl.searchParams.get('paperId');
  if (paperId) {
    const paper = await getExamPaper(paperId, user.id);
    if (!paper) throw new ApiError(404, 'not_found', 'Paper not found.');
    return ok({ paper });
  }
  const subjectId = req.nextUrl.searchParams.get('subjectId');

  const topicsPool = await db
    .select({ id: topics.id, name: topics.name })
    .from(topics)
    .where(subjectId ? and(eq(topics.subjectId, subjectId), topicReaches(user.id)) : topicReaches(user.id));
  const topicIds = topicsPool.map((t) => t.id);
  const [count, papers] = await Promise.all([
    topicIds.length
      ? db.select({ id: examQuestions.id }).from(examQuestions).where(inArray(examQuestions.topicId, topicIds))
      : Promise.resolve([] as { id: string }[]),
    subjectId ? listExamPapers(subjectId) : Promise.resolve([]),
  ]);
  const attempts = await db.select().from(examAttempts).where(eq(examAttempts.userId, user.id)).orderBy(desc(examAttempts.createdAt)).limit(20);
  return ok({ topics: topicsPool, questionsAvailable: count.length, papers, attempts });
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
  // Only topics this user may reach — the same condition as the picker and the
  // cram queue. A private topic id guessed or shared between accounts used to
  // pass straight through to build/submit here.
  const ownedTopics = await db
    .select({ id: topics.id, name: topics.name })
    .from(topics)
    .where(and(inArray(topics.id, body.topicIds), topicReaches(user.id)));
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
    aoProfile: result.aoProfile ?? null,
  });
});

async function buildPaper(userId: string, topicIds: string[], questionCount: number) {
  const { buildExam } = await import('@/services/study');
  const qs = await buildExam(userId, topicIds, questionCount);
  if (qs.length === 0) throw new ApiError(404, 'not_found', 'No exam questions available for these topics yet.');
  return qs;
}
