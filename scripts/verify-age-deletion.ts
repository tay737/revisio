import assert from 'node:assert/strict';
import { ageOnDate, isUnderAge, isValidDateOfBirth, learnerMeetsAgeConsent } from '../src/services/age-deletion-rules';
import { issueDeletionConfirmation, verifyDeletionConfirmation } from '../src/services/age-deletion-rules';

const today = new Date('2026-10-12T12:00:00.000Z');
assert.equal(isValidDateOfBirth('2013-10-12', today), true);
assert.equal(ageOnDate('2013-10-12', today), 13);
assert.equal(isUnderAge('2013-10-12', today), false, 'a learner turns 13 on their birthday');
assert.equal(ageOnDate('2013-10-13', today), 12);
assert.equal(isUnderAge('2013-10-13', today), true, 'a learner remains under 13 until their birthday');
assert.equal(isValidDateOfBirth('2012-02-29', today), true, 'valid leap-day birth dates are accepted');
assert.equal(ageOnDate('2012-02-29', new Date('2025-02-28T12:00:00.000Z')), 12, 'leap-day birthdays occur on March 1 in non-leap years');
assert.equal(ageOnDate('2012-02-29', new Date('2025-03-01T12:00:00.000Z')), 13);
assert.equal(isValidDateOfBirth('2013-02-29', today), false, 'impossible calendar dates are rejected');
assert.equal(isValidDateOfBirth('2026-10-13', today), false, 'future dates are rejected');
assert.equal(ageOnDate('', today), null, 'missing dates do not create an inferred age');

// The gate itself: a learner under 13 holds an account only while guardian
// consent is recorded, and the flag means *consent recorded*, never "the age
// check passed". These are the cases the registration route relies on.
assert.equal(learnerMeetsAgeConsent('2013-10-13', false, today), false, 'a 12-year-old without recorded consent is refused');
assert.equal(learnerMeetsAgeConsent('2013-10-13', true, today), true, 'a 12-year-old with recorded consent is allowed');
assert.equal(learnerMeetsAgeConsent('2013-10-12', false, today), true, 'the flag is irrelevant on the 13th birthday');
assert.equal(learnerMeetsAgeConsent('1990-01-01', false, today), true, 'an adult needs no guardian consent');
assert.equal(learnerMeetsAgeConsent(null, false, today), true, 'no retained date of birth means no age gate (the 13+ case)');
assert.equal(learnerMeetsAgeConsent(null, true, today), true, 'no retained date of birth gate regardless of the flag');
assert.equal(learnerMeetsAgeConsent('not-a-date', true, today), false, 'an unparseable date of birth fails closed');
assert.equal(learnerMeetsAgeConsent('2027-01-01', true, today), false, 'a future date of birth fails closed rather than reading as an adult');

const now = 1_800_000_000_000;
const issued = issueDeletionConfirmation('user-123', 'test-secret', now);
assert.equal(issued.expiresAt, now + 60_000);
assert.equal(verifyDeletionConfirmation(issued.token, 'user-123', 'test-secret', now), true);
assert.equal(verifyDeletionConfirmation(issued.token, 'another-user', 'test-secret', now), false, 'challenge is account-bound');
assert.equal(verifyDeletionConfirmation(issued.token, 'user-123', 'wrong-secret', now), false, 'challenge signature is verified');
assert.equal(verifyDeletionConfirmation(issued.token, 'user-123', 'test-secret', now + 60_000), false, 'challenge expires at the stated boundary');
assert.equal(verifyDeletionConfirmation(`${issued.token}x`, 'user-123', 'test-secret', now), false, 'tampered challenges are refused');

console.log('Age and account-deletion confirmation contracts passed.');
