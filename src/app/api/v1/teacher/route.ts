import { NextRequest } from 'next/server';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { cardUserStates, classes, classMemberships, reviewLogs, streaks, subjects, topics, users, xpEvents } from '@/db/schema';
import { ApiError, ok, requireUser, route } from '@/services/api';
import { canManageContent } from '@/services/roles';
import { makeSlug, setTopicVisibility } from '@/services/content-ops';
import type { Visibility } from '@/services/visibility';

function newCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // unambiguous charset
  let s = '';
  for (let i = 0; i < 6; i += 1) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

/**
 * GET /teacher — my classes with a per-student roster.
 *
 * The roster used to cost four round-trips *per student*: a class of thirty was
 * 120 sequential queries to a database in another region before the page could
 * render. It is now four grouped queries in total, whatever the class size.
 */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  if (!canManageContent(user)) throw new ApiError(403, 'forbidden', 'Teachers and developers only.');

  const myClasses = await db.select().from(classes).where(eq(classes.teacherId, user.id)).orderBy(desc(classes.createdAt));
  const classIds = myClasses.map((c) => c.id);

  const members = classIds.length
    ? await db
        .select({ classId: classMemberships.classId, userId: users.id, name: users.name, email: users.email })
        .from(classMemberships)
        .innerJoin(users, eq(classMemberships.userId, users.id))
        .where(inArray(classMemberships.classId, classIds))
    : [];

  const memberIds = [...new Set(members.map((m) => m.userId))];
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);

  // `count(*)` arrives from node-postgres as a string, so every aggregate is
  // cast in SQL rather than coerced in JavaScript.
  const [reviewRows, xpRows, streakRows, masteryRows] = await Promise.all([
    memberIds.length
      ? db
          .select({ userId: reviewLogs.userId, n: sql<number>`count(*)::int` })
          .from(reviewLogs)
          .where(and(inArray(reviewLogs.userId, memberIds), sql`${reviewLogs.reviewedAt} >= ${weekAgo.toISOString()}`))
          .groupBy(reviewLogs.userId)
      : Promise.resolve([]),
    memberIds.length
      ? db
          .select({ userId: xpEvents.userId, n: sql<number>`coalesce(sum(${xpEvents.amount}), 0)::int` })
          .from(xpEvents)
          .where(and(inArray(xpEvents.userId, memberIds), sql`${xpEvents.occurredAt} >= ${weekAgo.toISOString()}`))
          .groupBy(xpEvents.userId)
      : Promise.resolve([]),
    memberIds.length
      ? db.select({ userId: streaks.userId, current: streaks.current }).from(streaks).where(inArray(streaks.userId, memberIds))
      : Promise.resolve([]),
    memberIds.length
      ? db
          .select({
            userId: cardUserStates.userId,
            pct: sql<number>`coalesce(avg(case when ${cardUserStates.stage} = 'mastered' then 100.0 when ${cardUserStates.stage} = 'review' then 70.0 when ${cardUserStates.stage} = 'learning' then 40.0 else 0 end), 0)::int`,
          })
          .from(cardUserStates)
          .where(inArray(cardUserStates.userId, memberIds))
          .groupBy(cardUserStates.userId)
      : Promise.resolve([]),
  ]);

  const byUser = <T extends { userId: string }>(rows: T[]) => new Map(rows.map((r) => [r.userId, r]));
  const reviews = byUser(reviewRows);
  const xp = byUser(xpRows);
  const streakMap = byUser(streakRows);
  const mastery = byUser(masteryRows);

  const roster = members.map((m) => ({
    classId: m.classId,
    userId: m.userId,
    name: m.name,
    email: m.email,
    reviews7d: reviews.get(m.userId)?.n ?? 0,
    xp7d: xp.get(m.userId)?.n ?? 0,
    streak: streakMap.get(m.userId)?.current ?? 0,
    masteryPct: mastery.get(m.userId)?.pct ?? 0,
  }));

  const subjectList = await db.select({ id: subjects.id, name: subjects.name }).from(subjects).orderBy(subjects.name);
  return ok({
    classes: myClasses.map((c) => ({ ...c, roster: roster.filter((r) => r.classId === c.id) })),
    subjects: subjectList,
  });
});

/** POST /teacher — classes, join codes, publishing content, subjects. */
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  if (!canManageContent(user)) throw new ApiError(403, 'forbidden', 'Teachers and developers only.');
  const body = (await req.json()) as {
    action: 'create_class' | 'rotate_code' | 'create_public_topic' | 'create_subject' | 'rename_subject' | 'set_topic_visibility';
    name?: string;
    description?: string;
    subjectId?: string;
    classId?: string;
    topicId?: string;
    visibility?: Visibility;
  };

  switch (body.action) {
    case 'create_class': {
      if (!body.name) throw new ApiError(400, 'bad_request', 'Give the class a name.');
      let code = newCode();
      for (let i = 0; i < 5; i += 1) {
        const [clash] = await db.select({ id: classes.id }).from(classes).where(eq(classes.joinCode, code)).limit(1);
        if (!clash) break;
        code = newCode();
      }
      const [cls] = await db
        .insert(classes)
        .values({ id: crypto.randomUUID(), teacherId: user.id, name: body.name, subjectId: body.subjectId ?? '', joinCode: code })
        .returning();
      return ok({ class: cls }, { status: 201 });
    }

    case 'rotate_code': {
      if (!body.classId) throw new ApiError(400, 'bad_request', 'classId required');
      const [cls] = await db.select().from(classes).where(eq(classes.id, body.classId)).limit(1);
      if (!cls) throw new ApiError(404, 'not_found', 'Class not found.');
      if (cls.teacherId !== user.id) throw new ApiError(403, 'forbidden', 'Not your class.');
      const [updated] = await db.update(classes).set({ joinCode: newCode() }).where(eq(classes.id, cls.id)).returning();
      return ok({ class: updated });
    }

    case 'create_public_topic':
    case 'set_topic_visibility': {
      if (!body.topicId) throw new ApiError(400, 'bad_request', 'topicId required');
      const visibility: Visibility = body.action === 'create_public_topic' ? 'public' : body.visibility ?? 'public';
      // Publishing a topic publishes its lessons and cards too. Setting only the
      // topic flag is how a topic could read as published and behave as empty:
      // students would open it and find no question they were allowed to answer.
      const counts = await setTopicVisibility(user, body.topicId, visibility);
      return ok({ ok: true, visibility, ...counts });
    }

    case 'create_subject': {
      if (!body.name) throw new ApiError(400, 'bad_request', 'Give the subject a name.');
      const slug = makeSlug(body.name);
      const [existing] = await db.select({ id: subjects.id }).from(subjects).where(eq(subjects.slug, slug)).limit(1);
      if (existing) throw new ApiError(409, 'conflict', 'A subject with that name already exists.');
      const [subject] = await db
        .insert(subjects)
        .values({ id: crypto.randomUUID(), name: body.name, slug, description: body.description ?? '' })
        .returning();
      return ok({ subject }, { status: 201 });
    }

    case 'rename_subject': {
      if (!body.subjectId || !body.name) throw new ApiError(400, 'bad_request', 'subjectId and name required');
      const [updated] = await db.update(subjects).set({ name: body.name }).where(eq(subjects.id, body.subjectId)).returning();
      if (!updated) throw new ApiError(404, 'not_found', 'Subject not found.');
      return ok({ subject: updated });
    }

    default:
      throw new ApiError(400, 'bad_request', 'Unknown action.');
  }
});
