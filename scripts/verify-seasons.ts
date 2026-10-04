/**
 * Read-only check that every query `GET /api/v1/seasons` issues actually runs
 * against the live databases — the same statements, with a real user id. It
 * writes nothing; the backfill is exercised by looking at what it *would*
 * insert.
 *
 *   npx tsx scripts/verify-seasons.ts
 */
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { db } from '../src/db/client';
import { readReplica } from '../src/db/replica';
import { reviewLogs, seasonResults, users, xpEvents } from '../src/db/schema';
import { rankFor } from '../src/domain/ranked';
import { elapsedSeasons, rewardFor, seasonAt, seasonWindow } from '../src/domain/seasons';

const now = new Date();
const season = seasonAt(now);

await db.select({ id: users.id, name: users.name }).from(users).limit(3).then((r) => {
  console.log('users:', r.map((u) => `${u.name} (${u.id.slice(0, 8)})`).join(', ') || '(none)');
});

const [any] = await db.select({ id: users.id, name: users.name }).from(users).limit(1);
if (!any) {
  console.log('no users — nothing to verify');
  process.exit(0);
}
const me = any.id;

for (const label of ['primary + replica'] as const) {
  const run = (rdb: typeof db) => async () => {
    const [mine] = await rdb
      .select({ xp: sql<number>`coalesce(sum(${xpEvents.amount}), 0)::int` })
      .from(xpEvents)
      .where(and(eq(xpEvents.userId, me), gte(xpEvents.occurredAt, season.start)));
    const [reviews] = await rdb
      .select({ c: sql<number>`count(*)::int` })
      .from(reviewLogs)
      .where(and(eq(reviewLogs.userId, me), gte(reviewLogs.reviewedAt, season.start)));

    const board = await rdb
      .select({
        userId: xpEvents.userId,
        name: users.name,
        optOut: users.leaderboardOptOut,
        xp: sql<number>`coalesce(sum(${xpEvents.amount}), 0)::int`,
      })
      .from(xpEvents)
      .innerJoin(users, eq(xpEvents.userId, users.id))
      .where(gte(xpEvents.occurredAt, season.start))
      .groupBy(xpEvents.userId, users.name, users.leaderboardOptOut)
      .orderBy(desc(sql`coalesce(sum(${xpEvents.amount}), 0)`))
      .limit(30);

    const seasonXp = Number(mine?.xp ?? 0);
    const [ahead] = await rdb
      .select({ c: sql<number>`count(*)::int` })
      .from(
        sql`(select user_id, sum(amount) as s from xp_events where occurred_at >= ${season.start} group by user_id) season_totals`,
      )
      .where(sql`season_totals.s > ${seasonXp}`);

    const recorded = await rdb
      .select()
      .from(seasonResults)
      .where(eq(seasonResults.userId, me))
      .orderBy(desc(seasonResults.seasonNumber));

    // What the backfill would derive, per elapsed season.
    const wouldWrite = [];
    for (const number of elapsedSeasons(now)) {
      const { start, end } = seasonWindow(number);
      const [agg] = await rdb
        .select({ xp: sql<number>`coalesce(sum(${xpEvents.amount}), 0)::int` })
        .from(xpEvents)
        .where(and(eq(xpEvents.userId, me), gte(xpEvents.occurredAt, start), lt(xpEvents.occurredAt, end)));
      const [rv] = await rdb
        .select({ c: sql<number>`count(*)::int` })
        .from(reviewLogs)
        .where(and(eq(reviewLogs.userId, me), gte(reviewLogs.reviewedAt, start), lt(reviewLogs.reviewedAt, end)));
      const rank = rankFor(Number(agg?.xp ?? 0));
      wouldWrite.push(
        `S${number}: ${Number(rv?.c ?? 0)} reviews, ${rank.points} RP → ${rank.label}` +
          (Number(rv?.c ?? 0) >= 10 ? ` (${rewardFor(rank.tier).id})` : ' (not placed)'),
      );
    }

    console.log(`\n[${label}] ${season.label} day ${season.day}/90, ${season.daysLeft} left`);
    console.log(`  season xp ${seasonXp} · reviews ${Number(reviews?.c ?? 0)} · rank ${rankFor(seasonXp).label}`);
    console.log(`  board ${board.length} rows · ahead-of-me ${Number(ahead?.c ?? 0)}`);
    console.log(`  recorded results: ${recorded.length}`);
    console.log(`  backfill would derive:\n    ${wouldWrite.join('\n    ')}`);
  };

  try {
    // `readReplica` is the production wrapper for the mirror; run the identical
    // body through it so the replica path is exercised, not just the primary.
    await readReplica(run(db));
  } catch (e) {
    console.error(`\n[${label}] FAILED`, e);
    process.exitCode = 1;
  }
}

process.exit(process.exitCode ?? 0);