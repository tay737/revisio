import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { cardUserStates, cards, reviewLogs, streaks, subjects, topics, users, xpEvents } from '@/db/schema';
import { srsInfoForState } from '@/domain/srs';

/**
 * One learner's progress, as data — the single source both staff panels and the
 * learner's own Strength tab read, so the two can never disagree.
 *
 * Everything is a handful of grouped queries, cast at the SQL boundary
 * (`count(*)` arrives from node-postgres as a string otherwise). Strength comes
 * from the 12-level SRS ladder in domain/srs, derived from the stored scheduler
 * state — no new columns, no migration, and neither view can disagree with what
 * the learner's own review loop shows.
 */
export async function buildInsights(userId: string) {
  const monthAgo = new Date(Date.now() - 30 * 86_400_000);

  const [[student], totals, correctnessRows, streakRow, xpRow, dueRows, struggleRows, recentRows, topicMasterRows] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, email: users.email, createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    // Lifetime reviews.
    db.select({ n: sql<number>`count(*)::int` }).from(reviewLogs).where(eq(reviewLogs.userId, userId)),
    // Correct / total, lifetime and this month, in one pass.
    db
      .select({
        total: sql<number>`count(*)::int`,
        correct: sql<number>`coalesce(sum(case when ${reviewLogs.graded} ->> 'correct' = 'true' then 1 else 0 end), 0)::int`,
        monthTotal: sql<number>`coalesce(sum(case when ${reviewLogs.reviewedAt} >= ${monthAgo.toISOString()} then 1 else 0 end), 0)::int`,
        monthCorrect: sql<number>`coalesce(sum(case when ${reviewLogs.reviewedAt} >= ${monthAgo.toISOString()} and ${reviewLogs.graded} ->> 'correct' = 'true' then 1 else 0 end), 0)::int`,
      })
      .from(reviewLogs)
      .where(eq(reviewLogs.userId, userId)),
    db.select({ current: streaks.current, best: streaks.best }).from(streaks).where(eq(streaks.userId, userId)).limit(1),
    db.select({ total: sql<number>`coalesce(sum(${xpEvents.amount}), 0)::int` }).from(xpEvents).where(eq(xpEvents.userId, userId)),
    // The scheduler state of every card the learner has ever touched, with the
    // card and topic names — the raw material for strength and struggle.
    db
      .select({
        cardId: cardUserStates.cardId,
        stage: cardUserStates.stage,
        intervalDays: cardUserStates.intervalDays,
        dueAt: cardUserStates.dueAt,
        lapses: cardUserStates.lapses,
        reps: cardUserStates.reps,
        lastReviewedAt: cardUserStates.lastReviewedAt,
        cardKind: cards.kind,
        prompt: sql<string | null>`coalesce(${cards.textWithBlank}, ${cards.prompt}, ${cards.question})`,
        topicId: topics.id,
        topicName: topics.name,
        subjectId: subjects.id,
        subjectName: subjects.name,
      })
      .from(cardUserStates)
      .innerJoin(cards, eq(cardUserStates.cardId, cards.id))
      .innerJoin(topics, eq(cards.topicId, topics.id))
      .innerJoin(subjects, eq(topics.subjectId, subjects.id))
      .where(eq(cardUserStates.userId, userId))
      .orderBy(desc(cardUserStates.dueAt)),
    // Where the answers went wrong: cards graded incorrect in the last month,
    // most-missed first. A card may appear several times; the caller aggregates.
    db
      .select({
        cardId: reviewLogs.cardId,
        misses: sql<number>`count(*)::int`,
        lastMissedAt: sql<Date>`max(${reviewLogs.reviewedAt})`,
      })
      .from(reviewLogs)
      .where(and(eq(reviewLogs.userId, userId), sql`${reviewLogs.reviewedAt} >= ${monthAgo.toISOString()}`, sql`${reviewLogs.graded} ->> 'correct' = 'false'`))
      .groupBy(reviewLogs.cardId)
      .orderBy(sql`count(*) desc`)
      .limit(12),
    // The last twenty answers, for the "what was actually typed" view.
    db
      .select({
        id: reviewLogs.id,
        cardId: reviewLogs.cardId,
        mode: reviewLogs.mode,
        rating: reviewLogs.rating,
        userAnswer: reviewLogs.userAnswer,
        graded: reviewLogs.graded,
        xpAwarded: reviewLogs.xpAwarded,
        durationMs: reviewLogs.durationMs,
        reviewedAt: reviewLogs.reviewedAt,
        cardKind: cards.kind,
        prompt: sql<string | null>`coalesce(${cards.textWithBlank}, ${cards.prompt}, ${cards.question})`,
        topicName: topics.name,
        subjectName: subjects.name,
      })
      .from(reviewLogs)
      .innerJoin(cards, eq(reviewLogs.cardId, cards.id))
      .innerJoin(topics, eq(cards.topicId, topics.id))
      .innerJoin(subjects, eq(topics.subjectId, subjects.id))
      .where(eq(reviewLogs.userId, userId))
      .orderBy(desc(reviewLogs.reviewedAt))
      .limit(20),
    // Per-topic health: state counts and a 30-day miss count per topic.
    db
      .select({
        topicId: topics.id,
        topicName: topics.name,
        subjectName: subjects.name,
        states: sql<number>`count(*)::int`,
        mastered: sql<number>`coalesce(sum(case when ${cardUserStates.stage} = 'mastered' then 1 else 0 end), 0)::int`,
        lapses: sql<number>`coalesce(sum(${cardUserStates.lapses}), 0)::int`,
      })
      .from(cardUserStates)
      .innerJoin(cards, eq(cardUserStates.cardId, cards.id))
      .innerJoin(topics, eq(cards.topicId, topics.id))
      .innerJoin(subjects, eq(topics.subjectId, subjects.id))
      .where(eq(cardUserStates.userId, userId))
      .groupBy(topics.id, topics.name, subjects.name),
  ]);

  // ── Strength ladder ───────────────────────────────────────────────────────
  const srsLevels = Array.from({ length: 12 }, (_, i) => ({ level: i + 1, count: 0 }));
  const strengthRows = dueRows.map((r) => {
    const info = srsInfoForState({ stage: r.stage, intervalDays: r.intervalDays });
    srsLevels[info.level - 1].count += 1;
    return { ...r, srsLevel: info.level, srsLabel: info.label };
  });

  const totalCards = strengthRows.length;
  const dueCount = strengthRows.filter((r) => r.dueAt && r.dueAt.getTime() <= Date.now()).length;

  // ── Struggling topics: misses aggregated per topic ────────────────────────
  const struggleByTopic = new Map<string, { topicId: string; topicName: string; subjectName: string; misses: number; lastMissedAt: Date | null }>();
  for (const s of struggleRows) {
    const meta = strengthRows.find((r) => r.cardId === s.cardId);
    if (!meta) continue;
    const key = meta.topicId;
    const cur = struggleByTopic.get(key) ?? {
      topicId: key, topicName: meta.topicName, subjectName: meta.subjectName, misses: 0, lastMissedAt: null as Date | null,
    };
    cur.misses += s.misses;
    if (s.lastMissedAt && (!cur.lastMissedAt || s.lastMissedAt > cur.lastMissedAt)) cur.lastMissedAt = s.lastMissedAt;
    struggleByTopic.set(key, cur);
  }
  const struggling = [...struggleByTopic.values()].sort((a, b) => b.misses - a.misses).slice(0, 6);

  // Per-topic roll-up, weakest first (most lapses, least mastery).
  const topicHealth = topicMasterRows
    .map((t) => ({
      ...t,
      masteryPct: t.states > 0 ? Math.round((t.mastered / t.states) * 100) : 0,
      missCount: struggleByTopic.get(t.topicId)?.misses ?? 0,
    }))
    .sort((a, b) => b.missCount - a.missCount || b.lapses - a.lapses || a.masteryPct - b.masteryPct);

  const soonest = strengthRows
    .filter((r) => r.dueAt && r.dueAt.getTime() > Date.now())
    .sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime())
    .slice(0, 8);

  return {
    student,
    overview: {
      totalReviews: totals[0]?.n ?? 0,
      totalCards,
      correctPct: correctnessRows[0]?.total ? Math.round(((correctnessRows[0].correct ?? 0) / correctnessRows[0].total) * 100) : null,
      monthCorrectPct: correctnessRows[0]?.monthTotal ? Math.round(((correctnessRows[0].monthCorrect ?? 0) / correctnessRows[0].monthTotal) * 100) : null,
      monthReviews: correctnessRows[0]?.monthTotal ?? 0,
      xp: xpRow[0]?.total ?? 0,
      streak: streakRow[0]?.current ?? 0,
      bestStreak: streakRow[0]?.best ?? 0,
      dueCount,
    },
    srsLevels,
    distribution: strengthRows
      .slice()
      .sort((a, b) => a.srsLevel - b.srsLevel || (b.lastReviewedAt?.getTime() ?? 0) - (a.lastReviewedAt?.getTime() ?? 0))
      .slice(0, 60)
      .map((r) => ({
        cardId: r.cardId,
        kind: r.cardKind,
        prompt: r.prompt,
        topicId: r.topicId,
        topicName: r.topicName,
        subjectName: r.subjectName,
        stage: r.stage,
        srsLevel: r.srsLevel,
        srsLabel: r.srsLabel,
        dueAt: r.dueAt,
        lapses: r.lapses,
        reps: r.reps,
        lastReviewedAt: r.lastReviewedAt,
      })),
    struggling,
    topicHealth,
    recent: recentRows.map((r) => ({
      id: r.id,
      cardId: r.cardId,
      mode: r.mode,
      rating: r.rating,
      correct: r.graded?.correct ?? null,
      userAnswer: r.userAnswer,
      prompt: r.prompt,
      cardKind: r.cardKind,
      topicName: r.topicName,
      subjectName: r.subjectName,
      xpAwarded: r.xpAwarded,
      durationMs: r.durationMs,
      reviewedAt: r.reviewedAt,
    })),
    upcoming: soonest.map((r) => ({
      cardId: r.cardId,
      prompt: r.prompt,
      cardKind: r.cardKind,
      topicName: r.topicName,
      srsLevel: r.srsLevel,
      srsLabel: r.srsLabel,
      dueAt: r.dueAt,
    })),
    // Subjects the learner actually touches, derived from their own cards —
    // not the platform's full catalogue.
    subjects: [...new Map(strengthRows.map((r) => [r.subjectId, { id: r.subjectId, name: r.subjectName }])).values()],
  };
}
