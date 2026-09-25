import { NextRequest } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { cramSessions, lessons, topics } from '@/db/schema';
import { ApiError, ok, requireUser, route } from '@/services/api';
import { buildCramQueue, } from '@/services/study';
import { topicContentCounts } from '@/services/content-ops';
import { topicReaches } from '@/services/visibility';

/**
 * Cram — the picker and the session.
 *
 * The picker and the queue now agree on what a card is. They did not before:
 * the list counted every card in a topic while the queue demanded
 * `cards.visibility = 'public'`, so a private deck showed "12" and then dealt
 * zero questions. Both sides read services/visibility.ts, so the number beside
 * a topic is the number of questions the session will actually contain.
 */

/** GET /cram — topics available to cram, with counts that match the queue. */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const rows = await db
    .select({ id: topics.id, name: topics.name, visibility: topics.visibility, subjectId: topics.subjectId })
    .from(topics)
    .where(topicReaches(user.id));

  const counts = await topicContentCounts(user.id, rows.map((r) => r.id), { onlyReachable: true });

  return ok({
    topics: rows.map((t) => ({
      ...t,
      lessonCount: counts.get(t.id)?.lessons ?? 0,
      cardCount: counts.get(t.id)?.cards ?? 0,
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
  if (!body.topicIds?.length) throw new ApiError(400, 'bad_request', 'Pick at least one topic.');
  const maxPerTopic = Math.min(50, Math.max(1, body.maxPerTopic ?? 20));
  const noteDensity = body.noteDensity === 'summary' ? 'summary' : 'detailed';

  const allowed = await db
    .select({ id: topics.id })
    .from(topics)
    .where(and(inArray(topics.id, body.topicIds), topicReaches(user.id)));
  if (allowed.length === 0) throw new ApiError(403, 'forbidden', 'None of those topics are yours to cram.');
  const topicIds = allowed.map((t) => t.id);

  const [session, notes, queue] = await Promise.all([
    db
      .insert(cramSessions)
      .values({ id: crypto.randomUUID(), userId: user.id, topicIds, maxPerTopic, noteDensity })
      .returning()
      .then((r) => r[0]),
    db.select().from(lessons).where(inArray(lessons.topicId, topicIds)),
    buildCramQueue(user.id, topicIds, maxPerTopic),
  ]);

  return ok(
    {
      sessionId: session.id,
      noteDensity,
      notes: notes.map((l) => ({
        topicId: l.topicId,
        title: l.title,
        contentMd: noteDensity === 'summary' ? l.summaryMd : l.detailedMd,
        specRefs: l.specRefs,
      })),
      queue,
    },
    { status: 201 },
  );
});
