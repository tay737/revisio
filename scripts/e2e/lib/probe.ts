/**
 * The account the browser harness signs in as, and the promise that it leaves
 * nothing behind.
 *
 * A browser test that writes to production is only acceptable if "writes" is
 * bounded and reversible, so this module draws that boundary:
 *
 *   • The harness uses a *dedicated* account (`e2e-probe@…` by default) whose
 *     only job is to be clicked at. `assertProbeEmail` refuses any address that
 *     does not look like a probe, so a mistyped `E2E_EMAIL` cannot send the run
 *     into a real learner's settings.
 *   • The account is created directly in the database rather than through
 *     `/register`, because registration sends a verification email that nothing
 *     can read, and login refuses an unverified account. This is the same
 *     escape hatch `scripts/verify-*.ts` already uses.
 *   * Every field the suite is allowed to touch is snapshotted **before** the
 *     first click, and restored in a `finally`.
 *   • …and because a `finally` does not run when a machine is killed, the
 *     snapshot is *also* written to `restore.json` in the artifacts directory
 *     before any mutation happens. `npm run e2e:restore` applies it. A run that
 *     dies mid-click leaves a receipt, not a mess.
 */
// `.env` first, and before anything that opens a pool: the probe account is
// written straight to the database, so a run must not need a shell ritual to
// know where the database is. An exported `DATABASE_URL` still wins, because
// dotenv never overwrites a variable that already has a value — which is what
// makes "point the harness at another database" a one-line change.
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../../../src/db/client';
import { users, type ProfileVisibility } from '../../../src/db/schema';
import { hashPassword } from '../../../src/services/auth';

export const PROBE_EMAIL = process.env.E2E_EMAIL ?? 'e2e-probe@revisio.probe';
const PROBE_PASSWORD = process.env.E2E_PASSWORD ?? 'revisio-e2e-probe';
const PROBE_NAME = 'E2E Probe';

/**
 * Refuse an address that is not obviously a probe.
 *
 * The escape hatch exists and is spelled out, because a harness that cannot be
 * pointed at a real account *at all* would eventually be bypassed by copying a
 * line rather than by reading why.
 */
function assertProbeEmail(email: string) {
  if (process.env.E2E_ALLOW_ANY_ACCOUNT === '1') return;
  if (!/(^|[@._-])(e2e|probe|test|ci|bot)([@._-]|$)/i.test(email)) {
    throw new Error(
      `Refusing to sign in as ${email}: it does not look like a throwaway probe account. ` +
        'Use an address containing e2e/probe/test/ci/bot, or set E2E_ALLOW_ANY_ACCOUNT=1 if you really mean it.',
    );
  }
}

/** The profile fields a suite may touch, and nothing else. */
export type ProfileSnapshot = {
  id: string;
  email: string;
  name: string;
  username: string | null;
  nickname: string | null;
  bio: string | null;
  pronouns: string | null;
  avatarEmoji: string | null;
  avatarColor: string;
  bannerColor: string;
  profileVisibility: ProfileVisibility;
};

export type Probe = { email: string; password: string; handle: string; snapshot: ProfileSnapshot };

/**
 * Create or adopt the probe account, and hand back its credentials plus a
 * snapshot of everything the suite may change.
 *
 * Idempotent: the second run finds the row, resets the password to the known one
 * (a hand-edited password is the most likely reason a later run cannot sign in),
 * and re-snapshots.
 */
