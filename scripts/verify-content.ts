/**
 * Content checks — run with:
 *   npx tsx --conditions=react-server scripts/verify-content.ts
 *
 * (`--conditions=react-server` is what lets a script import the server modules;
 * `server-only` resolves to an empty module under that condition, exactly as it
 * does inside a route handler.)
 *
 * Exercises the three things this pass changed, against the real database:
 *   1. the deck grammar, including the multiple-choice rows that used to parse
 *      to the wrong correct index
 *   2. the visibility rule — that a card you own is studiable without an
 *      enrolment, which is what "no questions are ever added" meant
 *   3. merging two topics, on scratch topics it creates and removes itself
 *   4. connection hygiene — the pool must be a singleton in production too, or
 *      a handful of queries walks into the pooler's client ceiling and takes
 *      down login. Re-run this file with NODE_ENV=production for that check.
 */
import 'dotenv/config';
import { createHash } from 'crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import { db, isCapacityError } from '../src/db/client';
import { cards, lessons, refreshTokens, subjects, topics, users } from '../src/db/schema';
import { parseContent } from '../src/domain/parse-import';
import { buildCramQueue, buildDailyQueue } from '../src/services/study';
import { topicReaches } from '../src/services/visibility';
import { mergeTopics, topicContentCounts } from '../src/services/content-ops';
import { consumeRefreshToken, issueRefreshToken, type SessionUser } from '../src/services/auth';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${ok ? '' : ` — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}
function assert(label: string, condition: boolean, detail = '') {
  if (!condition) failures += 1;
  console.log(`${condition ? '  ok  ' : ' FAIL '} ${label}${condition ? '' : ` — ${detail}`}`);
}

async function parserChecks() {
  console.log('\n1. Deck grammar');
  const tsv = parseContent(
    [
      '# front\tback',
      'What is 2 + 2?\tFour',
      'cloze: The powerhouse of the cell is the ____ | mitochondrion | mitochondria',
      'mcq: Which organelle makes ATP?; Ribosome; *Mitochondrion; Nucleus',
      'mcq: Which organelle makes ATP?; Ribosome; Mitochondrion; Nucleus\t2',
      'this row has no delimiter',
    ].join('\n'),
    'tsv',
  );

  check('rows parsed', tsv.rows.length, 4);
  check('cloze answers', tsv.rows[1].kind === 'cloze' && tsv.rows[1].answers, ['mitochondrion', 'mitochondria']);
  check('mcq via * marker', tsv.rows[2].kind === 'mcq' && tsv.rows[2].correctIdx, 1);
  check('mcq via trailing index', tsv.rows[3].kind === 'mcq' && tsv.rows[3].correctIdx, 2);
  check(
    'mcq options are not truncated',
    tsv.rows[3].kind === 'mcq' && tsv.rows[3].options,
    ['Ribosome', 'Mitochondrion', 'Nucleus'],
  );
  check('the unparseable row is reported with its line number', tsv.errors, [{ row: 6, message: 'row needs a back separated by "tab"' }]);

  // The old parser computed the index from the last option when no index was
  // given, which produced NaN and silently dropped an option.
  const noIndex = parseContent('mcq: Pick one; A; B; C', 'tsv');
  check('an unmarked mcq is rejected rather than guessed', noIndex.rows.length, 0);
  check('and says why', noIndex.errors[0].message, 'mark the correct option with * or end the row with | index');
}

async function visibilityChecks(user: SessionUser) {
  console.log('\n2. Visibility — can this user actually be asked a question?');

  const queue = await buildDailyQueue(user.id, 50);
  assert('the daily queue deals cards', queue.length > 0, `got ${queue.length}; before this pass it was always 0`);

  // Every topic this user can reach, not only the ones they wrote: staff content
  // is owned by nobody, and a picker that counts reachable cards is the promise
  // under test — so the set has to be defined by reach, the same as the picker.
  const rows = await db.select().from(topics).where(topicReaches(user.id));
  const counts = await topicContentCounts(user.id, rows.map((r) => r.id), { onlyReachable: true });
  const promised = rows.reduce((n, r) => n + (counts.get(r.id)?.cards ?? 0), 0);
  assert('the picker counts cards that exist', promised > 0, `got ${promised} across ${rows.length} reachable topic(s)`);

  // The picker's number and the queue's length must be the same promise.
  for (const topic of rows) {
    const cramQueue = await buildCramQueue(user.id, [topic.id], 50);
    check(`cram queue matches its advertised count for "${topic.name}"`, cramQueue.length, counts.get(topic.id)?.cards ?? 0);
  }

  const enrolledBefore = queue.filter((c) => c.topicId).length;
  assert('cards carry the topic they belong to', enrolledBefore === queue.length);
}

async function mergeChecks(user: SessionUser) {
  console.log('\n3. Merge — folding two topics back together');

  const [subject] = await db.select({ id: subjects.id }).from(subjects).limit(1);
  if (!subject) {
    console.log('  skip  no subject to hang scratch topics from');
    return;
  }

  const stamp = Date.now().toString(36);
  const sourceId = crypto.randomUUID();
  const targetId = crypto.randomUUID();

  await db.insert(topics).values([
    { id: targetId, subjectId: subject.id, name: `verify-target-${stamp}`, slug: `verify-target-${stamp}`, visibility: 'private', ownerId: user.id },
    { id: sourceId, subjectId: subject.id, name: `verify-source-${stamp}`, slug: `verify-source-${stamp}`, visibility: 'private', ownerId: user.id },
  ]);
  await db.insert(lessons).values({ id: crypto.randomUUID(), topicId: targetId, title: 'Existing note', detailedMd: 'kept', visibility: 'private', ownerId: user.id, position: 0 });
  await db.insert(lessons).values({ id: crypto.randomUUID(), topicId: sourceId, title: 'Imported note', detailedMd: 'moved', visibility: 'private', ownerId: user.id, position: 0 });
  await db.insert(cards).values([
    { id: crypto.randomUUID(), topicId: sourceId, kind: 'cloze', textWithBlank: 'a ____ b', visibility: 'private', ownerId: user.id },
    { id: crypto.randomUUID(), topicId: sourceId, kind: 'cloze', textWithBlank: 'c ____ d', visibility: 'private', ownerId: user.id },
  ]);

  try {
    const self = await mergeTopics(user, sourceId, sourceId).catch((e: Error) => e.message);
    assert('a topic cannot merge into itself', typeof self === 'string', String(self));

    const notMine = await mergeTopics({ ...user, id: 'nobody', role: 'student' }, sourceId, targetId).catch((e: Error) => e.message);
    assert('a stranger cannot merge your topics', typeof notMine === 'string', String(notMine));

    const result = await mergeTopics(user, sourceId, targetId, { publish: true });
    check('cards moved', result.movedCards, 2);
    check('note sets moved', result.movedLessons, 1);

    const [gone] = await db.select().from(topics).where(eq(topics.id, sourceId));
    assert('the source topic is gone', gone === undefined);

    const moved = await db.select().from(cards).where(eq(cards.topicId, targetId));
    check('both cards live in the target now', moved.length, 2);
    assert('and picked up the target visibility', moved.every((c) => c.visibility === 'public'), JSON.stringify(moved.map((c) => c.visibility)));

    const movedLessons = await db.select().from(lessons).where(eq(lessons.topicId, targetId));
    check('both note sets live in the target', movedLessons.length, 2);
    check('positions are appended, not collided', movedLessons.map((l) => l.position).sort(), [0, 1]);

    const [target] = await db.select().from(topics).where(eq(topics.id, targetId));
    check('the target was published too', target.visibility, 'public');
  } finally {
    await db.delete(topics).where(eq(topics.id, targetId));
    await db.delete(topics).where(eq(topics.id, sourceId));
  }
}

/**
 * The outage this locks down: the pool was cached on `globalThis` only when
 * `NODE_ENV !== 'production'`, so in production every query built a new
 * `pg.Pool` and never ended one. A single `/me` with a `Promise.all` of five
 * queries opened five pools, and a one-user app reached the pooler's 200-client
 * ceiling — after which *every* request 500'd, login included.
 *
 * Run this file with `NODE_ENV=production` to exercise the path that broke.
 */
async function connectionChecks() {
  console.log(`\n4. Connection hygiene (NODE_ENV=${process.env.NODE_ENV ?? 'unset'})`);

  // Touch the database so a pool is definitely built.
  await db.select({ n: sql`1` }).from(users).limit(1);
  assert(
    'the pool is cached for the life of the process',
    Boolean(globalThis.__revisioPool),
    'a pool rebuilt per query is what exhausted the pooler',
  );
  assert('the drizzle handle is cached too', Boolean(globalThis.__revisioDb));

  const wrapped = new Error('DrizzleQueryError');
  wrapped.cause = Object.assign(new Error('max client connections reached, limit: 200'), { code: 'EMAXCONN' });
  assert('a wrapped pooler refusal is recognised', isCapacityError(wrapped));
  assert('a bare pooler refusal is recognised', isCapacityError(Object.assign(new Error('x'), { code: 'EMAXCONN' })));

  // The retry policy is deliberately narrow: a failure that could have landed
  // mid-statement must never be replayed, or a review could award XP twice.
  assert(
    'a mid-query reset is NOT treated as retryable',
    !isCapacityError(Object.assign(new Error('Connection terminated unexpectedly'), { code: 'ECONNRESET' })),
  );
  assert('an ordinary error is not retryable', !isCapacityError(new Error('syntax error at or near')));
}

/**
 * The refresh exchange, which is what put people back on the login screen.
 *
 * Every token used here is minted by the test and deleted by hash afterwards,
 * so the account's real sessions are never touched.
 */
async function rotationChecks(userId: string) {
  console.log('\n5. Refresh rotation');
  const minted = new Set<string>();
  const track = (raw: string) => {
    minted.add(sha256(raw));
    return raw;
  };

  try {
    const first = track(await issueRefreshToken(userId));
    const rotated = await consumeRefreshToken(first);
    assert('a live token exchanges for a replacement', Boolean(rotated?.nextRaw));
    if (!rotated) return;
    track(rotated.nextRaw);

    const [spent] = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, sha256(first))).limit(1);
    assert('and the token it replaced is revoked', Boolean(spent?.revokedAt));

    // The race: two tabs refresh at once and the second one arrives with a token
    // that was revoked a moment ago. Refusing it signs that tab out for no
    // reason, which is the reported symptom.
    const raced = await consumeRefreshToken(first);
    assert('a just-revoked token still exchanges', Boolean(raced?.nextRaw), 'a replayed token inside the window must not log anyone out');
    if (raced) track(raced.nextRaw);

    // Outside the window it must still be refused, or a stolen copy would work
    // forever.
    const stale = track(await issueRefreshToken(userId));
    const [staleRow] = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, sha256(stale))).limit(1);
    if (staleRow) {
      await db.update(refreshTokens).set({ revokedAt: new Date(Date.now() - 10 * 60_000) }).where(eq(refreshTokens.id, staleRow.id));
      const refused = await consumeRefreshToken(stale);
      check('a token revoked long ago is refused', refused, null);
    }

    const nonsense = await consumeRefreshToken('not-a-real-token');
    check('an unknown token is refused', nonsense, null);
  } finally {
    for (const hash of minted) {
      await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, hash));
    }
    const left = await db.select({ id: refreshTokens.id }).from(refreshTokens).where(inArray(refreshTokens.tokenHash, [...minted]));
    check('every token this check minted was removed', left.length, 0);
  }
}

async function main() {
  const [user] = await db.select().from(users).where(eq(users.email, 'tayyab@outlook.jp')).limit(1);
  if (!user) throw new Error('No verification account found.');
  const session: SessionUser = { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status };

  await parserChecks();
  await visibilityChecks(session);
  await mergeChecks(session);
  await connectionChecks();
  await rotationChecks(session.id);

  console.log(failures === 0 ? '\nAll content checks passed.\n' : `\n${failures} check(s) failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
