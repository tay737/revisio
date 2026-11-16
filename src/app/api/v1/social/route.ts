import { NextRequest } from 'next/server';
import { ok, requireUser, route, ApiError } from '@/services/api';
import { friendBoard, getSocialOverview, respondConnection, sendConnection } from '@/services/retention';

export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const [overview, board] = await Promise.all([getSocialOverview(user.id), friendBoard(user.id)]);
  return ok({ ...overview, board });
});

export const POST = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? '');
  if (action === 'send') return ok(await sendConnection(user.id, body));
  if (action === 'respond') {
    const connectionId = String(body.connectionId ?? '');
    const response = String(body.response ?? '');
    if (!connectionId || !response) throw new ApiError(400, 'bad_request', 'connectionId and response are required.');
    return ok(await respondConnection(user.id, connectionId, response));
  }
  throw new ApiError(400, 'bad_request', 'action must be send or respond.');
});
