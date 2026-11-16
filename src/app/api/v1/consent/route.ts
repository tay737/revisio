import { and, eq, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { users, studyConnections, guardianLinks } from '@/db/schema';
import { ApiError, ok, requireUser, route } from '@/services/api';
import { consentFromBlob } from '@/lib/consent';
import { isUnderAge } from '@/lib/age';
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
  for (const key of ['preferences', 'analytics', 'marketing', 'notifications', 'profile', 'school', 'social', 'research']) {
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

  // Sever-on-withdrawal (DPO Amendment B): social true→false ends every study
  // link and summary share in the same transaction. Re-consent starts fresh —
  // nothing silently reactivates.
  const [current] = await db.select({ consent: users.consent, dateOfBirth: users.dateOfBirth }).from(users).where(eq(users.id, user.id)).limit(1);
  const wasSocial = consentFromBlob(current?.consent).choices.social === true;
  const isSocial = choices.social === true;
  // #36: under-13 accounts registered under guardian consent may not self-grant
  // the social purpose. Withdrawal stays allowed — only the grant is refused.
  if (isSocial && isUnderAge(current?.dateOfBirth)) {
    throw new ApiError(403, 'social_underage', 'Social features are not available on guardian-consented accounts.');
  }
  const sever = wasSocial && !isSocial;

  await db.transaction(async (tx) => {
    await tx.update(users).set({
      consent: next,
      consentUpdatedAt: receivedAt,
    }).where(eq(users.id, user.id));
    if (sever) {
      await tx.delete(studyConnections).where(or(eq(studyConnections.requesterId, user.id), eq(studyConnections.addresseeId, user.id)));
      await tx.update(guardianLinks)
        .set({ status: 'revoked', respondedAt: receivedAt })
        .where(and(or(eq(guardianLinks.studentId, user.id), eq(guardianLinks.guardianId, user.id)), sql`${guardianLinks.status} in ('pending','accepted')`));
    }
  });

  return ok({ consent: next });
});
