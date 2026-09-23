import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { generateRecoveryCodes, generateTotpSecret, signAccessToken, totpUri, verifyTotp } from '@/services/auth';
import { ApiError, ok, requireUser, route } from '@/services/api';
import QRCode from 'qrcode';

/** GET: begin TOTP enrolment → secret + otpauth URI + QR data URL */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const secret = generateTotpSecret();
  await db.update(users).set({ totpSecret: secret }).where(eq(users.id, user.id));
  const uri = totpUri(user.email, secret);
  const qrDataUrl = await QRCode.toDataURL(uri);
  return ok({ secret, uri, qrDataUrl });
});

/** POST: confirm enrolment with a valid code → enables 2FA, returns recovery codes */
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!row?.totpSecret) throw new ApiError(400, 'no_secret', 'Start 2FA setup first.');
  if (!code || !verifyTotp(row.totpSecret, code)) throw new ApiError(400, 'invalid_code', 'Invalid code.');
  const { plain, hashed } = generateRecoveryCodes();
  await db.update(users).set({ totpEnabled: true, recoveryCodes: hashed }).where(eq(users.id, user.id));
  return ok({ enabled: true, recoveryCodes: plain });
});

/** DELETE: disable 2FA (requires valid code) */
export const DELETE = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!row?.totpEnabled) throw new ApiError(400, 'not_enabled', '2FA not enabled.');
  if (!code || !verifyTotp(row.totpSecret ?? '', code)) throw new ApiError(400, 'invalid_code', 'Invalid code.');
  await db.update(users).set({ totpEnabled: false, totpSecret: null, recoveryCodes: [] }).where(eq(users.id, user.id));
  return ok({ enabled: false });
});
