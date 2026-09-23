import { NextRequest } from 'next/server';
import { and, eq, inArray, or } from 'drizzle-orm';
import { db } from '@/db/client';
import { lessons, topics } from '@/db/schema';
import { ok, requireUser, route } from '@/services/api';

/** GET /lessons?topicId= — lessons of a visible topic. */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const topicId = req.nextUrl.searchParams.get('topicId');
  if (!topicId) return ok({ lessons: [] });

  const [topic] = await db
    .select()
    .from(topics)
    .where(and(eq(topics.id, topicId), or(eq(topics.visibility, 'public'), eq(topics.ownerId, user.id))))
    .limit(1);
  if (!topic) return ok({ lessons: [] });

  const rows = await db
    .select()
    .from(lessons)
    .where(and(eq(lessons.topicId, topicId), or(eq(lessons.visibility, 'public'), eq(lessons.ownerId, user.id))))
    .orderBy(lessons.position);
  return ok({ lessons: rows.map((l) => ({ id: l.id, title: l.title, detailedMd: l.detailedMd, summaryMd: l.summaryMd, specRefs: l.specRefs })) });
});
