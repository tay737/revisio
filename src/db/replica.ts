import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { createAppPool, isConnectionError } from './pool';
import { db, type Db } from './client';
import * as schema from './schema';

// ── The Neon read replica ──────────────────────────────────────────────────
//
// NEON_DATABASE_URL points at a Neon Postgres kept in step with the primary
// by src/db/sync.ts (change capture + bidirectional drain). Reads that
// tolerate second-scale staleness go to it; the primary keeps everything that
// must be exactly current or is a write:
//
//   • auth (`verifyAccessToken`, refresh rotation) — a stale users row must
//     never suspend or resurrect a session, and refresh tokens do not even
//     exist on the replica;
//   • the review write path (`submitReview`) — one scheduler, one grading
//     authority, per §7 of the architecture doc;
//   • every queue the learner is *dealt* (`buildDailyQueue`) — dealing a card
//     the replica has not met yet would grade against nothing.
//
// Everything else — dashboard, /me, leaderboards, subject lists, lesson text —
// reads from the replica. Each drained write lands on the other side within
// seconds (cron every minute, plus a kick after each submitted review), so
// "stale" here means at most one review behind, briefly.
//
// ── Failover: the mirror is an optimization, never a dependency ─────────────
//
// If NEON_DATABASE_URL is unset, `readDb()` returns the primary — the app
// runs single-database, exactly as before. If the mirror is configured but
// *unreachable at runtime*, `readDb()` fails open: the first connection-class
// failure opens a circuit that sends reads to the primary for
// NEON_FAILOVER_MS (default 30s), then probes the mirror again with one real
// read. A user's dashboard is served by the database they have instead of an
// error from the one they don't; the mirror being down must never cost more
// than the latency of a fallback. `mirrorHealth()` reports the circuit's
// state for the admin surface and logs.

type DrizzleDb = Db;

declare global {
  // eslint-disable-next-line no-var
  var __revisioNeonPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __revisioNeonDb: DrizzleDb | undefined;
  // eslint-disable-next-line no-var
  var __revisioNeonCircuit: { openUntil: number; lastOkAt: number } | undefined;
}

export function neonConfigured(): boolean {
  return Boolean(process.env.NEON_DATABASE_URL);
}

const FAILOVER_MS = Number(process.env.NEON_FAILOVER_MS ?? 30_000);

function circuit(): { openUntil: number; lastOkAt: number } {
  return (globalThis.__revisioNeonCircuit ??= { openUntil: 0, lastOkAt: 0 });
}

function initNeonDb(): DrizzleDb {
  const pool = globalThis.__revisioNeonPool ?? createAppPool(process.env.NEON_DATABASE_URL, { envName: 'NEON_DATABASE_URL', maxEnv: 'NEON_POOL_MAX' });
  globalThis.__revisioNeonPool = pool;
  const real = drizzle(pool, { schema });
  globalThis.__revisioNeonDb = real;
  return real;
}

/**
 * The read database: the Neon mirror when it is configured and reachable,
 * the primary when it is neither. Per-process state; the cron/CLI paths do
 * their own health handling against their own handles.
 */
export function readDb(): DrizzleDb {
  if (!neonConfigured()) return db;
  if (Date.now() < circuit().openUntil) return db; // circuit open → fail open
  return globalThis.__revisioNeonDb ?? initNeonDb();
}

/**
 * Wrap a read so a dead mirror degrades to the primary instead of erroring.
 * Only connection-class failures flip the circuit — a SQL error (bad query,
 * constraint) is a bug and must surface, not hide behind a fallback.
 */
export async function readReplica<T>(run: (rdb: DrizzleDb) => Promise<T>): Promise<T> {
  const rdb = readDb();
  try {
    const result = await run(rdb);
    if (rdb !== db) circuit().lastOkAt = Date.now();
    return result;
  } catch (e) {
    if (neonConfigured() && rdb !== db && isConnectionError(e)) {
      circuit().openUntil = Date.now() + FAILOVER_MS;
      console.error(`[replica] mirror unreachable — reads fail open to the primary for ${FAILOVER_MS / 1000}s`, e);
      return run(db);
    }
    throw e;
  }
}

export type MirrorHealth = {
  configured: boolean;
  state: 'disabled' | 'healthy' | 'degraded' | 'unknown';
  /** Seconds left before the circuit probes the mirror again. */
  retryInSec: number;
};

/** Circuit state for the admin surface and logs. Cheap; no I/O. */
export function mirrorHealth(): MirrorHealth {
  if (!neonConfigured()) return { configured: false, state: 'disabled', retryInSec: 0 };
  const { openUntil, lastOkAt } = circuit();
  if (Date.now() < openUntil) {
    return { configured: true, state: 'degraded', retryInSec: Math.ceil((openUntil - Date.now()) / 1000) };
  }
  // A mirror that answered within the last failover window is healthy; one
  // nobody has read through yet is simply unknown, not suspect.
  if (lastOkAt && Date.now() - lastOkAt < FAILOVER_MS) {
    return { configured: true, state: 'healthy', retryInSec: 0 };
  }
  return { configured: true, state: 'unknown', retryInSec: 0 };
}

export async function closeNeonDb(): Promise<void> {
  const pool = globalThis.__revisioNeonPool;
  globalThis.__revisioNeonPool = undefined;
  globalThis.__revisioNeonDb = undefined;
  globalThis.__revisioNeonCircuit = undefined;
  if (pool) await pool.end().catch(() => undefined);
}
