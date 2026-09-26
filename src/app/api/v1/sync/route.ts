import { NextRequest } from 'next/server';
import { neonConfigured, mirrorHealth } from '@/db/replica';
import { installSyncInfrastructure, runSync, sharedSyncHandles, closeSyncHandles, countPending, loadPrimaryKeys, type SyncHandles, type SyncDb } from '@/db/sync';
import { fail, ok, requireUser, route } from '@/services/api';

export const maxDuration = 60;

/**
 * Streaming between the primary (Supabase) and the Neon mirror.
 *
 *   GET /api/v1/sync            → drain both directions now (the cron's call)
 *   GET /api/v1/sync?action=status → pending events per side (developer only)
 *   GET /api/v1/sync?action=run    → explicit drain, developer session
 *
 * The Vercel cron (see vercel.json) hits this path every minute with the
 * `CRON_SECRET` bearer token — the default action is `run`, so the cron needs
 * no query string — and the reviews route also kicks the drain after each
 * submitted review, so the schedule is the backstop, not the only heartbeat.
 * A browser session may run it too, but only a developer's — the endpoint can
 * move arbitrary rows between databases.
 *
 * Handles are opened and closed per request on purpose: the cron fires once a
 * minute, and a serverless instance should not hold two extra pools of sockets
 * between invocations — the same client-budget discipline that forced the app
 * pools to be cached and small. `?action=run` on a cold instance pays one
 * connect per side, which is the whole cost.
 *
 * Infrastructure (event table + triggers) is probed, not re-installed: the
 * setup only runs when `_sync_events` is missing, so the steady-state cron
 * costs two `to_regclass` lookups per side and no DDL churn.
 */
export const GET = route(async (req: NextRequest) => {
  const action = req.nextUrl.searchParams.get('action') ?? 'run';
  if (action !== 'status' && action !== 'run') {
    return fail(400, 'bad_request', 'action must be "status" or "run".');
  }

  if (!neonConfigured()) {
    return ok({ configured: false, neon: false, pendingPrimary: 0, pendingNeon: 0 });
  }

  if (action === 'status') {
    await requireUser(req, ['developer']);
    const handles = sharedSyncHandles();
    if (!handles?.neon) return ok({ configured: true, neon: false, pendingPrimary: 0, pendingNeon: 0 });
    try {
      const [pendingPrimary, pendingNeon] = await Promise.all([
        countPending(handles.primary),
        countPending(handles.neon),
      ]);
      return ok({ configured: true, neon: true, mirror: mirrorHealth(), pendingPrimary, pendingNeon });
    } finally {
      await closeSyncHandles(handles);
      globalThis.__revisioSyncHandles = undefined;
    }
  }

  // run: the cron's bearer secret, or a developer session.
  const cronSecret = process.env.CRON_SECRET;
  const bearer = req.headers.get('authorization');
  const isCron = Boolean(cronSecret) && bearer === `Bearer ${cronSecret}`;
  if (!isCron) await requireUser(req, ['developer']);

  const handles = sharedSyncHandles();
  if (!handles?.neon) return fail(503, 'no_neon', 'NEON_DATABASE_URL is not set or the mirror is not reachable.');
  try {
    await ensureInfrastructure(handles);
    const result = await runSync(handles);
    return ok({ configured: true, neon: true, ...result });
  } catch (e) {
    console.error('[sync] run failed', e);
    return fail(502, 'sync_failed', e instanceof Error ? e.message : 'Sync run failed.');
  } finally {
    await closeSyncHandles(handles);
    globalThis.__revisioSyncHandles = undefined;
  }
});

async function ensureInfrastructure(handles: SyncHandles): Promise<void> {
  const dbs: SyncDb[] = handles.neon ? [handles.primary, handles.neon] : [handles.primary];
  const missing: typeof dbs = [];
  for (const db of dbs) {
    const client = await db.pool.connect();
    try {
      const res = await client.query(`SELECT to_regclass('_sync_events') AS t`);
      if (!res.rows[0]?.t) missing.push(db);
    } finally {
      client.release();
    }
  }
  if (missing.length > 0) {
    const pkMap = await loadPrimaryKeys(handles.primary);
    await installSyncInfrastructure(missing, pkMap);
  }
}
