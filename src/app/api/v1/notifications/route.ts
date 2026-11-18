import { NextRequest } from 'next/server';
import { ApiError, ok, requireUser, route } from '@/services/api';
import { listNotifications, markNotificationsRead } from '@/services/retention';

export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? 30);
  const beforeAt = req.nextUrl.searchParams.get('before');
  const beforeId = req.nextUrl.searchParams.get('beforeId');
  if ((beforeAt == null) !== (beforeId == null)) {
    throw new ApiError(400, 'bad_cursor', 'before and beforeId must be provided together.');
  }
  const before = beforeAt && beforeId ? { createdAt: beforeAt, id: beforeId } : undefined;
  return ok(await listNotifications(user.id, Number.isFinite(limit) ? limit : 30, before));
});

export const POST = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.map(String) : undefined;
  const limit = Number(body.limit);
  return ok(await markNotificationsRead(user.id, ids, Number.isFinite(limit) ? limit : 100));
});
