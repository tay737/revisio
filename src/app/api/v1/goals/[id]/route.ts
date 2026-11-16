import { NextRequest } from 'next/server';
import { ok, requireUser, route } from '@/services/api';
import { deleteGoal, updateGoal } from '@/services/retention';

export const PATCH = route(async (req: NextRequest, ctx: { params: Record<string, string> }) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  return ok({ goals: await updateGoal(user.id, ctx.params.id, body) });
});

export const DELETE = route(async (req: NextRequest, ctx: { params: Record<string, string> }) => {
  const user = await requireUser(req);
  return ok({ goals: await deleteGoal(user.id, ctx.params.id) });
});
