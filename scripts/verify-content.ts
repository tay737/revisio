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
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client';
import { cards, lessons, subjects, topics, users } from '../src/db/schema';
import { parseContent } from '../src/domain/parse-import';
import { buildCramQueue, buildDailyQueue } from '../src/services/study';
import { mergeTopics, topicContentCounts } from '../src/services/content-ops';
import type { SessionUser } from '../src/services/auth';

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

  const rows = await db.select().from(topics).where(eq(topics.ownerId, user.id));
  const counts = await topicContentCounts(user.id, rows.map((r) => r.id), { onlyReachable: true });
  const promised = rows.reduce((n, r) => n + (counts.get(r.id)?.cards ?? 0), 0);
  assert('the picker counts cards that exist', promised > 0, `got ${promised}`);

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

async function main() {
  const [user] = await db.select().from(users).where(eq(users.email, 'tayyab@outlook.jp')).limit(1);
  if (!user) throw new Error('No verification account found.');
  const session: SessionUser = { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status };

  await parserChecks();
  await visibilityChecks(session);
  await mergeChecks(session);

  console.log(failures === 0 ? '\nAll content checks passed.\n' : `\n${failures} check(s) failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
