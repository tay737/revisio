import { NextRequest } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { subjects, topics, userSubjects, classMemberships, classes } from '@/db/schema';
import { ok, requireUser, route } from '@/services/api';

/** GET /subjects → all public subjects, flagged with the user's enrollment + topic counts */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const rows = await db.select().from(subjects);
  const enrolled = await db.select({ subjectId: userSubjects.subjectId }).from(userSubjects).where(eq(userSubjects.userId, user.id));
  const enrolledIds = new Set(enrolled.map((e) => e.subjectId));

  // topics the user can see: public + own private
  const topicRows = await db
    .select({ subjectId: topics.subjectId, id: topics.id, visibility: topics.visibility, ownerId: topics.ownerId })
    .from(topics)
    .where(inArray(topics.subjectId, rows.map((r) => r.id).length ? rows.map((r) => r.id) : ['']));

  // also count topics from classes the student is in (subject-level access via class)
  const classSubjects = await db
    .select({ subjectId: classes.subjectId })
    .from(classMemberships)
    .innerJoin(classes, eq(classMemberships.classId, classes.id))
    .where(eq(classMemberships.userId, user.id));
  for (const cs of classSubjects) enrolledIds.add(cs.subjectId);

  return ok({
    subjects: rows.map((s) => ({
      id: s.id, name: s.name, slug: s.slug, description: s.description,
      enrolled: enrolledIds.has(s.id),
      topicCount: topicRows.filter((t) => t.subjectId === s.id && (t.visibility === 'public' || t.ownerId === user.id)).length,
    })),
  });
});

/** POST /subjects/enroll { subjectId } */
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const { subjectId } = (await req.json().catch(() => ({}))) as { subjectId?: string };
  if (!subjectId) return ok({ enrolled: false });
  await db.insert(userSubjects).values({ userId: user.id, subjectId }).onConflictDoNothing();
  return ok({ enrolled: true });
});
