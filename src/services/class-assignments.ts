import 'server-only';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  cardUserStates, cards, classAssignments, classes, classMemberships, reviewLogs, topics, users,
} from '@/db/schema';
import { ApiError } from '@/services/api';
import { canManageContent, isDeveloper } from '@/services/roles';
import type { SessionUser } from '@/services/auth';

function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

// ── assigned decks (#5) ─────────────────────────────────────────────────────
// A teacher pins a topic to a class with a deadline and a required flag.
// Completion is never stored — it is derived from review_logs/card_user_states
// at read time, so it cannot drift from what students actually did.

async function ownedClass(user: SessionUser, classId: string) {
  const [cls] = await db.select().from(classes).where(eq(classes.id, classId)).limit(1);
  if (!cls) throw new ApiError(404, 'not_found', 'Class not found.');
  if (cls.teacherId !== user.id && !isDeveloper(user)) throw new ApiError(403, 'forbidden', 'Not your class.');
  return cls;
}

async function isMember(userId: string, classId: string): Promise<boolean> {
  const [row] = await db
    .select({ classId: classMemberships.classId })
    .from(classMemberships)
    .where(and(eq(classMemberships.classId, classId), eq(classMemberships.userId, userId)))
    .limit(1);
  return !!row;
}

/** topicId + class name + topic name for every assignment in a class. */
export async function listAssignments(user: SessionUser, classId: string) {
  const cls = await db.select().from(classes).where(eq(classes.id, classId)).limit(1);
  if (!cls[0]) throw new ApiError(404, 'not_found', 'Class not found.');
  const teacher = cls[0].teacherId === user.id || isDeveloper(user);
  if (!teacher && !(await isMember(user.id, classId))) {
    throw new ApiError(403, 'forbidden', 'Only the teacher or class members can see assignments.');
  }
  const rows = await db
    .select({
      assignment: classAssignments,
      topicName: topics.name,
      subjectId: topics.subjectId,
    })
    .from(classAssignments)
    .innerJoin(topics, eq(classAssignments.topicId, topics.id))
    .where(eq(classAssignments.classId, classId))
    .orderBy(desc(classAssignments.createdAt));
  return rows.map((r) => ({
    id: r.assignment.id,
    classId: r.assignment.classId,
    topicId: r.assignment.topicId,
    topicName: r.topicName,
    subjectId: r.subjectId,
    dueDate: r.assignment.dueDate,
    noteDensity: r.assignment.noteDensity,
    required: r.assignment.required,
    note: r.assignment.note,
    createdAt: r.assignment.createdAt.toISOString(),
  }));
}

export async function createAssignment(user: SessionUser, input: Record<string, unknown>) {
  if (!canManageContent(user)) throw new ApiError(403, 'forbidden', 'Teachers and developers only.');
  const classId = String(input.classId ?? '');
  const topicId = String(input.topicId ?? '');
  if (!classId || !topicId) throw new ApiError(400, 'bad_request', 'classId and topicId are required.', 'topicId');
  await ownedClass(user, classId);

  const [topic] = await db.select({ id: topics.id }).from(topics).where(eq(topics.id, topicId)).limit(1);
  if (!topic) throw new ApiError(404, 'not_found', 'Topic not found.');

  const dueDate = input.dueDate === undefined || input.dueDate === null ? null : String(input.dueDate);
  if (dueDate !== null && !isDate(dueDate)) throw new ApiError(400, 'bad_request', 'dueDate must be YYYY-MM-DD.', 'dueDate');

  const noteDensity = ['light', 'standard', 'deep'].includes(String(input.noteDensity)) ? String(input.noteDensity) : 'standard';
  const note = String(input.note ?? '').slice(0, 500);

  const [row] = await db
    .insert(classAssignments)
    .values({
      id: crypto.randomUUID(), classId, topicId, dueDate,
      noteDensity: noteDensity as 'light' | 'standard' | 'deep',
      required: input.required !== false,
      note, createdBy: user.id,
    })
    .onConflictDoUpdate({
      target: [classAssignments.classId, classAssignments.topicId],
      set: { dueDate, noteDensity: noteDensity as 'light' | 'standard' | 'deep', required: input.required !== false, note },
    })
    .returning();
  return { id: row.id, classId, topicId, dueDate, noteDensity, required: row.required, note };
}

