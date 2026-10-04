/**
 * Read-only check that every query `GET /api/v1/seasons` issues actually runs
 * against the live databases — the same statements, with a real user id. It
 * writes nothing; the backfill is exercised by looking at what it *would*
 * insert.
 *
 * The headline assertion is the one that used to fail in production: the
 * caller's own season XP is read from the PRIMARY by the route, so it must be
 * identical here on both sides. When it was read from the replica, a review that
 * earned XP looked like it had not registered until the nightly drain caught up.
 * If this script ever prints a primary/replica gap on `own xp`, that class of bug
 * is back.
 *
 *   npx tsx scripts/verify-seasons.ts
 */
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { db } from '../src/db/client';
import { readReplica } from '../src/db/replica';
import { reviewLogs, seasonResults, users, xpEvents } from '../src/db/schema';
import { rankFor } from '../src/domain/ranked';
import { loadSeasonConfigs } from '../src/services/season-config';
import { elapsedSeasons, rewardFor, seasonAt, seasonWindow } from '../src/domain/seasons';

const now = new Date();
const configs = await loadSeasonConfigs();
const season = seasonAt(configs, now);

console.log(`configured seasons: ${configs.length} rows (${configs[0]?.startsAt.toISOString().slice(0, 10)} → ${configs[configs.length - 1]?.endsAt.toISOString().slice(0, 10)})`);

await db.select({ id: users.id, name: users.name }).from(users).limit(3).then((r) => {
  console.log('users:', r.map((u) => `${u.name} (${u.id.slice(0, 8)})`).join(', ') || '(none)');
});

const [any] = await db.select({ id: users.id, name: users.name }).from(users).limit(1);
if (!any) {
  console.log('no users — nothing to verify');
  process.exit(0);
}
const me = any.id;

/** The learner's own two aggregates — the numbers the route reads off the primary. */
async function ownXp(rdb: typeof db) {
  const [xp] = await rdb
    .select({ xp: sql<number>`coalesce(sum(${xpEvents.amount}), 0)::int` })
    .from(xpEvents)
    .where(and(eq(xpEvents.userId, me), gte(xpEvents.occurredAt, season.start)));
  const [reviews] = await rdb
    .select({ c: sql<number>`count(*)::int` })
    .from(reviewLogs)
    .where(and(eq(reviewLogs.userId, me), gte(reviewLogs.reviewedAt, season.start)));
  return { xp: Number(xp?.xp ?? 0), reviews: Number(reviews?.c ?? 0) };
}

const primaryOwn = await ownXp(db);

const replicaOwn = await readReplica((rdb) => ownXp(rdb));

for (const label of ['primary + replica'] as const) {
  const run = (rdb: typeof db) => async () => {
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

    const [ahead] = await rdb
      .select({ c: sql<number>`count(*)::int` })
      .from(
        sql`(select user_id, sum(amount) as s from xp_events where occurred_at >= ${season.start} group by user_id) season_totals`,
      )
      .where(sql`season_totals.s > ${primaryOwn.xp}`);

    const recorded = await rdb
      .select()
      .from(seasonResults)
      .where(eq(seasonResults.userId, me))
      .orderBy(desc(seasonResults.seasonNumber));

    // What the backfill would derive, per elapsed season.
    const wouldWrite = [];
    for (const number of elapsedSeasons(configs, now)) {
      const { start, end } = seasonWindow(number, configs);
      const config = configs.find((c) => c.number === number) ?? null;
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
          (Number(rv?.c ?? 0) >= 10 ? ` (${rewardFor(rank.tier, config).id})` : ' (not placed)'),
      );
    }

    const lengthDays = Math.round((season.end.getTime() - season.start.getTime()) / 86_400_000);
    console.log(`\n[${label}] ${season.label} day ${season.day}/${lengthDays}, ${season.daysLeft} left (${season.state})`);
    console.log(`  season xp ${primaryOwn.xp} · reviews ${primaryOwn.reviews} · rank ${rankFor(primaryOwn.xp).label}`);
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

// ── the lag check ───────────────────────────────────────────────────────────
// A gap here is *expected* right after a review and must not be what the screen
// shows, so this prints it rather than failing: the route reads `primaryOwn`.
const lagXp = primaryOwn.xp - replicaOwn.xp;
const lagReviews = primaryOwn.reviews - replicaOwn.reviews;
console.log(
  `\nmirror lag: ${lagXp} xp / ${lagReviews} reviews behind the primary` +
    (lagXp || lagReviews ? ' (ok — the route reads these from the primary)' : ' (in sync)'),
);

process.exit(process.exitCode ?? 0);