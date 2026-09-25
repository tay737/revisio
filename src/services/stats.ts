import 'server-only';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { cardUserStates, cards, reviewLogs, topics, userSubjects, userTopicStates } from '@/db/schema';
import { enrolledSubjectIds, studiableCard } from '@/services/visibility';

function startOfToday(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function todayStats(userId: string) {
  // `count(*)` comes back from node-postgres as a *string* (int8 is not parsed),
  // so every count is cast to int here. Without it `dueCount + newCount`
  // concatenated into "00" and every `due > 0` check silently evaluated false.
  const enrolled = await enrolledSubjectIds(userId);
  const [doneRow, correctRow, dueRow, newCards] = await Promise.all([
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(reviewLogs)
      .where(and(eq(reviewLogs.userId, userId), gte(reviewLogs.reviewedAt, startOfToday()))),
    // Correct count is read from the stored verdict, not assumed to equal the
    // review count — the dashboard's personalised copy quotes this back.
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(reviewLogs)
      .where(
        and(
          eq(reviewLogs.userId, userId),
          gte(reviewLogs.reviewedAt, startOfToday()),
          sql`(${reviewLogs.graded} ->> 'correct')::boolean is true`,
        ),
      ),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(cardUserStates)
      .where(and(eq(cardUserStates.userId, userId), sql`${cardUserStates.dueAt} <= now()`)),
    // New cards are counted under the same rule the queue deals them by, so the
    // dashboard's "N waiting" cannot disagree with the queue's length.
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(cards)
      .innerJoin(topics, eq(cards.topicId, topics.id))
      .leftJoin(cardUserStates, and(eq(cardUserStates.cardId, cards.id), eq(cardUserStates.userId, userId)))
      .where(and(studiableCard(userId, enrolled), sql`${cardUserStates.cardId} IS NULL`)),
  ]);
  return {
    reviewsToday: doneRow[0]?.c ?? 0,
    correctToday: correctRow[0]?.c ?? 0,
    dueCount: dueRow[0]?.c ?? 0,
    newCount: newCards[0]?.c ?? 0,
  };
}

/** Per-topic mastery for the transcript / dashboards. Subject follows the topics. */
export async function topicMastery(userId: string) {
  const enrolled = await enrolledSubjectIds(userId);
  return db
    .select({
      topicId: topics.id,
      topicName: topics.name,
      subjectId: topics.subjectId,
      total: sql<number>`count(distinct ${cards.id})::int`,
      mastered: sql<number>`count(distinct case when ${cardUserStates.stage} = 'mastered' then ${cards.id} end)::int`,
      started: sql<number>`count(distinct case when ${cardUserStates.stage} is not null then ${cards.id} end)::int`,
    })
    .from(topics)
    .innerJoin(cards, eq(cards.topicId, topics.id))
    .leftJoin(cardUserStates, and(eq(cardUserStates.cardId, cards.id), eq(cardUserStates.userId, userId)))
    .leftJoin(userSubjects, eq(userSubjects.subjectId, topics.subjectId))
    .where(studiableCard(userId, enrolled))
    .groupBy(topics.id, topics.name, topics.subjectId);
}
