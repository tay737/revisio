/* eslint-disable no-console */
// Admin account erasure — runs the SAME anonymisation transaction as
// DELETE /api/v1/data-deletion (services/account-erasure.ts) for accounts the
// caller cannot sign in as: QA fixtures, probe users, abandoned signups.
//
// Usage (from repo root, .env supplies DATABASE_URL = the PRIMARY):
//   NODE_OPTIONS="--import ./scripts/register-stub-loader.mjs" npx tsx scripts/erase-users.ts <email-or-id> [more...]
//
// Every argument must match exactly one users row by email or id. Already-
// deleted rows are skipped. There is no undo: anonymisation destroys the
// profile, credentials, learning records and owned private content.
import 'dotenv/config';
import { eq, inArray, or } from 'drizzle-orm';
import { db } from '../src/db/client';
import { users } from '../src/db/schema';
import { eraseUserAccount } from '../src/services/account-erasure';

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('usage: tsx scripts/erase-users.ts <email-or-id> [more...]');
  process.exit(2);
}

const matches = await db
  .select({ id: users.id, email: users.email, name: users.name, status: users.status })
  .from(users)
  .where(or(inArray(users.email, targets), inArray(users.id, targets)));

const byKey = new Map(matches.flatMap((u) => [[u.email, u], [u.id, u]] as const));
let failed = false;

for (const t of targets) {
  const u = byKey.get(t);
  if (!u) {
    console.log(`MISS  ${t} — no user with that email or id`);
    failed = true;
    continue;
  }
  if (u.status === 'deleted') {
    console.log(`SKIP  ${u.email} (${u.id}) — already deleted`);
    continue;
  }
  try {
    const { mediaQueued } = await eraseUserAccount(u.id);
    console.log(`DONE  ${u.email} (${u.id}) "${u.name}" — anonymised${mediaQueued ? `, ${mediaQueued} media object(s) queued` : ''}`);
  } catch (e) {
    console.log(`FAIL  ${u.email} (${u.id}) — ${e instanceof Error ? e.message : e}`);
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
