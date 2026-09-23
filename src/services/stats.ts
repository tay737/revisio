import 'server-only';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { cardUserStates, cards, reviewLogs, topics, userSubjects, userTopicStates } from '@/db/schema';

function startOfToday(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function todayStats(userId: string) {
  const [doneRow, dueRow, newCards] = await Promise.all([
    db
      .select({ c: sql<number>`count(*)` })
      .from(reviewLogs)
      .where(and(eq(reviewLogs.userId, userId), gte(reviewLogs.reviewedAt, startOfToday()))),
    db
      .select({ c: sql<number>`count(*)` })
      .from(cardUserStates)
      .where(and(eq(cardUserStates.userId, userId), sql`${cardUserStates.dueAt} <= now()`)),
    db
      .select({ c: sql<number>`count(*)` })
      .from(cards)
      .innerJoin(topics, eq(cards.topicId, topics.id))
      .innerJoin(userSubjects, eq(topics.subjectId, userSubjects.subjectId))
      .leftJoin(cardUserStates, and(eq(cardUserStates.cardId, cards.id), eq(cardUserStates.userId, userId)))
      .where(and(eq(userSubjects.userId, userId), eq(cards.visibility, 'public'), sql`${cardUserStates.cardId} IS NULL`)),
  ]);
  return {
    reviewsToday: doneRow[0]?.c ?? 0,
    dueCount: dueRow[0]?.c ?? 0,
    newCount: newCards[0]?.c ?? 0,
  };
}

/** Per-topic mastery for the transcript / dashboards. */
export async function topicMastery(userId: string) {
  return db
    .select({
      topicId: topics.id,
      topicName: topics.name,
      subjectId: topics.subjectId,
      total: sql<number>`count(distinct ${cards.id})`,
      mastered: sql<number>`count(distinct case when ${cardUserStates.stage} = 'mastered' then ${cards.id} end)`,
      started: sql<number>`count(distinct case when ${cardUserStates.stage} is not null then ${cards.id} end)`,
    })
    .from(topics)
    .innerJoin(cards, eq(cards.topicId, topics.id))
    .leftJoin(cardUserStates, and(eq(cardUserStates.cardId, cards.id), eq(cardUserStates.userId, userId)))
    .innerJoin(userSubjects, eq(userSubjects.subjectId, topics.subjectId))
    .where(and(eq(userSubjects.userId, userId), eq(cards.visibility, 'public')))
    .groupBy(topics.id, topics.name, topics.subjectId);
}
