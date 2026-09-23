import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { users, approvalRequests, userSubjects } from '@/db/schema';
import { hashPassword, issueEmailToken } from '@/services/auth';
import { sendVerificationEmail } from '@/services/email';
import { ApiError, ok, route } from '@/services/api';

export const POST = route(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  if (!body) throw new ApiError(400, 'bad_request', 'Invalid JSON body.');
  const { email, password, name, role, note, subjectIds, classCode } = body as {
    email?: string; password?: string; name?: string; role?: 'student' | 'teacher' | 'developer'; note?: string;
    subjectIds?: string[]; classCode?: string;
  };
  if (!email || !password || !name) throw new ApiError(400, 'bad_request', 'Email, password and name are required.');
  if (password.length < 8) throw new ApiError(400, 'weak_password', 'Password must be at least 8 characters.');
  if (role && role !== 'student' && role !== 'teacher' && role !== 'developer') {
    throw new ApiError(400, 'bad_request', 'Invalid role.');
  }
  // developer self-registration is never allowed — only teacher via staff portal
  const requestedRole = role === 'teacher' ? 'teacher' : 'student';

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (existing) throw new ApiError(409, 'email_taken', 'An account with this email already exists.');

  const [user] = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      email: email.toLowerCase(),
      name,
      passwordHash: await hashPassword(password),
      role: requestedRole === 'teacher' ? 'student' : 'student', // role upgrades after approval
      status: 'pending',
    })
    .returning();

  if (requestedRole === 'teacher') {
    await db.insert(approvalRequests).values({
      id: crypto.randomUUID(), userId: user.id, roleRequested: 'teacher', note: note ?? '',
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
