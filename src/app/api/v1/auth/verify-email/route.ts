import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { issueEmailToken, consumeEmailToken } from '@/services/auth';
import { sendVerificationEmail } from '@/services/email';
import { ApiError, ok, route } from '@/services/api';

/** POST /auth/verify-email { token } — confirm an email address. */
export const POST = route(async (req: NextRequest) => {
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  if (!token) throw new ApiError(400, 'bad_request', 'Token required.');
  const userId = await consumeEmailToken(token, 'verify');
  if (!userId) throw new ApiError(400, 'invalid_token', 'Verification link invalid or expired.');
  await db.update(users).set({ emailVerifiedAt: new Date(), status: 'active' }).where(eq(users.id, userId));
  return ok({ verified: true });
});

/** POST /auth/verify-email?resend=1 { email } — re-send the verification email. */
export const PUT = route(async (req: NextRequest) => {
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  if (!email) throw new ApiError(400, 'bad_request', 'Email required.');
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  // Always return ok — never leak which emails are registered.
  if (!user || user.emailVerifiedAt || user.status !== 'pending') return ok({ sent: true });

  const token = await issueEmailToken(user.id, 'verify');
  await sendVerificationEmail(user.email, token);
  return ok({ sent: true });
});
