import { NextRequest } from 'next/server';
import { ok, requireUser, route } from '@/services/api';
import { classPulse } from '@/services/class-assignments';

/**
 * GET /teacher/class-pulse?classId=&topicId= — per-card struggle across the
 * roster plus per-assignment completion. Teacher-owned classes only.
 */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const classId = req.nextUrl.searchParams.get('classId') ?? '';
  const topicId = req.nextUrl.searchParams.get('topicId') ?? undefined;
  return ok(await classPulse(user, classId, topicId));
});
