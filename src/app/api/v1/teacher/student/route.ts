import { NextRequest } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { classMemberships, classes } from '@/db/schema';
import { ApiError, ok, requireUser, route } from '@/services/api';
import { isDeveloper } from '@/services/roles';
import { buildInsights } from '@/services/insights';

/**
 * GET /teacher/student?userId=… — one learner's progress, for the staff panel.
 *
 * A teacher may open anyone in their own classes; a developer may open anyone.
 * The data itself is assembled by `buildInsights` — the exact same service the
 * learner's own Strength tab reads, so a teacher and their student can never be
 * shown two different stories about the same cards.
 */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const userId = new URL(req.url).searchParams.get('userId');
  if (!userId) throw new ApiError(400, 'bad_request', 'userId required');

  if (!isDeveloper(user)) {
    if (user.role !== 'teacher') throw new ApiError(403, 'forbidden', 'Staff only.');
    // The whole authorisation question is "do we share a class?" — one query.
    const shared = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(classMemberships)
      .innerJoin(classes, eq(classMemberships.classId, classes.id))
      .where(and(eq(classMemberships.userId, userId), eq(classes.teacherId, user.id)));
    if ((shared[0]?.n ?? 0) === 0) throw new ApiError(403, 'forbidden', 'This student is not in one of your classes.');
  }

  const insights = await buildInsights(userId);
  if (!insights.student) throw new ApiError(404, 'not_found', 'Student not found.');
  return ok(insights);
});
