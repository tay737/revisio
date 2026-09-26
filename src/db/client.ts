import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { createAppPool, isCapacityError } from './pool';
import * as schema from './schema';

// ── The primary database (Supabase) ────────────────────────────────────────
//
// This module owns exactly one thing: the primary `db` handle. Everything
// else lives where it belongs:
//
//   • pool discipline + error classification → src/db/pool.ts
//   • the read replica + failover policy     → src/db/replica.ts
//   • the streaming engine between the two   → src/db/sync.ts
//
// The failure history that shaped `createAppPool` (production building a new
// pool per query, the 200-client ceiling, sessions dying on refresh) is told
// once in pool.ts, not repeated here.

export { isCapacityError } from './pool';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

declare global {
  // eslint-disable-next-line no-var
  var __revisioPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __revisioDb: DrizzleDb | undefined;
}

function initDb(): DrizzleDb {
  const pool = globalThis.__revisioPool ?? createAppPool(process.env.DATABASE_URL, { envName: 'DATABASE_URL' });
  globalThis.__revisioPool = pool;
  return drizzle(pool, { schema });
}

function lazyDb(): DrizzleDb {
  if (globalThis.__revisioDb) return globalThis.__revisioDb;
  const real = initDb();
  globalThis.__revisioDb = real;
  return real;
}

/**
 * The write path and everything that must be exactly current: auth, refresh
 * rotation, the review write path, every queue the learner is dealt. Reads
 * that tolerate second-scale staleness go through `readDb()` in replica.ts.
 */
export const db = new Proxy({} as DrizzleDb, {
  get(_target, prop, receiver) {
    const real = lazyDb();
    const value = Reflect.get(real as object, prop, receiver);
    return typeof value === 'function' ? value.bind(real) : value;
  },
});

/**
 * Release pooled connections. A long-lived process that keeps a pool open
 * holds pooler slots for everything else, so scripts and other one-shot
 * callers should end with this rather than leaving the process to drop its
 * sockets.
 */
export async function closeDb(): Promise<void> {
  const pool = globalThis.__revisioPool;
  globalThis.__revisioPool = undefined;
  globalThis.__revisioDb = undefined;
  if (pool) await pool.end().catch(() => undefined);
}

export type Db = DrizzleDb;
