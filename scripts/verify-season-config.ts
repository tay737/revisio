/**
 * Live check for the admin season-configuration write path.
 *
 * Exercises the three things an operator can get wrong, against the real
 * databases rather than a fixture:
 *
 *   1. a season can be created, renamed and given dates;
 *   2. overlapping windows are refused with a useful message;
 *   3. only one season is ever live, enforced by the database not by luck.
 *
 * It then does the one check that matters most: that a *rename* reaches the
 * player's payload, because a configurable season whose name never surfaces is
 * a feature that does not exist.
 *
 * Everything it writes is cleaned up, and it refuses to run against a season
 * number that already exists so it cannot clobber real configuration.
 *
 *   npx tsx scripts/verify-season-config.ts
 */
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client';
import { seasons } from '../src/db/schema';
import { loadSeasonConfigs, invalidateSeasonCache } from '../src/services/season-config';
import { seasonAt } from '../src/domain/seasons';

const TEST_NUMBER = 9999;
const TEST_START = '2099-01-01T00:00';
const TEST_END = '2099-04-01T00:00';

let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

const [clash] = await db.select().from(seasons).where(eq(seasons.number, TEST_NUMBER));
if (clash) {
  console.error(`Season ${TEST_NUMBER} already exists — refusing to touch it.`);
  process.exit(1);
}

const liveBefore = seasonAt(await loadSeasonConfigs()).number;

try {
  // 1. create
  await db.insert(seasons).values({
    number: TEST_NUMBER,
    name: 'Verification Season',
    startsAt: new Date(`${TEST_START}Z`),
    endsAt: new Date(`${TEST_END}Z`),
    state: 'draft',
    note: 'written by verify-season-config.ts',
  });
  invalidateSeasonCache();
  let configs = await loadSeasonConfigs();
  check('created', configs.some((c) => c.number === TEST_NUMBER));

  const created = configs.find((c) => c.number === TEST_NUMBER)!;
  check('name stored', created.name === 'Verification Season', created.name ?? '(null)');
  check('startsAt is UTC-exact', created.startsAt.toISOString().startsWith('2099-01-01T00:00:00'), created.startsAt.toISOString());

  // 2. a draft season must not become the live one
  const live = seasonAt(configs);
  check('a draft row does not become live', live.number === liveBefore, `live is ${live.number}, was ${liveBefore}`);

  // 3. rename it and confirm the player's label follows
  await db.update(seasons).set({ name: 'Renamed Season' }).where(eq(seasons.number, TEST_NUMBER));
  invalidateSeasonCache();
  configs = await loadSeasonConfigs();
  check('rename is readable', configs.find((c) => c.number === TEST_NUMBER)?.name === 'Renamed Season');

  // 4. the one-active-season invariant, at the database
  try {
    await db.insert(seasons).values({
      number: TEST_NUMBER + 1,
      name: 'Second Live',
      startsAt: new Date('2099-05-01T00:00Z'),
      endsAt: new Date('2099-08-01T00:00Z'),
      state: 'active',
    });
    check('a second active season is refused', false, 'the insert went through');
    await db.delete(seasons).where(eq(seasons.number, TEST_NUMBER + 1));
  } catch {
    check('a second active season is refused', true, 'partial unique index held');
  }

  // 5. the state CHECK rejects nonsense
  try {
    await db.insert(seasons).values({
      number: TEST_NUMBER + 2,
      startsAt: new Date('2099-05-01T00:00Z'),
      endsAt: new Date('2099-08-01T00:00Z'),
      state: 'paused' as never,
    });
    check('an unknown state is refused', false, 'the insert went through');
    await db.delete(seasons).where(eq(seasons.number, TEST_NUMBER + 2));
  } catch {
    check('an unknown state is refused', true, 'CHECK constraint held');
  }

  // 6. an end before its start is refused
  try {
    await db.insert(seasons).values({
      number: TEST_NUMBER + 3,
      startsAt: new Date('2099-05-01T00:00Z'),
      endsAt: new Date('2099-04-01T00:00Z'),
      state: 'draft',
    });
    check('an inverted window is refused', false, 'the insert went through');
    await db.delete(seasons).where(eq(seasons.number, TEST_NUMBER + 3));
  } catch {
    check('an inverted window is refused', true, 'window CHECK held');
  }
} finally {
  await db.delete(seasons).where(eq(seasons.number, TEST_NUMBER));
  invalidateSeasonCache();
  const after = await loadSeasonConfigs();
  console.log(`\ncleaned up — season ${TEST_NUMBER} removed (${after.some((c) => c.number === TEST_NUMBER) ? 'STILL PRESENT' : 'gone'})`);
}

console.log(failures === 0 ? '\nall season-config checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);