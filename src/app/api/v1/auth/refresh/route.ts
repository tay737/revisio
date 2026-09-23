import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { consumeRefreshToken, issueRefreshToken, signAccessToken } from '@/services/auth';
import { ApiError, ok, REFRESH_COOKIE, route, setRefreshCookie } from '@/services/api';

export const POST = route(async (req: NextRequest) => {
  // Prefer cookie (web), fall back to body (future native client)
  const store = await cookies();
  const cookieToken = store.get(REFRESH_COOKIE)?.value;
  const body = await req.json().catch(() => ({}));
  const raw = cookieToken || (body as { refreshToken?: string }).refreshToken;
  if (!raw) throw new ApiError(401, 'no_refresh', 'No refresh token.');

  const userId = await consumeRefreshToken(raw);
  if (!userId) throw new ApiError(401, 'invalid_refresh', 'Refresh token invalid or expired.');
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.status === 'suspended') throw new ApiError(403, 'suspended', 'Account suspended.');

  const accessToken = await signAccessToken(user);
  const newRefresh = await issueRefreshToken(user.id);
  await setRefreshCookie(newRefresh);
  return ok({ accessToken, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});
