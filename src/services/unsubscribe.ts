import { createHmac, timingSafeEqual } from 'node:crypto';

// ── One-click unsubscribe tokens ────────────────────────────────────────────
//
// A recipient's mail client cannot hold a Revisio session, so an unsubscribe
// link has to authenticate itself. It does that the same way the account
// deletion challenge does: an HMAC over the account id plus the moment the
// token was issued, keyed on AUTH_SECRET. The account id is *inside* the
// signed payload, so a token can only ever stop mail for the account it was
// minted for — a forwarded message lets someone stop their own mail, not
// somebody else's.
//
// The token is deliberately long-lived (a link in an old inbox should still
// work) but not eternal, so a leaked mailbox URL is not a permanent
// capability. It is single-use in effect rather than in storage: applying it
// twice sets the same two purposes off, which is what idempotent means here.
//
// This module holds no `server-only` import on purpose: it is pure crypto, so
// the verification script can exercise it directly, exactly like
// `age-deletion-rules.ts`.

/** Six months: long enough for an inbox, short enough to expire eventually. */
export const UNSUBSCRIBE_TTL_MS = 180 * 24 * 60 * 60 * 1000;

/** The purposes an unsubscribe link turns off. Both are email-driven. */
export const UNSUBSCRIBE_KEYS = ['marketing', 'notifications'] as const;

export type UnsubscribeKey = (typeof UNSUBSCRIBE_KEYS)[number];

function signature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function requireSecret(secret: string | undefined): string {
  if (!secret?.trim()) {
    throw new Error('AUTH_SECRET must be configured to issue unsubscribe links.');
  }
  return secret;
}

export function issueUnsubscribeToken(userId: string, secret: string, now = Date.now()): string {
  requireSecret(secret);
  const payload = `${userId}.${now}`;
  return `${Buffer.from(payload).toString('base64url')}.${signature(payload, secret)}`;
}

/**
 * The account a token was issued for, or `null` when it is malformed, tampered
 * with, expired, or signed with a different secret.
 */
export function verifyUnsubscribeToken(
  token: string,
  secret: string,
  now = Date.now(),
): { userId: string } | null {
  if (!secret?.trim() || !token) return null;

  const separator = token.indexOf('.');
  if (separator <= 0 || separator !== token.lastIndexOf('.')) return null;
  const encodedPayload = token.slice(0, separator);
  const suppliedSignature = token.slice(separator + 1);
  if (!encodedPayload || !suppliedSignature) return null;

  let payload: string;
  try {
    payload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const payloadSeparator = payload.lastIndexOf('.');
  if (payloadSeparator <= 0) return null;
  const userId = payload.slice(0, payloadSeparator);
  const issuedAt = Number(payload.slice(payloadSeparator + 1));
  if (!userId || !Number.isSafeInteger(issuedAt) || issuedAt <= 0) return null;
  if (issuedAt > now + 60_000) return null; // a token from the future is not ours
  if (now - issuedAt > UNSUBSCRIBE_TTL_MS) return null;

  const expected = Buffer.from(signature(payload, secret));
  const supplied = Buffer.from(suppliedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

  return { userId };
}

/**
 * Merge an unsubscribe into the stored consent record without clobbering the
 * choices a learner made in Settings: only the two email purposes change, the
 * rest of the record (and its version) is carried through.
 */
export function applyUnsubscribe(
  existing: unknown,
  now = new Date(),
): Record<string, unknown> {
  const record = existing && typeof existing === 'object' ? (existing as Record<string, unknown>) : {};
  const rawChoices = record.choices && typeof record.choices === 'object'
    ? (record.choices as Record<string, unknown>)
    : {};
  const choices: Record<string, boolean> = { essential: true };
  for (const [key, value] of Object.entries(rawChoices)) {
    if (typeof value === 'boolean') choices[key] = value;
  }
  for (const key of UNSUBSCRIBE_KEYS) choices[key] = false;

  const stamp = now.toISOString();
  return {
    ...record,
    version: typeof record.version === 'number' ? record.version : 1,
    choices,
    updatedAt: stamp,
    decidedAt: typeof record.decidedAt === 'string' ? record.decidedAt : stamp,
    unsubscribedAt: stamp,
  };
}
