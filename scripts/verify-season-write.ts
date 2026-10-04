/**
 * Proves the season write path — the backfill INSERT and the reward-claim
 * UPDATE — runs as the connecting app role against the live primary, then puts
 * the table back exactly as it found it.
 *
 * This is the class of failure that is invisible until it happens: an RLS
 * sweep leaves a newly added table with no policy, reads sail through, and
 * every write dies inside the capture trigger. `drizzle/0006` ships the policy;
 * this is the receipt.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '../src/db/client';
import { seasonResults, users } from '../src/db/schema';

const [me] = await db.select({ id: users.id }).from(users).limit(1);
if (!me) throw new Error('no users to test with');

const SEASON = 999; // a number no real season will reach
await db
  .delete(seasonResults)
  .where(and(eq(seasonResults.userId, me.id), eq(seasonResults.seasonNumber, SEASON)));

await db.insert(seasonResults).values({
  userId: me.id,
  seasonNumber: SEASON,
  finalTier: 'emerald',
  finalDivision: 2,
  finalRankIndex: 13,
  finalRp: 3100,
  reviews: 42,
  rewardId: 'emerald',
  endedAt: new Date(),
});
console.log('insert  ok');

await db
  .update(seasonResults)
  .set({ rewardClaimedAt: new Date() })
  .where(and(eq(seasonResults.userId, me.id), eq(seasonResults.seasonNumber, SEASON)));
console.log('update  ok');

const [row] = await db
  .select()
  .from(seasonResults)
  .where(and(eq(seasonResults.userId, me.id), eq(seasonResults.seasonNumber, SEASON)));
console.log('read back:', row && `${row.finalTier} ${row.finalDivision}, claimed=${!!row.rewardClaimedAt}`);

await db
  .delete(seasonResults)
  .where(and(eq(seasonResults.userId, me.id), eq(seasonResults.seasonNumber, SEASON)));
const [gone] = await db
  .select()
  .from(seasonResults)
  .where(and(eq(seasonResults.userId, me.id), eq(seasonResults.seasonNumber, SEASON)));
console.log('cleanup ok:', gone === undefined);
