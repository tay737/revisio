import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { verifyPassword, signAccessToken, issueRefreshToken, verifyTotp, hashRecoveryCode } from '@/services/auth';
import { ApiError, ok, route, setRefreshCookie } from '@/services/api';

export const POST = route(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  const { email, password, totp, recoveryCode } = (body ?? {}) as {
    email?: string; password?: string; totp?: string; recoveryCode?: string;
  };
  if (!email || !password) throw new ApiError(400, 'bad_request', 'Email and password are required.');

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
    const totpOk = totp ? verifyTotp(user.totpSecret ?? '', totp) : false;
    const recoveryOk = recoveryCode && user.recoveryCodes ? user.recoveryCodes.includes(hashRecoveryCode(recoveryCode)) : false;
    if (!totpOk && !recoveryOk) {
      throw new ApiError(401, 'invalid_mfa', 'Invalid 2FA code.');
    }
  }

  const accessToken = await signAccessToken(user);
  const refresh = await issueRefreshToken(user.id);
  await setRefreshCookie(refresh);

  return ok({
    accessToken,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status, totpEnabled: user.totpEnabled },
  });
});
