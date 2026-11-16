import { NextRequest } from 'next/server';
import { ok, requireUser, route } from '@/services/api';
import { createAssignment, listAssignments } from '@/services/class-assignments';

/** GET /classes/assignments?classId= — teacher or class member. */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const classId = req.nextUrl.searchParams.get('classId') ?? '';
  return ok({ assignments: await listAssignments(user, classId) });
});

/** POST /classes/assignments — teacher-owned class only. */
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return ok({ error: 'bad_request' }, { status: 400 });
  return ok({ assignment: await createAssignment(user, body as Record<string, unknown>) }, { status: 201 });
});
