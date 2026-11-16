// Offline scheduler backtest (#4) — the mandatory evidence gate before any
// scheduling change ships behind a flag.
//
// Replays real `review_logs` history through each registered Scheduler and
// asks the only question that matters: over the same window, with the same
// learner ratings, which algorithm demands fewer reviews while landing cards
// at least as high?
//
// Method per (user, card) stream, in time order:
//   state = newCardState(algorithm)
//   for each logged review at t with rating r:
//     if state.dueAt <= t  → this review counts as a "due pull": the scheduler
//                            itself demanded it (daily-mode demand).
//     state = scheduler.schedule(state, r, params, t)
// Metrics per algorithm:
//   duePulls   — reviews the schedule would have demanded in-window
//   mastery    — share of touched cards ending in stage 'mastered'
//   lapses     — total lapses accumulated
//   avgInterval— mean final intervalDays across touched cards
//
// "Win" = fewer duePulls at equal-or-better mastery, or equal pulls at better
// mastery. Run: NODE_OPTIONS="--import ./scripts/register-stub-loader.mjs" \
//   npx tsx scripts/eval-schedulers.ts [--user <id>] [--days 30] [--algorithms sm2,fsrs-lite]

import 'dotenv/config';
import { and, eq, gte } from 'drizzle-orm';
import { db, closeDb } from '../src/db/client';
import { reviewLogs } from '../src/db/schema';
import { getScheduler, listSchedulers, newCardState, type CardState, type Rating, type Scheduler } from '../src/domain/srs';

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const userId = arg('user');
const days = Number(arg('days') ?? 30);
const algorithms = (arg('algorithms') ?? 'sm2,fsrs-lite').split(',').map((s) => s.trim());

const since = new Date(Date.now() - days * 86_400_000);

type LogRow = { userId: string; cardId: string; rating: string; mode: string; reviewedAt: Date };

async function loadLogs(): Promise<LogRow[]> {
  const rows = await db
    .select({
      userId: reviewLogs.userId,
      cardId: reviewLogs.cardId,
      rating: reviewLogs.rating,
      mode: reviewLogs.mode,
      reviewedAt: reviewLogs.reviewedAt,
    })
    .from(reviewLogs)
    .where(and(gte(reviewLogs.reviewedAt, since), ...(userId ? [eq(reviewLogs.userId, userId)] : [])))
    .orderBy(reviewLogs.reviewedAt);
  return rows as LogRow[];
}

type Metrics = {
  algorithm: string;
  reviews: number;
  duePulls: number;
  cards: number;
  mastered: number;
  lapses: number;
  avgIntervalDays: number;
};

function simulate(algorithm: string, logs: LogRow[]): Metrics {
  const scheduler: Scheduler = getScheduler(algorithm);
  const params = scheduler.defaultParams();
  // Per (user, card) streams — scheduling state is per learner per card.
  const streams = new Map<string, { state: CardState & { dueAt: Date }; lastDue: Date }>();
  let duePulls = 0;
  let reviews = 0;

  for (const log of logs) {
    if (log.mode !== 'daily') continue; // cram/exam/learn reviews are demand, not schedule
    reviews++;
    const key = `${log.userId}:${log.cardId}`;
    let stream = streams.get(key);
    if (!stream) {
      const fresh = newCardState(algorithm);
      stream = { state: { ...fresh, dueAt: new Date(0) }, lastDue: new Date(0) };
      streams.set(key, stream);
    }
    const t = log.reviewedAt;
    if (stream.state.dueAt.getTime() <= t.getTime()) duePulls++;
    stream.state = scheduler.schedule(stream.state, log.rating as Rating, params, t);
    stream.lastDue = stream.state.dueAt;
  }

  let mastered = 0;
  let lapses = 0;
  let intervalSum = 0;
  for (const { state } of streams.values()) {
    if (state.stage === 'mastered') mastered++;
    lapses += state.lapses;
    intervalSum += state.intervalDays;
  }
  const cards = streams.size;
  return {
    algorithm,
    reviews,
    duePulls,
    cards,
    mastered,
    lapses,
    avgIntervalDays: cards ? Math.round((intervalSum / cards) * 10) / 10 : 0,
  };
}

async function main() {
  console.log(`Backtest window: last ${days} day(s)${userId ? `, user ${userId}` : ', all users'}`);
  console.log(`Algorithms: ${algorithms.join(', ')}`);
  const registered = new Set(listSchedulers().map((s) => s.name));
  for (const a of algorithms) {
    if (!registered.has(a)) {
      console.error(`✗ unknown algorithm "${a}" — registered: ${[...registered].join(', ')}`);
      process.exit(1);
    }
  }

  const logs = await loadLogs();
  const dailyLogs = logs.filter((l) => l.mode === 'daily');
  console.log(`review_logs in window: ${logs.length} (${dailyLogs.length} daily-mode)\n`);
  if (dailyLogs.length < 50) {
    console.log('Not enough history for a meaningful replay (<50 daily reviews). Widen --days.');
    process.exit(0);
  }

  const results = algorithms.map((a) => simulate(a, dailyLogs));
  const base = results[0];
  console.log(
    ['algorithm'.padEnd(12), 'duePulls'.padStart(9), 'reviews'.padStart(8), 'cards'.padStart(7), 'mastered'.padStart(9), 'lapses'.padStart(7), 'avgInt(d)'.padStart(10)].join(' '),
  );
  for (const r of results) {
    const delta = r === base ? '' : `  (${r.duePulls - base.duePulls >= 0 ? '+' : ''}${r.duePulls - base.duePulls} pulls vs ${base.algorithm})`;
    console.log(
      [
        r.algorithm.padEnd(12),
        String(r.duePulls).padStart(9),
        String(r.reviews).padStart(8),
        String(r.cards).padStart(7),
        `${r.mastered}/${r.cards}`.padStart(9),
        String(r.lapses).padStart(7),
        String(r.avgIntervalDays).padStart(10),
      ].join(' ') + delta,
    );
  }

  // Verdict against the incumbent (first algorithm listed = control).
  const winner = results
    .slice(1)
    .filter((r) => r.duePulls < base.duePulls && r.mastered >= base.mastered)
    .sort((a, b) => a.duePulls - b.duePulls)[0];
  console.log(
    winner
      ? `\nWINNER: ${winner.algorithm} — ${base.duePulls - winner.duePulls} fewer due pulls at equal-or-better mastery.`
      : '\nNo challenger beat the control on pulls-at-parity-mastery. Keep the incumbent.',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => closeDb());
