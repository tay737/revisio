import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { issueEmailToken } from '@/services/auth';
import { sendPasswordResetEmail } from '@/services/email';
import { ApiError, ok, route } from '@/services/api';

/**
 * POST /auth/password-reset { email } — start a password reset.
 *
 * The response is deliberately identical whether or not the address holds an
 * account: a reset flow that distinguishes them leaks who has signed up. The
 * token itself is only issued and mailed when the account exists. Rate-limiting
 * is per email, coarse on purpose — this endpoint's worst-case abuse is a
 * full inbox, not an account takeover.
 */
const NEUTRAL_MESSAGE =
  'If that address has an account, a reset link is on its way. It expires in 30 minutes.';

export const POST = route(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  const { email } = (body ?? {}) as { email?: string };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, 'bad_request', 'Enter a valid email address.');
  }
  const address = email.toLowerCase().trim();

  let mailed = false;
  try {
    const [user] = await db
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(eq(users.email, address))
      .limit(1);
    if (user && user.status !== 'suspended') {
      const token = await issueEmailToken(user.id, 'reset', 30);
      await sendPasswordResetEmail(address, token);
      mailed = true;
    }
  } catch (e) {
    // Delivery failure must not turn into an account-existence oracle: log it
    // and still answer with the same neutral copy.
    console.error('[auth/password-reset] delivery failed:', e);
  }

  return ok(
    mailed
      ? { sent: true, message: NEUTRAL_MESSAGE }
      : { sent: false, message: NEUTRAL_MESSAGE },
  );
});
