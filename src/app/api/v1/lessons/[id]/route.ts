import { NextRequest } from 'next/server';
import { and, eq, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { cards, lessons, topics } from '@/db/schema';
import { ApiError, ok, requireUser, route } from '@/services/api';

export const GET = route(async (req: NextRequest, ctx: { params: Record<string, string> }) => {
  const user = await requireUser(req);
  const { id } = ctx.params;
  const [lesson] = await db
    .select()
    .from(lessons)
    .where(and(eq(lessons.id, id), or(eq(lessons.visibility, 'public'), eq(lessons.ownerId, user.id))))
    .limit(1);
  if (!lesson) throw new ApiError(404, 'not_found', 'Lesson not found.');
  const [topic] = await db.select().from(topics).where(eq(topics.id, lesson.topicId)).limit(1);
  const [cardCount] = await db
    .select({ c: sql<number>`count(*)` })
    .from(cards)
    .where(and(eq(cards.lessonId, lesson.id), or(eq(cards.visibility, 'public'), eq(cards.ownerId, user.id))));
  return ok({
    lesson: {
      id: lesson.id, title: lesson.title, detailedMd: lesson.detailedMd, summaryMd: lesson.summaryMd,
      specRefs: lesson.specRefs, visibility: lesson.visibility, isOwner: lesson.ownerId === user.id,
    },
    topic: topic ? { id: topic.id, name: topic.name } : null,
    cardCount: cardCount?.c ?? 0,
  });
});
