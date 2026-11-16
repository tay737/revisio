import 'server-only';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { cardAnswers, cards, deckSubscriptions, lessons, subjects, topics, users } from '@/db/schema';
import { ApiError } from '@/services/api';
import { makeSlug } from '@/services/content-ops';
import type { SessionUser } from '@/services/auth';

/**
 * Deck library (#6) — verified, staff/teacher-published decks a student can
 * follow.
 *
 * A "deck" is a public topic that actually holds public cards. Students cannot
 * mint one: their publishes land in `pending_review`, so `visibility='public'`
 * plus a non-empty public card set is the verification signal — the content
 * went through the staff path.
 *
 * Follow is copy-on-follow (the ticket's MVP): the follower gets a private
 * copy of the public lessons/cards under a per-user "Shared decks" subject,
 * and the subscription row snapshots the content counts at follow time so
 * "updated since you followed" is computable. Live propagation is deferred —
 * demand first.
 */

export type PublicDeck = {
  topicId: string;
  name: string;
  description: string;
  subjectName: string;
  authorName: string;
  cardCount: number;
  lessonCount: number;
  followerCount: number;
  /** Present when the user already follows this deck. */
  subscription: {
    id: string;
    copyTopicId: string;
    copySubjectId: string;
    updated: boolean;
  } | null;
};

/** The per-user subject that receives deck copies. */
async function sharedDecksSubject(userId: string) {
  const slug = makeSlug('shared-decks', userId.slice(0, 8));
  const [existing] = await db.select().from(subjects).where(eq(subjects.slug, slug)).limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(subjects)
    .values({
      id: crypto.randomUUID(),
      name: 'Shared decks',
      slug,
      description: 'Private copies of decks you follow from the public library.',
      ownerId: userId,
    })
    .returning();
  return created;
}

export async function listPublicDecks(userId: string): Promise<PublicDeck[]> {
  const deckRows = await db
    .select({
      topic: topics,
      subjectName: subjects.name,
      authorName: users.name,
      authorUsername: users.username,
    })
    .from(topics)
    .innerJoin(subjects, eq(topics.subjectId, subjects.id))
    .leftJoin(users, eq(topics.ownerId, users.id))
    .where(eq(topics.visibility, 'public'))
    .orderBy(asc(subjects.name), asc(topics.name));
  if (deckRows.length === 0) return [];

  const ids = deckRows.map((r) => r.topic.id);
  const [cardCounts, lessonCounts, followerCounts, subs] = await Promise.all([
    db
      .select({ topicId: cards.topicId, n: sql<number>`count(*)::int` })
      .from(cards)
      .where(and(inArray(cards.topicId, ids), eq(cards.visibility, 'public')))
      .groupBy(cards.topicId),
    db
      .select({ topicId: lessons.topicId, n: sql<number>`count(*)::int` })
      .from(lessons)
      .where(and(inArray(lessons.topicId, ids), eq(lessons.visibility, 'public')))
      .groupBy(lessons.topicId),
    db
      .select({ topicId: deckSubscriptions.deckTopicId, n: sql<number>`count(*)::int` })
      .from(deckSubscriptions)
      .where(inArray(deckSubscriptions.deckTopicId, ids))
      .groupBy(deckSubscriptions.deckTopicId),
    db
      .select({
        id: deckSubscriptions.id,
        deckTopicId: deckSubscriptions.deckTopicId,
        copyTopicId: deckSubscriptions.copyTopicId,
        cardsAtFollow: deckSubscriptions.cardsAtFollow,
        lessonsAtFollow: deckSubscriptions.lessonsAtFollow,
        copySubjectId: topics.subjectId,
      })
      .from(deckSubscriptions)
      .innerJoin(topics, eq(deckSubscriptions.copyTopicId, topics.id))
      .where(eq(deckSubscriptions.userId, userId)),
  ]);

  const cardsBy = new Map(cardCounts.map((r) => [r.topicId, r.n]));
  const lessonsBy = new Map(lessonCounts.map((r) => [r.topicId, r.n]));
  const followersBy = new Map(followerCounts.map((r) => [r.topicId, r.n]));
  const subBy = new Map(subs.map((s) => [s.deckTopicId, s]));

  return deckRows
    .map((r) => {
      const cardCount = cardsBy.get(r.topic.id) ?? 0;
      const lessonCount = lessonsBy.get(r.topic.id) ?? 0;
      // A deck with no reachable public card is a shell — listing it would
      // repeat the exact "published but empty" bug visibility.ts documents.
      if (cardCount === 0) return null;
      const sub = subBy.get(r.topic.id);
      return {
        topicId: r.topic.id,
        name: r.topic.name,
        description: r.topic.description,
        subjectName: r.subjectName,
        authorName: r.authorName ?? r.authorUsername ?? 'Revisio',
        cardCount,
        lessonCount,
        followerCount: followersBy.get(r.topic.id) ?? 0,
        subscription: sub
          ? {
              id: sub.id,
              copyTopicId: sub.copyTopicId,
              copySubjectId: sub.copySubjectId,
              updated: sub.cardsAtFollow !== cardCount || sub.lessonsAtFollow !== lessonCount,
            }
          : null,
      } satisfies PublicDeck;
    })
    .filter((d): d is PublicDeck => d !== null);
}

/**
 * Follow a deck: copy its public lessons/cards into a private topic under the
 * user's "Shared decks" subject, then record the subscription.
 *
 * Copies get fresh ids throughout — the follower owns their copy outright and
 * can edit it; source edits never touch it (that is the deferred live-update
 * path). Only `public` lessons and cards are copied, so a partially-private
 * source tree cannot leak.
 */