export async function ensureProbeAccount(): Promise<Probe> {
  assertProbeEmail(PROBE_EMAIL);
  const passwordHash = await hashPassword(PROBE_PASSWORD);
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, PROBE_EMAIL.toLowerCase()))
    .limit(1);

  if (existing.length === 0) {
    console.log(`probe: creating ${PROBE_EMAIL}`);
    // `users_username_idx` is unique, so the handle is only taken if nobody else
    // already holds it. A taken handle is not a reason to fail the run — the
    // account works perfectly well at its id address, which is what `handle`
    // falls back to.
    const taken = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, 'e2e-probe'))
      .limit(1);
    await db.insert(users).values({
      id: `e2e-probe-${Date.now().toString(36)}`,
      email: PROBE_EMAIL.toLowerCase(),
      name: PROBE_NAME,
      // active + verified: login refuses a pending, unverified account, and
      // there is no inbox here to click the link in.
      status: 'active',
      emailVerifiedAt: new Date(),
      passwordHash,
      username: taken.length === 0 ? 'e2e-probe' : null,
    });
  } else {
    await db
      .update(users)
      .set({ passwordHash, status: 'active', emailVerifiedAt: new Date() })
      .where(eq(users.id, existing[0].id));
  }

  const snapshot = await snapshotProfile(PROBE_EMAIL);
  return { email: PROBE_EMAIL, password: PROBE_PASSWORD, handle: snapshot.username ?? snapshot.id, snapshot };
}

/** Read every field the harness is allowed to change. */
export async function snapshotProfile(email: string): Promise<ProfileSnapshot> {
  const [row] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (!row) throw new Error(`No probe account ${email}.`);
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    username: row.username,
    nickname: row.nickname,
    bio: row.bio,
    pronouns: row.pronouns,
    avatarEmoji: row.avatarEmoji,
    avatarColor: row.avatarColor,
    bannerColor: row.bannerColor,
    profileVisibility: row.profileVisibility,
  };
}

/** Put every one of those fields back. Safe to call twice. */
export async function restoreProfile(snapshot: ProfileSnapshot) {
  await db
    .update(users)
    .set({
      name: snapshot.name,
      username: snapshot.username,
      nickname: snapshot.nickname,
      bio: snapshot.bio,
      pronouns: snapshot.pronouns,
      avatarEmoji: snapshot.avatarEmoji,
      avatarColor: snapshot.avatarColor,
      bannerColor: snapshot.bannerColor,
      profileVisibility: snapshot.profileVisibility,
    })
    .where(eq(users.id, snapshot.id));
  const after = await snapshotProfile(snapshot.email);
  const same = (['name', 'username', 'nickname', 'bio', 'pronouns', 'avatarEmoji', 'avatarColor', 'bannerColor'] as const)
    .every((key) => after[key] === snapshot[key])
    && JSON.stringify(after.profileVisibility) === JSON.stringify(snapshot.profileVisibility);
  if (!same) throw new Error('restore did not take — the probe account is not as it was.');
}

/**
 * Write the receipt.
 *
 * Called *before* the first mutation, so the artifacts directory always holds
 * either "nothing was changed" or "here is exactly how to undo it".
 */
export function writeRestorePlan(artifacts: string, snapshot: ProfileSnapshot) {
  mkdirSync(artifacts, { recursive: true });
  const path = join(artifacts, 'restore.json');
  writeFileSync(path, JSON.stringify({ email: snapshot.email, snapshot }, null, 2));
  console.log(`probe: restore plan written to ${path}`);
  return path;
}

/** `npm run e2e:restore` — apply the newest receipt in the artifacts tree. */
export async function restoreFromDisk(): Promise<void> {
  const root = join(process.cwd(), 'artifacts', 'e2e');
  let newest: { path: string; at: number } | null = null;
  let dirs: string[] = [];
  try {
    dirs = readdirSync(root);
  } catch {
    throw new Error(`No artifacts at ${root} — there is nothing to restore.`);
  }
  for (const dir of dirs) {
    const path = join(root, dir, 'restore.json');
    try {
      const at = statSync(path).mtimeMs;
      if (!newest || at > newest.at) newest = { path, at };
    } catch {
      continue;
    }
  }
  if (!newest) throw new Error(`No restore.json under ${root}.`);
  const plan = JSON.parse(readFileSync(newest.path, 'utf8')) as { snapshot: ProfileSnapshot };
  console.log(`restoring from ${newest.path}`);
  await restoreProfile(plan.snapshot);
  console.log(`restored ${plan.snapshot.email}`);
}