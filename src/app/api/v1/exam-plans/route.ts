import { NextRequest } from 'next/server';
import { ok, requireUser, route } from '@/services/api';
import { createExamPlan, listExamPlans } from '@/services/retention';

export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  return ok({ plans: await listExamPlans(user.id) });
});

export const POST = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  return ok({ plan: await createExamPlan(user.id, body) });
});
