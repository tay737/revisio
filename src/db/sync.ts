import { getTableName, getTableColumns, type Table } from 'drizzle-orm';
import { Pool } from 'pg';
import { createAppPool } from './pool';
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
// A sync run then drains each side into the other, in order:
//
//   primary._sync_events  →  upsert/delete on Neon
//   Neon._sync_events     →  upsert/delete on primary
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
  'email_tokens',
  'refresh_tokens',
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
  'season_results',
  'class_memberships',
  'imports',
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

/** Create every app table on a bare database by replaying drizzle/0000_init.sql. */
export async function bootstrapSchemaFromMigration(dbs: SyncDb[]): Promise<void> {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const migrationPath = join(process.cwd(), 'drizzle', '0000_init.sql');
  let migrationSql: string;
  try {
    migrationSql = readFileSync(migrationPath, 'utf8');
  } catch {
    throw new Error(`sync: cannot read ${migrationPath} — run drizzle-kit generate first`);
  }
  for (const { pool } of dbs) {
    const client = await pool.connect();
    try {
      await client.query(migrationSql);
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
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const tableName of REPLICATED_TABLES) {
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

type SyncEvent = { seq: string; table_name: string; op: string; pk: string; row_data: Record<string, unknown> | null };

/**
 * Drain `from._sync_events` into `to`, oldest first, until the source is empty.
 * Returns events applied; consumed events are deleted from the source only
 * after the whole batch succeeds, so a crash replays rather than skips.
 */
export async function drainEvents(from: SyncDb, to: SyncDb, pkMap: PrimaryKeyMap, maxEvents = 2_000): Promise<number> {
  let drained = 0;
  const deadline = Date.now() + DRAIN_BUDGET_MS;
  for (;;) {
    const fromClient = await from.pool.connect();
    let events: SyncEvent[];
    try {
      events = (
        await fromClient.query(
          `SELECT seq, table_name, op, pk, row_data FROM _sync_events ORDER BY seq ASC LIMIT ${maxEvents}`,
        )
      ).rows;
    } finally {
      fromClient.release();
    }
    if (events.length === 0) break;

    await applyEventBatch(to, events, pkMap);

    const seqs = events.map((e) => Number(e.seq));
    const fromClient2 = await from.pool.connect();
    try {
      await fromClient2.query('BEGIN');
      await fromClient2.query(`DELETE FROM _sync_events WHERE seq = ANY($1::bigint[])`, [seqs]);
      await fromClient2.query('COMMIT');
    } catch (e) {
      await fromClient2.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      fromClient2.release();
    }
    drained += events.length;
    if (events.length < maxEvents) break;
    // A backlog larger than one budget should leave the rest for the next
    // tick rather than have the whole invocation killed by the platform's
    // function timeout — which deleted nothing and made no progress at all.
    if (Date.now() > deadline) break;
  }
  return drained;
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
 * Apply one batch in dependency order, retrying rows whose parents are later
 * in the same batch (an UPDATE of `users` after an INSERT of a row referencing
 * it). Up to REORDER_PASSES passes; anything still failing raises so the run
 * is retried wholesale next tick — the source events survive until then.
 *
 * Each pass is one transaction with the replication flag set locally, so the
 * trigger sees the flag for every statement in it (a `set_config(…, true)`
 * outside an explicit transaction would expire with the statement itself and
 * every replicated write would be re-captured — an echo loop), a pass either
 * lands whole or not at all, and per-event savepoints let FK-stranded rows be
 * parked and retried without aborting the pass.
 */
async function applyEventBatch(to: SyncDb, events: SyncEvent[], pkMap: PrimaryKeyMap): Promise<void> {
  const ordered = [...events].sort((a, b) => {
    const ia = REPLICATED_TABLES.indexOf(a.table_name as (typeof REPLICATED_TABLES)[number]);
    const ib = REPLICATED_TABLES.indexOf(b.table_name as (typeof REPLICATED_TABLES)[number]);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });

  let pending = ordered;
  for (let pass = 0; pass < REORDER_PASSES; pass += 1) {
    const failed: typeof pending = [];
    const toClient = await to.pool.connect();
    try {
      await toClient.query('BEGIN');
      await toClient.query("SELECT set_config('app.sync_replicated', 'on', true)");
      let savepoint = 0;
      for (const event of pending) {
        const name = `ev_${savepoint++}`;
        try {
          await toClient.query(`SAVEPOINT ${name}`);
          await applyOne(toClient, event, pkMap);
          await toClient.query(`RELEASE SAVEPOINT ${name}`);
        } catch (e) {
          // FK violation because the parent row arrives later in this batch, or
          // a unique conflict whose resolving row is still ahead — park it for
          // the next pass. Anything else is real; rethrow.
          await toClient.query(`ROLLBACK TO SAVEPOINT ${name}`).catch(() => undefined);
          const cause = (e as { cause?: { code?: string } }).cause ?? e;
          const code = (cause as { code?: string }).code;
          if (code === '23503' || code === '23505') failed.push(event);
          else throw e;
        }
      }
      await toClient.query('COMMIT');
    } catch (e) {
      await toClient.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      toClient.release();
    }
    if (failed.length === 0) return;
    if (pass < REORDER_PASSES - 1) await new Promise((r) => setTimeout(r, REORDER_WAIT_MS));
    pending = failed;
  }
  throw new Error(
    `sync: ${pending.length} event(s) could not be applied to ${to.label} after ${REORDER_PASSES} passes ` +
      `(first: ${pending[0].table_name} ${pending[0].op} ${pending[0].pk})`,
  );
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

async function applyOne(client: Pool | import('pg').PoolClient, event: SyncEvent, pkMap: PrimaryKeyMap): Promise<void> {
  // The caller's transaction carries `app.sync_replicated = 'on'`, so these
  // writes capture nothing — the two sides cannot echo events forever.
  const def = tableDef(event.table_name, pkMap);

  if (event.op === 'DELETE') {
    const values = pkValues(event, def);
    const where = def.pkCols.map((c, i) => `"${c}" = '${values[i].replace(/'/g, "''")}'`).join(' AND ');
    await client.query(`DELETE FROM "${event.table_name}" WHERE ${where}`);
    return;
  }

  if (!event.row_data) return;
  await upsertRow(client, event.table_name, def, event.row_data);
}

async function upsertRow(
  client: Pool | import('pg').PoolClient,
  tableName: string,
  def: TableDef,
  row: Record<string, unknown>,
): Promise<void> {
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
  if (cols.length === 0) return;
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
  drainedNeonToPrimary: number;
  pendingPrimary: number;
  pendingNeon: number;
};

/**
 * One bidirectional drain. Both directions read their own event log and write
 * to the other side inside `app.sync_replicated`, so neither produces new
 * events of its own. Safe to run concurrently with itself: worst case two runs
 * drain different halves and both delete what they applied.
 */
export async function runSync(handles: SyncHandles): Promise<SyncRunResult> {
  const { primary, neon } = handles;
  if (!neon) {
    return { ran: false, drainedPrimaryToNeon: 0, drainedNeonToPrimary: 0, pendingPrimary: 0, pendingNeon: 0 };
  }
  const pkMap = await getPkMap(handles);

  const [pendingPrimary, pendingNeon] = await Promise.all([countPending(primary), countPending(neon)]);
  if (pendingPrimary === 0 && pendingNeon === 0) {
    return { ran: false, drainedPrimaryToNeon: 0, drainedNeonToPrimary: 0, pendingPrimary: 0, pendingNeon: 0 };
  }

  const drainedPrimaryToNeon = await drainEvents(primary, neon, pkMap);
  const drainedNeonToPrimary = await drainEvents(neon, primary, pkMap);

  const [pendingPrimaryAfter, pendingNeonAfter] = await Promise.all([countPending(primary), countPending(neon)]);
  return {
    ran: true,
    drainedPrimaryToNeon,
    drainedNeonToPrimary,
    pendingPrimary: pendingPrimaryAfter,
    pendingNeon: pendingNeonAfter,
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
export function kickSync(maxEvents = 200): void {
  const handles = sharedSyncHandles();
  if (!handles || !handles.neon) return;
  void (async () => {
    try {
      const pkMap = await getPkMap(handles);
      const drained = await drainEvents(handles.primary, handles.neon as SyncDb, pkMap, maxEvents);
      if (drained > 0) console.log(`[sync] kicked ${drained} event(s) primary → neon`);
    } catch (e) {
      console.error('[sync] kick failed (cron will catch up)', e);
    }
  })();
}
