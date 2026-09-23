import { NextRequest } from 'next/server';
import { ok, requireUser, route } from '@/services/api';
import { buildDailyQueue } from '@/services/study';

export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? 20);
  const queue = await buildDailyQueue(user.id, Math.min(Math.max(1, limit), 100));
  return ok({ queue });
});
