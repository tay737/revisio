import { NextRequest } from 'next/server';
import { ApiError, getSession, ok, route } from '@/services/api';
import { clientIp, takeRateLimitAttempt } from '@/services/rate-limit';
import { recordAnalyticsEvents, type AnalyticsEventInput } from '@/services/analytics';

/**
 * POST /api/v1/events — first-party funnel events.
 *
 * Public by design: the landing funnel starts before any account exists, so
 * there is nothing to authenticate against. The privacy gate lives in the
 * client (events only fire after the Analytics consent purpose is granted);
 * this route's job is validation, rate limiting and storage. A valid session
 * is still picked up when present so post-signup events carry the user id —
 * that is what stitches the funnel together.
 */
export const POST = route(async (req: NextRequest) => {
  await takeRateLimitAttempt('eventsIp', clientIp(req));

  const body = (await req.json().catch(() => null)) as { events?: unknown } | null;
  const events = Array.isArray(body?.events) ? (body.events as AnalyticsEventInput[]) : null;
  if (!events?.length) throw new ApiError(400, 'bad_request', 'events must be a non-empty array.');

  const session = await getSession(req);
  const accepted = await recordAnalyticsEvents(events, session?.id ?? null);
  return ok({ accepted });
});
