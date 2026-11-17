import { NextRequest } from 'next/server';
import type { Pool } from 'pg';
import { neonConfigured, mirrorHealth } from '@/db/replica';
import { installSyncInfrastructure, runSync, sharedSyncHandles, closeSyncHandles, countPending, loadPrimaryKeys, ensureSyncWriteAccess, type SyncHandles } from '@/db/sync';
import { fail, ok, requireUser, route } from '@/services/api';

export const maxDuration = 60;

/**
 * Streaming between the primary (Supabase) and the Neon mirror.
 *
 *   GET /api/v1/sync            → drain both directions now (the cron's call)
 *   GET /api/v1/sync?action=status → pending events per side (developer only)
 *   GET /api/v1/sync?action=run    → explicit drain, developer session
 *
 * The Vercel cron (see vercel.json) hits this path on its schedule — daily at
 * `0 3 * * *`, the most frequent cron the Hobby plan allows (Pro could run
 * `* * * * *`) — with the `CRON_SECRET` bearer token. The default action is
 * `run`, so the cron needs no query string. The reviews route also kicks the
 * drain after each submitted review (held open by `waitUntil`), so the
 * schedule is the backstop, not the only heartbeat; for sub-daily freshness
 * on Hobby, point an external scheduler at this path with the same bearer.
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

  // The cron bearer is accepted for `status` too: it is read-only queue
  // telemetry, and the scheduled health probe (sync-health.yml) has no user
  // session — only the shared secret.
  const cronSecret = process.env.CRON_SECRET;
  const bearer = req.headers.get('authorization');
  const isCron = Boolean(cronSecret) && bearer === `Bearer ${cronSecret}`;

  if (action === 'status') {
    if (!isCron) await requireUser(req, ['developer']);
    const handles = sharedSyncHandles();
    if (!handles?.neon) return ok({ configured: true, neon: false, pendingPrimary: 0, pendingNeon: 0 });
    try {
      const pendingPrimary = await countPending(handles.primary);
      // Telemetry beyond the bare count (#61): how stale the oldest queued
      // event is and how far the mirror's review log trails the primary.
      // Best-effort — a metrics failure must not take the status endpoint
      // down with it. The mirror has no event queue (#52 one-way): pendingNeon
      // stays null rather than querying a table that no longer exists there.
      let telemetry: Record<string, unknown> = {};
      try {
        const [oldestPrimary, lag] = await Promise.all([
          oldestEventAt(handles.primary.pool),
          reviewLagSeconds(handles.primary.pool, handles.neon.pool),
        ]);
        telemetry = { oldestPrimary, oldestNeon: null, reviewLagSeconds: lag };
      } catch (e) {
        telemetry = { telemetryError: e instanceof Error ? e.message : 'metrics failed' };
      }
      return ok({ configured: true, neon: true, mirror: mirrorHealth(), pendingPrimary, pendingNeon: null, ...telemetry });
    } finally {
      await closeSyncHandles(handles);
      globalThis.__revisioSyncHandles = undefined;
    }
  }

  // run: the cron's bearer secret, or a developer session.
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

/** Oldest queued event's capture time on one side, or null when the queue is empty. */
async function oldestEventAt(pool: Pool): Promise<string | null> {
  const res = await pool.query(`SELECT min(captured_at) AS oldest FROM _sync_events`);
  return res.rows[0]?.oldest ? new Date(res.rows[0].oldest).toISOString() : null;
}

/** Seconds the mirror's newest review trails the primary's; null when either side has none. */
async function reviewLagSeconds(primary: Pool, neon: Pool): Promise<number | null> {
  const [p, n] = await Promise.all([
    primary.query(`SELECT max(reviewed_at) AS latest FROM review_logs`),
    neon.query(`SELECT max(reviewed_at) AS latest FROM review_logs`),
  ]);
  const pLatest = p.rows[0]?.latest ? new Date(p.rows[0].latest).getTime() : null;
  const nLatest = n.rows[0]?.latest ? new Date(n.rows[0].latest).getTime() : null;
  if (pLatest == null || nLatest == null) return null;
  return Math.max(0, Math.round((pLatest - nLatest) / 1000));
}

async function ensureInfrastructure(handles: SyncHandles): Promise<void> {
  // One-way replication (#52): only the primary captures events. The mirror
  // is written solely by the apply path and has no `_sync_events` table.
  const db = handles.primary;
  const client = await db.pool.connect();
  let missing = false;
  try {
    const res = await client.query(`SELECT to_regclass('_sync_events') AS t`);
    missing = !res.rows[0]?.t;
  } finally {
    client.release();
  }
  if (missing) {
    const pkMap = await loadPrimaryKeys(handles.primary);
    await installSyncInfrastructure([handles.primary], pkMap);
  }
  // A table that exists but rejects the connecting role's writes is the
  // failure that silently broke every application write once; probe and
  // repair on every run, cron included.
  await ensureSyncWriteAccess(db);
}
