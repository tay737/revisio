import { NextRequest } from 'next/server';
import { ok, requireUser, route } from '@/services/api';
import { deleteExamPlan, updateExamPlan } from '@/services/retention';

export const PATCH = route(async (req: NextRequest, ctx: { params: Record<string, string> }) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  return ok({ plan: await updateExamPlan(user.id, ctx.params.id, body) });
});

export const DELETE = route(async (req: NextRequest, ctx: { params: Record<string, string> }) => {
  const user = await requireUser(req);
  return ok({ plans: await deleteExamPlan(user.id, ctx.params.id) });
});
