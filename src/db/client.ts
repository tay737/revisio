import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { PoolConfig } from 'pg';
import * as schema from './schema';

// Postgres via Supabase (DATABASE_URL = Supabase transaction pooler, port 6543).
// The pool is created lazily on first query so builds/imports never connect.
//
// Connection budget: the pooler multiplexes, but it also has a hard *client*
// ceiling for the whole project (200). Every serverless instance holds its own
// pool, so the ceiling is shared across production lambdas, local servers and
// any script pointed at the same `DATABASE_URL`. Meeting it produces
// `(EMAXCONN) max client connections reached`, which used to surface as a bare
// "Unexpected server error" on whatever the user happened to be doing — and,
// worse, a failed `/auth/refresh` signed them out.
//
// The worst of it was one line: this module cached the pool on `globalThis` only
// when `NODE_ENV !== 'production'`. Production therefore built a **new pool on
// every query** and never ended one — a single `/me` request with a `Promise.all`
// of five queries opened five pools, up to fifteen clients, none released. That
// is how a one-user app reached a 200-client ceiling, and why it worked at first
// and then failed on everything at once.
//
// So three things changed here:
//   • `max` defaults to 2, and `idleTimeoutMillis` is short, so a warm instance
//     does not sit on connections it is not using;
//   • a query whose connection could never be acquired is retried, because that
//     failure means nothing ran and the pooler usually has room a moment later;
//   • `isCapacityError` lets callers answer "try again" instead of "something
//     broke". `services/api.ts` uses it to return 503, and the client treats
//     503 as retryable rather than as a dead session.
//
// Above all, the pool is now cached in **every** environment. That is the fix;
// the rest keeps the failure legible when it does happen.

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

declare global {
  // eslint-disable-next-line no-var
  var __revisioPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __revisioDb: DrizzleDb | undefined;
}

/** Walk `cause` chains — Drizzle wraps driver errors, so the code is a few links down. */
function errorChain(e: unknown): unknown[] {
  const links: unknown[] = [];
  let current: unknown = e;
  for (let i = 0; current && i < 6; i += 1) {
    links.push(current);
    current = (current as { cause?: unknown }).cause;
  }
  return links;
}

/**
 * Did this failure happen *before* the statement reached the database?
 *
 * Only these are retryable, and the distinction is deliberate: EMAXCONN,
 * ECONNREFUSED and an acquisition timeout all mean no connection was handed
 * over, so no SQL ran and a retry cannot duplicate a write. A reset or timeout
 * *mid-query* is excluded, because retrying a review insert there could award
 * the XP twice — a silent corruption is much worse than an error the user can
 * retry by hand.
 */
export function isCapacityError(e: unknown): boolean {
  return errorChain(e).some((link) => {
    const code = (link as { code?: string } | null)?.code;
    const message = String((link as { message?: string } | null)?.message ?? '');
    return (
      code === 'EMAXCONN' ||
      code === 'ECONNREFUSED' ||
      code === 'ETIMEDOUT' ||
      code === '53300' ||
      /max client connections|too many clients|remaining connection slots|timeout exceeded when trying to connect/i.test(message)
    );
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function initPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Point it at your Supabase Postgres instance.');
  const isLocal = url.includes('localhost') || url.includes('127.0.0.1');
  const config: PoolConfig = {
    connectionString: url,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
    max: Number(process.env.PGPOOL_MAX ?? 2),
    // Short, because an idle serverless instance has no business holding a
    // pooler slot. 30s of idle on every warm lambda is what fills the ceiling.
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    allowExitOnIdle: true,
  };
  const pool = new Pool(config);

  // Retry only acquisition failures, twice, with jittered backoff.
  const run = pool.query.bind(pool);
  pool.query = (async (...args: Parameters<Pool['query']>) => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await run(...args);
      } catch (e) {
        if (!isCapacityError(e) || attempt >= 2) throw e;
        await sleep(120 * 2 ** attempt + Math.random() * 120);
      }
    }
  }) as Pool['query'];

  return pool;
}

function initDb(): DrizzleDb {
  const pool = globalThis.__revisioPool ?? initPool();
  globalThis.__revisioPool = pool;
  return drizzle(pool, { schema });
}

function lazyDb(): DrizzleDb {
  if (globalThis.__revisioDb) return globalThis.__revisioDb;
  const real = initDb();
  globalThis.__revisioDb = real;
  return real;
}

export const db = new Proxy({} as DrizzleDb, {
  get(_target, prop, receiver) {
    const real = lazyDb();
    const value = Reflect.get(real as object, prop, receiver);
    return typeof value === 'function' ? value.bind(real) : value;
  },
});

/**
 * Release pooled connections. A long-lived process that keeps a pool open holds
 * pooler slots for everything else, so scripts and other one-shot callers should
 * end with this rather than leaving the process to drop its sockets.
 */
export async function closeDb(): Promise<void> {
  const pool = globalThis.__revisioPool;
  globalThis.__revisioPool = undefined;
  globalThis.__revisioDb = undefined;
  if (pool) await pool.end().catch(() => undefined);
}

export type Db = DrizzleDb;
