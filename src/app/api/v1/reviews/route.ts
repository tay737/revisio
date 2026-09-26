import { NextRequest } from 'next/server';
import { ApiError, ok, requireUser, route } from '@/services/api';
import { submitReview } from '@/services/study';
import { kickSync, sharedSyncHandles } from '@/db/sync';

export const POST = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const body = (await req.json().catch(() => null)) as {
    cardId?: string; answer?: string; selectedOptionId?: string; durationMs?: number; mode?: 'daily' | 'cram' | 'exam' | 'learn'; sessionId?: string;
  } | null;
  if (!body?.cardId) throw new ApiError(400, 'bad_request', 'cardId is required.');
  const result = await submitReview(user.id, {
    cardId: body.cardId,
    answer: body.answer,
    selectedOptionId: body.selectedOptionId,
    durationMs: body.durationMs,
    mode: body.mode ?? 'daily',
    sessionId: body.sessionId,
  });
  // Streaming: the review's rows (review_logs, card_user_states, xp_events, …)
  // were captured by the primary's triggers on write; this drains them to the
  // Neon mirror without waiting for the next cron tick, so dashboards and
  // leaderboards served from the replica see the review within seconds.
  // Fire-and-forget — failure here falls back to the scheduled run.
  if (sharedSyncHandles()) kickSync();
  return ok(result);
});
