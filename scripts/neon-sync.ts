import 'dotenv/config';
import { installSyncInfrastructure, bootstrapSchemaFromMigration, backfillPrimaryToNeon, runSync, openSyncHandles, closeSyncHandles, countPending, loadPrimaryKeys, type SyncHandles } from '../src/db/sync';

// ── Neon mirror operator CLI ─────────────────────────────────────────────────
//
//   tsx scripts/neon-sync.ts init      Install _sync_events + capture triggers on BOTH databases
//   tsx scripts/neon-sync.ts run       One bidirectional drain (used by cron/CI too)
//   tsx scripts/neon-sync.ts status    Pending events per side
//   tsx scripts/neon-sync.ts watch     Drain every NEON_SYNC_INTERVAL_MS (default 5s) — run
//                                      this on any always-on box next to the two databases
//   tsx scripts/neon-sync.ts bootstrap Create the app schema on a bare Neon project (0000_init.sql)
//                                      and backfill every current row, before enabling NEON_DATABASE_URL
//
// Requires DATABASE_URL (Supabase primary) and NEON_DATABASE_URL (Neon) in the
// environment. `bootstrap` is the only command that writes without events
// flowing first — run it once, then `init`, then point the app at both.

type Command = 'init' | 'run' | 'status' | 'watch' | 'bootstrap';

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
  // backfill failed, and the generated migration is not IF NOT EXISTS.
  const existing = await neon.pool.query("SELECT to_regclass('users') AS t");
  if (existing.rows[0]?.t) {
    console.log('Neon already has the app schema — skipping creation.');
  } else {
    console.log('Creating app schema on Neon from drizzle/0000_init.sql …');
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
      await installSyncInfrastructure([handles.primary, handles.neon], pkMap);
      console.log('Sync infrastructure installed on both databases.');
      console.log('Next: deploy the app with NEON_DATABASE_URL set, or start `watch`.');
      return;
    }

    if (command === 'status') {
      const [p, n] = await Promise.all([countPending(handles.primary), countPending(handles.neon)]);
      console.log(`primary → neon pending: ${p}`);
      console.log(`neon → primary pending: ${n}`);
      return;
    }

    if (command === 'run') {
      const result = await runSync(handles);
      if (!result.ran) {
        console.log('nothing to drain');
        return;
      }
      console.log(
        `drained ${result.drainedPrimaryToNeon} primary→neon, ${result.drainedNeonToPrimary} neon→primary ` +
          `(pending after: ${result.pendingPrimary} primary, ${result.pendingNeon} neon)`,
      );
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
              `[${new Date().toISOString()}] drained ${result.drainedPrimaryToNeon}→neon, ${result.drainedNeonToPrimary}→primary ` +
                `(pending: ${result.pendingPrimary}/${result.pendingNeon})`,
            );
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
