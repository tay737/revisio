import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { hashPassword, revokeAllRefreshTokens, verifyPassword } from '@/services/auth';
import { ApiError, ok, requireUser, route } from '@/services/api';

/**
 * POST /me/password — change the password.
 *
 * The current password is required: this page is reachable on any device that
 * holds a live session, and the session is the weaker claim. Every refresh
 * token is revoked afterwards, so a stolen session dies here too — the price
 * is that other devices sign out, which is the honest outcome of a password
 * change and is stated on the button that does it.
 */
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const { currentPassword, newPassword } = (await req.json().catch(() => ({}))) as {
    currentPassword?: string;
    newPassword?: string;
  };
  if (!currentPassword || !newPassword) {
    throw new ApiError(400, 'bad_request', 'Enter your current password and a new one.');
  }
  if (newPassword.length < 8) {
    throw new ApiError(400, 'weak_password', 'New password must be at least 8 characters.');
  }
  if (newPassword === currentPassword) {
    throw new ApiError(400, 'bad_request', 'That is your current password.');
  }

  const [row] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, user.id)).limit(1);
  if (!row || !(await verifyPassword(currentPassword, row.hash))) {
    throw new ApiError(403, 'wrong_password', 'Current password is incorrect. Nothing was changed.');
  }

  await db.update(users).set({ passwordHash: await hashPassword(newPassword) }).where(eq(users.id, user.id));
  await revokeAllRefreshTokens(user.id);
  return ok({ changed: true });
});
