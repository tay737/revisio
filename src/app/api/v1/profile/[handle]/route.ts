import { NextRequest } from 'next/server';
import { ApiError, getSession, ok, route } from '@/services/api';
import { getPublicProfile } from '@/services/profile';

/**
 * GET /profile/:handle — a public profile, visibility already applied.
 *
 * Public on purpose: signed-out visitors must be able to open a shared profile
 * link. Everything sensitive is filtered server-side in `getPublicProfile`, so
 * this handler is a thin door over the one privacy boundary.
 */
export const GET = route(async (req: NextRequest, ctx: { params: Record<string, string> }) => {
  const viewer = await getSession(req);
  const handle = ctx.params.handle?.trim();
  if (!handle) throw new ApiError(400, 'bad_request', 'Profile handle required.');
  const profile = await getPublicProfile(handle, viewer);
  if (!profile) throw new ApiError(404, 'not_found', 'No profile at that address.');
  return ok(profile);
});
