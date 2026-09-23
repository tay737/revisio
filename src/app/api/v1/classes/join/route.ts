import { NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { classes, classMemberships } from '@/db/schema';
import { ApiError, ok, requireUser, route } from '@/services/api';

/** POST /classes/join { code } — student joins by class code */
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  if (user.role !== 'student') throw new ApiError(403, 'forbidden', 'Only students join classes.');
  const { code } = (await req.json()) as { code?: string };
  const normalized = (code ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(normalized)) throw new ApiError(400, 'bad_request', 'Enter the 6-character class code.');

  const [cls] = await db.select().from(classes).where(eq(classes.joinCode, normalized)).limit(1);
  if (!cls) throw new ApiError(404, 'not_found', 'No class with that code.');

  const [existing] = await db
    .select()
    .from(classMemberships)
    .where(and(eq(classMemberships.classId, cls.id), eq(classMemberships.userId, user.id)))
    .limit(1);
  if (existing) return ok({ class: { id: cls.id, name: cls.name }, alreadyJoined: true });

  await db.insert(classMemberships).values({ classId: cls.id, userId: user.id });
  return ok({ class: { id: cls.id, name: cls.name } }, { status: 201 });
});

/** GET /classes/join — my classes */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const rows = await db
    .select({ id: classes.id, name: classes.name, subjectId: classes.subjectId })
    .from(classMemberships)
    .innerJoin(classes, eq(classMemberships.classId, classes.id))
    .where(eq(classMemberships.userId, user.id));
  return ok({ classes: rows });
});
