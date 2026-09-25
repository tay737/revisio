import { NextRequest } from 'next/server';
import { ApiError, ok, requireUser, route } from '@/services/api';
import { buildFirstExposure } from '@/services/study';

/**
 * GET /learn?topicId=…&batch=4 — the next few cards this user has never met.
 *
 * A selection route, deliberately: it answers *which* cards to show, and the
 * session grades them through the ordinary `/api/v1/reviews` with
 * `mode: 'learn'`. One grading path and one scheduler, so a card met here
 * behaves exactly like a card met anywhere else.
 *
 * The notes come back with the batch. A first attempt at material you have not
 * read is a guess, and the whole difference between reviewing and learning is
 * that here the reading is part of the question.
 */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const topicId = req.nextUrl.searchParams.get('topicId');
  if (!topicId) throw new ApiError(400, 'bad_request', 'Which topic?');

  const batch = Number(req.nextUrl.searchParams.get('batch') ?? 4);
  const session = await buildFirstExposure(user.id, topicId, Number.isFinite(batch) ? batch : 4);
  if (!session) throw new ApiError(404, 'not_found', 'That topic is not one you can study.');

  return ok(session);
});
