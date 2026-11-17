import { getTableName, getTableColumns, type Table } from 'drizzle-orm';
import { Pool } from 'pg';
import { waitUntil } from '@vercel/functions';
import { createAppPool, errorChain, isConnectionError } from './pool';
import * as schema from './schema';

// ── How data streams between Supabase (primary) and Neon (replica) ─────────────
//
// The Neon project is a mirror of the primary's app schema plus one extra
// table, `_sync_events`, on both sides. A trigger function on every app table
// appends the full row image to that table on every insert, update and delete
// — this is change capture at the database, so *no* application write path
// changes shape and no event is ever lost to a process crash between "did the
// thing" and "tell the other side".
//
// A sync run then drains the primary's queue into Neon, in order:
//
//   primary._sync_events  →  upsert/delete on Neon
//
// Replication is ONE-WAY (#52): the app never writes Neon, the mirror has no
// capture triggers and no `_sync_events` table, and there is no failover
// runbook — if Neon diverges or is promoted, rebuild it from the primary via
// `neon:bootstrap` + backfill rather than expecting bidirectional convergence.
//
// Upserts are idempotent (same event replays to the same state), deletes are
// carried as real tombstones, and consumed events are deleted only after a
// batch succeeds — a crash mid-drain replays a few events and lands in the
// same place.
//
// Every sync write runs inside a transaction with
// `SET LOCAL app.sync_replicated = 'on'`, which the trigger function checks:
// replicated rows do not re-capture, or the two sides would echo row images
// back and forth forever. For the same reason the capture trigger is
// deliberately *absent* from `_sync_events` itself — the function inserts
// into the very table it would be attached to.
//
// Primary keys: most tables key on `id`, but `streaks` keys on user_id,
// `feature_flags` on key, and six join/state tables use composite keys. The
// sync engine does not guess: it reads the real primary keys from the
// Postgres catalog (`loadPrimaryKeys`) and threads them through triggers,
// deletes, conflict targets and the backfill cursor. Composite key values
// travel in `_sync_events.pk` as a JSON array text.
//
// Ordering, and the one deliberate wart: events are stamped with the writing
// database's clock (`captured_at`), so the two sides' clocks must be roughly
// sane (they are — both are cloud Postgres). A same-PK update arriving after
// a delete is applied by `upsert_row` regardless; the next real write to
// that row re-captures and converges. For this app — an SRS log, not a bank
// ledger — that is the right trade against building a vector-clock exchange.
//
// FKs make strict per-row ordering matter (an event for a `card_answers` row
// must not land before its `card` exists), so a batch is applied in up to a
// few passes with small waits; a batch that still cannot land in full is
// retried on the next run rather than half-applied.

/** All replicated tables, in FK-safe dependency order (parents first). */
const REPLICATED_TABLES = [
  'users',
  'media_assets',
  'profile_badges',
  'user_profile_badges',
  'subjects',
  'classes',
  'achievements',
  'feature_flags',
  'approval_requests',
  'topics',
  'lessons',
  'cards',
  'user_subjects',
  'card_answers',
  'math_sets',
  'user_topic_states',
  'card_user_states',
  'review_logs',
  'cram_sessions',
  'exam_papers',
  'exam_questions',
  'exam_attempts',
  'xp_events',
  'streaks',
  'user_achievements',
  'league_memberships',
  'seasons',
  'season_results',
  'class_memberships',
  'imports',
  'streak_events',
  'notification_prefs',
  'notifications',
  'notification_deliveries',
  'exam_plans',
  'user_challenges',
  'user_goals',
  'study_connections',
  'guardian_links',
  'referral_codes',
  'referral_redemptions',
  'class_assignments',
  'deck_subscriptions',
  'audit_log',
] as const;

const SYNC_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS _sync_events (
  seq          bigserial PRIMARY KEY,
  table_name   text NOT NULL,
  op           text NOT NULL CHECK (op IN ('INSERT', 'UPDATE', 'DELETE')),
  pk           text NOT NULL,
  row_data     jsonb,
  captured_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS _sync_events_seq_idx ON _sync_events (seq);
`;

const TRIGGER_FUNCTION_SQL = `
CREATE OR REPLACE FUNCTION sync_capture_event() RETURNS trigger AS $fn$
DECLARE
  pk_cols text[] := string_to_array(TG_ARGV[0], ',');
  img     jsonb  := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  pk      text;
BEGIN
  IF current_setting('app.sync_replicated', true) = 'on' THEN
    RETURN NULL;
  END IF;
  IF array_length(pk_cols, 1) = 1 THEN
    pk := img ->> pk_cols[1];
  ELSE
    SELECT jsonb_agg(img ->> c ORDER BY i)::text INTO pk FROM unnest(pk_cols) WITH ORDINALITY AS u(c, i);
  END IF;
  INSERT INTO _sync_events (table_name, op, pk, row_data)
  VALUES (
    TG_TABLE_NAME,
    TG_OP,
    pk,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE img END
  );
  RETURN NULL;
END;
$fn$ LANGUAGE plpgsql;
`;

// ── column/type definitions, from the drizzle schema ────────────────────────

type ColumnDef =
  | { name: string; kind: 'json' | 'int' | 'real' | 'bool' | 'text' }
  | { name: string; kind: 'date'; date: true };

type TableDef = { pkCols: string[]; columns: ColumnDef[] };

/** Column kinds per SQL table name, keyed by `getTableName` (export names and
 *  SQL names differ — `featureFlags` → `feature_flags`). Built lazily so a
 *  schema/sync mismatch fails a sync *run*, not page-data collection. */
let columnsCache: Record<string, ColumnDef[]> | null = null;

function tableColumns(): Record<string, ColumnDef[]> {
  if (columnsCache) return columnsCache;
  const defs: Record<string, ColumnDef[]> = {};
  for (const value of Object.values(schema)) {
    const table = value as Table;
    let name: string;
    try {
      name = getTableName(table);
    } catch {
      continue; // not a table export
    }
    if (name === '_sync_events') continue;
    const columns: ColumnDef[] = [];
    for (const col of Object.values(getTableColumns(table))) {
      let kind: ColumnDef['kind'] = 'text';
      if (col.columnType === 'PgJsonb' || col.columnType === 'PgJson') kind = 'json';
      else if (col.columnType === 'PgInteger') kind = 'int';
      else if (col.columnType === 'PgReal' || col.columnType === 'PgDoublePrecision') kind = 'real';
      else if (col.columnType === 'PgBoolean') kind = 'bool';
      else if (col.columnType === 'PgTimestamp' || col.columnType === 'PgTimestampString') kind = 'date';
      if (kind === 'date') columns.push({ name: col.name, kind: 'date', date: true } as ColumnDef);
      else columns.push({ name: col.name, kind } as ColumnDef);
    }
    defs[name] = columns;
  }
  columnsCache = defs;
  return defs;
}

/**
 * Row identity of every public table, from the live catalog — the source of
 * truth the sync engine writes into, not a parallel assumption. Maps SQL
 * table name → ordered identity column names. Most tables have a PRIMARY KEY
 * constraint; the join/state tables declare identity as a `*_pk` UNIQUE
 * INDEX instead (which the app's `onConflictDoNothing` inserts already
 * target), so those are accepted too: PK first, else the `*_pk` index.
 * Every entry point calls this once per run and threads the result down.
 */
export async function loadPrimaryKeys(db: { pool: Pool }): Promise<Record<string, string[]>> {
  const client = await db.pool.connect();
  try {
    const res = await client.query<{ table_name: string; pk_cols: string[] }>(`
      SELECT c.relname AS table_name,
             array_agg(a.attname ORDER BY a.attnum)::text[] AS pk_cols
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
      WHERE con.contype = 'p'
        AND c.relnamespace = 'public'::regnamespace
        AND c.relname <> '_sync_events'
      GROUP BY c.oid, c.relname
    `);
    const unique = await client.query<{ table_name: string; pk_cols: string[] }>(`
      SELECT t.relname AS table_name,
             (SELECT array_agg(a.attname ORDER BY k.ord)::text[]
              FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
              JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum) AS pk_cols
      FROM pg_index i
      JOIN pg_class t ON t.oid = i.indrelid
      JOIN pg_class ic ON ic.oid = i.indexrelid
      WHERE i.indisunique AND ic.relname LIKE '%\_pk' AND t.relnamespace = 'public'::regnamespace
    `);
    const map: Record<string, string[]> = {};
    for (const row of unique.rows) if (Array.isArray(row.pk_cols)) map[row.table_name] = row.pk_cols;
    for (const row of res.rows) map[row.table_name] = row.pk_cols; // PK wins
    return map;
  } finally {
    client.release();
  }
}

function tableDef(tableName: string, pkMap: Record<string, string[]>): TableDef {
  const columns = tableColumns()[tableName];
  if (!columns) throw new Error(`sync: table "${tableName}" is not in the drizzle schema`);
  const pkCols = pkMap[tableName];
  if (!pkCols || pkCols.length === 0) throw new Error(`sync: no primary key found in catalog for "${tableName}"`);
  return { pkCols, columns };
}

/** JSONB → SQL literal for one column value, keyed to the schema's pg type. */
function literalFor(value: unknown, col: ColumnDef): string {
  if (value === null || value === undefined) return 'NULL';
  switch (col.kind) {
    case 'json':
      return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
    case 'int':
      return `(${Number(value)})::int`;
    case 'real':
      return `(${Number(value)})::real`;
    case 'bool':
      return value ? 'TRUE' : 'FALSE';
    default:
      return `'${String(value).replace(/'/g, "''")}'`;
  }
}

