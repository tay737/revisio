import { NextRequest } from 'next/server';
import { ok, requireUser, route, ApiError } from '@/services/api';
import { guardianSummary } from '@/services/retention';

export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const studentId = req.nextUrl.searchParams.get('studentId');
  if (!studentId) throw new ApiError(400, 'bad_request', 'studentId is required.');
  return ok(await guardianSummary(user.id, studentId));
});
