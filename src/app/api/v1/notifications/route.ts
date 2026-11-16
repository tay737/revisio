import { NextRequest } from 'next/server';
import { ok, requireUser, route } from '@/services/api';
import { listNotifications, markNotificationsRead } from '@/services/retention';

export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? 30);
  return ok(await listNotifications(user.id, Number.isFinite(limit) ? limit : 30));
});

export const POST = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.map(String) : undefined;
  return ok(await markNotificationsRead(user.id, ids));
});
