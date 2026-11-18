import { NextRequest } from 'next/server';
import { ApiError, ok, requireUser, route } from '@/services/api';
import { setConfusedFlag } from '@/services/study';
import { kickSync, sharedSyncHandles } from '@/db/sync';

/**
 * POST /api/v1/confused — the F10 "Still confused" toggle. Body:
 * `{ cardId, flagged }`. The flag is the learner's own mark on
 * `card_user_states.confused_at`; it feeds their insights surface and the
 * teacher's student panel alike (D9).
 */
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const body = (await req.json().catch(() => null)) as { cardId?: string; flagged?: boolean } | null;
  if (!body?.cardId || typeof body.flagged !== 'boolean') {
    throw new ApiError(400, 'bad_request', 'cardId and a boolean flagged are required.');
  }
  const result = await setConfusedFlag(user.id, body.cardId, body.flagged);
  // card_user_states replicates through the same trigger capture as every
  // other study write — kick the mirror drain so teacher surfaces see the
  // flag without waiting for the cron tick.
  if (sharedSyncHandles()) kickSync();
  return ok(result);
});
