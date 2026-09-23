import { NextRequest } from 'next/server';
import { db } from '@/db/client';
import { refreshTokens } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { REFRESH_COOKIE, ok, route } from '@/services/api';

/** POST /auth/logout — revoke the presented refresh token + clear cookie. */
export const POST = route(async (req: NextRequest) => {
  const raw = req.cookies.get(REFRESH_COOKIE)?.value;
  if (raw) {
    const { createHash } = await import('crypto');
    const tokenHash = createHash('sha256').update(raw).digest('hex');
    await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.tokenHash, tokenHash));
  }
  const { clearRefreshCookie } = await import('@/services/api');
  await clearRefreshCookie();
  return ok({ ok: true });
});
