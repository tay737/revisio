import { NextRequest } from 'next/server';
import { ok, requireUser, route } from '@/services/api';
import { getNotificationPrefs, updateNotificationPrefs } from '@/services/retention';

export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  return ok(await getNotificationPrefs(user.id));
});

export const PUT = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  return ok(await updateNotificationPrefs(user.id, body));
});