export async function followDeck(user: SessionUser, deckTopicId: string) {
  const [deck] = await db.select().from(topics).where(eq(topics.id, deckTopicId)).limit(1);
  if (!deck || deck.visibility !== 'public') {
    throw new ApiError(404, 'not_found', 'Deck not found.');
  }

  const [srcLessons, srcCards] = await Promise.all([
    db.select().from(lessons).where(and(eq(lessons.topicId, deckTopicId), eq(lessons.visibility, 'public'))).orderBy(asc(lessons.position)),
    db.select().from(cards).where(and(eq(cards.topicId, deckTopicId), eq(cards.visibility, 'public'))).orderBy(asc(cards.createdAt)),
  ]);
  if (srcCards.length === 0) {
    throw new ApiError(400, 'bad_request', 'That deck has no public questions yet.');
  }

  const [existing] = await db
    .select()
    .from(deckSubscriptions)
    .where(and(eq(deckSubscriptions.userId, user.id), eq(deckSubscriptions.deckTopicId, deckTopicId)))
    .limit(1);
  if (existing) {
    const [copy] = await db.select({ subjectId: topics.subjectId }).from(topics).where(eq(topics.id, existing.copyTopicId)).limit(1);
    return { subscription: existing, copyTopicId: existing.copyTopicId, copySubjectId: copy?.subjectId ?? '', alreadyFollowing: true };
  }

  const subject = await sharedDecksSubject(user.id);

  // Re-follow after unfollow: the subscription row is gone but the private
  // copy stayed. Reuse it rather than minting a duplicate — match by name
  // inside the user's Shared decks subject, most recent wins if legacy
  // duplicates exist. Content is not re-copied (live propagation is deferred,
  // so the existing copy is current-enough); the count snapshots refresh so
  // "updated since you followed" measures from this follow.
  const [priorCopy] = await db
    .select({ id: topics.id })
    .from(topics)
    .where(
      and(
        eq(topics.ownerId, user.id),
        eq(topics.subjectId, subject.id),
        eq(topics.visibility, 'private'),
        eq(topics.name, deck.name),
      ),
    )
    .orderBy(desc(topics.createdAt))
    .limit(1);
  if (priorCopy) {
    const [subscription] = await db
      .insert(deckSubscriptions)
      .values({
        id: crypto.randomUUID(),
        userId: user.id,
        deckTopicId,
        copyTopicId: priorCopy.id,
        cardsAtFollow: srcCards.length,
        lessonsAtFollow: srcLessons.length,
      })
      .returning();
    return { subscription, copyTopicId: priorCopy.id, copySubjectId: subject.id, alreadyFollowing: false };
  }

  const copyTopicId = crypto.randomUUID();
  await db.insert(topics).values({
    id: copyTopicId,
    subjectId: subject.id,
    name: deck.name,
    slug: makeSlug('deck', deck.name, user.id.slice(0, 8), Date.now().toString(36)),
    description: deck.description,
    visibility: 'private',
    ownerId: user.id,
    position: 0,
  });

  // Lessons first — cards point at them through lessonId.
  const lessonIdMap = new Map<string, string>();
  for (const [i, l] of srcLessons.entries()) {
    const newId = crypto.randomUUID();
    lessonIdMap.set(l.id, newId);
    await db.insert(lessons).values({
      id: newId,
      topicId: copyTopicId,
      title: l.title,
      detailedMd: l.detailedMd,
      summaryMd: l.summaryMd,
      specRefs: l.specRefs,
      visibility: 'private',
      ownerId: user.id,
      position: i,
    });
  }

  const cardIdMap = new Map<string, string>();
  for (const c of srcCards) {
    const newId = crypto.randomUUID();
    cardIdMap.set(c.id, newId);
    await db.insert(cards).values({
      id: newId,
      topicId: copyTopicId,
      lessonId: c.lessonId ? (lessonIdMap.get(c.lessonId) ?? null) : null,
      kind: c.kind,
      textWithBlank: c.textWithBlank,
      prompt: c.prompt,
      question: c.question,
      options: c.options,
      correctOptionId: c.correctOptionId,
      explanationMd: c.explanationMd,
      visibility: 'private',
      ownerId: user.id,
      generated: c.generated,
    });
  }

  const srcCardIds = srcCards.map((c) => c.id);
  if (srcCardIds.length) {
    const srcAnswers = await db.select().from(cardAnswers).where(inArray(cardAnswers.cardId, srcCardIds));
    const answerRows = srcAnswers
      .map((a) => {
        const newCardId = cardIdMap.get(a.cardId);
        return newCardId
          ? {
              id: crypto.randomUUID(),
              cardId: newCardId,
              text: a.text,
              isPrimary: a.isPrimary,
              keywords: a.keywords,
              minPoints: a.minPoints,
            }
          : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (answerRows.length) {
      await db.insert(cardAnswers).values(answerRows);
    }
  }

  const [subscription] = await db
    .insert(deckSubscriptions)
    .values({
      id: crypto.randomUUID(),
      userId: user.id,
      deckTopicId,
      copyTopicId,
      cardsAtFollow: srcCards.length,
      lessonsAtFollow: srcLessons.length,
    })
    .returning();

  return { subscription, copyTopicId, copySubjectId: subject.id, alreadyFollowing: false };
}

/** Unfollow: the subscription goes; the private copy stays — it is the user's now. */
export async function unfollowDeck(user: SessionUser, subscriptionId: string) {
  const deleted = await db
    .delete(deckSubscriptions)
    .where(and(eq(deckSubscriptions.id, subscriptionId), eq(deckSubscriptions.userId, user.id)))
    .returning({ id: deckSubscriptions.id });
  if (deleted.length === 0) throw new ApiError(404, 'not_found', 'Subscription not found.');
  return { ok: true };
}
