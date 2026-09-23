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

const secret = new TextEncoder().encode(process.env.AUTH_SECRET || 'dev-only-secret-change-me');
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
  const raw = randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000);
  await db.insert(refreshTokens).values({ id: crypto.randomUUID(), userId, tokenHash: sha256(raw), expiresAt });
  return raw;
}

export async function consumeRefreshToken(raw: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(refreshTokens)
    .where(and(eq(refreshTokens.tokenHash, sha256(raw)), isNull(refreshTokens.revokedAt), gt(refreshTokens.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  // rotate: revoke old, issue new
  await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, row.id));
  return issueRefreshToken(row.userId);
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

// ── email tokens (verify/reset) — dev: link logged to console ───────────────

export async function issueEmailToken(userId: string, kind: 'verify' | 'reset'): Promise<string> {
  const raw = randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 3_600_000);
  await db.insert(emailTokens).values({ id: crypto.randomUUID(), userId, kind, tokenHash: sha256(raw), expiresAt });
  return raw;
}

export async function consumeEmailToken(raw: string, kind: 'verify' | 'reset'): Promise<string | null> {
  const [row] = await db
    .select()
    .from(emailTokens)
    .where(and(eq(emailTokens.tokenHash, sha256(raw)), eq(emailTokens.kind, kind), isNull(emailTokens.usedAt), gt(emailTokens.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  await db.update(emailTokens).set({ usedAt: new Date() }).where(eq(emailTokens.id, row.id));
  return row.userId;
}
