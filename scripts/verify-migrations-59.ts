// #59 verification: bare-target bootstrap replays the FULL migration set and
// the apply-migrations ledger tracks pending/applied correctly.
//
//   createdb revisio_mig59   (on the local E2E cluster, port 54329)
//   DATABASE_URL=postgres://postgres@127.0.0.1:54329/revisio_mig59 \
//     NODE_OPTIONS="--import ./scripts/register-stub-loader.mjs" \
//     npx tsx scripts/verify-migrations-59.ts
//
// Exits non-zero on the first failed check.

import { Pool } from 'pg';
import { execFileSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { bootstrapSchemaFromMigration } from '../src/db/sync';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL must point at a BARE local database');

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${detail}`); }
}

async function main() {
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    // ── 1. Bare bootstrap replays every drizzle/*.sql ──────────────────────
    console.log('bootstrapSchemaFromMigration on bare database …');
    await bootstrapSchemaFromMigration([{ pool, label: 'verify' }]);

    const tables = await pool.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`,
    );
    const names = new Set(tables.rows.map((r) => r.tablename as string));
    for (const t of [
      'users', 'cards', 'topics', 'ai_drafts', 'exam_papers', 'streak_events',
      'rate_limits', 'analytics_events', '_sync_events',
    ]) {
      check(`table ${t} exists`, names.has(t));
    }
    check('schema has >= 40 app tables', names.size >= 40, `got ${names.size}`);

    const fn = await pool.query(`SELECT proname FROM pg_proc WHERE proname = 'sync_capture_event'`);
    check('sync_capture_event() exists', fn.rowCount === 1);

    const trg = await pool.query(
      `SELECT count(*)::int AS c FROM pg_trigger WHERE NOT tgisinternal`,
    );
    check('sync triggers installed by migrations', (trg.rows[0]?.c ?? 0) > 0, `got ${trg.rows[0]?.c}`);

    const idx = await pool.query(
      `SELECT count(*)::int AS c FROM pg_indexes WHERE schemaname='public' AND indexname LIKE 'analytics_events%'`,
    );
    check('analytics_events indexes exist', (idx.rows[0]?.c ?? 0) >= 2, `got ${idx.rows[0]?.c}`);

    const pol = await pool.query(
      `SELECT count(*)::int AS c FROM pg_policies WHERE tablename IN ('rate_limits','analytics_events') AND policyname='app_full_access'`,
    );
    check('RLS app_full_access on lazy tables', (pol.rows[0]?.c ?? 0) === 2, `got ${pol.rows[0]?.c}`);

    // ── 2. apply-migrations ledger on the bootstrapped database ────────────
    console.log('apply-migrations baseline/status/migrate …');
    const env = { ...process.env };
    delete env.DATABASE_URL_UNPOOLED; // mirror leg not under test here
    const run = (args: string[]) =>
      execFileSync('npx', ['tsx', 'scripts/apply-migrations.ts', ...args], {
        env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });

    // Baseline everything (simulates prod DBs that predate the ledger).
    run(['baseline']);
    const statusOut = run(['status']);
    check('status reports all applied', statusOut.includes('up to date') || /2\d\/2\d applied/.test(statusOut), statusOut.trim());

    // Drop one ledger row → migrate must re-apply only that file. Use a file
    // that is idempotent so the re-apply is a clean no-op.
    await pool.query(`DELETE FROM _migrations WHERE filename = '0013_users_education_level.sql'`);
    const migOut = run(['migrate']);
    check('migrate re-applied the pending file', migOut.includes('applied 0013_users_education_level.sql'), migOut.trim());
    const again = run(['status']);
    check('status clean after migrate', !again.includes('pending:'), again.trim());

    // ── 3. Pending-file detection with a scratch migration ─────────────────
    const scratch = join(process.cwd(), 'drizzle', '9999_scratch_verify.sql');
    writeFileSync(scratch, `CREATE TABLE IF NOT EXISTS _mig_scratch_verify (id int PRIMARY KEY);\n`);
    try {
      const st = run(['status']);
      check('status lists scratch file as pending', st.includes('pending: 9999_scratch_verify.sql'), st.trim());
      run(['migrate']);
      const t = await pool.query(`SELECT to_regclass('_mig_scratch_verify') AS t`);
      check('scratch migration applied', Boolean(t.rows[0]?.t));
    } finally {
      rmSync(scratch, { force: true });
    }
  } finally {
    await pool.end();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
