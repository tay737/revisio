import 'server-only';
import { and, eq, inArray, or, type SQL } from 'drizzle-orm';
import { db } from '@/db/client';
import { cards, lessons, topics, userSubjects } from '@/db/schema';

/**
 * Visibility — the single owner of "may this user see or study this?".
 *
 * Before this module that question was answered in nine places with four
 * different rules, and the disagreement was not academic. The cram picker
 * counted every card in a topic, while the cram *queue* demanded
 * `cards.visibility = 'public'` — so a user's own imported deck was advertised
 * as "12 questions" and then dealt zero. The review queue was stricter again,
 * requiring a public topic *and* a public card *and* an enrolment, so a private
 * deck was unstudiable everywhere at once, and `visibleContentCondition` — the
 * one function that was supposed to own this — was exported, imported once and
 * never called.
 *
 * The rule, stated once:
 *
 *   - a topic reaches you if it is public, or you own it
 *   - a card inside it reaches you if it is public, or you own it
 *   - following the subject matters only for content that is not yours
 *
 * Authoring rights are deliberately *not* here. "May edit" is a role question
 * and lives in services/roles.ts; conflating the two is what made a developer's
 * own content invisible to the developer.
 */

export type Visibility = 'public' | 'pending_review' | 'private';

/** The in-memory form of the rule, for rows already loaded. */
export function reachesUser(visibility: string, ownerId: string | null, userId: string): boolean {
  return visibility === 'public' || ownerId === userId;
}

/** May this user open the topic at all (read its notes, see it listed)? */
export function topicReaches(userId: string): SQL | undefined {
  return or(eq(topics.visibility, 'public'), eq(topics.ownerId, userId));
}

export function cardReaches(userId: string): SQL | undefined {
  return or(eq(cards.visibility, 'public'), eq(cards.ownerId, userId));
}

export function lessonReaches(userId: string): SQL | undefined {
  return or(eq(lessons.visibility, 'public'), eq(lessons.ownerId, userId));
}

/** Subjects this user follows. Empty is meaningful, not an error. */
export async function enrolledSubjectIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ subjectId: userSubjects.subjectId })
    .from(userSubjects)
    .where(eq(userSubjects.userId, userId));
  return rows.map((r) => r.subjectId);
}

/**
 * The condition for "a card this user may be dealt in the daily queue".
 * Expects the query to join `cards` → `topics`. `enrolled` is passed in rather
 * than looked up so a caller can reuse one lookup, but it is never optional to
 * *think about*: an empty list means public content is simply not on offer.
 */
export function studiableCard(userId: string, enrolled: string[]): SQL | undefined {
  const mine = or(eq(topics.ownerId, userId), eq(cards.ownerId, userId));

  // Yours: no enrolment needed, but the card must still reach you.
  const owned = and(mine, cardReaches(userId), topicReaches(userId));

  // Not yours: it must be published on both layers and inside a subject you follow.
  const followed = enrolled.length
    ? and(
        eq(topics.visibility, 'public'),
        eq(cards.visibility, 'public'),
        inArray(topics.subjectId, enrolled),
      )
    : undefined;

  return followed ? or(owned, followed) : owned;
}

/**
 * The condition for a card in an explicitly chosen set of topics (cram, exam
 * practice). Enrolment is irrelevant — the user picked these topics by hand —
 * but visibility still is, which is what the old queue got wrong.
 */
export function studiableCardIn(userId: string, topicIds: string[]): SQL | undefined {
  if (topicIds.length === 0) return undefined;
  return and(inArray(cards.topicId, topicIds), topicReaches(userId), cardReaches(userId));
}