export async function updateAssignment(user: SessionUser, id: string, input: Record<string, unknown>) {
  if (!canManageContent(user)) throw new ApiError(403, 'forbidden', 'Teachers and developers only.');
  const [row] = await db.select().from(classAssignments).where(eq(classAssignments.id, id)).limit(1);
  if (!row) throw new ApiError(404, 'not_found', 'Assignment not found.');
  await ownedClass(user, row.classId);

  const patch: Partial<typeof classAssignments.$inferInsert> = {};
  if (input.dueDate !== undefined) {
    const dueDate = input.dueDate === null ? null : String(input.dueDate);
    if (dueDate !== null && !isDate(dueDate)) throw new ApiError(400, 'bad_request', 'dueDate must be YYYY-MM-DD.', 'dueDate');
    patch.dueDate = dueDate;
  }
  if (input.noteDensity !== undefined) {
    if (!['light', 'standard', 'deep'].includes(String(input.noteDensity))) {
      throw new ApiError(400, 'bad_request', 'noteDensity must be light, standard or deep.', 'noteDensity');
    }
    patch.noteDensity = String(input.noteDensity) as 'light' | 'standard' | 'deep';
  }
  if (input.required !== undefined) patch.required = !!input.required;
  if (input.note !== undefined) patch.note = String(input.note).slice(0, 500);
  const [updated] = await db.update(classAssignments).set(patch).where(eq(classAssignments.id, id)).returning();
  return updated;
}

export async function deleteAssignment(user: SessionUser, id: string) {
  if (!canManageContent(user)) throw new ApiError(403, 'forbidden', 'Teachers and developers only.');
  const [row] = await db.select().from(classAssignments).where(eq(classAssignments.id, id)).limit(1);
  if (!row) throw new ApiError(404, 'not_found', 'Assignment not found.');
  await ownedClass(user, row.classId);
  await db.delete(classAssignments).where(eq(classAssignments.id, id));
  return { ok: true };
}

/**
 * topicIds a learner must see boosted in their queue: REQUIRED assignments in
 * classes they belong to. Optional assignments inform the teacher view but do
 * not reorder a student's day — the student chose to be in the class, not to
 * be scheduled by it.
 */
export async function requiredAssignmentTopicIds(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ topicId: classAssignments.topicId })
    .from(classAssignments)
    .innerJoin(classMemberships, eq(classAssignments.classId, classMemberships.classId))
    .where(and(eq(classMemberships.userId, userId), eq(classAssignments.required, true)));
  return new Set(rows.map((r) => r.topicId));
}

/**
 * Class retrieval pulse: per-card struggle across the whole roster, plus
 * per-assignment completion. Teacher-only. Aggregation is four grouped
 * queries regardless of class size — the same shape as /teacher GET.
 */
