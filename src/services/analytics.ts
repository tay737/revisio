import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { isUnderAge } from '@/lib/age';

// ── First-party product analytics ───────────────────────────────────────────
//
// The store behind POST /api/v1/events. Same lazy-table pattern as
// rate_limits: the app is fully serverless and the funnel must work on the
// primary (Supabase) without a migration being applied to both databases by
// hand. `analytics_events` is deliberately NOT in drizzle/schema.ts and does
// NOT replicate to the Neon mirror — it is per-primary measurement data, not
// app state, exactly like rate_limits.
//
// Privacy contract (docs/ANALYTICS-EVENTS.md):
//   • No IP address, no user agent, no fingerprint is stored. The request IP
//     is used only for the rate-limit bucket and discarded.
//   • `anonymous_id` is a random UUID the browser mints after the visitor
//     grants the Analytics consent purpose; `user_id` is attached only when
//     the request carries a valid session.
//   • Event names and prop shapes are allowlisted here AND in
//     src/lib/analytics.ts — anything else is dropped before it reaches SQL.

export const ANALYTICS_EVENTS = [
  'page_view',
  'cta_click',
  'demo_review_submit',
  'demo_review_complete',
  'demo_curve_rate',
  'signup_started',
  'signup_completed',
  'first_review_completed',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];
const EVENT_NAMES = new Set<string>(ANALYTICS_EVENTS);

export type AnalyticsEventInput = {
  name?: unknown;
  props?: unknown;
  path?: unknown;
  anonymousId?: unknown;
  at?: unknown;
};

let tableReady: Promise<void> | null = null;

async function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = db.execute(sql`
      CREATE TABLE IF NOT EXISTS analytics_events (
        id            text PRIMARY KEY,
        name          text NOT NULL,
        props         jsonb,
        path          text,
        anonymous_id  text,
        user_id       text,
        created_at    timestamptz NOT NULL DEFAULT now()
      )
    `).then(async () => {
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS analytics_events_name_time_idx
        ON analytics_events (name, created_at)
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS analytics_events_created_idx
        ON analytics_events (created_at)
      `);
    }, (e) => {
      tableReady = null; // retry next request rather than caching the failure
      throw e;
    });
  }
  return tableReady;
}

function cleanProps(input: unknown): Record<string, string | number | boolean | null> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>).slice(0, 12)) {
    const k = key.slice(0, 60);
    if (value === null) out[k] = null;
    else if (typeof value === 'string') out[k] = value.slice(0, 200);
    else if (typeof value === 'number' || typeof value === 'boolean') out[k] = value;
  }
  return Object.keys(out).length ? out : null;
}

function cleanPath(input: unknown): string | null {
  return typeof input === 'string' && input ? input.slice(0, 300) : null;
}

function cleanAnonymousId(input: unknown): string | null {
  return typeof input === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(input) ? input : null;
}

/**
 * Insert a batch of client-reported events. Returns how many rows landed.
 * Fails open (returns 0, logs loudly): a funnel hiccup must never surface as
 * an error to a visitor.
 */
export async function recordAnalyticsEvents(
  events: AnalyticsEventInput[],
  userId: string | null,
): Promise<number> {
  const rows = events
    .filter((e): e is AnalyticsEventInput & { name: string } => typeof e?.name === 'string' && EVENT_NAMES.has(e.name))
    .slice(0, 10)
    .map((e) => ({
      id: crypto.randomUUID(),
      name: e.name,
      props: cleanProps(e.props),
      path: cleanPath(e.path),
      anonymousId: cleanAnonymousId(e.anonymousId),
    }));
  if (!rows.length) return 0;
  try {
    await ensureTable();
    const tuples = rows.map((row) =>
      sql`(${row.id}, ${row.name}, ${row.props ? JSON.stringify(row.props) : null}::jsonb, ${row.path}, ${row.anonymousId}, ${userId})`,
    );
    await db.execute(sql`
      INSERT INTO analytics_events (id, name, props, path, anonymous_id, user_id)
      VALUES ${sql.join(tuples, sql`, `)}
    `);
    return rows.length;
  } catch (e) {
    console.error('[analytics] event insert failed', e);
    return 0;
  }
}

/**
 * Hygiene delete for the lazy funnel table. Raw events are measurement data,
 * not app state; the window is deliberately conservative and bounded per call.
 */
export async function pruneAnalyticsEvents(retentionDays = 90, batch = 5000): Promise<number> {
  try {
    await ensureTable();
    const result = await db.execute(sql`
      DELETE FROM analytics_events
      WHERE id IN (
        SELECT id FROM analytics_events
        WHERE created_at < now() - (${retentionDays} * interval '1 day')
        ORDER BY created_at
        LIMIT ${batch}
      )
    `);
    return (result as unknown as { rowCount?: number }).rowCount ?? 0;
  } catch (e) {
    console.error('[analytics] prune failed', e);
    return 0;
  }
}

/**
 * Record a server-observed funnel event (no anonymous id — the session is the
 * identity). Used for `first_review_completed`, which the client cannot know
 * is first. Fails open like the batch path.
 */
export async function recordServerEvent(
  name: AnalyticsEventName,
  userId: string,
  props?: Record<string, string | number | boolean | null>,
): Promise<void> {
  try {
    // F-A ruling: under-13 accounts cannot hold analytics consent, so a stale
    // blob must not grant the effect — server-side events carry user_id and
    // are skipped outright for guardian-consented accounts.
    const [u] = await db.select({ dateOfBirth: users.dateOfBirth }).from(users).where(eq(users.id, userId)).limit(1);
    if (isUnderAge(u?.dateOfBirth)) return;
    await ensureTable();
    await db.execute(sql`
      INSERT INTO analytics_events (id, name, props, user_id)
      VALUES (${crypto.randomUUID()}, ${name}, ${props ? JSON.stringify(props) : null}::jsonb, ${userId})
    `);
  } catch (e) {
    console.error('[analytics] server event insert failed', e);
  }
}
