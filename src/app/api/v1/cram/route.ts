import { NextRequest } from 'next/server';
import { and, eq, inArray, or } from 'drizzle-orm';
import { db } from '@/db/client';
import { cards, cramSessions, lessons, topics, userTopicStates } from '@/db/schema';
import { ApiError, ok, requireUser, route } from '@/services/api';
import { buildCramQueue, visibleContentCondition } from '@/services/study';

/** GET /cram — topics available to cram (public + own private, with lesson counts) */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const rows = await db
    .select({ id: topics.id, name: topics.name, visibility: topics.visibility, subjectId: topics.subjectId })
    .from(topics)
    .where(or(eq(topics.visibility, 'public'), eq(topics.ownerId, user.id)));
  const lessonsIn = rows.length ? await db.select({ topicId: lessons.topicId }).from(lessons).where(inArray(lessons.topicId, rows.map((r) => r.id))) : [];
  const cardsIn = rows.length ? await db.select({ topicId: cards.topicId }).from(cards).where(inArray(cards.topicId, rows.map((r) => r.id))) : [];
  return ok({
    topics: rows.map((t) => ({
      ...t,
      lessonCount: lessonsIn.filter((l) => l.topicId === t.id).length,
      cardCount: cardsIn.filter((c) => c.topicId === t.id).length,
    })),
  });
});

/** POST /cram { topicIds, maxPerTopic, noteDensity } — start cram session.
 *  Returns lesson notes for the chosen density plus the question queue. */
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const body = (await req.json()) as {
    topicIds?: string[];
    maxPerTopic?: number;
    noteDensity?: 'detailed' | 'summary';
  };
  if (!body.topicIds?.length) throw new ApiError(400, 'bad_request', 'Select at least one topic.');
  const maxPerTopic = Math.min(50, Math.max(1, body.maxPerTopic ?? 20));
  const noteDensity = body.noteDensity === 'summary' ? 'summary' : 'detailed';

  // verify the user may see these topics
  const allowed = await db
    .select({ id: topics.id })
    .from(topics)
    .where(and(inArray(topics.id, body.topicIds), or(eq(topics.visibility, 'public'), eq(topics.ownerId, user.id))));
  if (allowed.length === 0) throw new ApiError(403, 'forbidden', 'No accessible topics in selection.');

  const [session] = await db
    .insert(cramSessions)
    .values({ id: crypto.randomUUID(), userId: user.id, topicIds: allowed.map((t) => t.id), maxPerTopic, noteDensity })
    .returning();

  const notes = await db
    .select()
    .from(lessons)
    .where(inArray(lessons.topicId, allowed.map((t) => t.id)));
  const queue = await buildCramQueue(user.id, allowed.map((t) => t.id), maxPerTopic);

  return ok({
    sessionId: session.id,
    noteDensity,
    notes: notes.map((l) => ({
      topicId: l.topicId, title: l.title,
      contentMd: noteDensity === 'summary' ? l.summaryMd : l.detailedMd,
      specRefs: l.specRefs,
    })),
    queue,
  }, { status: 201 });
});
