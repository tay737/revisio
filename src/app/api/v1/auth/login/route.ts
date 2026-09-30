import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { verifyPassword, signAccessToken, issueRefreshToken, verifyTotp, hashRecoveryCode } from '@/services/auth';
import { ApiError, ok, route, setRefreshCookie } from '@/services/api';
import { takeRateLimitAttempt, clearRateLimit, clientIp } from '@/services/rate-limit';

export const POST = route(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  const { email, password, totp, recoveryCode } = (body ?? {}) as {
    email?: string; password?: string; totp?: string; recoveryCode?: string;
  };
  if (!email || !password) throw new ApiError(400, 'bad_request', 'Email and password are required.');

  // ── rate limits, before any bcrypt work ──────────────────────────────────
  // Two walls: per source IP (the outer one, so a distributed guess still has
  // to spend its own budget) and per email+IP (the inner one, so a shared
  // office NAT cannot lock a household out of one another's accounts). Both
  // are taken before the password is even hashed — bcrypt's cost is the
  // defence against offline work, not against a million polite requests.
  const ip = clientIp(req);
  const identity = `${email.toLowerCase()}:${ip}`;
  await takeRateLimitAttempt('loginIp', ip);
  await takeRateLimitAttempt('loginIdentity', identity);

  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new ApiError(401, 'invalid_credentials', 'Invalid email or password.');
  }
  if (user.status === 'suspended') throw new ApiError(403, 'suspended', 'Account suspended.');
  if (user.status === 'pending' && !user.emailVerifiedAt) {
    throw new ApiError(403, 'email_unverified', 'Check your inbox and verify your email first.');
  }

  if (user.totpEnabled) {
    if (!totp && !recoveryCode) {
      return ok({ mfaRequired: true }, { status: 200 });
    }
    // A TOTP guess gets its own budget: the code is six digits, and the
    // limiter is per account so the guesser cannot spread across IPs freely.
    await takeRateLimitAttempt('totp', user.id);
    const totpOk = totp ? verifyTotp(user.totpSecret ?? '', totp) : false;
    const recoveryOk = recoveryCode && user.recoveryCodes ? user.recoveryCodes.includes(hashRecoveryCode(recoveryCode)) : false;
    if (!totpOk && !recoveryOk) {
      throw new ApiError(401, 'invalid_mfa', 'Invalid 2FA code.');
    }
  }

  // A real login should not spend the window: clear both walls so a user who
  // fat-fingered their password twice today is not capped tomorrow.
  await clearRateLimit('loginIp', ip).catch(() => undefined);
  await clearRateLimit('loginIdentity', identity).catch(() => undefined);

  const accessToken = await signAccessToken(user);
  const refresh = await issueRefreshToken(user.id);
  await setRefreshCookie(refresh);

  return ok({
    accessToken,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status, totpEnabled: user.totpEnabled },
  });
});
