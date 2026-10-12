import { createHmac, timingSafeEqual } from 'node:crypto';
import { ageOnDate, isUnderAge, isValidDateOfBirth } from '@/lib/age';

export { ageOnDate, isUnderAge, isValidDateOfBirth, learnerMeetsAgeConsent } from '@/lib/age';

const CONFIRMATION_TTL_MS = 60_000;

function signature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function issueDeletionConfirmation(userId: string, secret: string, now = Date.now()) {
  if (!secret.trim()) throw new Error('AUTH_SECRET must be configured to issue deletion confirmations.');
  const expiresAt = now + CONFIRMATION_TTL_MS;
  const payload = `${userId}.${expiresAt}`;
  const token = `${Buffer.from(payload).toString('base64url')}.${signature(payload, secret)}`;
  return { token, expiresAt };
}

export function verifyDeletionConfirmation(token: string, userId: string, secret: string, now = Date.now()): boolean {
  if (!secret.trim()) return false;
  const separator = token.indexOf('.');
  if (separator <= 0 || separator !== token.lastIndexOf('.')) return false;
  const encodedPayload = token.slice(0, separator);
  const suppliedSignature = token.slice(separator + 1);
  if (!encodedPayload || !suppliedSignature) return false;

  let payload: string;
  try {
    payload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
  } catch {
    return false;
  }
  const payloadSeparator = payload.lastIndexOf('.');
  if (payloadSeparator <= 0) return false;
  const tokenUserId = payload.slice(0, payloadSeparator);
  const expiresAt = Number(payload.slice(payloadSeparator + 1));
  if (tokenUserId !== userId || !Number.isSafeInteger(expiresAt) || expiresAt <= now) return false;

  const expected = Buffer.from(signature(payload, secret));
  const supplied = Buffer.from(suppliedSignature);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
