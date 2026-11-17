import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';

// ── Migration apply path (#59) ───────────────────────────────────────────────
//
// The hand-applied `psql -f` process had no bookkeeping: drizzle/meta/_journal.json
// only tracks the two drizzle-kit baselines (0000/0001) while two dozen hand-written
// files exist, so there was no way to know what a given database had seen. This
// script replaces the journal for the apply path with a per-database
// `_migrations` ledger — the journal/snapshots remain only as drizzle-kit's
// diff baseline and are NOT used here.
//
//   tsx scripts/apply-migrations.ts status    Show applied/pending per database
//   tsx scripts/apply-migrations.ts baseline  Record every current file as applied
//                                              WITHOUT running it — run once on
//                                              databases that already have the
//                                              schema (prod primary + mirror)
//   tsx scripts/apply-migrations.ts migrate   Apply pending files, oldest first,
//                                              to DATABASE_URL (Supabase primary)
//                                              and DATABASE_URL_UNPOOLED (Neon
//                                              mirror) — the documented
//                                              single-command both-databases path
//
// `_migrations` is per-database bookkeeping: it is not in schema.ts, not
// replicated, and intentionally diverges between primary and mirror.

type Command = 'status' | 'baseline' | 'migrate';

const command = process.argv[2] as Command | undefined;
if (!command || !['status', 'baseline', 'migrate'].includes(command)) {
  console.error('Usage: tsx scripts/apply-migrations.ts <status|baseline|migrate>');
  process.exit(1);
}

const MIGRATIONS_DIR = join(process.cwd(), 'drizzle');
const LEDGER_SQL = `
CREATE TABLE IF NOT EXISTS _migrations (
  filename   text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
)`;

interface Target {
  name: string;
  url: string;
}

function targets(): Target[] {
  const out: Target[] = [];
  if (process.env.DATABASE_URL) out.push({ name: 'primary', url: process.env.DATABASE_URL });
  if (process.env.DATABASE_URL_UNPOOLED) out.push({ name: 'neon-mirror', url: process.env.DATABASE_URL_UNPOOLED });
  return out;
}

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
}

async function appliedSet(pool: Pool): Promise<Set<string>> {
  await pool.query(LEDGER_SQL);
  const res = await pool.query('SELECT filename FROM _migrations');
  return new Set(res.rows.map((r) => r.filename as string));
}

async function main(): Promise<void> {
  const files = migrationFiles();
  const dbs = targets();
  if (dbs.length === 0) {
    console.error('DATABASE_URL (and optionally DATABASE_URL_UNPOOLED) is required.');
    process.exit(1);
  }

  if (command === 'status') {
    for (const { name, url } of dbs) {
      const pool = new Pool({ connectionString: url, max: 1 });
      try {
        const applied = await appliedSet(pool);
        const pending = files.filter((f) => !applied.has(f));
        console.log(`${name}: ${applied.size}/${files.length} applied`);
        for (const f of pending) console.log(`  pending: ${f}`);
      } finally {
        await pool.end();
      }
    }
    return;
  }

  if (command === 'baseline') {
    for (const { name, url } of dbs) {
      const pool = new Pool({ connectionString: url, max: 1 });
      try {
        await pool.query(LEDGER_SQL);
        for (const f of files) {
          await pool.query('INSERT INTO _migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [f]);
        }
        console.log(`${name}: baselined ${files.length} migration file(s) as applied.`);
      } finally {
        await pool.end();
      }
    }
    return;
  }

  // migrate
  let failed = false;
  for (const { name, url } of dbs) {
    const pool = new Pool({ connectionString: url, max: 1 });
    try {
      const applied = await appliedSet(pool);
      const pending = files.filter((f) => !applied.has(f));
      if (pending.length === 0) {
        console.log(`${name}: up to date (${files.length} file(s) applied).`);
        continue;
      }
      console.log(`${name}: applying ${pending.length} pending file(s) …`);
      for (const f of pending) {
        const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
        try {
          if (/CONCURRENTLY/i.test(sql)) {
            // CREATE INDEX CONCURRENTLY cannot run inside a transaction —
            // split on drizzle's statement-breakpoint markers and apply each
            // statement in autocommit, matching `psql -f` (see 0022's header).
            for (const stmt of sql.split(/-->\s*statement-breakpoint/)) {
              if (stmt.trim()) await pool.query(stmt);
            }
          } else {
            // One simple-protocol query per file: Postgres wraps the statement
            // list in an implicit transaction, so a failure leaves nothing
            // half applied.
            await pool.query(sql);
          }
          await pool.query('INSERT INTO _migrations (filename) VALUES ($1)', [f]);
          console.log(`  applied ${f}`);
        } catch (e) {
          failed = true;
          console.error(`  FAILED ${f}: ${e instanceof Error ? e.message : e}`);
          break; // stop this database; fix forward, do not skip
        }
      }
    } finally {
      await pool.end();
    }
  }
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
