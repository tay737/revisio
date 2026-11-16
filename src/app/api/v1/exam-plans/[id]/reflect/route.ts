import { NextRequest } from 'next/server';
import { ok, requireUser, route } from '@/services/api';
import { reflectExamPlan } from '@/services/retention';

export const POST = route(async (req: NextRequest, ctx: { params: Record<string, string> }) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  return ok({ plan: await reflectExamPlan(user.id, ctx.params.id, body) });
});
