import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { PoolConfig } from 'pg';
import * as schema from './schema';

// Postgres via Supabase (DATABASE_URL = Supabase transaction pooler, port 6543).
// The pool is created lazily on first query so builds/imports never connect.
//
// Connection budget: Supabase's transaction pooler is shared; keep `max` small.
// For serverless, one function instance ≈ one pool of PGPOOL_MAX (default 3).
// `allowExitOnIdle` lets Vercel freeze/recycle the function without holding
// sockets open; keepalives kill half-open connections after network changes.

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

declare global {
  // eslint-disable-next-line no-var
  var __revisioPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __revisioDb: DrizzleDb | undefined;
}

function initDb(): DrizzleDb {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Point it at your Supabase Postgres instance.');
  const isLocal = url.includes('localhost') || url.includes('127.0.0.1');
  const config: PoolConfig = {
    connectionString: url,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
    max: Number(process.env.PGPOOL_MAX ?? 3),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    allowExitOnIdle: true,
  };
  const pool = globalThis.__revisioPool ?? new Pool(config);
  if (process.env.NODE_ENV !== 'production') globalThis.__revisioPool = pool;
  return drizzle(pool, { schema });
}

function lazyDb(): DrizzleDb {
  if (globalThis.__revisioDb) return globalThis.__revisioDb;
  const real = initDb();
  if (process.env.NODE_ENV !== 'production') globalThis.__revisioDb = real;
  return real;
}

export const db = new Proxy({} as DrizzleDb, {
  get(_target, prop, receiver) {
    const real = lazyDb();
    const value = Reflect.get(real as object, prop, receiver);
    return typeof value === 'function' ? value.bind(real) : value;
  },
});

export type Db = DrizzleDb;
