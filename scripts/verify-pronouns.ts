/**
 * Live check for pronouns: the value, the normalisation, and the one promise
 * that makes the field safe — that a visitor never sees it unless the owner said
 * they could.
 *
 * Runs against the real databases rather than a fixture, through the same
 * `getPublicProfile` the profile page and `/api/v1/profile/:handle` both read,
 * because a feature that is only correct in the route that writes it is not
 * correct anywhere.
 *
 * Everything it writes is cleaned up, and it refuses to run if a row with the
 * probe handle already exists, so it cannot overwrite anyone's profile.
 *
 *   npm run verify:pronouns
 */
import { and, eq } from 'drizzle-orm';
import { db } from '../src/db/client';
import { users } from '../src/db/schema';
import { DEFAULT_VISIBILITY, getPublicProfile } from '../src/services/profile';
import { normalisePronouns, PRONOUN_MAX, pronounsProblem } from '../src/lib/pronouns';

const HANDLE = 'pronoun-probe';
const OWNER = { id: 'pronoun-probe-owner', email: 'probe@revisio.invalid', name: 'Pronoun Probe', role: 'student' as const, status: 'active' as const };

let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

const [clash] = await db.select({ id: users.id }).from(users).where(eq(users.username, HANDLE));
if (clash) {
  console.error(`Handle ${HANDLE} already exists — refusing to touch it.`);
  process.exit(1);
}

// ── the rules, before the database ──────────────────────────────────────────
check('empty is "I have none", not a problem', pronounsProblem('') === null);
check('the common sets are all legal', ['she/her', 'he/him', 'they/them', 'she/they', 'he/they', 'ask me', 'ze/zir', 'Mx/they']
  .every((p) => pronounsProblem(p) === null));
check('case is preserved', normalisePronouns('  Ze/Zir ') === 'Ze/Zir');
check('whitespace collapses', normalisePronouns('she /  her') === 'she / her');
check('empty becomes null', normalisePronouns('   ') === null);
check('an over-long value is refused', pronounsProblem('a'.repeat(PRONOUN_MAX + 1)) !== null);
check('markup is refused', pronounsProblem('<script>she/her</script>') !== null);
// A newline is folded to a space rather than refused: a learner who pastes from
// another app should get "she/her he/him" saved, not an error about their
// keyboard. The check that matters is that what is stored is the folded value.
check('a pasted newline folds to a space', normalisePronouns('she/her\nhe/him') === 'she/her he/him', normalisePronouns('she/her\nhe/him') ?? '(null)');

await db.insert(users).values({
  id: OWNER.id,
  email: OWNER.email,
  name: 'Pronoun Probe',
  passwordHash: 'not-a-real-hash',
  username: HANDLE,
  pronouns: 'she/her',
});

try {
  // ── public, because the owner allows it ──────────────────────────────────
  let mine = await getPublicProfile(HANDLE, OWNER);
  check('the owner always sees their own pronouns', mine?.pronouns === 'she/her', mine?.pronouns ?? '(null)');
  check('the owner always sees their own email', mine?.email === OWNER.email);

  let theirs = await getPublicProfile(HANDLE, null);
  check('a visitor sees the pronouns when public', theirs?.pronouns === 'she/her', theirs?.pronouns ?? '(null)');
  check('a visitor still never sees the email', theirs?.email === null);
  check('the visibility map travels with the profile', theirs?.visibility.pronouns === true);

  // ── private, and this is the promise ─────────────────────────────────────
  await db
    .update(users)
    .set({ profileVisibility: { ...DEFAULT_VISIBILITY, pronouns: false } })
    .where(eq(users.id, OWNER.id));
  theirs = await getPublicProfile(HANDLE, null);
  check('a visitor gets null when it is private', theirs?.pronouns === null, String(theirs?.pronouns));
  check('the key is present, so "private" is distinguishable from "unset"', theirs !== null && 'pronouns' in theirs);

  mine = await getPublicProfile(HANDLE, OWNER);
  check('the owner still sees it while it is private', mine?.pronouns === 'she/her', mine?.pronouns ?? '(null)');

  // Turning it back on must work, because a switch that only goes one way is
  // not a control.
  await db
    .update(users)
    .set({ profileVisibility: { ...DEFAULT_VISIBILITY, pronouns: true } })
    .where(eq(users.id, OWNER.id));
  theirs = await getPublicProfile(HANDLE, null);
  check('it can be made public again', theirs?.pronouns === 'she/her', theirs?.pronouns ?? '(null)');

  // ── a row written before the key existed ──────────────────────────────────
  // 0009 did not backfill `profile_visibility`; an absent key has to mean the
  // default, or every existing account would silently hide its pronouns.
  await db.update(users).set({ profileVisibility: { name: true } as never }).where(eq(users.id, OWNER.id));
  theirs = await getPublicProfile(HANDLE, null);
  check('an absent key means the default, not hidden', theirs?.pronouns === 'she/her', theirs?.pronouns ?? '(null)');

  // ── the database's own half ──────────────────────────────────────────────
  let refused = false;
  try {
    await db.update(users).set({ pronouns: 'x'.repeat(PRONOUN_MAX + 1) }).where(eq(users.id, OWNER.id));
  } catch {
    refused = true;
  }
  check(`the CHECK refuses more than ${PRONOUN_MAX} characters`, refused);

  refused = false;
  try {
    await db.update(users).set({ pronouns: '   ' }).where(eq(users.id, OWNER.id));
  } catch {
    refused = true;
  }
  check('the CHECK refuses whitespace, which means nothing', refused);
} finally {
  await db.delete(users).where(and(eq(users.id, OWNER.id)));
  const [gone] = await db.select({ id: users.id }).from(users).where(eq(users.id, OWNER.id));
  check('the probe row is gone', !gone);
}

console.log(failures === 0 ? '\npronouns: all checks passed' : `\npronouns: ${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);