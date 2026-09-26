import { Pool } from 'pg';
import type { PoolConfig } from 'pg';

// ── The one owner of pool discipline and database-error policy ─────────────
//
// Every pg Pool in the app is built here, and every "is this error what I
// think it is" question is answered here. The discipline exists because of a
// real outage: this module's predecessor cached its pool on `globalThis` only
// when NODE_ENV !== 'production', so production built a **new pool on every
// query** and never ended one — a single `/me` request with a Promise.all of
// five queries opened five pools of up to three clients each, none released.
// A one-user app reached the Supabase pooler's 200-client project ceiling,
// and from then on every request failed, login included. What keeps that from
// recurring, in every pool:
//
//   • cached by the caller in every environment (see client.ts / replica.ts);
//   • `max` defaults to 2 with a short idle timeout — a warm serverless
//     instance does not sit on pooler slots it is not using;
//   • acquisition failures are retried in-place with jittered backoff, because
//     they mean nothing ran;
//   • `isCapacityError` / `isConnectionError` let callers answer "wait" or
//     "fail over" instead of "something broke".

/** Walk `cause` chains — Drizzle wraps driver errors, so the code is a few links down. */
export function errorChain(e: unknown): unknown[] {
  const links: unknown[] = [];
  let current: unknown = e;
  for (let i = 0; current && i < 6; i += 1) {
    links.push(current);
    current = (current as { cause?: unknown }).cause;
  }
  return links;
}

function matches(e: unknown, test: (code: string, message: string) => boolean): boolean {
  return errorChain(e).some((link) => {
    const code = (link as { code?: string } | null)?.code ?? '';
    const message = String((link as { message?: string } | null)?.message ?? '');
    return test(code, message);
  });
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
  return matches(e, (code, message) =>
    code === 'EMAXCONN' ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === '53300' ||
    /max client connections|too many clients|remaining connection slots|timeout exceeded when trying to connect/i.test(message),
  );
}

/**
 * Did the *connection itself* fail — the database unreachable, gone, or
 * refusing to admit us? Unlike capacity pressure, this is not worth retrying
 * in place: the other side is not coming back mid-request. Used by the
 * replica's circuit breaker to decide when reads should fail open to the
 * primary.
 */
export function isConnectionError(e: unknown): boolean {
  return matches(e, (code, message) =>
    /^E(CONNREFUSED|CONNRESET|TIMEDOUT|HOSTUNREACH|NOTFOUND|AI_AGAIN)$/.test(code) ||
    code === '08000' || code === '08001' || code === '08003' || code === '08006' ||
    code === '08004' || code === '57P01' || code === '28P01' ||
    /connection terminated|timeout expired|password authentication failed|getaddrinfo/i.test(message),
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Build a pool under the shared discipline. Cached by the caller — this
 * function must be called at most once per database per process.
 */
export function createAppPool(
  url: string | undefined,
  opts: { envName: string; maxEnv?: string },
): Pool {
  if (!url) throw new Error(`${opts.envName} is not set.`);
  const isLocal = url.includes('localhost') || url.includes('127.0.0.1');
  const config: PoolConfig = {
    connectionString: url,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
    max: Number(process.env[opts.maxEnv ?? 'PGPOOL_MAX'] ?? 2),
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
