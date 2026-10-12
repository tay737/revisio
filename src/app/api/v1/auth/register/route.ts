import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { users, approvalRequests, userSubjects } from '@/db/schema';
import { hashPassword, issueEmailToken } from '@/services/auth';
import { isUnderAge, isValidDateOfBirth } from '@/lib/age';
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
  if (!email || !password || !name) throw new ApiError(400, 'bad_request', 'Email, password and name are required.');
  if (password.length < 8) throw new ApiError(400, 'weak_password', 'Password must be at least 8 characters.');
  const registrationRole = role ?? requestedRoleInput;
  if (registrationRole && registrationRole !== 'student' && registrationRole !== 'teacher' && registrationRole !== 'developer') {
    throw new ApiError(400, 'bad_request', 'Invalid role.');
  }
  // All learner registrations need an honest DOB so the server, not the
  // browser, can decide whether guardian consent is required.
  const learnerRegistration = !registrationRole || registrationRole === 'student';
  if (learnerRegistration && !isValidDateOfBirth(dateOfBirth)) {
    throw new ApiError(400, 'invalid_date_of_birth', 'Enter a valid date of birth that is not in the future.');
  }
  const underAge = learnerRegistration && isUnderAge(dateOfBirth ?? null);
  if (underAge && ageConsent !== true) {
    throw new ApiError(403, 'age_consent_required', 'A parent or guardian must confirm consent before a learner under 13 can register.');
  }

  // Staff role requests remain pending approval; learner age consent only
  // applies to self-registration as a student. The staff form sends
  // `requestedRole` while the ordinary form sends `role`.
  const requestedRole = registrationRole === 'teacher' || registrationRole === 'developer'
    ? registrationRole
    : 'student';

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (existing) throw new ApiError(409, 'email_taken', 'An account with this email already exists.');

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
    if (Array.isArray(subjectIds) && subjectIds.length > 0) {
      await db.insert(userSubjects).values(subjectIds.slice(0, 12).map((subjectId) => ({ userId: user.id, subjectId })));
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
    { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status, ...(emailConfigured ? {} : { verifyUrl: `/verify-email?token=${token}` }) },
    { status: 201 },
  );
});
