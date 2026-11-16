import { NextRequest } from 'next/server';
import { ok, requireUser, route } from '@/services/api';
import { ApiError } from '@/services/api';
import { deleteAssignment, updateAssignment } from '@/services/class-assignments';

type Ctx = { params: Record<string, string> };

/** PATCH /classes/assignments/[id] — dueDate, noteDensity, required, note. */
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') throw new ApiError(400, 'bad_request', 'Invalid JSON body.');
  return ok({ assignment: await updateAssignment(user, ctx.params.id, body as Record<string, unknown>) });
});

/** DELETE /classes/assignments/[id] */
export const DELETE = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser(req);
  return ok(await deleteAssignment(user, ctx.params.id));
});
