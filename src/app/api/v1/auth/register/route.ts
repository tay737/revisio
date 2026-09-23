import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users, approvalRequests } from '@/db/schema';
import { hashPassword, issueEmailToken } from '@/services/auth';
import { ApiError, ok, route } from '@/services/api';

export const POST = route(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  if (!body) throw new ApiError(400, 'bad_request', 'Invalid JSON body.');
  const { email, password, name, role, note } = body as {
    email?: string; password?: string; name?: string; role?: 'student' | 'teacher' | 'developer'; note?: string;
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
      role: 'student', // role upgrades after approval
      status: 'pending',
    })
    .returning();

  if (requestedRole === 'teacher') {
    await db.insert(approvalRequests).values({
      id: crypto.randomUUID(), userId: user.id, roleRequested: 'teacher', note: note ?? '',
    });
  }

  const token = await issueEmailToken(user.id, 'verify');
  const verifyUrl = `/verify-email?token=${token}`;
  // In dev we surface the link directly; in prod this would be an email via SMTP.
  console.log(`[email] verify link for ${user.email}: ${verifyUrl}`);

  return ok({ id: user.id, email: user.email, name: user.name, role: user.role, status: user.status, verifyUrl: `/#/verify-email?token=${token}` }, { status: 201 });
});
