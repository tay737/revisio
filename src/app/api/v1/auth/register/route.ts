import { NextRequest } from 'next/server';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { users, approvalRequests, userSubjects, subjects } from '@/db/schema';
import { hashPassword, issueEmailToken } from '@/services/auth';
import { isUnderAge, isValidDateOfBirth } from '@/lib/age';
// education-level collection removed (UK GDPR Art 5(1)(c)); see privacy review 7.2.
import { sendVerificationEmail } from '@/services/email';
import { ApiError, ok, route } from '@/services/api';
import { takeRateLimitAttempt, clientIp } from '@/services/rate-limit';

export const POST = route(async (req: NextRequest) => {
  // One wall per source IP: account creation is the seed of every abuse
  // pattern (spam profiles, bulk spam submissions, a mailshot of verification
  // links), and it is the cheapest door to close.
  await takeRateLimitAttempt('registerIp', clientIp(req));
  const body = await req.json().catch(() => null);
  if (!body) throw new ApiError(400, 'bad_request', 'Invalid JSON body.');
  const { email, password, name, role, requestedRole: requestedRoleInput, note, ageConsent, dateOfBirth, subjectIds, classCode } = body as {
    email?: string; password?: string; name?: string; role?: 'student' | 'teacher' | 'developer';
    requestedRole?: 'student' | 'teacher' | 'developer'; note?: string;
    ageConsent?: boolean; dateOfBirth?: string; subjectIds?: string[]; classCode?: string;
  };

  // Every rejection names the control it belongs under (`ApiError.field`), so
  // the wizard renders the sentence beneath that field and marks that field —
  // and only that field — invalid.
  if (!email) throw new ApiError(400, 'bad_request', 'Enter an email address you can receive mail at.', 'email');
  if (!password) throw new ApiError(400, 'bad_request', 'Choose a password of at least 8 characters.', 'password');
  if (!name) throw new ApiError(400, 'bad_request', 'Add your name so your teacher or classmates can recognise you.', 'name');
  if (password.length < 8) throw new ApiError(400, 'weak_password', 'Use at least 8 characters for your password.', 'password');

  const registrationRole = role ?? requestedRoleInput;
  if (registrationRole && registrationRole !== 'student' && registrationRole !== 'teacher' && registrationRole !== 'developer') {
    throw new ApiError(400, 'bad_request', 'Invalid role.', 'role');
  }
  const learnerRegistration = !registrationRole || registrationRole === 'student';

  // Education level collection removed (UK GDPR Art 5(1)(c)); no feature
  // consumed the field, so there was no lawful basis for holding it. See
  // privacy review 7.2 and the DPO's ruling.

  // All learner registrations need an honest DOB so the server, not the
  // browser, can decide whether guardian consent is required.
  if (learnerRegistration && !isValidDateOfBirth(dateOfBirth)) {
    throw new ApiError(400, 'invalid_date_of_birth', 'Enter a valid date of birth that is not in the future.', 'dateOfBirth');
  }
  const underAge = learnerRegistration && isUnderAge(dateOfBirth ?? null);
  if (underAge && ageConsent !== true) {
    throw new ApiError(403, 'age_consent_required', 'A parent or guardian must confirm consent before the account can be created.', 'ageConsent');
  }

  // Staff role requests remain pending approval; learner age consent only
  // applies to self-registration as a student. The staff form sends
  // `requestedRole` while the ordinary form sends `role`.
  const requestedRole = registrationRole === 'teacher' || registrationRole === 'developer'
    ? registrationRole
    : 'student';

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (existing) throw new ApiError(409, 'email_taken', 'That address already has an account. Sign in instead.', 'email');

  // A subject can be unpublished between the form loading and submit. Trusting
  // the ids put a foreign-key violation in an unwrapped insert, so the whole
  // registration 500'd; instead, keep the ones that exist and tell the client
  // which were dropped so it can say "you can pick them later".
  const requestedSubjectIds = Array.isArray(subjectIds)
    ? [...new Set(subjectIds.filter((id): id is string => typeof id === 'string'))].slice(0, 12)
    : [];
  const availableSubjectIds = requestedSubjectIds.length
    ? (await db.select({ id: subjects.id }).from(subjects).where(inArray(subjects.id, requestedSubjectIds))).map((row) => row.id)
    : [];
  const unavailableSubjects = requestedSubjectIds.filter((id) => !availableSubjectIds.includes(id));

  const [user] = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      email: email.toLowerCase(),
      name,
      passwordHash: await hashPassword(password),
      role: 'student', // role upgrades after approval
      status: 'pending',
      // `ageConsent` is a record of a *guardian's* consent, so it is true only
      // when one was actually required and recorded — never as a stand-in for
      // "the age requirement was satisfied". Writing `true` for a learner of 13
      // or over asserted a parent's consent that was never given, which is a
      // fabricated entry in the very record a data-subject request reads back.
      // Nothing depends on the flag there: `dateOfBirth` is deliberately not
      // retained above 13 (the form says so), and an absent DOB already means
      // "no age gate applies" to `learnerMeetsAgeConsent`.
      ageConsent: underAge,
      dateOfBirth: underAge ? dateOfBirth ?? null : null,
    })
    .returning();

  if (requestedRole === 'teacher' || requestedRole === 'developer') {
    await db.insert(approvalRequests).values({
      id: crypto.randomUUID(), userId: user.id, roleRequested: requestedRole, note: note ?? '',
    });
  }

  // subject enrolment + class join at registration time
  if (requestedRole === 'student') {
    if (availableSubjectIds.length > 0) {
      await db.insert(userSubjects).values(availableSubjectIds.map((subjectId) => ({ userId: user.id, subjectId })));
    }
    if (classCode) {
      await db.execute(sql`insert into class_memberships (class_id, user_id)
        select id, ${user.id}::text from classes where upper(join_code) = ${classCode.toUpperCase()} limit 1`);
    }
  }

  const token = await issueEmailToken(user.id, 'verify');
  await sendVerificationEmail(user.email, token);

  // No mail provider configured (dev/self-host): surface the link so the flow
  // still works. Once RESEND_API_KEY is set, delivery is by email only.
  const emailConfigured = !!process.env.RESEND_API_KEY;
  return ok(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      ...(unavailableSubjects.length > 0 ? { unavailableSubjects } : {}),
      ...(emailConfigured ? {} : { verifyUrl: `/verify-email?token=${token}` }),
    },
    { status: 201 },
  );
});
