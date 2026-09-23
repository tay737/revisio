import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { consumeEmailToken } from '@/services/auth';
import { ApiError, ok, route } from '@/services/api';

export const POST = route(async (req: NextRequest) => {
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  if (!token) throw new ApiError(400, 'bad_request', 'Token required.');
  const userId = await consumeEmailToken(token, 'verify');
  if (!userId) throw new ApiError(400, 'invalid_token', 'Verification link invalid or expired.');
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId));
  return ok({ verified: true });
});
