import { NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { deckReports, topics } from '@/db/schema';
import { ApiError, ok, requireUser, route } from '@/services/api';

/**
 * POST /api/v1/decks/report — F12/D11 "report this deck".
 *
 *   { deckTopicId, reason? } → records one moderation-queue row per
 *   (user, deck); a repeat report is a no-op, so the endpoint is idempotent
 *   and safe to retry from an offline outbox.
 *
 * The deck must be a public topic — reporting a private or nonexistent one
 * is a 404, not a stored row. `reason` is optional free text (500 chars).
 */
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const body = (await req.json().catch(() => ({}))) as {
    deckTopicId?: string;
    reason?: string;
  };
  if (!body.deckTopicId || typeof body.deckTopicId !== 'string') {
    throw new ApiError(400, 'bad_request', 'deckTopicId required.');
  }

  const [deck] = await db
    .select({ id: topics.id })
    .from(topics)
    .where(and(eq(topics.id, body.deckTopicId), eq(topics.visibility, 'public')))
    .limit(1);
  if (!deck) throw new ApiError(404, 'not_found', 'That deck does not exist.');

  const reason =
    typeof body.reason === 'string' && body.reason.trim()
      ? body.reason.trim().slice(0, 500)
      : null;

  await db
    .insert(deckReports)
    .values({ id: crypto.randomUUID(), userId: user.id, deckTopicId: deck.id, reason })
    .onConflictDoNothing({ target: [deckReports.userId, deckReports.deckTopicId] });

  return ok({ reported: true });
});
