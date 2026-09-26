import { NextRequest } from 'next/server';
import { eq, ne, and } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { issueEmailToken, verifyPassword } from '@/services/auth';
import { sendEmailChangeEmail } from '@/services/email';
import { ApiError, ok, requireUser, route } from '@/services/api';

/**
 * POST /me/email — request an email change.
 *
 * The address is never swapped here. It is stored as `pending_email` and a
 * one-hour link is mailed to the *new* address; only clicking that link moves
 * it (auth/verify-email, `email_change` kind). Someone who owns the session
 * but not the new mailbox therefore cannot take the account to an address
 * they control silently, and the owner is left a paper trail in their inbox.
 */
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const { password, newEmail } = (await req.json().catch(() => ({}))) as {
    password?: string;
    newEmail?: string;
  };
  const email = newEmail?.trim().toLowerCase();
  if (!password || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, 'bad_request', 'Enter your password and a valid new email address.');
  }

  const [row] = await db
    .select({ hash: users.passwordHash, email: users.email, pending: users.pendingEmail })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (!row) throw new ApiError(404, 'not_found', 'Account not found.');
  if (email === row.email) throw new ApiError(400, 'bad_request', 'That is already your email address.');
  if (!(await verifyPassword(password, row.hash))) {
    throw new ApiError(403, 'wrong_password', 'Password is incorrect. Nothing was changed.');
  }

  const [taken] = await db.select({ id: users.id }).from(users).where(and(eq(users.email, email), ne(users.id, user.id))).limit(1);
  if (taken) throw new ApiError(409, 'email_taken', 'An account already uses that email address.');

  await db.update(users).set({ pendingEmail: email }).where(eq(users.id, user.id));
  const token = await issueEmailToken(user.id, 'email_change');
  await sendEmailChangeEmail(email, token);
  return ok({ pending: true });
});
