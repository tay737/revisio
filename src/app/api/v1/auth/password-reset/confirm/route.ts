import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { consumeEmailToken, hashPassword, revokeAllRefreshTokens } from '@/services/auth';
import { signAccessToken, issueRefreshToken } from '@/services/auth';
import { ApiError, ok, route, setRefreshCookie } from '@/services/api';

/**
 * POST /auth/password-reset/confirm { token, password } — finish a reset.
 *
 * Single-use by the token store itself: `consumeEmailToken` marks the row used
 * inside the same read it validates, so a replayed token finds nothing. Every
 * refresh token is revoked — other devices were signed out and the response
 * says so — and the caller is signed in here, because someone who just proved
 * ownership of the address by reading its mail does not need to type the
 * password they only just chose.
 */
export const POST = route(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  const { token, password } = (body ?? {}) as { token?: string; password?: string };
  if (!token) throw new ApiError(400, 'bad_request', 'That reset link is missing its token.');
  if (!password || password.length < 8) {
    throw new ApiError(400, 'weak_password', 'Password must be at least 8 characters.');
  }

  const userId = await consumeEmailToken(token, 'reset');
  if (!userId) {
    throw new ApiError(
      400,
      'invalid_token',
      'That reset link has expired or was already used. Request a fresh one.',
    );
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password) })
    .where(eq(users.id, userId));
  await revokeAllRefreshTokens(userId);

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const accessToken = await signAccessToken(user);
  const refresh = await issueRefreshToken(user.id);
  await setRefreshCookie(refresh);

  return ok({
    accessToken,
    signedOutElsewhere: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      totpEnabled: user.totpEnabled,
    },
  });
});
