import { NextRequest } from 'next/server';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { readReplica } from '@/db/replica';
import { subjects, topics, userSubjects, classMemberships, classes } from '@/db/schema';
import { ok, requireUser, route } from '@/services/api';

/** GET /subjects → all public subjects, flagged with the user's enrollment + topic counts */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  // Catalogue reads go to the Neon replica when configured (readReplica); the
  // write handler below stays on the primary.
  const rows = await readReplica((rdb) => rdb.select().from(subjects));
  const ids = rows.map((r) => r.id);

  const [enrolledRows, topicRows, classSubjects] = await Promise.all([
    readReplica((rdb) =>
      rdb.select({ subjectId: userSubjects.subjectId }).from(userSubjects).where(eq(userSubjects.userId, user.id)),
    ),
    readReplica((rdb) =>
      rdb
        .select({ subjectId: topics.subjectId, id: topics.id, visibility: topics.visibility, ownerId: topics.ownerId })
        .from(topics)
        .where(inArray(topics.subjectId, ids.length ? ids : [''])),
    ),
    readReplica((rdb) =>
      rdb
        .select({ subjectId: classes.subjectId })
        .from(classMemberships)
        .innerJoin(classes, eq(classMemberships.classId, classes.id))
        .where(eq(classMemberships.userId, user.id)),
    ),
  ]);

  // subjects the user follows, plus subject-level access via their classes
  const enrolledIds = new Set(enrolledRows.map((e) => e.subjectId));
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
