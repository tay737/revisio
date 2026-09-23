import { NextRequest } from 'next/server';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { cardUserStates, classes, classMemberships, reviewLogs, streaks, subjects, topics, users, xpEvents } from '@/db/schema';
import { ApiError, ok, requireUser, route } from '@/services/api';
import { canManageContent } from '@/services/roles';

function newCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // unambiguous charset
  let s = '';
  for (let i = 0; i < 6; i += 1) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

/** GET /teacher — my classes with per-student roster analytics */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  if (!canManageContent(user)) throw new ApiError(403, 'forbidden', 'Teachers/developers only.');

  const myClasses = await db.select().from(classes).where(eq(classes.teacherId, user.id)).orderBy(desc(classes.createdAt));
  const classIds = myClasses.map((c) => c.id);
  const members = classIds.length
    ? await db
        .select({ classId: classMemberships.classId, userId: users.id, name: users.name, email: users.email, joinedAt: classMemberships.joinedAt })
        .from(classMemberships)
        .innerJoin(users, eq(classMemberships.userId, users.id))
        .where(inArray(classMemberships.classId, classIds))
    : [];

  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const roster: {
    classId: string; userId: string; name: string; email: string;
    reviews7d: number; xp7d: number; streak: number; masteryPct: number;
  }[] = [];

  for (const m of members) {
    const [reviews] = await db
      .select({ n: sql<number>`count(*)` })
      .from(reviewLogs)
      .where(and(eq(reviewLogs.userId, m.userId), gte(reviewLogs.reviewedAt, weekAgo)));
    const [xp] = await db
      .select({ n: sql<number>`coalesce(sum(${xpEvents.amount}), 0)` })
      .from(xpEvents)
      .where(and(eq(xpEvents.userId, m.userId), gte(xpEvents.occurredAt, weekAgo)));
    const [streakRow] = await db.select().from(streaks).where(eq(streaks.userId, m.userId)).limit(1);
    const [mastery] = await db
      .select({
        pct: sql<number>`coalesce(avg(case when ${cardUserStates.stage} = 'mastered' then 100.0 when ${cardUserStates.stage} = 'review' then 70.0 when ${cardUserStates.stage} = 'learning' then 40.0 else 0 end), 0)`,
      })
      .from(cardUserStates)
      .where(eq(cardUserStates.userId, m.userId));
    roster.push({
      classId: m.classId, userId: m.userId, name: m.name, email: m.email,
      reviews7d: reviews?.n ?? 0, xp7d: xp?.n ?? 0, streak: streakRow?.current ?? 0, masteryPct: Math.round(mastery?.pct ?? 0),
    });
  }

  const subjectList = await db.select({ id: subjects.id, name: subjects.name }).from(subjects);
  return ok({
    classes: myClasses.map((c) => ({ ...c, roster: roster.filter((r) => r.classId === c.id) })),
    subjects: subjectList,
  });
});

/** POST /teacher — create class, rotate join code, publish own topic, create subject */
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  if (!canManageContent(user)) throw new ApiError(403, 'forbidden', 'Teachers/developers only.');
  const body = (await req.json()) as {
    action: 'create_class' | 'rotate_code' | 'create_public_topic' | 'create_subject';
    name?: string;
    description?: string;
    subjectId?: string;
    classId?: string;
    topicId?: string;
  };

  switch (body.action) {
    case 'create_class': {
      if (!body.name) throw new ApiError(400, 'bad_request', 'name required');
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
    case 'create_public_topic': {
      if (!body.topicId) throw new ApiError(400, 'bad_request', 'topicId required');
      const [topic] = await db.select().from(topics).where(eq(topics.id, body.topicId)).limit(1);
      if (!topic) throw new ApiError(404, 'not_found', 'Topic not found.');
      if (topic.ownerId !== user.id) throw new ApiError(403, 'forbidden', 'Not your topic.');
      const [updated] = await db.update(topics).set({ visibility: 'public' }).where(eq(topics.id, topic.id)).returning();
      return ok({ topic: updated });
    }
    case 'create_subject': {
      if (!body.name) throw new ApiError(400, 'bad_request', 'name required');
      const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const [existing] = await db.select({ id: subjects.id }).from(subjects).where(eq(subjects.slug, slug)).limit(1);
      if (existing) throw new ApiError(409, 'conflict', 'A subject with that name already exists.');
      const [subject] = await db
        .insert(subjects)
        .values({ id: crypto.randomUUID(), name: body.name, slug, description: body.description ?? '' })
        .returning();
      return ok({ subject }, { status: 201 });
    }
    default:
      throw new ApiError(400, 'bad_request', 'Unknown action.');
  }
});
