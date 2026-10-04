import { NextRequest } from 'next/server';
import { ok, requireUser, route } from '@/services/api';
import { buildInsights } from '@/services/insights';

/**
 * GET /insights — the signed-in learner's own progress, as data.
 *
 * The same payload the staff panels read (via /teacher/student), pointed at
 * yourself: strength ladder, struggling topics, recent answers, upcoming
 * reviews. A learner is always allowed to read their own ledger — the only
 * difference from the staff route is whose id it is.
 */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  return ok(await buildInsights(user.id));
});
