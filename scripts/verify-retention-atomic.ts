/* eslint-disable no-console */
// Concurrency check for #57 — atomic completion claims + delivery claiming.
// Run: DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres \
//   NODE_OPTIONS="--import ./scripts/register-stub-loader.mjs" npx tsx scripts/verify-retention-atomic.ts
import { and, eq, like } from 'drizzle-orm';
import { db } from '../src/db/client';
import {
  notificationDeliveries, notificationPrefs, notifications, streaks, userGoals, users, xpEvents,
} from '../src/db/schema';
import { listChallenges, listGoals, processRetentionReminders } from '../src/services/retention';

let failures = 0;
const check = (name: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failures++;
};

const tag = Date.now().toString(36);
const mkUser = async (suffix: string) =>
  db.insert(users).values({
    id: crypto.randomUUID(),
    email: `atomic57-${tag}-${suffix}@test.local`,
    name: `A57 ${suffix}`, passwordHash: 'x', role: 'teacher', status: 'active', dateOfBirth: '1990-01-01',
  }).returning().then((r) => r[0]);

async function main() {
  // ── 1. listGoals: concurrent GETs must award goal XP exactly once ──────
  const goalUser = await mkUser('goal');
  const goalId = crypto.randomUUID();
  try {
    await db.insert(xpEvents).values({ id: crypto.randomUUID(), userId: goalUser.id, amount: 5, source: 'review' });
    await db.insert(userGoals).values({ id: goalId, userId: goalUser.id, kind: 'xp', title: 'Earn XP', target: 1 });

    await Promise.all(Array.from({ length: 6 }, () => listGoals(goalUser.id)));
    const awards = await db.select().from(xpEvents).where(and(eq(xpEvents.userId, goalUser.id), like(xpEvents.refId, `goal:${goalId}`)));
    const notes = await db.select().from(notifications).where(and(eq(notifications.userId, goalUser.id), eq(notifications.kind, 'goal')));
    check('concurrent listGoals: exactly one XP award', awards.length === 1, `${awards.length} awards`);
    check('concurrent listGoals: exactly one notification', notes.length === 1, `${notes.length} notifications`);

    // A later read must not re-award either.
    await listGoals(goalUser.id);
    const awards2 = await db.select().from(xpEvents).where(and(eq(xpEvents.userId, goalUser.id), like(xpEvents.refId, `goal:${goalId}`)));
    check('subsequent listGoals: still exactly one award', awards2.length === 1, `${awards2.length} awards`);
  } finally {
    await db.delete(userGoals).where(eq(userGoals.userId, goalUser.id));
    await db.delete(xpEvents).where(eq(xpEvents.userId, goalUser.id));
    await db.delete(notifications).where(eq(notifications.userId, goalUser.id));
    await db.delete(users).where(eq(users.id, goalUser.id));
  }

  // ── 2. listChallenges: concurrent GETs must award challenge XP once ────
  const chUser = await mkUser('ch');
  try {
    await db.insert(streaks).values({ userId: chUser.id, current: 7, best: 7 });
    await Promise.all(Array.from({ length: 6 }, () => listChallenges(chUser.id)));
    const monday = (() => {
      const d = new Date(); const day = d.getUTCDay(); const back = (day + 6) % 7;
      return new Date(d.getTime() - back * 86_400_000).toISOString().slice(0, 10);
    })();
    const awards = await db.select().from(xpEvents).where(and(eq(xpEvents.userId, chUser.id), like(xpEvents.refId, `weekly-streak-7:${monday}`)));
    const notes = await db.select().from(notifications).where(and(eq(notifications.userId, chUser.id), eq(notifications.kind, 'challenge')));
    check('concurrent listChallenges: exactly one XP award', awards.length === 1, `${awards.length} awards`);
    check('concurrent listChallenges: exactly one notification', notes.length === 1, `${notes.length} notifications`);
  } finally {
    await db.delete(streaks).where(eq(streaks.userId, chUser.id));
    await db.delete(xpEvents).where(eq(xpEvents.userId, chUser.id));
    await db.delete(notifications).where(eq(notifications.userId, chUser.id));
    await db.delete(users).where(eq(users.id, chUser.id));
  }

  // ── 3. claimDelivery via processRetentionReminders: overlapping runs ───
  const remUser = await mkUser('rem');
  const now = new Date();
  const localTime = now.toISOString().slice(11, 16);
  try {
    await db.insert(streaks).values({ userId: remUser.id, current: 5, best: 5 });
    await db.insert(notificationPrefs).values({
      userId: remUser.id, enabled: true, localTime, timezone: 'UTC', channel: 'in_app',
      triggers: { streakRisk: true, dueCards: false, seasonEnding: false, achievement: false, weeklyRecap: false, leagueEnding: false, examCountdown: false },
    });
    await db.update(users).set({ consent: { version: 1, choices: { notifications: true } } }).where(eq(users.id, remUser.id));

    await Promise.all(Array.from({ length: 4 }, () => processRetentionReminders(now, 50)));
    const deliveries = await db.select().from(notificationDeliveries).where(and(eq(notificationDeliveries.userId, remUser.id), eq(notificationDeliveries.kind, 'streak_risk')));
    const notes = await db.select().from(notifications).where(and(eq(notifications.userId, remUser.id), eq(notifications.kind, 'streak_risk')));
    check('overlapping cron runs: exactly one delivery row', deliveries.length === 1, `${deliveries.length} rows`);
    check('delivery marked sent', deliveries[0]?.status === 'sent', deliveries[0]?.status);
    check('overlapping cron runs: exactly one notification', notes.length === 1, `${notes.length} notifications`);

    // A second cron pass must not resend.
    await processRetentionReminders(now, 50);
    const deliveries2 = await db.select().from(notificationDeliveries).where(and(eq(notificationDeliveries.userId, remUser.id), eq(notificationDeliveries.kind, 'streak_risk')));
    const notes2 = await db.select().from(notifications).where(and(eq(notifications.userId, remUser.id), eq(notifications.kind, 'streak_risk')));
    check('next cron pass: no duplicate delivery', deliveries2.length === 1, `${deliveries2.length} rows`);
    check('next cron pass: no duplicate notification', notes2.length === 1, `${notes2.length} notifications`);
  } finally {
    await db.delete(notificationDeliveries).where(eq(notificationDeliveries.userId, remUser.id));
    await db.delete(notificationPrefs).where(eq(notificationPrefs.userId, remUser.id));
    await db.delete(streaks).where(eq(streaks.userId, remUser.id));
    await db.delete(notifications).where(eq(notifications.userId, remUser.id));
    await db.delete(users).where(eq(users.id, remUser.id));
  }

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
