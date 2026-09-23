import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { consumeRefreshToken, signAccessToken } from '@/services/auth';
import { ApiError, ok, REFRESH_COOKIE, route, setRefreshCookie } from '@/services/api';

export const POST = route(async (req: NextRequest) => {
  // Prefer cookie (web), fall back to body (future native client)
  const store = await cookies();
  const cookieToken = store.get(REFRESH_COOKIE)?.value;
  const body = await req.json().catch(() => ({}));
  const raw = cookieToken || (body as { refreshToken?: string }).refreshToken;
  if (!raw) throw new ApiError(401, 'no_refresh', 'No refresh token.');

  const rotated = await consumeRefreshToken(raw);
  if (!rotated) throw new ApiError(401, 'invalid_refresh', 'Refresh token invalid or expired.');
  const [user] = await db.select().from(users).where(eq(users.id, rotated.userId)).limit(1);
  if (!user) throw new ApiError(401, 'invalid_refresh', 'Refresh token invalid or expired.');
  if (user.status === 'suspended') throw new ApiError(403, 'suspended', 'Account suspended.');

  const accessToken = await signAccessToken(user);
  await setRefreshCookie(rotated.nextRaw);
  return ok({ accessToken, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});
