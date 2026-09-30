import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { ApiError } from '@/services/api';

// ── The one rate limiter ────────────────────────────────────────────────────
//
// The abuse-prone doors — login, register, verification-email resend, 2FA —
// had no limit at all: bcrypt cost is the only brake on a password guess, and
// the resend route could be driven indefinitely against Resend. The limiter
// lives in Postgres because the app is fully serverless (Vercel): there is no
// always-on process to hold an in-memory counter, and no external service is
// justified at this scale. The Postgres write also already exists on these
// paths' worst days (auth touches the primary), so this adds no new failure
// dependency — and a limiter that fails *open* degrades to exactly the
// behaviour the app had before it, which is the right bias for a brake that
// must never itself become the outage.
//
// One table, fixed-window counting:
//
//   rate_limits(key text pk, window_start timestamptz, count int)
//
// The upsert is a single statement, so two concurrent requests cannot both
// win the race: `count = 1` only lands when the row was absent, and the
// returning count is the authoritative post-increment value. Expired windows
// are reset by the same statement. The table is created lazily — migrations
// on Supabase and the Neon mirror both need it, and a request that finds it
// missing pays the DDL once, then never again.

export type RateLimitRule = {
  /** Bucket name: one limiter may serve several rules (e.g. per-IP and per-email). */
  bucket: string;
  /** Window in seconds; the counter resets when it elapses. */
  windowSec: number;
  /** Attempts allowed per window; the (n+1)th is refused. */
  max: number;
};

const RULES = {
  /** Per source IP — the outer wall against distributed guessing. */
  loginIp: { bucket: 'login-ip', windowSec: 900, max: 20 },
  /** Per email+IP — the inner wall that does not lock a family/office NAT out. */
  loginIdentity: { bucket: 'login-id', windowSec: 900, max: 8 },
  registerIp: { bucket: 'register-ip', windowSec: 3600, max: 10 },
  /** Verification resends: the address is the resource being exhausted. */
  verifySend: { bucket: 'verify-send', windowSec: 3600, max: 5 },
  /** 2FA attempts per account: TOTP codes are 6 digits and worth guessing slowly. */
  totp: { bucket: 'totp', windowSec: 900, max: 10 },
} satisfies Record<string, RateLimitRule>;

export type RateLimitKind = keyof typeof RULES;

let tableReady: Promise<void> | null = null;

async function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = db.execute(sql`
      CREATE TABLE IF NOT EXISTS rate_limits (
        key           text PRIMARY KEY,
        window_start  timestamptz NOT NULL DEFAULT now(),
        count         integer NOT NULL DEFAULT 0
      )
    `).then(
      () => undefined,
      (e) => {
        tableReady = null; // retry next request rather than caching the failure
        throw e;
      },
    );
  }
  return tableReady;
}

function keyFor(kind: RateLimitKind, identity: string): string {
  return `${RULES[kind].bucket}:${identity}`;
}

/**
 * Take one attempt against `kind` for `identity` (an ip, an email, a user id).
 * Returns the attempts remaining in the window. Throws the limiter's own 429
 * when the window is exhausted — the route wrapper turns ApiError into the
 * response, so callers can stay one line.
 *
 * Failure policy is fail-open on purpose: a limiter outage must not take
 * authentication with it. It logs loudly so the gap is visible.
 */
export async function takeRateLimitAttempt(kind: RateLimitKind, identity: string): Promise<number> {
  const rule = RULES[kind];
  const key = keyFor(kind, identity);
  try {
    await ensureTable();
    const result = await db.execute(sql`
      INSERT INTO rate_limits (key, window_start, count)
      VALUES (${key}, now(), 1)
      ON CONFLICT (key) DO UPDATE SET
        window_start = CASE WHEN rate_limits.window_start > now() - (${rule.windowSec} || ' seconds')::interval
                            THEN rate_limits.window_start ELSE now() END,
        count = CASE WHEN rate_limits.window_start > now() - (${rule.windowSec} || ' seconds')::interval
                     THEN rate_limits.count + 1 ELSE 1 END
      RETURNING count
    `);
    const rows = (result as unknown as { rows: { count: number }[] }).rows ?? [];
    const count = Number(rows[0]?.count ?? 1);
    if (count > rule.max) {
      throw new ApiError(429, 'rate_limited', 'Too many attempts. Wait a little and try again.');
    }
    return Math.max(0, rule.max - count);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    // Fail open — but say so. A silent open limiter is a silently absent one.
    console.error(`[rate-limit] limiter unavailable, failing open for ${kind}`, e);
    return rule.max;
  }
}

/** Best-effort reset on success (a verified login should not spend the window). */
export async function clearRateLimit(kind: RateLimitKind, identity: string): Promise<void> {
  try {
    await ensureTable();
    await db.execute(sql`DELETE FROM rate_limits WHERE key = ${keyFor(kind, identity)}`);
  } catch (e) {
    console.error(`[rate-limit] clear failed for ${kind}`, e);
  }
}

/** The caller's address, from Vercel's forwarded headers, without trusting a spoofable x-forwarded-for hop blindly. */
export function clientIp(req: { headers: { get(name: string): string | null } }): string {
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return 'unknown';
}
