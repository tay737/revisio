import { NextRequest } from 'next/server';
import { fail, ok } from '@/services/api';
import { processRetentionReminders } from '@/services/retention';
import { runRetentionCleanup } from '@/services/retention-cleanup';

export const maxDuration = 60;

/**
 * Reminder dispatcher. Called by the GitHub Actions cron (every 10–15 min) with
 * `Authorization: Bearer $CRON_SECRET` or `x-cron-secret`. It only sends to
 * learners who opted in, whose local send window is open, and whose consent
 * record still allows non-essential notifications.
 */
async function handler(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const bearer = req.headers.get('authorization') ?? '';
  const header = req.headers.get('x-cron-secret') ?? '';
  if (!secret || (bearer !== `Bearer ${secret}` && header !== secret)) {
    return fail(401, 'unauthorized', 'Cron secret required.');
  }
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? 200);
  const cleanup = await runRetentionCleanup();
  const result = await processRetentionReminders(new Date(), Number.isFinite(limit) ? limit : 200);
  return ok({ ok: true, ...result, cleanup });
}

export const GET = handler;
export const POST = handler;
