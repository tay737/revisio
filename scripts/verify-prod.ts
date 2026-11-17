/**
 * Read-only production verification probe (#64).
 *
 *   npx tsx scripts/verify-prod.ts
 *
 * Answers the database half of the production checklist against BOTH live
 * databases: the Supabase primary (DATABASE_URL, pooled) and the Neon mirror
 * (DATABASE_URL_UNPOOLED, or NEON_DATABASE_URL when set — .env carries the
 * mirror under the unpooled name).
 *
 * STRICTLY READ-ONLY: every statement is a SELECT against catalogs or
 * `_sync_events`/`review_logs` counts. Nothing here writes, and nothing here
 * should ever be extended to write — the runbook (docs/PROD-VERIFICATION.md)
 * is the authority on what "verified" means.
 *
 * The checks are deliberately tolerant of missing pieces: a table that does
 * not exist yet reports as a finding, not a crash, so the same script works
 * before and after #51/#52 land.
 */
import 'dotenv/config';
import { Client } from 'pg';

const PRIMARY_URL = process.env.DATABASE_URL;
const MIRROR_URL = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED;

// Same rule as src/db/pool.ts: remote hosts need TLS, localhost does not.
function pgConfig(url: string) {
  const isLocal = /localhost|127\.0\.0\.1/.test(url);
  return { connectionString: url, ssl: isLocal ? undefined : { rejectUnauthorized: false } };
}

let failures = 0;
let checks = 0;
function check(label: string, condition: boolean, detail: unknown = '') {
  checks += 1;
  if (!condition) failures += 1;
  console.log(`${condition ? '  ok  ' : ' FAIL '} ${label}${condition ? '' : ` — ${JSON.stringify(detail)}`}`);
}
function info(label: string, detail: unknown) {
  console.log(`  --   ${label} — ${JSON.stringify(detail)}`);
}

async function q<T = Record<string, unknown>>(client: Client, sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await client.query(sql, params);
  return res.rows as T[];
}

async function tableExists(client: Client, name: string): Promise<boolean> {
  const [row] = await q<{ t: string | null }>(client, `SELECT to_regclass($1) AS t`, [name]);
  return row?.t != null;
}

async function syncTriggerNames(client: Client): Promise<string[]> {
  const rows = await q<{ tgname: string }>(
    client,
    `SELECT tg.tgname FROM pg_trigger tg
       JOIN pg_class c ON c.oid = tg.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND tg.tgname LIKE '%\\_\\_sync_trg' AND NOT tg.tgisinternal
      ORDER BY tg.tgname`,
  );
  return rows.map((r) => r.tgname);
}

async function publicTables(client: Client): Promise<string[]> {
  const rows = await q<{ tablename: string }>(client, `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`);
  return rows.map((r) => r.tablename);
}

/** Tables with row security enabled but no policy at all — the 2026-09-28 incident class. */
async function rlsWithoutPolicy(client: Client): Promise<string[]> {
  const rows = await q<{ relname: string }>(
    client,
    `SELECT c.relname
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
        AND NOT EXISTS (
          SELECT 1 FROM pg_policies p
           WHERE p.schemaname = 'public' AND p.tablename = c.relname
        )
      ORDER BY c.relname`,
  );
  return rows.map((r) => r.relname);
}

async function main() {
  if (!PRIMARY_URL) throw new Error('DATABASE_URL is not set.');
  const primary = new Client(pgConfig(PRIMARY_URL));
  await primary.connect();

  console.log('\nPrimary (Supabase)');
  const primaryHasEvents = await tableExists(primary, '_sync_events');
  check('primary has _sync_events', primaryHasEvents);
  if (primaryHasEvents) {
    const [row] = await q<{ pending: number; oldest: string | null }>(
      primary,
      `SELECT count(*)::int AS pending, min(captured_at) AS oldest FROM _sync_events`,
    );
    info('pending events / oldest captured_at', { pending: row?.pending, oldest: row?.oldest });
    check('primary sync backlog is drained', (row?.pending ?? 0) === 0, row?.pending);
  }
  const [primaryReview] = await q<{ latest: string | null }>(primary, `SELECT max(reviewed_at) AS latest FROM review_logs`);
  info('primary max(review_logs.reviewed_at)', primaryReview?.latest);

  const primaryTriggers = await syncTriggerNames(primary);
  info('primary __sync_trg count', primaryTriggers.length);
  check('deck_subscriptions sync trigger on primary', primaryTriggers.includes('deck_subscriptions__sync_trg'), primaryTriggers.filter((t) => t.includes('deck_sub')));
  const primaryRlsGaps = await rlsWithoutPolicy(primary);
  check('no public table has RLS enabled with zero policies (primary)', primaryRlsGaps.length === 0, primaryRlsGaps);
  for (const lazy of ['rate_limits', 'analytics_events']) {
    info(`primary ${lazy} exists`, await tableExists(primary, lazy));
  }
  const primaryTables = await publicTables(primary);
  info('primary public table count', primaryTables.length);
  await primary.end();

  if (!MIRROR_URL) {
    console.log('\nMirror (Neon): DATABASE_URL_UNPOOLED/NEON_DATABASE_URL not set — mirror checks skipped.');
  } else {
    const mirror = new Client(pgConfig(MIRROR_URL));
    await mirror.connect();

    console.log('\nMirror (Neon)');
    const mirrorHasEvents = await tableExists(mirror, '_sync_events');
    check('mirror has _sync_events', mirrorHasEvents);
    if (mirrorHasEvents) {
      const [row] = await q<{ pending: number; oldest: string | null }>(
        mirror,
        `SELECT count(*)::int AS pending, min(captured_at) AS oldest FROM _sync_events`,
      );
      info('pending events / oldest captured_at', { pending: row?.pending, oldest: row?.oldest });
    }
    const [mirrorReview] = await q<{ latest: string | null }>(mirror, `SELECT max(reviewed_at) AS latest FROM review_logs`);
    info('mirror max(review_logs.reviewed_at)', mirrorReview?.latest);
    check(
      'mirror review_logs converges to primary',
      Boolean(primaryReview?.latest && mirrorReview?.latest && mirrorReview.latest >= primaryReview.latest),
      { primary: primaryReview?.latest, mirror: mirrorReview?.latest },
    );

    const mirrorTriggers = await syncTriggerNames(mirror);
    info('mirror __sync_trg count', mirrorTriggers.length);
    check('deck_subscriptions sync trigger on mirror', mirrorTriggers.includes('deck_subscriptions__sync_trg'));
    const missingOnMirror = primaryTriggers.filter((t) => !mirrorTriggers.includes(t));
    const extraOnMirror = mirrorTriggers.filter((t) => !primaryTriggers.includes(t));
    check('sync trigger sets match across databases', missingOnMirror.length === 0 && extraOnMirror.length === 0, { missingOnMirror, extraOnMirror });

    const mirrorRlsGaps = await rlsWithoutPolicy(mirror);
    check('no public table has RLS enabled with zero policies (mirror)', mirrorRlsGaps.length === 0, mirrorRlsGaps);
    const mirrorTables = await publicTables(mirror);
    info('mirror public table count', mirrorTables.length);
    const onlyPrimary = primaryTables.filter((t) => !mirrorTables.includes(t));
    const onlyMirror = mirrorTables.filter((t) => !primaryTables.includes(t));
    check('public table sets match across databases', onlyPrimary.length === 0 && onlyMirror.length === 0, { onlyPrimary, onlyMirror });
    await mirror.end();
  }

  console.log(`\n${checks - failures}/${checks} checks passed.`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
