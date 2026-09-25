import 'server-only';
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { cardAnswers, cards, imports, lessons, topics, userTopicStates } from '@/db/schema';
import { ApiError } from '@/services/api';
import { canManageContent } from '@/services/roles';
import type { SessionUser } from '@/services/auth';
import type { Visibility } from '@/services/visibility';

/**
 * Content operations — the write side of the content tree.
 *
 * Three jobs that all have to touch topics, lessons and cards together, kept in
 * one place so they cannot drift apart:
 *
 *   - `makeSlug`      naming a topic, once
 *   - `setVisibility` publishing or withdrawing a whole tree
 *   - `mergeTopics`   folding one topic into another
 *
 * The reason these belong together is the bug that motivated them. A user
 * imported 12 questions and wrote a set of notes, and the app put them in two
 * topics that could never be combined: the importer always minted a fresh
 * private topic, and nothing anywhere could move a card between topics. The
 * questions were audible in the picker and silent in the queue. Splitting is
 * easy to do by accident, so joining has to be a first-class operation.
 */

export function makeSlug(...parts: string[]): string {
  return (
    parts
      .join('-')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 60) || 'topic'
  );
}

/** Rights over one topic. Staff may touch anything; everyone else only their own. */
export async function loadEditableTopic(user: SessionUser, topicId: string) {
  const [topic] = await db.select().from(topics).where(eq(topics.id, topicId)).limit(1);
  if (!topic) throw new ApiError(404, 'not_found', 'Topic not found.');
  if (!canManageContent(user) && topic.ownerId !== user.id) {
    throw new ApiError(403, 'forbidden', 'Not your content.');
  }
  return topic;
}

/**
 * Publish or withdraw an entire tree.
 *
 * The children follow the topic deliberately. A `public` topic whose cards are
 * still `private` reads as published and behaves as empty — that is precisely
 * how this database ended up with a subject page listing topics and no
 * studiable card anywhere in it.
 */
export async function setTopicVisibility(
  user: SessionUser,
  topicId: string,
  visibility: Visibility,
): Promise<{ lessons: number; cards: number }> {
  await loadEditableTopic(user, topicId);
  await db.update(topics).set({ visibility }).where(eq(topics.id, topicId));
  const lessonRows = await db.update(lessons).set({ visibility }).where(eq(lessons.topicId, topicId)).returning({ id: lessons.id });
  const cardRows = await db.update(cards).set({ visibility }).where(eq(cards.topicId, topicId)).returning({ id: cards.id });
  return { lessons: lessonRows.length, cards: cardRows.length };
}

export type MergeResult = {
  movedCards: number;
  movedLessons: number;
  targetTopicId: string;
  deletedTopicId: string;
  published: boolean;
};

/**
 * Fold `sourceId` into `targetId`: every lesson and card moves, the source is
 * deleted, and no review history is lost.
 *
 * `publish` also flips the moved rows — and the target — to public, which is
 * the "I imported my questions, now make them part of the real topic" case.
 */
export async function mergeTopics(
  user: SessionUser,
  sourceId: string,
  targetId: string,
  options: { publish?: boolean } = {},
): Promise<MergeResult> {
  if (!sourceId || !targetId) throw new ApiError(400, 'bad_request', 'Pick a topic to merge and a topic to merge it into.');
  if (sourceId === targetId) throw new ApiError(400, 'bad_request', 'A topic cannot be merged into itself.');

  const [source, target] = await Promise.all([loadEditableTopic(user, sourceId), loadEditableTopic(user, targetId)]);

  const [sourceLessons, sourceCards, highest] = await Promise.all([
    db.select().from(lessons).where(eq(lessons.topicId, sourceId)).orderBy(asc(lessons.position)),
    db.select({ id: cards.id }).from(cards).where(eq(cards.topicId, sourceId)),
    db.select({ max: sql<number>`coalesce(max(${lessons.position}), -1)::int` }).from(lessons).where(eq(lessons.topicId, targetId)),
  ]);

  const base = (highest[0]?.max ?? -1) + 1;

  // Lessons first: cards carry `lessonId`, so the lesson rows must exist under
  // the target before the cards arrive pointing at them.
  for (const [i, lesson] of sourceLessons.entries()) {
    await db
      .update(lessons)
      .set({
        topicId: targetId,
        position: base + i,
        ...(options.publish ? { visibility: 'public' as const, ownerId: target.ownerId } : {}),
      })
      .where(eq(lessons.id, lesson.id));
  }

  if (sourceCards.length) {
    await db
      .update(cards)
      .set({
        topicId: targetId,
        ...(options.publish ? { visibility: 'public' as const, ownerId: target.ownerId } : {}),
      })
      .where(eq(cards.topicId, sourceId));
  }

  // Progress travels with the content. `card_user_states` is keyed by card id so
  // it needs nothing; the per-topic row does, and dropping it would silently
  // reset a reader's place for the topic they just tidied up.
  const [topicStates] = await Promise.all([
    db.select().from(userTopicStates).where(eq(userTopicStates.topicId, sourceId)),
    db.update(imports).set({ targetTopicId: targetId }).where(eq(imports.targetTopicId, sourceId)),
  ]);
  if (topicStates.length) {
    await db
      .insert(userTopicStates)
      .values(topicStates.map((s) => ({ ...s, topicId: targetId })))
      .onConflictDoNothing();
  }

  if (options.publish) {
    await db.update(topics).set({ visibility: 'public' }).where(eq(topics.id, targetId));
  }

  // The source's remaining children go with it through the FK cascades.
  await db.delete(topics).where(eq(topics.id, sourceId));

  return {
    movedCards: sourceCards.length,
    movedLessons: sourceLessons.length,
    targetTopicId: targetId,
    deletedTopicId: sourceId,
    published: Boolean(options.publish),
  };
}

/**
 * Counts per topic, under one visibility rule, for the pickers and admin lists.
 * Answering "how many questions will I actually get?" before the session starts
 * is what makes the cram picker honest.
 */
export async function topicContentCounts(
  userId: string,
  topicIds: string[],
  opts: { onlyReachable?: boolean } = {},
): Promise<Map<string, { cards: number; lessons: number }>> {
  const counts = new Map<string, { cards: number; lessons: number }>();
  if (topicIds.length === 0) return counts;
  for (const id of topicIds) counts.set(id, { cards: 0, lessons: 0 });

  const [cardRows, lessonRows] = await Promise.all([
    db
      .select({ topicId: cards.topicId, reachable: sql<number>`count(*)::int` })
      .from(cards)
      .where(
        opts.onlyReachable
          ? and(inArray(cards.topicId, topicIds), or(eq(cards.visibility, 'public'), eq(cards.ownerId, userId)))
          : inArray(cards.topicId, topicIds),
      )
      .groupBy(cards.topicId),
    db.select({ topicId: lessons.topicId, n: sql<number>`count(*)::int` }).from(lessons).where(inArray(lessons.topicId, topicIds)).groupBy(lessons.topicId),
  ]);

  for (const row of cardRows) counts.set(row.topicId, { cards: row.reachable, lessons: counts.get(row.topicId)?.lessons ?? 0 });
  for (const row of lessonRows) counts.set(row.topicId, { cards: counts.get(row.topicId)?.cards ?? 0, lessons: row.n });
  return counts;
}

/** Every answer row for a set of cards, for editors who need to see them. */
export async function answersForCards(cardIds: string[]) {
  if (cardIds.length === 0) return [];
  return db.select().from(cardAnswers).where(inArray(cardAnswers.cardId, cardIds));
}
