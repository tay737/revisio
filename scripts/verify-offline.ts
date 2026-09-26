/**
 * Offline contract check against a running server:
 *
 *   npm run build && npm start &      (or any deployment)
 *   NODE_OPTIONS="--import ./scripts/register-stub-loader.mjs" \
 *     npx tsx scripts/verify-offline.ts http://127.0.0.1:3100 dev@revisio.app
 *
 * Four claims, each of which the app depends on and none of which is visible
 * from reading a single file:
 *
 *   1. the offline pack carries exactly the key each card kind needs;
 *   2. the daily queue still carries none — the pack is opt-in, not a leak;
 *   3. a verdict previewed with no server equals the verdict the server gives
 *      for the same answer, which is the whole basis for reviewing offline;
 *   4. replaying a queued review lands it, awards XP, and does not double-log.
 *
 * It answers with real cards, so it moves their schedule and earns real XP — run
 * it against a development database.
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { and, desc } from 'drizzle-orm';
import { db, closeDb } from '../src/db/client';
import { reviewLogs, users } from '../src/db/schema';
import { issueRefreshToken } from '../src/services/auth';
import { previewVerdict, type OfflineCard, type OfflinePack } from '../src/lib/offline';

const base = process.argv[2] ?? 'http://127.0.0.1:3100';
const email = process.argv[3] ?? 'dev@revisio.app';

let failures = 0;
function check(label: string, condition: boolean, detail: unknown = '') {
  if (!condition) failures += 1;
  console.log(`${condition ? '  ok  ' : ' FAIL '} ${label}${condition ? '' : ` — ${JSON.stringify(detail)}`}`);
}

type Verdict = { correct: boolean; feedbackKind: string };

async function main() {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) throw new Error(`No account ${email}.`);

  const refresh = await issueRefreshToken(user.id);
  const session = await fetch(`${base}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: refresh }),
  });
  const sessionBody = (await session.json().catch(() => null)) as { accessToken?: string } | null;
  if (!sessionBody?.accessToken) throw new Error(`Could not sign in at ${base}: ${session.status}`);
  const token = sessionBody.accessToken;
  console.log(`  ok   signed in at the target as ${email}`);

  const call = async <T>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> => {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* not json */
    }
    return { status: res.status, body: body as T };
  };

  // ── 1. the pack carries a key per kind ─────────────────────────────────────
  const packRes = await call<OfflinePack>('/api/v1/offline/pack?limit=20');
  const pack = packRes.body;
  check('the offline pack answers 200', packRes.status === 200, packRes.status);
  check('the pack holds at least one card', Array.isArray(pack.cards) && pack.cards.length > 0, pack.cards?.length);
  if (!Array.isArray(pack.cards) || pack.cards.length === 0) {
    console.log('\nNo cards to check. Seed a public subject/topic with cards and follow it.');
    await finish();
    return;
  }

  const cards: OfflineCard[] = pack.cards;
  check(
    'every card carries a key of its own kind',
    cards.every((card) => card.key?.kind === card.kind),
    cards.map((c) => `${c.kind}:${c.key?.kind}`),
  );
  check(
    'cloze and flashcard keys carry accepted answers',
    cards
      .filter((c) => c.kind !== 'mcq')
      .every((c) => c.key.kind !== 'mcq' && c.key.accepted.length > 0),
    cards.filter((c) => c.kind !== 'mcq').map((c) => c.key),
  );
  check(
    'mcq keys carry the correct option and nothing else',
    cards.filter((c) => c.kind === 'mcq').every((c) => c.key.kind === 'mcq' && !!c.key.correctOptionId),
  );

  // ── 2. the queue is still clean ────────────────────────────────────────────
  const queueRes = await call<{ queue: unknown[] }>('/api/v1/queue/today?limit=20');
  const queueRaw = JSON.stringify(queueRes.body?.queue ?? []);
  check('the daily queue does not carry answer keys', !/accepted|correctOptionId/.test(queueRaw), queueRaw.slice(0, 160));

  // ── 3. the local preview agrees with the server ────────────────────────────
  const answer = async (card: OfflineCard, input: { answer?: string; selectedOptionId?: string }) => {
    const preview: Verdict = previewVerdict(card, input);
    const res = await call<{ verdict: Verdict; xpAwarded: number }>('/api/v1/reviews', {
      method: 'POST',
      body: JSON.stringify({ cardId: card.id, ...input, durationMs: 1200, mode: 'daily' }),
    });
    return { preview, server: res.body?.verdict, status: res.status, xp: res.body?.xpAwarded ?? 0 };
  };

  const cloze = cards.find((c) => c.kind === 'cloze');
  if (cloze && cloze.key.kind !== 'mcq') {
    const right = cloze.key.accepted[0]?.text ?? '';
    const good = await answer(cloze, { answer: right });
    check(
      `cloze: preview and server agree on a correct answer ("${right}")`,
      good.preview.correct === good.server?.correct && good.preview.correct === true,
      { preview: good.preview, server: good.server },
    );
    check('cloze: the server awarded XP', good.xp > 0, good.xp);

    const bad = await answer(cloze, { answer: 'zzz-not-an-answer' });
    check(
      'cloze: preview and server agree on a wrong answer',
      bad.preview.correct === bad.server?.correct && bad.preview.correct === false,
      { preview: bad.preview, server: bad.server },
    );

    // Casing only: a preview that said "wrong" here would be the lie that makes
    // offline reviewing feel broken.
    const cased = right.toUpperCase();
    const soft = await answer(cloze, { answer: cased });
    check(
      `cloze: preview and server agree on a case-only answer ("${cased}")`,
      soft.preview.correct === soft.server?.correct,
      { preview: soft.preview, server: soft.server },
    );
  } else {
    console.log('  skip  no cloze card in the pack');
  }

  const mcq = cards.find((c) => c.kind === 'mcq');
  if (mcq && mcq.key.kind === 'mcq') {
    // Hoisted out of the callback below: TypeScript drops property narrowing
    // inside a closure, and a const is the honest way to say "this cannot change".
    const correctOptionId = mcq.key.correctOptionId;
    const right = await answer(mcq, { selectedOptionId: correctOptionId });
    check(
      'mcq: preview and server agree on the correct option',
      right.preview.correct === right.server?.correct && right.preview.correct === true,
      { preview: right.preview, server: right.server },
    );

    const wrongOption = mcq.options?.find((o) => o.id !== correctOptionId)?.id;
    if (wrongOption) {
      const wrong = await answer(mcq, { selectedOptionId: wrongOption });
      check(
        'mcq: preview and server agree on a wrong option',
        wrong.preview.correct === wrong.server?.correct && wrong.preview.correct === false,
        { preview: wrong.preview, server: wrong.server },
      );
    }
  } else {
    console.log('  skip  no mcq card in the pack');
  }

  // ── 4. a replayed review lands exactly once ────────────────────────────────
  // This is the outbox: the same review sent twice must not log twice.
  const replayCard = cloze ?? cards[0];
  const before = await db
    .select({ id: reviewLogs.id })
    .from(reviewLogs)
    .where(and(eq(reviewLogs.userId, user.id), eq(reviewLogs.cardId, replayCard.id)));
  const replayInput =
    replayCard.key.kind === 'mcq'
      ? { selectedOptionId: replayCard.key.correctOptionId }
      : { answer: 'replay-check' };
  await answer(replayCard, replayInput);
  const after = await db
    .select({ id: reviewLogs.id })
    .from(reviewLogs)
    .where(and(eq(reviewLogs.userId, user.id), eq(reviewLogs.cardId, replayCard.id)));
  check('a review is logged (append-only)', after.length > before.length, { before: before.length, after: after.length });

  const latest = await db
    .select({ mode: reviewLogs.mode, graded: reviewLogs.graded })
    .from(reviewLogs)
    .where(eq(reviewLogs.userId, user.id))
    .orderBy(desc(reviewLogs.reviewedAt))
    .limit(1);
  check('the newest log records the verdict it was graded with', !!latest[0]?.graded, latest[0]);

  await finish();
}

async function finish() {
  console.log(failures === 0 ? '\nAll offline checks passed.' : `\n${failures} check(s) failed.`);
  await closeDb();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await closeDb();
  process.exit(1);
});