// ── database handles ────────────────────────────────────────────────────────

export type SyncDb = { pool: Pool; label: string };
export type PrimaryKeyMap = Record<string, string[]>;
export type SyncHandles = { primary: SyncDb; neon: SyncDb | null; pkMap?: PrimaryKeyMap };

function makeDb(url: string | undefined, label: string): SyncDb {
  // Same discipline as the app pools — one builder, one set of knobs.
  return { pool: createAppPool(url, { envName: label === 'primary' ? 'DATABASE_URL' : 'NEON_DATABASE_URL' }), label };
}

export function openSyncHandles(): SyncHandles {
  const primary = makeDb(process.env.DATABASE_URL, 'primary');
  const neonUrl = process.env.NEON_DATABASE_URL;
  return { primary, neon: neonUrl ? makeDb(neonUrl, 'neon') : null };
}

export async function closeSyncHandles(handles: SyncHandles): Promise<void> {
  await Promise.all([handles.primary.pool.end().catch(() => undefined), handles.neon?.pool.end().catch(() => undefined)]);
}

/** Load the catalog pk map once per handles object. */
export async function getPkMap(handles: SyncHandles): Promise<PrimaryKeyMap> {
  if (!handles.pkMap) handles.pkMap = await loadPrimaryKeys(handles.primary);
  return handles.pkMap;
}

// ── setup ───────────────────────────────────────────────────────────────────

/**
 * Install `_sync_events` + the capture function + per-table triggers. Pass
 * the PRIMARY only (#52): the mirror is written exclusively by the apply
 * path under `app.sync_replicated` and needs no capture machinery — giving
 * it triggers would just build a second queue nothing drains.
 */
export async function installSyncInfrastructure(dbs: SyncDb[], pkMap?: PrimaryKeyMap): Promise<void> {
  const map = pkMap ?? (await loadPrimaryKeys(dbs[0]));
  for (const { pool } of dbs) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const statement of SYNC_SCHEMA_SQL.split(';')) {
        if (statement.trim()) await client.query(statement);
      }
      await client.query(TRIGGER_FUNCTION_SQL);
      for (const table of REPLICATED_TABLES) {
        await client.query(triggerSql(table, map));
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }
}

function triggerSql(table: string, pkMap: PrimaryKeyMap): string {
  // The pk column list is the trigger's argument; `streaks` gets 'user_id',
  // `feature_flags` 'key', join tables 'user_id,card_id' and friends.
  const def = tableDef(table, pkMap);
  return `
DROP TRIGGER IF EXISTS "${table}__sync_trg" ON "${table}";
CREATE TRIGGER "${table}__sync_trg"
AFTER INSERT OR UPDATE OR DELETE ON "${table}"
FOR EACH ROW EXECUTE FUNCTION sync_capture_event('${def.pkCols.join(',')}');`;
}

// ── write access ────────────────────────────────────────────────────────────

/**
 * The app's own path into the event log, exercised exactly as the capture
 * trigger fires it: INSERT as the connecting role, then DELETE, all inside a
 * transaction that rolls back — nothing persists, no event is created.
 *
 * This exists because the failure it catches was invisible: a Supabase RLS
 * sweep enabled row security on every public table, and `_sync_events` — a
 * table the mirror added *after* the app's `app_full_access` policies were
 * written — got RLS with no policy. Every application write then died inside
 * the capture trigger (login, register, a submitted review) while every read
 * sailed through, and the site looked broken in exactly the way a database
 * outage looks. Probing the real write path here, and repairing it — policy
 * for the connecting role, table grants, sequence USAGE for the bigserial
 * `seq` — turns that recurrence into something the next sync run heals.
 */
const SYNC_PROBE_SQL = `
BEGIN;
INSERT INTO _sync_events (table_name, op, pk) VALUES ('__probe__', 'INSERT', '__probe__');
DELETE FROM _sync_events WHERE table_name = '__probe__';
ROLLBACK;
`;

