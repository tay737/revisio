import { NextRequest } from 'next/server';
import { ApiError, ok, requireUser, route } from '@/services/api';
import { submitReview } from '@/services/study';

export const POST = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const body = (await req.json().catch(() => null)) as {
    cardId?: string; answer?: string; selectedOptionId?: string; durationMs?: number; mode?: 'daily' | 'cram' | 'exam'; sessionId?: string;
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
  return ok(result);
});
