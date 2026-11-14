import { NextRequest } from 'next/server';
import { db } from '@/db/client';
import { refreshTokens } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { REFRESH_COOKIE, ok, route } from '@/services/api';

/**
 * POST /auth/logout — revoke the presented refresh token + clear cookie.
 *
 * Web sends the httpOnly cookie; native clients cannot, so they pass their
 * stored token as `{ "refreshToken": "..." }` in the body and get the same
 * revocation. Only the presented token dies — other sessions on other devices
 * are untouched (that is what /me/password's revoke-all is for).
 */
export const POST = route(async (req: NextRequest) => {
  const body = (await req.json().catch(() => ({}))) as { refreshToken?: string };
  const raw = req.cookies.get(REFRESH_COOKIE)?.value ?? body.refreshToken;
  if (raw) {
    const { createHash } = await import('crypto');
    const tokenHash = createHash('sha256').update(raw).digest('hex');
    await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.tokenHash, tokenHash));
  }
  const { clearRefreshCookie } = await import('@/services/api');
  await clearRefreshCookie();
  return ok({ ok: true });
});
