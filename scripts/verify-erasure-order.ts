/* eslint-disable no-console */
// Erasure-ordering check for #58 — DB anonymisation commits before media
// objects are deleted, and the delete_failed_at ledger semantics hold.
// Run: AUTH_SECRET=test-secret DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres \
//   NODE_OPTIONS="--import ./scripts/register-stub-loader.mjs" npx tsx scripts/verify-erasure-order.ts
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client';
import { mediaAssets, refreshTokens, users } from '../src/db/schema';
import { issueRefreshToken, signAccessToken } from '../src/services/auth';
import { DELETE } from '../src/app/api/v1/data-deletion/route';
import { deleteAccountMediaObjects, drainFailedMediaDeletions } from '../src/services/media-erasure';

let failures = 0;
const check = (name: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failures++;
};

const del = (headers: Record<string, string>) =>
  DELETE(new NextRequest('http://verify.local/api/v1/data-deletion', { method: 'DELETE', headers }), { params: {} });

async function main() {
  const [user] = await db.insert(users).values({
    id: crypto.randomUUID(),
    email: `erasure-${Date.now()}@test.local`,
    name: 'Erasure', passwordHash: 'x', role: 'teacher', status: 'active',
    avatarUrl: 'media/test-key', bannerUrl: null, dateOfBirth: '1990-01-01',
  }).returning();
  await db.insert(mediaAssets).values({
    id: crypto.randomUUID(), userId: user.id, kind: 'avatar', key: 'test-key',
    contentType: 'image/png', sizeBytes: 10,
  });
  const raw = await issueRefreshToken(user.id);
  const accessToken = await signAccessToken({ id: user.id, email: user.email, role: 'teacher', totpEnabled: false });
  const auth = { authorization: `Bearer ${accessToken}` };

  try {
    // Phase 1: no confirmation header → challenge token.
    const challenge = await del(auth);
    const challengeBody = await challenge.json();
    check('challenge issued', challenge.status === 200 && Boolean(challengeBody.confirmationToken), `${challenge.status}`);
    const token = challengeBody.confirmationToken as string;

    // Phase 2: confirmed deletion.
    const done = await del({ ...auth, 'x-data-deletion-confirm': token });
    const doneBody = await done.json();
    check('deletion succeeds', done.status === 200 && doneBody.deleted === true, `${done.status} ${JSON.stringify(doneBody).slice(0, 120)}`);
    check('no media stranded (unconfigured bucket = removed)', doneBody.mediaQueued === 0, `mediaQueued=${doneBody.mediaQueued}`);

    const [after] = await db.select().from(users).where(eq(users.id, user.id));
    check('user anonymised', after?.status === 'deleted' && after.email.startsWith('deleted+'), after?.status);
    check('avatar pointer nulled', after?.avatarUrl === null);
    const assets = await db.select().from(mediaAssets).where(eq(mediaAssets.userId, user.id));
    check('media_assets ledger row removed after object delete', assets.length === 0, `${assets.length} rows`);
    // refresh_tokens rows are cascade-DELETED inside the transaction (not
    // merely revoked) — the check is that no live token survives.
    const toks = await db.select().from(refreshTokens).where(eq(refreshTokens.userId, user.id));
    check('no live refresh token survives erasure', toks.every((t) => Boolean(t.revokedAt)), `${toks.length} rows`);

    // #70: the stamp is the retry queue. A failed bucket delete must leave
    // the ledger row (and its stamp) for the drain; a successful one removes it.
    await db.insert(mediaAssets).values({
      id: crypto.randomUUID(), userId: user.id, kind: 'banner', key: 'drain-key',
      contentType: 'image/png', sizeBytes: 1, deleteFailedAt: new Date(),
    });
    const strandedKeys = await deleteAccountMediaObjects(user.id, async () => false);
    check('failed bucket delete reports the key stranded', strandedKeys.includes('drain-key'));
    const [stamped] = await db.select().from(mediaAssets).where(eq(mediaAssets.userId, user.id));
    check('stamped ledger row survives a bucket failure', Boolean(stamped?.deleteFailedAt));
    const drainFail = await drainFailedMediaDeletions(100, async () => false);
    check('drain keeps stamped rows on bucket failure', drainFail.stranded >= 1, JSON.stringify(drainFail));
    const drainOk = await drainFailedMediaDeletions(100, async () => true);
    check('drain removes stamped rows on success', drainOk.removed >= 1, JSON.stringify(drainOk));
    const afterDrain = await db.select().from(mediaAssets).where(eq(mediaAssets.userId, user.id));
    check('no stamped rows remain after successful drain', afterDrain.every((r) => !r.deleteFailedAt));
    void raw;
  } finally {
    await db.delete(mediaAssets).where(eq(mediaAssets.userId, user.id));
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, user.id));
    await db.delete(users).where(eq(users.id, user.id));
  }
  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
