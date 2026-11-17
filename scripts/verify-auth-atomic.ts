/* eslint-disable no-console */
// Concurrency check for #54 — atomic refresh/email token consumption.
// Run: DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres \
//   NODE_OPTIONS="--import ./scripts/register-stub-loader.mjs" npx tsx scripts/verify-auth-atomic.ts
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client';
import { users, refreshTokens, emailTokens } from '../src/db/schema';
import {
  consumeEmailToken,
  consumeRefreshToken,
  issueEmailToken,
  issueRefreshToken,
} from '../src/services/auth';

let failures = 0;
const check = (name: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failures++;
};

async function main() {
  const email = `atomic-${Date.now()}@test.local`;
  const [user] = await db
    .insert(users)
    .values({ id: crypto.randomUUID(), email, name: 'Atomic', passwordHash: 'x', role: 'teacher', status: 'active', dateOfBirth: '1990-01-01' })
    .returning();

  try {
    // ── refresh: 8 concurrent consumes of one live token ──────────────────
    const raw = await issueRefreshToken(user.id);
    const results = await Promise.all(Array.from({ length: 8 }, () => consumeRefreshToken(raw)));
    const wins = results.filter((r) => r && !('rejection' in r));
    const losses = results.filter((r) => r === null);
    check('concurrent live-token consume: bounded wins (<=2: claim + single-use grace)', wins.length <= 2, `${wins.length} wins / ${losses.length} null`);
    check('concurrent live-token consume: at least one winner', wins.length >= 1);

    // ── grace is single-use: the spent token must now be dead ─────────────
    const again = await consumeRefreshToken(raw);
    check('token is dead after claim+grace spent', again === null);

    // ── sequential grace still works once (lost-cookie retry) ─────────────
    const raw2 = await issueRefreshToken(user.id);
    const first = await consumeRefreshToken(raw2);
    check('first exchange succeeds', Boolean(first && !('rejection' in first)));
    const retry = await consumeRefreshToken(raw2);
    check('one grace retry succeeds', Boolean(retry && !('rejection' in retry)));
    const third = await consumeRefreshToken(raw2);
    check('second grace retry refused (grace single-use)', third === null);

    // ── unknown token ─────────────────────────────────────────────────────
    check('unknown token refused', (await consumeRefreshToken('nope')) === null);

    // ── email token: concurrent consume → exactly one winner ──────────────
    const etok = await issueEmailToken(user.id, 'verify');
    const eres = await Promise.all(Array.from({ length: 6 }, () => consumeEmailToken(etok, 'verify')));
    const eWins = eres.filter((r) => r === user.id);
    check('concurrent email-token consume: exactly one winner', eWins.length === 1, `${eWins.length} wins`);
    check('consumed email token refused afterwards', (await consumeEmailToken(etok, 'verify')) === null);
    check('wrong kind refused', (await consumeEmailToken(etok, 'reset')) === null);
  } finally {
    await db.delete(emailTokens).where(eq(emailTokens.userId, user.id));
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, user.id));
    await db.delete(users).where(eq(users.id, user.id));
  }

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