/**
 * Probe that the connecting role can write the event log; if the probe fails,
 * install the policy and grants it needs and probe again — the second probe
 * throwing surfaces the genuine, still-unfixed error. Idempotent; cheap
 * enough to run on every sync invocation (cron included).
 */
export async function ensureSyncWriteAccess(db: SyncDb): Promise<void> {
  const client = await db.pool.connect();
  try {
    try {
      await client.query(SYNC_PROBE_SQL);
      return;
    } catch {
      // Fall through to the repair; the original error is not worth keeping —
      // the probe after the repair is the one that must tell the truth.
    }
    const who: string = (await client.query('SELECT current_user AS u')).rows[0]?.u;
    if (!who) throw new Error('sync: could not resolve current_user for repair');
    await client.query(`
      DROP POLICY IF EXISTS sync_app_access ON public._sync_events;
      CREATE POLICY sync_app_access ON public._sync_events FOR ALL TO "${who}"
        USING (true) WITH CHECK (true);
      GRANT SELECT, INSERT, DELETE ON public._sync_events TO "${who}";
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${who}";
    `);
    await client.query(SYNC_PROBE_SQL);
  } finally {
    client.release();
  }
}

/**
 * Create the full current schema on a bare database by replaying every
 * drizzle/*.sql migration in filename order. The sync event log and capture
 * function go in first because later migrations create their own
 * `sync_capture_event()` triggers (0006 onward); `init` still installs the
 * trigger set for tables that predate that convention.
 *
 * Filename order is the apply order: the duplicate numeric prefixes
 * (0001_maths_practice before 0001_profile_identity, 0021_ai_drafts before
 * 0021_erasure_nullable_provenance) are independent — neither pair shares a
 * dependency, so lexical sort is safe. All files except 0000_init are
 * idempotent, but this path only runs on a bare target (the caller checks
 * for `users` first), so 0000's plain CREATE TABLEs are fine.
 */
