import { NextRequest } from 'next/server';
import { ok, requireUser, route, ApiError } from '@/services/api';
import { createGuardianLink, listGuardianLinks, respondGuardianLink } from '@/services/retention';

export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  return ok({ links: await listGuardianLinks(user.id) });
});

export const POST = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? 'create');
  if (action === 'create') return ok({ links: await createGuardianLink(user.id, body) });
  if (action === 'respond') {
    const linkId = String(body.linkId ?? '');
    const response = String(body.response ?? '');
    if (!linkId || !response) throw new ApiError(400, 'bad_request', 'linkId and response are required.');
    return ok(await respondGuardianLink(user.id, linkId, response));
  }
  throw new ApiError(400, 'bad_request', 'action must be create or respond.');
});
