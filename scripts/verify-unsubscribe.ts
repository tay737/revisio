import assert from 'node:assert/strict';
import {
  UNSUBSCRIBE_TTL_MS,
  applyUnsubscribe,
  issueUnsubscribeToken,
  verifyUnsubscribeToken,
} from '../src/services/unsubscribe';

const secret = 'test-secret';
const now = 1_800_000_000_000;

// ── token issuing / verification ────────────────────────────────────────────
const token = issueUnsubscribeToken('user-123', secret, now);
assert.deepEqual(verifyUnsubscribeToken(token, secret, now), { userId: 'user-123' });
assert.deepEqual(
  verifyUnsubscribeToken(token, secret, now + UNSUBSCRIBE_TTL_MS),
  { userId: 'user-123' },
  'a link stays usable up to its expiry',
);
assert.equal(
  verifyUnsubscribeToken(token, secret, now + UNSUBSCRIBE_TTL_MS + 1),
  null,
  'a link expires after its stated lifetime',
);
assert.equal(verifyUnsubscribeToken(token, 'another-secret', now), null, 'the signature is verified');
assert.equal(verifyUnsubscribeToken(token, '', now), null, 'an unconfigured secret verifies nothing');
assert.equal(verifyUnsubscribeToken(`${token}x`, secret, now), null, 'a tampered token is refused');
assert.equal(verifyUnsubscribeToken(token.slice(0, -2), secret, now), null, 'a truncated token is refused');
assert.equal(verifyUnsubscribeToken('', secret, now), null);
assert.equal(verifyUnsubscribeToken('nodot', secret, now), null);
assert.equal(verifyUnsubscribeToken('a.b.c', secret, now), null);
assert.equal(
  verifyUnsubscribeToken(issueUnsubscribeToken('user-123', secret, now + 120_000), secret, now),
  null,
  'a token issued in the future is not accepted',
);

// A token is bound to the account it was minted for: encoding another account
// id into the payload must not verify, or a forwarded message could opt
// somebody else out.
const [payload, signature] = token.split('.');
const forged = Buffer.from('user-999.99999999999999').toString('base64url');
assert.equal(verifyUnsubscribeToken(`${forged}.${signature}`, secret, now), null, 'the account id is part of the signature');

assert.throws(() => issueUnsubscribeToken('user-123', ''), /AUTH_SECRET/);

// ── consent merge ───────────────────────────────────────────────────────────
const stamp = new Date('2026-10-12T09:30:00.000Z');
const merged = applyUnsubscribe(
  {
    version: 1,
    updatedAt: '2026-10-01T00:00:00.000Z',
    decidedAt: '2026-10-01T00:00:00.000Z',
    choices: { essential: true, analytics: true, preferences: true, marketing: true, notifications: true, research: false },
  },
  stamp,
);
assert.deepEqual(merged.choices, {
  essential: true,
  analytics: true,
  preferences: true,
  marketing: false,
  notifications: false,
  research: false,
}, 'only the two email purposes are turned off; the rest of the choices survive');
assert.equal(merged.version, 1);
assert.equal(merged.updatedAt, stamp.toISOString());
assert.equal(merged.decidedAt, '2026-10-01T00:00:00.000Z', 'an existing decision date is not rewritten');
assert.equal(merged.unsubscribedAt, stamp.toISOString());

const fromEmpty = applyUnsubscribe(null, stamp);
assert.deepEqual(fromEmpty.choices, { essential: true, marketing: false, notifications: false });
assert.equal(fromEmpty.decidedAt, stamp.toISOString(), 'an account with no recorded decision gets one');
assert.equal(fromEmpty.version, 1);

const idempotent = applyUnsubscribe(merged, stamp);
assert.deepEqual(idempotent.choices, merged.choices, 'unsubscribing twice is the same as once');

// Junk in the column must not throw or invent consent.
const fromJunk = applyUnsubscribe('not-an-object', stamp);
assert.deepEqual(fromJunk.choices, { essential: true, marketing: false, notifications: false });

console.log('Unsubscribe token and consent-merge contracts passed.');