export async function bootstrapSchemaFromMigration(dbs: SyncDb[]): Promise<void> {
  const { readFileSync, readdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const dir = join(process.cwd(), 'drizzle');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  if (files.length === 0) {
    throw new Error(`sync: no migrations found in ${dir} — run drizzle-kit generate first`);
  }
  for (const { pool } of dbs) {
    const client = await pool.connect();
    try {
      for (const statement of SYNC_SCHEMA_SQL.split(';')) {
        if (statement.trim()) await client.query(statement);
      }
      await client.query(TRIGGER_FUNCTION_SQL);
      for (const file of files) {
        const migrationSql = readFileSync(join(dir, file), 'utf8');
        try {
          // Whole-file query = one implicit transaction, which is what we want
          // for atomicity — except CREATE INDEX CONCURRENTLY files (0022),
          // which Postgres refuses inside any transaction. Those split on the
          // drizzle statement-breakpoint markers and run statement-by-statement
          // in autocommit, matching `psql -f`.
          if (/CONCURRENTLY/i.test(migrationSql)) {
            for (const stmt of migrationSql.split(/-->\s*statement-breakpoint/)) {
              if (stmt.trim()) await client.query(stmt);
            }
          } else {
            await client.query(migrationSql);
          }
        } catch (e) {
          throw new Error(`sync: migration ${file} failed — ${e instanceof Error ? e.message : e}`);
        }
      }
      // Record the replay in the same _migrations ledger apply-migrations.ts
      // uses, so `neon:bootstrap` and `db:migrate` agree on what a database
      // has seen — including on future bare targets.
      await client.query(`CREATE TABLE IF NOT EXISTS _migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
      for (const file of files) {
        await client.query('INSERT INTO _migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
      }
    } finally {
      client.release();
    }
  }
}

/** Neon needs every current primary row to become its baseline before events flow. */
export async function backfillPrimaryToNeon(
  primary: SyncDb,
  neon: SyncDb,
  pkMap: PrimaryKeyMap,
  batchSize = 500,
  only?: readonly string[],
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const tableName of only ?? REPLICATED_TABLES) {
    const def = tableDef(tableName, pkMap);
    const neonClient = await neon.pool.connect();
    try {
      let cursor: unknown[] | null = null;
      let total = 0;
      for (;;) {
        const primaryClient = await primary.pool.connect();
        let rows: Record<string, unknown>[];
        try {
          // Keyset pagination over the pk — row comparison supports composite
          // keys directly, so ordering is stable across batches.
          const where = cursor === null ? '' : ` WHERE (${def.pkCols.map((c) => `"${c}"`).join(', ')}) > (${def.pkCols.map((_, i) => `$${i + 1}`).join(', ')})`;
          rows = (
            await primaryClient.query(
              `SELECT * FROM "${tableName}"${where} ORDER BY ${def.pkCols.map((c) => `"${c}"`).join(', ')} LIMIT ${batchSize}`,
              cursor ?? [],
            )
          ).rows;
        } finally {
          primaryClient.release();
        }
        if (rows.length === 0) break;
        await applyUpserts(neonClient, tableName, def, rows);
        total += rows.length;
        cursor = def.pkCols.map((c) => rows[rows.length - 1][c]);
        if (rows.length < batchSize) break;
      }
      counts[tableName] = total;
    } finally {
      neonClient.release();
    }
  }
  return counts;
}

// ── the drain ───────────────────────────────────────────────────────────────

const REORDER_PASSES = 4;
const REORDER_WAIT_MS = 120;

/**
 * Events per apply transaction. Small enough that one chunk always fits the
 * drain budget over cross-region Neon latency (~25 events ≈ low seconds);
 * large enough that post-chunk verification stays a handful of SELECTs.
 */
const APPLY_CHUNK_SIZE = 25;

/**
 * Events selected per drain iteration — replaces the old fixed 2,000, which
 * no budget could ever fit (the 2026-11-16 stall). The drain loop now selects
 * batch after batch until the deadline, so progress is incremental by
 * construction. NEON_SYNC_BATCH_SIZE tunes it; clamped so a typo cannot
 * recreate the stall or degenerate into per-event SELECTs.
 */
const SYNC_BATCH_SIZE = Math.min(1_000, Math.max(10, Number(process.env.NEON_SYNC_BATCH_SIZE ?? 150)));

/** Connection-class failures (Neon scale-to-zero drops, admin shutdowns) get
 *  this many jittered-backoff attempts before the run fails. */
const CONN_RETRY_ATTEMPTS = 3;

type SyncEvent = { seq: string; table_name: string; op: string; pk: string; row_data: Record<string, unknown> | null };

/** Per-direction counters for one drain — the observability hooks #61 alerts on. */
export type SyncDrainStats = {
  applied: number;
  deferred: number;
  orphansDropped: number;
  unverified: number;
  retried: number;
  elapsedMs: number;
};

type DeferredEvent = { event: SyncEvent; reason: string };
type PendingItem = { event: SyncEvent; code: string | null; constraint: string | null };
type ApplyChunkResult = { applied: SyncEvent[]; deferred: DeferredEvent[]; unverified: number; retried: number };
type ApplyResult = ApplyChunkResult & { orphansDropped: number };

/** FK constraint → parent mapping, resolved once per constraint per drain call. */
type FkMapping = { parentTable: string; childCols: string[]; parentCols: string[] };
type DrainCtx = { parentPullTried: Set<string>; fkCache: Map<string, FkMapping | null> };

/**
 * Drain `from._sync_events` into `to`, oldest first, until the source is empty
 * or the deadline passes. Only *applied* seqs are deleted — deferred events
 * (FK-stranded, malformed, unverified) keep their seqs and retry next run,
 * which is what turns the old all-or-nothing batch into guaranteed forward
 * progress: a budget stop loses at most the in-flight chunk.
 */
export async function drainEvents(
  from: SyncDb,
  to: SyncDb,
  pkMap: PrimaryKeyMap,
  opts: { maxEvents?: number; deadline?: number } = {},
): Promise<SyncDrainStats> {
  const started = Date.now();
  const maxEvents = Math.min(1_000, Math.max(10, opts.maxEvents ?? SYNC_BATCH_SIZE));
  const deadline = opts.deadline ?? started + DRAIN_BUDGET_MS;
  const stats: SyncDrainStats = { applied: 0, deferred: 0, orphansDropped: 0, unverified: 0, retried: 0, elapsedMs: 0 };
  const ctx: DrainCtx = { parentPullTried: new Set(), fkCache: new Map() };
  // Deferred seqs are excluded from later SELECTs in this call: without it a
  // poisoned event would be re-fetched and re-burn budget on every iteration,
  // starving newer events behind it (backend review amendment). They retry
  // fresh on the next drainEvents call.
  const deferredSeqs = new Set<number>();
  const deferredLog: string[] = [];

  // Collapse bursts before draining: only each row's final state matters
  // (INSERT and UPDATE both land as the same upsert, DELETE as a tombstone),
  // so intermediate events for a pk are dead weight that can only fail —
  // an orphaned INSERT ahead of its own DELETE is exactly what stalled the
  // queue for five weeks in Oct/Nov 2026.
  await withConnRetry(() => compactSyncEvents(from), deadline, to.label);

  for (;;) {
    if (Date.now() > deadline) break;
    let events: SyncEvent[];
    try {
      events = await withConnRetry(() => selectEvents(from, maxEvents, deferredSeqs), deadline, to.label);
    } catch (e) {
      if ((e as Error).name === 'SyncBudgetExceeded') break;
      throw e;
    }
    if (events.length === 0) break;

    let res: ApplyResult;
    try {
      res = await withConnRetry(() => applyEvents(from, to, events, pkMap, deadline, ctx), deadline, to.label);
    } catch (e) {
      // Budget exhausted mid-batch: committed chunks already landed (their
      // seqs simply stay queued and replay idempotently next run) and this
      // batch's remaining events were never touched.
      if ((e as Error).name === 'SyncBudgetExceeded') break;
      throw e;
    }

    stats.orphansDropped += res.orphansDropped;
    stats.unverified += res.unverified;
    stats.retried += res.retried;
    if (res.applied.length > 0) {
      await withConnRetry(
        () => deleteSyncEventSeqs(from, res.applied.map((e) => Number(e.seq))),
        deadline,
        to.label,
      );
      stats.applied += res.applied.length;
    }
    for (const d of res.deferred) {
      const seq = Number(d.event.seq);
      if (deferredSeqs.has(seq)) continue;
      deferredSeqs.add(seq);
      stats.deferred += 1;
      if (deferredLog.length < 10) {
        deferredLog.push(`${d.event.table_name} ${d.event.op} ${d.event.pk} seq=${d.event.seq} (${d.reason})`);
      }
    }
    // A backlog larger than one budget should leave the rest for the next
    // tick rather than have the whole invocation killed by the platform's
    // function timeout — which deleted nothing and made no progress at all.
    if (Date.now() > deadline) break;
  }

  stats.elapsedMs = Date.now() - started;
  if (deferredLog.length > 0) {
    console.warn(`[sync] ${stats.deferred} event(s) deferred to next run for ${to.label}: ${deferredLog.join('; ')}`);
  }
  return stats;
}

/** Next batch of queued events, oldest first, minus seqs already deferred this call. */
async function selectEvents(from: SyncDb, limit: number, exclude: Set<number>): Promise<SyncEvent[]> {
  const client = await from.pool.connect();
  try {
    const res =
      exclude.size === 0
        ? await client.query(
            `SELECT seq, table_name, op, pk, row_data FROM _sync_events ORDER BY seq ASC LIMIT $1`,
            [limit],
          )
        : await client.query(
            `SELECT seq, table_name, op, pk, row_data FROM _sync_events WHERE seq <> ALL($2::bigint[]) ORDER BY seq ASC LIMIT $1`,
            [limit, [...exclude]],
          );
    return res.rows;
  } finally {
    client.release();
  }
}

/**
 * Retry a sync operation on connection-class failures (Neon scale-to-zero
 * ECONNRESET, admin shutdown 57P01, cannot-connect-now 57P03, 08006) with
 * jittered backoff, bounded by the run deadline. Each attempt re-acquires
 * its client from the pool, so a dropped handle is replaced rather than
 * reused. Safe at this granularity because every wrapped operation is either
 * a single auto-commit statement or a transaction that rolls back whole —
 * replay is always idempotent.
 */
async function withConnRetry<T>(fn: () => Promise<T>, deadline: number, targetLabel: string): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (e) {
      if ((e as Error).name === 'SyncBudgetExceeded' || !isRetryableSyncError(e) || attempt >= CONN_RETRY_ATTEMPTS - 1) {
        throw e;
      }
      const wait = 250 * 2 ** attempt + Math.random() * 250;
      if (Date.now() + wait > deadline) throw syncBudgetError(targetLabel);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

function isRetryableSyncError(e: unknown): boolean {
  if (isConnectionError(e)) return true;
  return errorChain(e).some((link) => (link as { code?: string } | null)?.code === '57P03');
}

/**
 * How long one drain may keep applying batches. Bounded so a backlog bigger
 * than any single invocation can chew makes *partial* progress: the cron's
 * maxDuration would otherwise kill the request mid-run, the consumed-event
 * deletes never commit, and every retry restarts the same minute from zero —
 * the shape of outage where pending > ~1000 never drains at all.
 */
const DRAIN_BUDGET_MS = Number(process.env.NEON_DRAIN_BUDGET_MS ?? 25_000);

/**
 * Apply one selected batch in dependency order (parents first — the
 * REPLICATED_TABLES sort is unchanged), chunked so each chunk is its own
 * transaction. Orphans are proven once per batch here, before any chunk
 * runs: their per-event source SELECTs are the ~0.8s/event cost from the QA
 * receipt, so running them per chunk would multiply that by the chunk count
 * (backend review amendment).
 *
 * Events that cannot land — FK-stranded after the chunk's reorder passes,
 * malformed, or failing post-chunk verification — are *deferred*: their
 * seqs are not consumed and they retry next run. The old code threw here and
 * failed the whole run, which is how one poison event stalled the queue.
 */
async function applyEvents(
  from: SyncDb,
  to: SyncDb,
  events: SyncEvent[],
  pkMap: PrimaryKeyMap,
  deadline: number,
  ctx: DrainCtx,
): Promise<ApplyResult> {
  const result: ApplyResult = { applied: [], deferred: [], orphansDropped: 0, unverified: 0, retried: 0 };
  const { live, orphans } = await partitionOrphans(from, events, pkMap);
  if (orphans.length > 0) {
    await convergeDroppedRows(to, orphans, pkMap);
    await deleteConsumedEvents(from, orphans);
    result.orphansDropped = orphans.length;
    console.warn(
      `[sync] dropped ${orphans.length} orphaned event(s) for ${to.label} before applying: ` +
        orphans.slice(0, 5).map((e) => `${e.table_name} ${e.op} ${e.pk}`).join('; '),
    );
  }
  if (live.length === 0) return result;

  const ordered = [...live].sort((a, b) => {
    const ia = REPLICATED_TABLES.indexOf(a.table_name as (typeof REPLICATED_TABLES)[number]);
    const ib = REPLICATED_TABLES.indexOf(b.table_name as (typeof REPLICATED_TABLES)[number]);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });

  for (let i = 0; i < ordered.length; i += APPLY_CHUNK_SIZE) {
    if (Date.now() > deadline) throw syncBudgetError(to.label);
    const chunk = await applyChunk(from, to, ordered.slice(i, i + APPLY_CHUNK_SIZE), pkMap, deadline, ctx);
    result.applied.push(...chunk.applied);
    result.deferred.push(...chunk.deferred);
    result.unverified += chunk.unverified;
    result.retried += chunk.retried;
  }
  return result;
}

/**
 * One chunk of up to APPLY_CHUNK_SIZE events: up to REORDER_PASSES
 * chunk-scoped passes, each pass one transaction with `app.sync_replicated`
 * set locally and per-event savepoints. FK violations (23503/23505) are
 * parked and retried; every OTHER per-event error — including the loud
 * null-row_data and zero-writable-columns throws — defers that one event
 * and lets the chunk commit, so a single malformed event can never roll
 * back its neighbours every tick (the same stall shape in miniature).
 * Only connection-level and budget errors abort the chunk.
 *
 * Survivors of the passes get one parent-pull attempt (INSERT/UPDATE +
 * 23503 only — DELETE ordering stays with the reorder passes, and parents
 * are never pulled for deletes). Everything else defers with a reason.
 *
 * Post-chunk verification then proves consumed ⇒ landed for this chunk's
 * INSERT/UPDATE rows with one existence SELECT per table. It proves the row
 * EXISTS, not that values match — value drift stays #61's row-parity job;
 * nobody should read this as full parity.
 */
async function applyChunk(
  from: SyncDb,
  to: SyncDb,
  events: SyncEvent[],
  pkMap: PrimaryKeyMap,
  deadline: number,
  ctx: DrainCtx,
): Promise<ApplyChunkResult> {
  const applied: SyncEvent[] = [];
  const deferred: DeferredEvent[] = [];
  let unverified = 0;
  let retried = 0;

  let pending: PendingItem[] = events.map((event) => ({ event, code: null, constraint: null }));
  for (let pass = 0; pass < REORDER_PASSES && pending.length > 0; pass += 1) {
    if (Date.now() > deadline) throw syncBudgetError(to.label);
    const failed: PendingItem[] = [];
    const succeeded: SyncEvent[] = [];
    const toClient = await to.pool.connect();
    try {
      await toClient.query('BEGIN');
      await toClient.query("SELECT set_config('app.sync_replicated', 'on', true)");
      let savepoint = 0;
      for (const item of pending) {
        if (Date.now() > deadline) throw syncBudgetError(to.label);
        const name = `ev_${savepoint++}`;
        try {
          await toClient.query(`SAVEPOINT ${name}`);
          await applyOne(toClient, item.event, pkMap);
          await toClient.query(`RELEASE SAVEPOINT ${name}`);
          succeeded.push(item.event);
        } catch (e) {
          await toClient.query(`ROLLBACK TO SAVEPOINT ${name}`).catch(() => undefined);
          const cause = (e as { cause?: { code?: string; constraint?: string } }).cause ?? e;
          const code = (cause as { code?: string }).code ?? null;
          if (code === '23503' || code === '23505') {
            failed.push({ event: item.event, code, constraint: (cause as { constraint?: string }).constraint ?? null });
            retried += 1;
          } else if (isRetryableSyncError(e)) {
            throw e;
          } else {
            deferred.push({ event: item.event, reason: describeApplyError(e) });
          }
        }
      }
      await toClient.query('COMMIT');
    } catch (e) {
      await toClient.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      toClient.release();
    }
    applied.push(...succeeded);
    if (failed.length === 0) {
      pending = [];
      break;
    }
    if (pass < REORDER_PASSES - 1) await new Promise((r) => setTimeout(r, REORDER_WAIT_MS));
    pending = failed;
  }

  for (const item of pending) {
    if (Date.now() > deadline) throw syncBudgetError(to.label);
    let reason: string | null;
    if (item.code === '23503' && (item.event.op === 'INSERT' || item.event.op === 'UPDATE')) {
      if (ctx.parentPullTried.has(item.event.seq)) {
        reason = 'parent-pull-exhausted';
      } else {
        ctx.parentPullTried.add(item.event.seq);
        reason = await tryParentPull(from, to, item, pkMap, ctx);
      }
    } else if (item.event.op === 'DELETE') {
      reason = `delete-ordering:${item.code ?? 'unknown'}`;
    } else {
      reason = item.code ? `fk:${item.code}` : 'unresolved';
    }
    if (reason === null) applied.push(item.event);
    else deferred.push({ event: item.event, reason });
  }

  // Post-chunk existence verification — see the function comment.
  const checkable = applied.filter((e) => e.op !== 'DELETE');
  if (checkable.length === 0) return { applied, deferred, unverified, retried };
  const byTable = new Map<string, SyncEvent[]>();
  for (const e of checkable) {
    const list = byTable.get(e.table_name);
    if (list) list.push(e);
    else byTable.set(e.table_name, [e]);
  }
  const verified: SyncEvent[] = applied.filter((e) => e.op === 'DELETE');
  for (const [table, evs] of byTable) {
    let def: TableDef | null = null;
    try {
      def = tableDef(table, pkMap);
    } catch {
      def = null;
    }
    if (!def) {
      for (const e of evs) {
        deferred.push({ event: e, reason: 'unverified' });
        unverified += 1;
      }
      continue;
    }
    const client = await to.pool.connect();
    try {
      const found = await existingRowKeys(client, table, def, evs);
      for (const e of evs) {
        const key = eventPkKey(e, def);
        if (key !== null && found.has(key)) verified.push(e);
        else {
          deferred.push({ event: e, reason: 'unverified' });
          unverified += 1;
        }
      }
    } finally {
      client.release();
    }
  }
  return { applied: verified, deferred, unverified, retried };
}

/** Short, log-safe description of a per-event apply failure. */
function describeApplyError(e: unknown): string {
  const cause = (e as { cause?: { code?: string; message?: string } }).cause ?? e;
  const code = (cause as { code?: string }).code;
  const msg = String((cause as { message?: string }).message ?? e).replace(/\s+/g, ' ').slice(0, 120);
  return code ? `${code}: ${msg}` : msg;
}

/**
 * Missing-parent self-heal: the child's FK parent exists on the source but
 * its own event was compacted away, so it can never arrive through the
 * queue. Resolve the violated constraint via pg_constraint (cached per
 * drain call), pull the parent row image from the source, upsert it to the
 * target, and retry the child once — all inside one flagged transaction.
 * Returns null on success, a defer reason otherwise. If the parent row is
 * absent on the source too, the event defers and is counted — never dropped.
 */
async function tryParentPull(
  from: SyncDb,
  to: SyncDb,
  item: PendingItem,
  pkMap: PrimaryKeyMap,
  ctx: DrainCtx,
): Promise<string | null> {
  const { event } = item;
  if (!item.constraint || !event.row_data) return 'fk-unmapped';
  const mapping = await resolveFkMapping(from, event.table_name, item.constraint, ctx.fkCache);
  if (!mapping) return 'fk-unmapped';
  let parentDef: TableDef;
  try {
    parentDef = tableDef(mapping.parentTable, pkMap);
  } catch {
    return 'parent-not-replicated';
  }
  const values = mapping.childCols.map((c) => event.row_data?.[c]);
  if (values.some((v) => v === null || v === undefined)) return 'null-fk-value';

  const fromClient = await from.pool.connect();
  let parentRow: Record<string, unknown> | undefined;
  try {
    const where = mapping.parentCols.map((_, i) => `"${mapping.parentCols[i]}"::text = $${i + 1}`).join(' AND ');
    const res = await fromClient.query(`SELECT * FROM "${mapping.parentTable}" WHERE ${where} LIMIT 1`, values.map(String));
    parentRow = res.rows[0] as Record<string, unknown> | undefined;
  } finally {
    fromClient.release();
  }
  if (!parentRow) return 'missing-parent';

  const toClient = await to.pool.connect();
  try {
    await toClient.query('BEGIN');
    await toClient.query("SELECT set_config('app.sync_replicated', 'on', true)");
    await upsertRow(toClient, mapping.parentTable, parentDef, parentRow);
    await applyOne(toClient, event, pkMap);
    await toClient.query('COMMIT');
    return null;
  } catch (e) {
    await toClient.query('ROLLBACK').catch(() => undefined);
    if (isRetryableSyncError(e)) throw e;
    return `parent-pull-failed:${describeApplyError(e)}`;
  } finally {
    toClient.release();
  }
}

/** constraint name + child table → parent table and the column correspondence. */
async function resolveFkMapping(
  from: SyncDb,
  childTable: string,
  constraint: string,
  cache: Map<string, FkMapping | null>,
): Promise<FkMapping | null> {
  const key = `${childTable}.${constraint}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const client = await from.pool.connect();
  let mapping: FkMapping | null = null;
  try {
    const res = await client.query(
      `SELECT con.confrelid::regclass::text AS parent_table,
              (SELECT array_agg(a.attname::text ORDER BY u.ord)
                 FROM unnest(con.conkey) WITH ORDINALITY AS u(attnum, ord)
                 JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = u.attnum) AS child_cols,
              (SELECT array_agg(a.attname::text ORDER BY u.ord)
                 FROM unnest(con.confkey) WITH ORDINALITY AS u(attnum, ord)
                 JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = u.attnum) AS parent_cols
         FROM pg_constraint con
        WHERE con.contype = 'f' AND con.conname = $1 AND con.conrelid = ('public.' || $2)::regclass`,
      [constraint, childTable],
    );
    const row = res.rows[0] as { parent_table: string; child_cols: string[]; parent_cols: string[] } | undefined;
    if (row && Array.isArray(row.child_cols) && Array.isArray(row.parent_cols)) {
      // regclass::text may render schema-qualified ('public.users'); the sync
      // engine keys tables by bare name, so normalize.
      const parentTable = row.parent_table.split('.').pop() ?? row.parent_table;
      mapping = { parentTable, childCols: row.child_cols, parentCols: row.parent_cols };
    }
  } finally {
    client.release();
  }
  cache.set(key, mapping);
  return mapping;
}

/** Decode `_sync_events.pk` — a bare value for single-pk tables, a JSON array for composites. */
function pkValues(event: SyncEvent, def: TableDef): string[] {
  if (def.pkCols.length === 1) return [event.pk];
  const parsed: unknown = JSON.parse(event.pk);
  if (!Array.isArray(parsed) || parsed.length !== def.pkCols.length) {
    throw new Error(`sync: malformed composite pk "${event.pk}" for ${event.table_name}`);
  }
  return parsed.map(String);
}

/** `WHERE` clause locating one event's row, for single and composite pks alike. */
function pkPredicate(def: TableDef, values: string[]): string {
  return def.pkCols.map((c, i) => `"${c}" = '${values[i].replace(/'/g, "''")}'`).join(' AND ');
}

/** Error name drainEvents recognises as "stop cleanly, resume next run". */
function syncBudgetError(label: string): Error {
  const e = new Error(`sync: drain budget exhausted during batch to ${label}; remaining events retry next run`);
  e.name = 'SyncBudgetExceeded';
  return e;
}

/** Canonical pk key for membership tests — bare value for single pks, JSON array text for composites. */
function eventPkKey(event: SyncEvent, def: TableDef): string | null {
  try {
    const values = pkValues(event, def);
    return def.pkCols.length === 1 ? values[0] : JSON.stringify(values);
  } catch {
    return null;
  }
}

/**
 * Which of a batch's INSERT/UPDATE pks still exist on the source — one query
 * per table for the whole batch. `::text` on both sides keeps uuid/int pk
 * columns comparable to the event log's text without literal-cast failures.
 */
async function existingRowKeys(
  client: import('pg').PoolClient,
  table: string,
  def: TableDef,
  events: SyncEvent[],
): Promise<Set<string>> {
  const usable = events
    .map((e) => ({ e, key: eventPkKey(e, def) }))
    .filter((x): x is { e: SyncEvent; key: string } => x.key !== null);
  const found = new Set<string>();
  if (usable.length === 0) return found;

  if (def.pkCols.length === 1) {
    const col = def.pkCols[0];
    const res = await client.query(
      `SELECT "${col}"::text AS k FROM "${table}" WHERE "${col}"::text = ANY($1::text[])`,
      [[...new Set(usable.map((x) => x.key))]],
    );
    for (const row of res.rows) found.add(String(row.k));
    return found;
  }

  const perCol = def.pkCols.map((_, i) => [
    ...new Set(usable.map((x) => (JSON.parse(x.key) as string[])[i])),
  ]);
  const res = await client.query(
    `SELECT ${def.pkCols.map((c) => `"${c}"::text`).join(', ')} FROM "${table}" ` +
      `WHERE (${def.pkCols.map((c) => `"${c}"::text`).join(', ')}) IN ` +
      `(SELECT * FROM unnest(${def.pkCols.map((_, i) => `$${i + 1}::text[]`).join(', ')}))`,
    perCol,
  );
  for (const row of res.rows) found.add(JSON.stringify(def.pkCols.map((c) => String(row[c]))));
  return found;
}

/**
 * Split events into proven orphans (INSERT/UPDATE whose row no longer exists
 * on the source — can never apply) and everything else. DELETEs are always
 * live: a tombstone either applies or fails on real dependents, which must
 * stay loud. Any lookup failure leaves the table's events live — doubt
 * resolves toward retrying, never toward dropping.
 */
async function partitionOrphans(
  from: SyncDb,
  events: SyncEvent[],
  pkMap: PrimaryKeyMap,
): Promise<{ live: SyncEvent[]; orphans: SyncEvent[] }> {
  const live: SyncEvent[] = [];
  const orphans: SyncEvent[] = [];
  const byTable = new Map<string, SyncEvent[]>();
  for (const e of events) {
    if (e.op === 'DELETE') {
      live.push(e);
      continue;
    }
    const list = byTable.get(e.table_name);
    if (list) list.push(e);
    else byTable.set(e.table_name, [e]);
  }

  const client = await from.pool.connect();
  try {
    for (const [table, evs] of byTable) {
      let def: TableDef | null = null;
      let found: Set<string> | null = null;
      try {
        def = tableDef(table, pkMap);
        found = await existingRowKeys(client, table, def, evs);
      } catch {
        def = null;
        found = null;
      }
      for (const e of evs) {
        const key = found && def ? eventPkKey(e, def) : null;
        if (found && key !== null && !found.has(key)) orphans.push(e);
        else live.push(e);
      }
    }
  } finally {
    client.release();
  }
  return { live, orphans };
}

/**
 * Converge the target for dropped orphans: the source says the row is absent,
 * so the target must not keep it either (it may hold a partial image from an
 * earlier pass). One transaction, replication flag set — same discipline as
 * a normal pass.
 */
async function convergeDroppedRows(to: SyncDb, events: SyncEvent[], pkMap: PrimaryKeyMap): Promise<void> {
  const client = await to.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.sync_replicated', 'on', true)");
    for (const event of events) {
      const def = tableDef(event.table_name, pkMap);
      const values = pkValues(event, def);
      await client.query(`DELETE FROM "${event.table_name}" WHERE ${pkPredicate(def, values)}`);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

/** Consume events on the source by seq so they are never re-examined. */
async function deleteSyncEventSeqs(from: SyncDb, seqs: number[]): Promise<void> {
  if (seqs.length === 0) return;
  const client = await from.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM _sync_events WHERE seq = ANY($1::bigint[])`, [seqs]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

/** Consume orphaned events on the source so they are never re-examined. */
async function deleteConsumedEvents(from: SyncDb, events: SyncEvent[]): Promise<void> {
  await deleteSyncEventSeqs(from, events.map((e) => Number(e.seq)));
}

/**
 * Keep only the last event per (table_name, pk) in `_sync_events`. Every op
 * for a pk collapses to that row's final state — upsert for INSERT/UPDATE,
 * tombstone for DELETE — so earlier events can only fail (orphans) or waste
 * batch slots. This is the automated form of the manual compaction that
 * unwedged the Oct 2026 stall; it runs once per drain, cheap on an empty log.
 */
async function compactSyncEvents(from: SyncDb): Promise<void> {
  const client = await from.pool.connect();
  try {
    const exists = await client.query(`SELECT to_regclass('_sync_events') AS t`);
    if (!exists.rows[0]?.t) return;
    await client.query(`
      DELETE FROM _sync_events e
      USING (SELECT DISTINCT ON (table_name, pk) seq, table_name, pk
             FROM _sync_events ORDER BY table_name, pk, seq DESC) k
      WHERE e.seq <> k.seq AND e.table_name = k.table_name AND e.pk = k.pk`);
  } finally {
    client.release();
  }
}

async function applyOne(client: Pool | import('pg').PoolClient, event: SyncEvent, pkMap: PrimaryKeyMap): Promise<void> {
  // The caller's transaction carries `app.sync_replicated = 'on'`, so these
  // writes capture nothing — the two sides cannot echo events forever.
  const def = tableDef(event.table_name, pkMap);

  if (event.op === 'DELETE') {
    const values = pkValues(event, def);
    await client.query(`DELETE FROM "${event.table_name}" WHERE ${pkPredicate(def, values)}`);
    return;
  }

  // Loud, never silent: an INSERT/UPDATE with no row image used to return
  // early and consume the event with zero write — the consumed-but-never-
  // landed divergence QA found. Throwing defers the event instead.
  if (!event.row_data) {
    throw new Error(`sync: ${event.table_name} ${event.op} seq=${event.seq} has null row_data`);
  }
  await upsertRow(client, event.table_name, def, event.row_data);
}

/**
 * #52 §3, DPO-approved 2026-11-17: the Neon mirror never holds second-factor
 * secrets. Every `users` row written by the apply path — event drain
 * (`applyOne`), missing-parent pull (`tryParentPull`) and backfill
 * (`applyUpserts`) all funnel through `upsertRow` — has `totp_secret`
 * forced to NULL and `recovery_codes` to `[]`, so a mirror rebuild cannot
 * re-populate them either. The primary is untouched: every TOTP read
 * (login, /2fa, data-deletion) stays on the primary. `email` stays
 * replicated by deliberate DPO ruling — `/me` and leaderboards read it off
 * the mirror — which means mirror promotion requires users re-enrolling
 * 2FA; promotion is rebuild-not-failover under #52 anyway.
 *
 * The apply path only ever writes the Neon mirror post-#52 (replication is
 * one-way, the mirror has no capture triggers), so the redaction is
 * unconditional here rather than target-gated.
 */
const MIRROR_REDACTED: Record<string, Record<string, unknown>> = {
  users: { totp_secret: null, recovery_codes: [] },
};

async function upsertRow(
  client: Pool | import('pg').PoolClient,
  tableName: string,
  def: TableDef,
  row: Record<string, unknown>,
): Promise<void> {
  const redacted = MIRROR_REDACTED[tableName];
  if (redacted) row = { ...row, ...redacted };
  const cols: string[] = [];
  const values: string[] = [];
  for (const col of def.columns) {
    if (!(col.name in row)) continue;
    const value = row[col.name];
    if (col.kind === 'date') {
      // node-postgres parses timestamptz into a Date; JSONB round-trips it as an
      // ISO string. Accept both; absent/NULL stays NULL.
      if (value === null || value === undefined) continue;
      cols.push(col.name);
      values.push(`'${new Date(value as string).toISOString().replace(/'/g, "''")}'::timestamptz`);
      continue;
    }
    cols.push(col.name);
    values.push(literalFor(value, col));
  }
  // Loud, never silent: zero writable columns means schema/column drift —
  // the event used to be consumed with no write at all.
  if (cols.length === 0) {
    throw new Error(`sync: no writable columns for ${tableName} (row keys: ${Object.keys(row).slice(0, 8).join(', ')})`);
  }
  const conflict = def.pkCols.map((c) => `"${c}"`).join(', ');
  const stmt =
    `INSERT INTO "${tableName}" (${cols.map((c) => `"${c}"`).join(', ')}) ` +
    `VALUES (${values.join(', ')}) ` +
    `ON CONFLICT (${conflict}) DO UPDATE SET ` +
    cols.filter((c) => !def.pkCols.includes(c)).map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ');
  await client.query(stmt);
}

async function applyUpserts(
  client: Pool | import('pg').PoolClient,
  tableName: string,
  def: TableDef,
  rows: Record<string, unknown>[],
): Promise<void> {
  // One transaction per batch, flag set locally for it — same discipline as
  // applyEventBatch, without which the backfill would capture itself.
  await client.query('BEGIN');
  await client.query("SELECT set_config('app.sync_replicated', 'on', true)");
  try {
    for (const row of rows) await upsertRow(client, tableName, def, row);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  }
}

// ── one run ─────────────────────────────────────────────────────────────────

export type SyncRunResult = {
  ran: boolean;
  drainedPrimaryToNeon: number;
  pendingPrimary: number;
  /** Per-direction drain detail (#51 observability hooks for #61). */
  primaryToNeon?: SyncDrainStats;
};

/**
 * One primary→Neon drain (#52: replication is one-way — the mirror is
 * read-only, written exclusively by this apply path under
 * `app.sync_replicated`, and has no event queue of its own). Safe to run
 * concurrently with itself: worst case two runs drain different halves and
 * both delete what they applied.
 */
export async function runSync(handles: SyncHandles): Promise<SyncRunResult> {
  const { primary, neon } = handles;
  if (!neon) {
    return { ran: false, drainedPrimaryToNeon: 0, pendingPrimary: 0 };
  }
  const pkMap = await getPkMap(handles);

  const pendingPrimary = await countPending(primary);
  if (pendingPrimary === 0) {
    return { ran: false, drainedPrimaryToNeon: 0, pendingPrimary: 0 };
  }

  const deadline = Date.now() + DRAIN_BUDGET_MS;
  const primaryToNeon = await drainEvents(primary, neon, pkMap, { deadline });

  const pendingPrimaryAfter = await countPending(primary);
  return {
    ran: true,
    drainedPrimaryToNeon: primaryToNeon.applied,
    pendingPrimary: pendingPrimaryAfter,
    primaryToNeon,
  };
}

export async function countPending(db: SyncDb): Promise<number> {
  const client = await db.pool.connect();
  try {
    const res = await client.query('SELECT count(*)::int AS c FROM _sync_events');
    return res.rows[0]?.c ?? 0;
  } finally {
    client.release();
  }
}

/** Oldest queued event's capture time on one side, or null when the queue is empty. */
export async function oldestPendingAt(db: SyncDb): Promise<Date | null> {
  const client = await db.pool.connect();
  try {
    const res = await client.query(`SELECT min(captured_at) AS oldest FROM _sync_events`);
    const v = res.rows[0]?.oldest;
    return v ? new Date(v) : null;
  } finally {
    client.release();
  }
}

// ── the fast path from inside the app ───────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __revisioSyncHandles: SyncHandles | undefined;
}

/** Handles cached for the process, like the app pools; null when single-db. */
export function sharedSyncHandles(): SyncHandles | null {
  if (!process.env.NEON_DATABASE_URL) return null;
  if (!globalThis.__revisioSyncHandles) globalThis.__revisioSyncHandles = openSyncHandles();
  return globalThis.__revisioSyncHandles;
}

/**
 * Fire-and-forget drain after a write that should reach the replica quickly.
 * Never throws — the cron run is the backstop — and never blocks the response.
 */
export function kickSync(maxEvents = 50): void {
  const handles = sharedSyncHandles();
  if (!handles || !handles.neon) return;
  const drain = (async () => {
    try {
      const pkMap = await getPkMap(handles);
      const stats = await drainEvents(handles.primary, handles.neon as SyncDb, pkMap, { maxEvents });
      if (stats.applied > 0) console.log(`[sync] kicked ${stats.applied} event(s) primary → neon`);
      if (stats.deferred > 0) console.warn(`[sync] kick deferred ${stats.deferred} event(s) primary → neon`);
    } catch (e) {
      console.error('[sync] kick failed (cron will catch up)', e);
    }
  })();
  // On Vercel, waitUntil keeps the function alive until the drain finishes —
  // without it the runtime can freeze the instance the moment the response is
  // sent and the kick silently never runs. Outside a request context (scripts,
  // tests) there is nothing to extend; the promise still runs to completion.
  try {
    waitUntil(drain);
  } catch {
    // No request context — the drain is already running on its own.
  }
}
