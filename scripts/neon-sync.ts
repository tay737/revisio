import 'dotenv/config';
import { installSyncInfrastructure, bootstrapSchemaFromMigration, backfillPrimaryToNeon, runSync, openSyncHandles, closeSyncHandles, countPending, oldestPendingAt, loadPrimaryKeys, type SyncHandles, type SyncDrainStats } from '../src/db/sync';

// ── Neon mirror operator CLI ─────────────────────────────────────────────────
//
//   tsx scripts/neon-sync.ts init      Install _sync_events + capture triggers on the PRIMARY only
//   tsx scripts/neon-sync.ts run       One primary→neon drain (used by cron/CI too)
//   tsx scripts/neon-sync.ts status    Pending events on the primary
//   tsx scripts/neon-sync.ts watch     Drain every NEON_SYNC_INTERVAL_MS (default 5s) — run
//                                      this on any always-on box next to the two databases
//   tsx scripts/neon-sync.ts bootstrap Create the full app schema on a bare Neon project
//                                      (every drizzle/*.sql in order) and backfill every
//                                      current row, before enabling NEON_DATABASE_URL
//
// Requires DATABASE_URL (Supabase primary) and NEON_DATABASE_URL (Neon) in the
// environment. `bootstrap` is the only command that writes without events
// flowing first — run it once, then `init`, then point the app at both.
// Replication is one-way (#52): the mirror is read-only, has no capture
// triggers and no _sync_events table.

type Command = 'init' | 'run' | 'status' | 'watch' | 'bootstrap';

function drainStatsLine(label: string, s: SyncDrainStats): string {
  return (
    `${label} applied=${s.applied} deferred=${s.deferred} orphans=${s.orphansDropped} ` +
    `unverified=${s.unverified} retried=${s.retried} ${s.elapsedMs}ms`
  );
}

const command = process.argv[2] as Command | undefined;
const COMMANDS: Command[] = ['init', 'run', 'status', 'watch', 'bootstrap'];

if (!command || !COMMANDS.includes(command)) {
  console.error(`Usage: tsx scripts/neon-sync.ts <${COMMANDS.join('|')}>`);
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL (Supabase primary) is required.');
  process.exit(1);
}
if (!process.env.NEON_DATABASE_URL) {
  console.error('NEON_DATABASE_URL (Neon) is required for every sync command.');
  process.exit(1);
}

async function bootstrap(handles: SyncHandles): Promise<void> {
  const neon = handles.neon;
  if (!neon) throw new Error('unreachable');
  // Idempotent: a previous attempt may have created the schema before its
  // backfill failed. `users` alone is not proof of a complete schema — a
  // bootstrap that died mid-replay leaves it behind — so completeness is
  // judged by the _migrations ledger covering every drizzle/*.sql file.
  // A users-without-full-ledger state means a partial bootstrap: refuse
  // rather than silently skip, since re-running 0000_init on it would fail.
  const { readdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const allFiles = readdirSync(join(process.cwd(), 'drizzle')).filter((f) => f.endsWith('.sql')).sort();
  const hasUsers = await neon.pool.query(`SELECT to_regclass('users') AS u`);
  const applied = await neon.pool
    .query(`SELECT count(*)::int AS c FROM _migrations`)
    .then((r) => r.rows[0]?.c as number)
    .catch(() => 0); // ledger absent → nothing recorded
  const complete = Boolean(hasUsers.rows[0]?.u) && applied >= allFiles.length;
  if (complete) {
    console.log('Neon already has the app schema — skipping creation.');
  } else if (hasUsers.rows[0]?.u) {
    throw new Error(
      `Neon has a partial schema (${applied}/${allFiles.length} migrations recorded) — ` +
        'a previous bootstrap died mid-replay or predates the ledger. Run `npm run db:migrate:baseline` ' +
        'against it once to adopt the ledger, or drop and re-bootstrap; refusing to skip silently.',
    );
  } else {
    console.log('Creating app schema on Neon from drizzle/*.sql …');
    await bootstrapSchemaFromMigration([neon]);
    console.log('Schema created.');
  }
  console.log('Backfilling current rows …');
  // Primary keys come from the primary's catalog — the authority being mirrored.
  const pkMap = await loadPrimaryKeys(handles.primary);
  const counts = await backfillPrimaryToNeon(handles.primary, neon, pkMap);
  let total = 0;
  for (const [table, count] of Object.entries(counts)) {
    if (count > 0) {
      console.log(`  ${table.padEnd(22)} ${count}`);
      total += count;
    }
  }
  console.log(`Backfill complete: ${total} row(s). Run \`init\` next, then set NEON_DATABASE_URL in the app environment.`);
}

async function main(): Promise<void> {
  const handles = openSyncHandles();
  if (!handles.neon) throw new Error('NEON_DATABASE_URL is not set.');
  try {
    if (command === 'bootstrap') return await bootstrap(handles);

    if (command === 'init') {
      const pkMap = await loadPrimaryKeys(handles.primary);
      await installSyncInfrastructure([handles.primary], pkMap);
      console.log('Sync infrastructure installed on the primary (the mirror is apply-only — no triggers, no event queue).');
      console.log('Next: deploy the app with NEON_DATABASE_URL set, or start `watch`.');
      return;
    }

    if (command === 'status') {
      const [p, op] = await Promise.all([countPending(handles.primary), oldestPendingAt(handles.primary)]);
      const age = (d: Date | null) => (d ? `${Math.round((Date.now() - d.getTime()) / 1000)}s` : '—');
      console.log(`primary → neon pending: ${p} (oldest ${age(op)})`);
      // Deferred events are still pending rows — a non-zero pending count with
      // a growing oldest age is what "queue empty but events are stuck" looks
      // like; the per-run deferred breakdown is on `run`.
      return;
    }

    if (command === 'run') {
      const result = await runSync(handles);
      if (!result.ran) {
        console.log('nothing to drain');
        return;
      }
      console.log(`drained ${result.drainedPrimaryToNeon} primary→neon (pending after: ${result.pendingPrimary} primary)`);
      if (result.primaryToNeon) console.log(drainStatsLine('primary→neon', result.primaryToNeon));
      return;
    }

    if (command === 'watch') {
      const interval = Number(process.env.NEON_SYNC_INTERVAL_MS ?? 5_000);
      console.log(`watching: drain every ${interval}ms — Ctrl+C to stop`);
      for (;;) {
        try {
          const result = await runSync(handles);
          if (result.ran) {
            console.log(
              `[${new Date().toISOString()}] drained ${result.drainedPrimaryToNeon}→neon ` +
                `(pending: ${result.pendingPrimary})`,
            );
            const s = result.primaryToNeon;
            if (s && (s.deferred > 0 || s.unverified > 0 || s.orphansDropped > 0)) console.log(`  p→n: ${drainStatsLine('p→n', s)}`);
          }
        } catch (e) {
          console.error('[watch] drain failed, retrying next tick:', e instanceof Error ? e.message : e);
        }
        await new Promise((resolve) => setTimeout(resolve, interval));
      }
    }
  } finally {
    await closeSyncHandles(handles);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
