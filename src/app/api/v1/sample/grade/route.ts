import { NextRequest } from 'next/server';
import { ApiError, ok, route } from '@/services/api';
import { clientIp, takeRateLimitAttempt } from '@/services/rate-limit';
import { gradeSampleCard } from '@/services/acquisition';

/**
 * POST /sample/grade — grade one sample card with the real grading rules.
 * Unauthenticated by design (that is the point of the demo), so it is
 * rate-limited per IP and persists nothing: no card state, no XP, no user.
 */
export const POST = route(async (req: NextRequest) => {
  await takeRateLimitAttempt('sampleGrade', clientIp(req));
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') throw new ApiError(400, 'bad_request', 'Invalid JSON body.');
  const result = await gradeSampleCard(body as { cardId?: unknown; answer?: unknown; selectedOptionId?: unknown });
  return ok(result);
});