export async function classPulse(user: SessionUser, classId: string, topicId?: string) {
  const cls = await ownedClass(user, classId);
  const members = await db
    .select({ userId: classMemberships.userId, name: users.name })
    .from(classMemberships)
    .innerJoin(users, eq(classMemberships.userId, users.id))
    .where(eq(classMemberships.classId, classId));
  const memberIds = members.map((m) => m.userId);
  if (memberIds.length === 0) {
    return { class: { id: cls.id, name: cls.name }, members: 0, cards: [], assignments: [] };
  }

  const assignmentRows = await db
    .select({ assignment: classAssignments, topicName: topics.name, cardCount: sql<number>`count(distinct ${cards.id})::int` })
    .from(classAssignments)
    .innerJoin(topics, eq(classAssignments.topicId, topics.id))
    .leftJoin(cards, and(eq(cards.topicId, classAssignments.topicId), eq(cards.visibility, 'public')))
    .where(eq(classAssignments.classId, classId))
    .groupBy(classAssignments.id, topics.name)
    .orderBy(desc(classAssignments.createdAt));

  // Per-assignment completion: distinct topic cards each member has reviewed
  // since the assignment was created.
  const assignedTopicIds = assignmentRows.map((r) => r.assignment.topicId);
  const completionRows = assignedTopicIds.length
    ? await db
        .select({
          topicId: cards.topicId,
          userId: reviewLogs.userId,
          touched: sql<number>`count(distinct ${reviewLogs.cardId})::int`,
        })
        .from(reviewLogs)
        .innerJoin(cards, eq(reviewLogs.cardId, cards.id))
        .innerJoin(classAssignments, and(eq(classAssignments.topicId, cards.topicId), eq(classAssignments.classId, classId)))
        .where(and(inArray(reviewLogs.userId, memberIds), inArray(cards.topicId, assignedTopicIds), sql`${reviewLogs.reviewedAt} >= ${classAssignments.createdAt}`))
        .groupBy(cards.topicId, reviewLogs.userId)
    : [];
  const touchedBy = new Map(completionRows.map((r) => [`${r.topicId}:${r.userId}`, r.touched]));

  // Per-card struggle for the pulse: reviews, miss rate, mean duration, lapses.
  const cardRows = await db
    .select({
      cardId: reviewLogs.cardId,
      kind: cards.kind,
      prompt: sql<string | null>`coalesce(${cards.textWithBlank}, ${cards.prompt}, ${cards.question})`,
      topicId: cards.topicId,
      topicName: topics.name,
      reviews: sql<number>`count(*)::int`,
      misses: sql<number>`coalesce(sum(case when ${reviewLogs.graded} ->> 'correct' = 'false' then 1 else 0 end), 0)::int`,
      avgDurationMs: sql<number>`coalesce(round(avg(${reviewLogs.durationMs})), 0)::int`,
    })
    .from(reviewLogs)
    .innerJoin(cards, eq(reviewLogs.cardId, cards.id))
    .innerJoin(topics, eq(cards.topicId, topics.id))
    .where(and(inArray(reviewLogs.userId, memberIds), ...(topicId ? [eq(cards.topicId, topicId)] : [])))
    .groupBy(reviewLogs.cardId, cards.kind, cards.textWithBlank, cards.prompt, cards.question, cards.topicId, topics.name)
    .orderBy(sql`count(*) desc`)
    .limit(60);

  // Lapses are per (user, card) state, not per review — summing them through
  // the review join would multiply each member's count by their review count.
  const cardIds = cardRows.map((c) => c.cardId);
  const lapseRows = cardIds.length
    ? await db
        .select({ cardId: cardUserStates.cardId, lapses: sql<number>`coalesce(sum(${cardUserStates.lapses}), 0)::int` })
        .from(cardUserStates)
        .where(and(inArray(cardUserStates.userId, memberIds), inArray(cardUserStates.cardId, cardIds)))
        .groupBy(cardUserStates.cardId)
    : [];
  const lapsesByCard = new Map(lapseRows.map((r) => [r.cardId, r.lapses]));

  const assignments = assignmentRows.map((r) => {
    const total = Number(r.cardCount ?? 0);
    const roster = members.map((m) => {
      const touched = touchedBy.get(`${r.assignment.topicId}:${m.userId}`) ?? 0;
      return { userId: m.userId, name: m.name, touched, total, completionPct: total ? Math.round((touched / total) * 100) : 0 };
    });
    const classAvg = roster.length ? Math.round(roster.reduce((s, x) => s + x.completionPct, 0) / roster.length) : 0;
    return {
      id: r.assignment.id, topicId: r.assignment.topicId, topicName: r.topicName,
      dueDate: r.assignment.dueDate, required: r.assignment.required,
      cardCount: total, classAvgCompletionPct: classAvg, roster,
    };
  });

  return {
    class: { id: cls.id, name: cls.name, subjectId: cls.subjectId },
    members: memberIds.length,
    cards: cardRows.map((c) => ({
      cardId: c.cardId, kind: c.kind, prompt: c.prompt, topicId: c.topicId, topicName: c.topicName,
      reviews: c.reviews, missRatePct: c.reviews ? Math.round((c.misses / c.reviews) * 100) : 0,
      avgDurationMs: c.avgDurationMs, lapses: lapsesByCard.get(c.cardId) ?? 0,
    })),
    assignments,
  };
}
