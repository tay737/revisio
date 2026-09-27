import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { mathSets, subjects } from '@/db/schema';
import { ApiError, ok, requireUser, route } from '@/services/api';
import { canManageContent, isDeveloper } from '@/services/roles';
import {
  conceptCatalogue,
  createMathSet,
  deleteMathSet,
  listPracticeTopics,
  markPracticeAnswers,
  startPracticeSession,
  updateMathSet,
} from '@/services/maths';

/**
 * GET /maths?subjectId=…&topics=1   the concept catalogue + practice topics + my sets
 * GET /maths?concepts=1             the concept catalogue alone (authoring picker)
 */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const params = req.nextUrl.searchParams;
  const staff = canManageContent(user);

  const concepts = conceptCatalogue();
  const subjectId = params.get('subjectId');
  if (!subjectId) return ok({ concepts });

  const enabled = await db.select({ mathsEnabled: subjects.mathsEnabled }).from(subjects).where(eq(subjects.id, subjectId)).limit(1);
  const topicList = await listPracticeTopics(user.id, user, subjectId);

  const mySets = staff
    ? await db
        .select({ id: mathSets.id, topicId: mathSets.topicId, title: mathSets.title, description: mathSets.description, concepts: mathSets.concepts, defaultCount: mathSets.defaultCount, defaultDifficulty: mathSets.defaultDifficulty })
        .from(mathSets)
        .where(eq(mathSets.ownerId, user.id))
    : [];

  return ok({ concepts, mathsEnabled: enabled[0]?.mathsEnabled ?? false, topics: topicList, mySets });
});

/**
 * POST /maths
 *   { action: 'start', topicIds, conceptIds?, difficulty, count }  → a session (no answers)
 *   { action: 'mark', answers: [{ questionId, answer }] }          → verdicts (server re-derives)
 *   { action: 'create_set' | 'update_set' | 'delete_set', … }      → staff authoring
 */
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const body = (await req.json()) as {
    action: 'start' | 'mark' | 'create_set' | 'update_set' | 'delete_set';
    subjectId?: string;
    topicIds?: string[];
    conceptIds?: string[];
    difficulty?: 'easy' | 'medium' | 'hard' | 'mixed';
    count?: number;
    answers?: { questionId: string; answer?: string }[];
    setId?: string;
    topicId?: string;
    title?: string;
    description?: string;
    concepts?: string[];
    defaultCount?: number;
    defaultDifficulty?: 'easy' | 'medium' | 'hard' | 'mixed';
  };

  switch (body.action) {
    case 'start': {
      const difficulty = body.difficulty ?? 'mixed';
      if (!['easy', 'medium', 'hard', 'mixed'].includes(difficulty)) throw new ApiError(400, 'bad_request', 'difficulty must be easy, medium, hard or mixed.');
      const difficultyKey = difficulty as 'easy' | 'medium' | 'hard' | 'mixed';
      const session = await startPracticeSession({
        userId: user.id,
        user,
        topicIds: body.topicIds ?? [],
        conceptIds: body.conceptIds,
        difficulty: difficultyKey === 'mixed' ? 'mixed' : difficultyKey,
        count: body.count ?? 10,
      });
      return ok(session);
    }
    case 'mark': {
      const entries = (body.answers ?? []).map((a) => ({ questionId: a.questionId, answer: a.answer }));
      const results = await markPracticeAnswers(user.id, entries);
      return ok({ results });
    }
    case 'create_set':
      return ok({ set: await createMathSet(user, body) }, { status: 201 });
    case 'update_set':
      if (!body.setId) throw new ApiError(400, 'bad_request', 'setId required.');
      return ok(await updateMathSet(user, body.setId, body));
    case 'delete_set':
      if (!body.setId) throw new ApiError(400, 'bad_request', 'setId required.');
      return ok(await deleteMathSet(user, body.setId));
    default:
      throw new ApiError(400, 'bad_request', 'Unknown action.');
  }
});

/** DELETE /maths?setId=… — staff removing a set. */
export const DELETE = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const setId = req.nextUrl.searchParams.get('setId');
  if (!setId) throw new ApiError(400, 'bad_request', 'setId required.');
  return ok(await deleteMathSet(user, setId));
});
