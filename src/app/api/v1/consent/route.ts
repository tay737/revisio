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
  const updatedAt = typeof body.updatedAt === 'string' && !Number.isNaN(Date.parse(body.updatedAt))
    ? body.updatedAt
    : new Date().toISOString();
  const next = {
    version: 1,
    updatedAt,
    choices,
    decidedAt: typeof body.decidedAt === 'string' && !Number.isNaN(Date.parse(body.decidedAt))
      ? body.decidedAt
      : updatedAt,
  } as const;

  await db.update(users).set({
    consent: next,
    consentUpdatedAt: new Date(next.updatedAt),
  }).where(eq(users.id, user.id));

  return ok({ consent: next });
});
