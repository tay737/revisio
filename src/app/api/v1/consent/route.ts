import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { ApiError, ok, requireUser, route } from '@/services/api';
import type { NextRequest } from 'next/server';

/** GET /api/v1/consent — current consent state for the signed-in user. */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const [row] = await db.select({ consent: users.consent }).from(users).where(eq(users.id, user.id)).limit(1);
  const record = row?.consent && typeof row.consent === 'object' ? row.consent as Record<string, unknown> : {};
  const decidedAt = typeof record.decidedAt === 'string'
    ? record.decidedAt
    : typeof record.updatedAt === 'string' && record.choices
      ? record.updatedAt
      : null;
  return ok({ consent: record, decidedAt });
});

/** PATCH /api/v1/consent — replace the user's consent state. */
export const PATCH = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const body = (await req.json().catch(() => null)) as {
    version?: number;
    updatedAt?: string;
    choices?: Record<string, boolean>;
    decidedAt?: string;
  } | null;
  if (!body?.choices) throw new ApiError(400, 'bad_request', 'consent.choices are required.');

  const choices: Record<string, boolean> = { essential: true };
  for (const key of ['preferences', 'analytics', 'marketing', 'notifications', 'profile', 'school', 'research']) {
    if (typeof body.choices[key] === 'boolean') choices[key] = body.choices[key];
  }
  // The moment consent was recorded is our evidence under UK GDPR Art 7(1), so
  // the server stamps it. The browser's own time is kept beside it for the
  // offline case (a choice made yesterday, synced today), but it never replaces
  // the server time: a client-supplied stamp can be backdated, and a record that
  // can be backdated proves nothing.
  const receivedAt = new Date();
  const claimedAt = typeof body.updatedAt === 'string' && !Number.isNaN(Date.parse(body.updatedAt))
    ? body.updatedAt
    : null;
  const next = {
    version: 1,
    updatedAt: receivedAt.toISOString(),
    decidedAt: receivedAt.toISOString(),
    clientReportedAt: claimedAt,
    choices,
  };

  await db.update(users).set({
    consent: next,
    consentUpdatedAt: receivedAt,
  }).where(eq(users.id, user.id));

  return ok({ consent: next });
});
