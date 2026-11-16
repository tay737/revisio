import { NextRequest } from 'next/server';
import { ok, requireUser, route } from '@/services/api';
import { createGoal, listGoals } from '@/services/retention';

export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  return ok({ goals: await listGoals(user.id) });
});

export const POST = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  return ok({ goals: await createGoal(user.id, body) });
});
