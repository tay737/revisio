import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// Postgres via Supabase (DATABASE_URL = Supabase connection string).
// Session pooler URL recommended for serverless (Vercel).
// The pool is created lazily on first query so builds/imports never connect.

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
  const pool =
    globalThis.__revisioPool ??
    new Pool({
      connectionString: url,
      max: 10,
      ssl: url.includes('localhost') || url.includes('127.0.0.1') ? undefined : { rejectUnauthorized: false },
    });
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
