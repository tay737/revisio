import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { issueEmailToken, consumeEmailToken } from '@/services/auth';
import { sendVerificationEmail } from '@/services/email';
import { ApiError, ok, route } from '@/services/api';
import { takeRateLimitAttempt } from '@/services/rate-limit';

/**
 * POST /auth/verify-email { token, kind? }
 *
 * Two tokens land here. `verify` activates a new account. `email_change`
 * completes an address move: the pending address is checked for collisions at
 * the last moment (someone could have registered it in the window), then
 * swapped in and the pending copy cleared.
 */
export const POST = route(async (req: NextRequest) => {
  const { token, kind } = (await req.json().catch(() => ({}))) as { token?: string; kind?: string };
  if (!token) throw new ApiError(400, 'bad_request', 'Token required.');
  if (kind === 'email_change') {
    const userId = await consumeEmailToken(token, 'email_change');
    if (!userId) throw new ApiError(400, 'invalid_token', 'Link invalid or expired. Request a new email from Settings.');
    const [row] = await db.select({ pending: users.pendingEmail }).from(users).where(eq(users.id, userId)).limit(1);
    if (!row?.pending) throw new ApiError(409, 'conflict', 'No email change is waiting. Request a new one from Settings.');
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, row.pending)).limit(1);
    if (taken && taken.id !== userId) {
      await db.update(users).set({ pendingEmail: null }).where(eq(users.id, userId));
      throw new ApiError(409, 'email_taken', 'That address was registered by someone else in the meantime.');
    }
    await db.update(users).set({ email: row.pending, pendingEmail: null }).where(eq(users.id, userId));
    return ok({ verified: true, email: row.pending });
  }

  const userId = await consumeEmailToken(token, 'verify');
  if (!userId) throw new ApiError(400, 'invalid_token', 'Verification link invalid or expired.');
  await db.update(users).set({ emailVerifiedAt: new Date(), status: 'active' }).where(eq(users.id, userId));
  return ok({ verified: true });
});

/** POST /auth/verify-email?resend=1 { email } — re-send the verification email. */
export const PUT = route(async (req: NextRequest) => {
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  if (!email) throw new ApiError(400, 'bad_request', 'Email required.');
  // The mailbox is the resource being exhausted; one budget per address.
  // Taken *after* the lookup and *before* any disclosure — a limited request
  // must be indistinguishable from a clean one, or the always-ok shape below
  // becomes a registration oracle (the limiter would confirm which addresses
  // are real). The catch keeps the neutral answer on limit.
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  try {
    await takeRateLimitAttempt('verifySend', `resend:${email.toLowerCase()}`);
  } catch {
    return ok({ sent: true });
  }
  // Always return ok — never leak which emails are registered.
  if (!user || user.emailVerifiedAt || user.status !== 'pending') return ok({ sent: true });

  const token = await issueEmailToken(user.id, 'verify');
  await sendVerificationEmail(user.email, token);
  return ok({ sent: true });
});
