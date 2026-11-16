import { NextRequest } from 'next/server';
import { ok, requireUser, route } from '@/services/api';
import { getStreakSummary } from '@/services/retention';

export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  return ok(await getStreakSummary(user.id));
});
