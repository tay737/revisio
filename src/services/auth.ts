import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import { createHash, randomBytes } from 'crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { users, refreshTokens, emailTokens } from '@/db/schema';

export type Role = 'student' | 'teacher' | 'developer';
export type SessionUser = { id: string; email: string; name: string; role: Role; status: string };

// The dev fallback is a boot choice, not a runtime default: if production ever
// starts without AUTH_SECRET, tokens would be signed with a key anyone can
// read in this repository — every account forgeable. So the module refuses to
// start (build/RSC init throws) unless the env explicitly says it is a
// non-production run. Failing closed here is what keeps the fallback from
// silently shipping.
const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ||
    (process.env.NODE_ENV === 'production' || process.env.VERCEL
      ? undefined
      : 'dev-only-secret-change-me') ||
    '',
);
if (secret.byteLength === 0) {
  throw new Error('AUTH_SECRET must be set in production. Generate one with: openssl rand -hex 32');
}
export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_DAYS = 30;

// ── passwords ───────────────────────────────────────────────────────────────
export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

// ── JWT access tokens ───────────────────────────────────────────────────────

export async function signAccessToken(user: { id: string; email: string; role: Role; totpEnabled: boolean }): Promise<string> {
  return new SignJWT({ email: user.email, role: user.role, twofa: user.totpEnabled })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (!payload.sub) return null;
    const [row] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
    if (!row || row.status === 'suspended') return null;
    // Pending users may only reach approval-related endpoints; gate here.
    return { id: row.id, email: row.email, name: row.name, role: row.role, status: row.status };
  } catch {
    return null;
  }
}

// ── refresh tokens (rotating, hashed at rest) ───────────────────────────────

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export async function issueRefreshToken(userId: string): Promise<string> {
  const { raw, row } = newRefreshToken();
  await db.insert(refreshTokens).values({ ...row, userId });
  return raw;
}

/**
 * A token revoked this recently can still be exchanged — once.
 *
 * See `consumeRefreshToken` for why this window exists. It is measured from the
 * moment of revocation, so it only ever applies to a token that was valid
 * moments ago, not to one that expired.
 */
const REUSE_GRACE_MS = 60_000;

/** A fresh opaque refresh token. One place decides how one is minted. */
function newRefreshToken() {
  const raw = randomBytes(48).toString('hex');
  return {
    raw,
    row: {
      id: crypto.randomUUID(),
      tokenHash: sha256(raw),
      expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000),
    },
  };
}

/**
 * Exchange a refresh token for its replacement.
 *
 * This used to be three statements in a row — read, revoke, insert — with the
 * revoke *first* and no transaction around them. Three ways that ends a session
 * nobody asked to end:
 *
 *   • the insert fails after the revoke committed (a capacity refusal, a
 *     dropped socket) → the browser holds a revoked token and no replacement,
 *     and is signed out by a blip;
 *   • the `Set-Cookie` never lands → the same thing, one step later;
 *   • two tabs refresh together, both present the same token, whoever arrives
 *     second is refused → that tab is signed out.
 *
 * So the rotation happens inside one transaction, where either both halves land
 * or neither does, and a token revoked within the grace window is still
 * exchangeable. A race becomes a race again instead of a logout, and a retry
 * after a failure succeeds instead of finding the token spent.
 *
 * Reuse outside the window is still refused, and the caller treats that as a
 * dead session — an old token that turns up later is the one case worth
 * refusing, because it means a copy exists.
 */
export async function consumeRefreshToken(raw: string): Promise<{ userId: string; nextRaw: string } | null> {
  const hash = sha256(raw);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.tokenHash, hash), gt(refreshTokens.expiresAt, new Date())))
      .limit(1);
    if (!row) return null;
    if (row.revokedAt && Date.now() - row.revokedAt.getTime() > REUSE_GRACE_MS) return null;

    const next = newRefreshToken();
    await tx.insert(refreshTokens).values({ ...next.row, userId: row.userId });
    if (!row.revokedAt) {
      await tx.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, row.id));
    }
    return { userId: row.userId, nextRaw: next.raw };
  });
}

export async function revokeAllRefreshTokens(userId: string) {
  await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.userId, userId));
}

// ── TOTP 2FA ────────────────────────────────────────────────────────────────

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function totpUri(email: string, secret: string): string {
  return authenticator.keyuri(email, 'Revisio', secret).toString();
}

export function verifyTotp(secret: string, token: string): boolean {
  try {
    return authenticator.verify({ secret, token });
  } catch {
    return false;
  }
}

export function generateRecoveryCodes(count = 8): { plain: string[]; hashed: string[] } {
  const plain = Array.from({ length: count }, () => randomBytes(5).toString('hex').toUpperCase());
  return { plain, hashed: plain.map((c) => sha256(c)) };
}

export function hashRecoveryCode(code: string): string {
  return sha256(code.trim().toUpperCase());
}

// ── email tokens (verify/reset/email_change) — dev: link logged to console ──

export type EmailTokenKind = 'verify' | 'reset' | 'email_change';

/**
 * Issue a single-use email token. Password resets get a deliberately shorter
 * life (30 minutes) than verification (24h): a reset link in an inbox is the
 * one token whose value decays fastest.
 */
export async function issueEmailToken(
  userId: string,
  kind: EmailTokenKind,
  ttlMinutes = 24 * 60,
): Promise<string> {
  const raw = randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + ttlMinutes * 3_600_000);
  await db.insert(emailTokens).values({ id: crypto.randomUUID(), userId, kind, tokenHash: sha256(raw), expiresAt });
  return raw;
}

export async function consumeEmailToken(raw: string, kind: EmailTokenKind): Promise<string | null> {
  const [row] = await db
    .select()
    .from(emailTokens)
    .where(and(eq(emailTokens.tokenHash, sha256(raw)), eq(emailTokens.kind, kind), isNull(emailTokens.usedAt), gt(emailTokens.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  await db.update(emailTokens).set({ usedAt: new Date() }).where(eq(emailTokens.id, row.id));
  return row.userId;
}
