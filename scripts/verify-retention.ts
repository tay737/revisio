/**
 * Proves the retention reminder triggers (#11/#17 punch list) end-to-end
 * against the primary DB with fixture users — same receipt style as
 * verify:ai-drafts. Every row it creates is removed at the end.
 *
 *   achievement  → candidate + once-ever dedupe per achievement id
 *   channel      → in_app delivers in-app only; email delivers; legacy 'push'
 *                  prefs fall back to in-app; updateNotificationPrefs rejects
 *                  'push' and accepts 'email'/'in_app'
 *   streak_risk  → standalone when live streak + no review today + no
 *                  due_cards candidate; suppressed when due_cards fires
 *   league_ending→ only with a current-week membership, dedupe per week
 *   exam_countdown → nearest active plan inside 7d only; suppressed when
 *                  topicsRemaining === 0; dedupe per plan+daysLeft
 *   weeklyRecap  → in_app users get the recap notification once and no
 *                  ':email' delivery; email users get both
 *   under-13 (#36) → stored social consent cannot grant social: PATCH
 *                  /consent refuses the grant, overview/board hide social,
 *                  send/accept 403, decline stays allowed, DOB-less
 *                  accounts unaffected
 *
 * Run against a LOCAL test DB, never prod:
 *   DATABASE_URL=postgres://localhost:5432/revisio_verify \
 *     npm run verify:retention
 */
import 'dotenv/config';

import { eq, or } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { db, closeDb } from '../src/db/client';
import {
  achievements, cardUserStates, cards, examPlans, leagueMemberships,
  notificationDeliveries, notificationPrefs, notifications, streaks,
  studyConnections, subjects, topics, userAchievements, users,
} from '../src/db/schema';
import {
  friendBoard, getSocialOverview, processRetentionReminders,
  respondConnection, sendConnection, updateNotificationPrefs,
} from '../src/services/retention';
import { weekBounds } from '../src/domain/ranked';
import { socialPairKey } from '../src/domain/retention';
import { signAccessToken } from '../src/services/auth';
import { PATCH as patchConsent } from '../src/app/api/v1/consent/route';
import { ApiError } from '../src/services/api';

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures += 1;
}

const MARK = `retention-verify-${Date.now().toString(36)}`;
const ALL_OFF = { dueCards: false, streakRisk: false, seasonEnding: false, achievement: false, weeklyRecap: false, leagueEnding: false, examCountdown: false } as Record<string, boolean>;
const triggers = (on: Record<string, boolean>) => ({ ...ALL_OFF, ...on }) as Record<string, boolean>;

// Send window: localTime '18:00' UTC, now = 18:07 UTC on the given date.
function atUtc(date: Date, hour = 18, minute = 7) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, minute));
}
const TODAY = new Date();
const NOW = atUtc(TODAY);
const isoDay = (offset: number) => new Date(NOW.getTime() + offset * 86_400_000).toISOString().slice(0, 10);

async function seedUser(tag: string, opts: { channel: string; triggers: Record<string, boolean>; user?: Record<string, unknown>; consent?: Record<string, unknown> }) {
  const id = `${MARK}-${tag}`;
  await db.insert(users).values({
    id,
    email: `${id}@verify.invalid`,
    name: `Verify ${tag}`,
    passwordHash: 'verify',
    status: 'active',
    consent: opts.consent ?? { version: 1, choices: { notifications: true } },
    ...opts.user,
  });
  await db.insert(notificationPrefs).values({
    userId: id, enabled: true, localTime: '18:00', timezone: 'UTC',
    triggers: opts.triggers, channel: opts.channel as 'email' | 'in_app' | 'push',
  });
  return id;
}

const deliveries = (userId: string) =>
  db.select().from(notificationDeliveries).where(eq(notificationDeliveries.userId, userId));
const notices = (userId: string) =>
  db.select().from(notifications).where(eq(notifications.userId, userId));

const fixtureUserIds: string[] = [];
const fixtureContentIds = { subject: '', topic: '', card: '', achievement: '' };

try {
  // ── shared content fixture: one public card that can be "due" ──────────
  fixtureContentIds.subject = `${MARK}-subj`;
  fixtureContentIds.topic = `${MARK}-topic`;
  fixtureContentIds.card = `${MARK}-card`;
  await db.insert(subjects).values({ id: fixtureContentIds.subject, name: MARK, slug: MARK });
  await db.insert(topics).values({
    id: fixtureContentIds.topic, subjectId: fixtureContentIds.subject,
    name: MARK, slug: MARK, visibility: 'public',
  });
  await db.insert(cards).values({
    id: fixtureContentIds.card, topicId: fixtureContentIds.topic,
    kind: 'flashcard', prompt: 'verify prompt', visibility: 'public',
  });
  const dueState = (userId: string) =>
    db.insert(cardUserStates).values({
      userId, cardId: fixtureContentIds.card, stage: 'review',
      dueAt: new Date(Date.now() - 86_400_000),
    });

  // ── 1. achievement trigger + once-ever dedupe ───────────────────────────
  fixtureContentIds.achievement = `${MARK}-ach`;
  await db.insert(achievements).values({
    id: fixtureContentIds.achievement, name: 'Verify Achievement',
    description: 'Fixture description.', icon: 'x', rule: { kind: 'manual' },
  });
  const achUser = await seedUser('ach', { channel: 'email', triggers: triggers({ achievement: true }) });
  fixtureUserIds.push(achUser);
  await db.insert(userAchievements).values({
    userId: achUser, achievementId: fixtureContentIds.achievement,
    unlockedAt: new Date(Date.now() - 3_600_000),
  });

  await processRetentionReminders(NOW);
  let d = await deliveries(achUser);
  const achDelivery = d.find((r) => r.kind === 'achievement');
  check('achievement delivery sent', achDelivery?.status === 'sent', achDelivery?.dedupeKey ?? 'none');
  check('achievement dedupe key', achDelivery?.dedupeKey === `achievement:${fixtureContentIds.achievement}`);
  const achNotice = (await notices(achUser)).find((n) => n.kind === 'achievement');
  check('achievement in-app copy', achNotice?.title === 'Achievement unlocked: Verify Achievement', achNotice?.title ?? 'none');

  await processRetentionReminders(NOW);
  d = await deliveries(achUser);
  check('achievement dedupe blocks resend', d.filter((r) => r.kind === 'achievement').length === 1);

  // ── 2. channel honored ──────────────────────────────────────────────────
  const inAppUser = await seedUser('inapp', { channel: 'in_app', triggers: triggers({ dueCards: true }) });
  const emailUser = await seedUser('email', { channel: 'email', triggers: triggers({ dueCards: true }) });
  const pushUser = await seedUser('push', { channel: 'push', triggers: triggers({ dueCards: true }) });
  fixtureUserIds.push(inAppUser, emailUser, pushUser);
  for (const u of [inAppUser, emailUser, pushUser]) await dueState(u);

  await processRetentionReminders(NOW);

  const inAppD = (await deliveries(inAppUser)).find((r) => r.kind === 'due_cards');
  check('in_app delivery recorded', inAppD?.status === 'sent' && inAppD.channel === 'in_app');
  check('in_app produced notification', (await notices(inAppUser)).some((n) => n.kind === 'due_cards'));
  check('in_app sent no email-channel delivery', !(await deliveries(inAppUser)).some((r) => r.channel === 'email'));

  const emailD = (await deliveries(emailUser)).find((r) => r.kind === 'due_cards');
  check('email delivery recorded', emailD?.status === 'sent' && emailD.channel === 'email');
  check('email produced notification', (await notices(emailUser)).some((n) => n.kind === 'due_cards'));

  const pushD = (await deliveries(pushUser)).find((r) => r.kind === 'due_cards');
  check('legacy push falls back in-app', pushD?.status === 'sent' && pushD.channel === 'push');
  check('legacy push produced notification', (await notices(pushUser)).some((n) => n.kind === 'due_cards'));
  check('legacy push sent no email', !(await deliveries(pushUser)).some((r) => r.channel === 'email'));

  // updateNotificationPrefs: push rejected, email + in_app accepted
  const prefUser = await seedUser('prefs', { channel: 'email', triggers: ALL_OFF });
  fixtureUserIds.push(prefUser);
  let pushRejected = false;
  try {
    await updateNotificationPrefs(prefUser, { channel: 'push' });
  } catch (e) {
    pushRejected = e instanceof ApiError && e.status === 400;
  }
  check('prefs rejects push', pushRejected);
  const inAppPrefs = await updateNotificationPrefs(prefUser, { channel: 'in_app' });
  check('prefs accepts in_app', inAppPrefs.prefs.channel === 'in_app');
  const emailPrefs = await updateNotificationPrefs(prefUser, { channel: 'email' });
  check('prefs accepts email', emailPrefs.prefs.channel === 'email');

  // ── 3. streak_risk standalone vs suppressed ─────────────────────────────
  const riskUser = await seedUser('risk', { channel: 'in_app', triggers: triggers({ streakRisk: true }) });
  const bothUser = await seedUser('both', { channel: 'in_app', triggers: triggers({ dueCards: true, streakRisk: true }) });
  fixtureUserIds.push(riskUser, bothUser);
  const yesterday = isoDay(-1);
  for (const u of [riskUser, bothUser]) {
    await db.insert(streaks).values({ userId: u, current: 5, best: 5, lastActiveDate: yesterday, freezes: 0 });
  }
  await dueState(bothUser); // riskUser deliberately has an empty queue

  await processRetentionReminders(NOW);

  const riskD = await deliveries(riskUser);
  check('streak_risk fires standalone', riskD.some((r) => r.kind === 'streak_risk' && r.status === 'sent'));
  check('streak_risk in-app copy', (await notices(riskUser)).some((n) => n.kind === 'streak_risk' && n.title === 'Your streak is still alive'));

  const bothD = await deliveries(bothUser);
  check('due_cards fires for due user', bothD.some((r) => r.kind === 'due_cards' && r.status === 'sent'));
  check('streak_risk suppressed when due_cards sent', !bothD.some((r) => r.kind === 'streak_risk'));
  const bothStreakNotice = (await notices(bothUser)).find((n) => n.kind === 'due_cards');
  check('due_cards streak variant copy', !!bothStreakNotice?.body.includes('streak'), bothStreakNotice?.body ?? 'none');

  // ── 4. league_ending: membership-gated, dedupe per week ─────────────────
  // Saturday of the CURRENT UTC lobby week → daysLeft = 2. (Adding days to
  // NOW directly can land on next week's Saturday when today is Sunday.)
  const dowMon = (NOW.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  const sat = new Date(NOW.getTime() - dowMon * 86_400_000 + 5 * 86_400_000);
  const leagueNow = atUtc(sat);
  const week = weekBounds(leagueNow);
  const leagueUser = await seedUser('league', { channel: 'in_app', triggers: triggers({ leagueEnding: true }) });
  const noLeagueUser = await seedUser('noleague', { channel: 'in_app', triggers: triggers({ leagueEnding: true }) });
  fixtureUserIds.push(leagueUser, noLeagueUser);
  await db.insert(leagueMemberships).values({ userId: leagueUser, league: 'bronze', weekStart: week.weekStart, xpWeek: 10 });

  await processRetentionReminders(leagueNow);
  const leagueD = await deliveries(leagueUser);
  const leagueRow = leagueD.find((r) => r.kind === 'league_ending');
  check('league_ending fires with membership', leagueRow?.status === 'sent');
  check('league_ending dedupe per week', leagueRow?.dedupeKey === `league_ending:${week.weekStart}`);
  check('league_ending gated on membership', !(await deliveries(noLeagueUser)).some((r) => r.kind === 'league_ending'));

  await processRetentionReminders(leagueNow);
  check('league_ending dedupe blocks resend', (await deliveries(leagueUser)).filter((r) => r.kind === 'league_ending').length === 1);

  // ── 5. exam_countdown: nearest plan only, suppression, dedupe ───────────
  const examUser = await seedUser('exam', { channel: 'in_app', triggers: triggers({ examCountdown: true }) });
  fixtureUserIds.push(examUser);
  const nearPlan = `${MARK}-plan-near`;
  const farPlan = `${MARK}-plan-far`;
  const emptyPlan = `${MARK}-plan-empty`;
  await db.insert(examPlans).values([
    { id: nearPlan, userId: examUser, title: 'Near Exam', examDate: isoDay(3), topicIds: [fixtureContentIds.topic], dailyTarget: 10, status: 'active' },
    { id: farPlan, userId: examUser, title: 'Far Exam', examDate: isoDay(5), topicIds: [fixtureContentIds.topic], dailyTarget: 10, status: 'active' },
    { id: emptyPlan, userId: examUser, title: 'Empty Exam', examDate: isoDay(2), topicIds: [], subjectId: null, dailyTarget: 10, status: 'active' },
  ]);

  // The empty-scope plan is nearest (day 2) but has topicsRemaining === 0 —
  // it must be suppressed AND must not shadow the real nearest plan... except
  // the dispatcher only evaluates the single nearest row. So this user proves
  // suppression; a second user proves nearest-of-multiple.
  await processRetentionReminders(NOW);
  const examD = await deliveries(examUser);
  const examRows = examD.filter((r) => r.kind === 'exam_countdown');
  check('exam_countdown suppressed for finished plan', examRows.length === 0, `${examRows.length} deliveries`);

  const examUser2 = await seedUser('exam2', { channel: 'in_app', triggers: triggers({ examCountdown: true }) });
  fixtureUserIds.push(examUser2);
  const near2 = `${MARK}-plan2-near`;
  const far2 = `${MARK}-plan2-far`;
  await db.insert(examPlans).values([
    { id: near2, userId: examUser2, title: 'Chemistry Mock', examDate: isoDay(3), topicIds: [fixtureContentIds.topic], dailyTarget: 10, status: 'active' },
    { id: far2, userId: examUser2, title: 'Physics Mock', examDate: isoDay(5), topicIds: [fixtureContentIds.topic], dailyTarget: 10, status: 'active' },
  ]);
  await processRetentionReminders(NOW);
  const examD2 = (await deliveries(examUser2)).filter((r) => r.kind === 'exam_countdown');
  check('exam_countdown fires once for nearest plan', examD2.length === 1, `${examD2.length} deliveries`);
  check('exam_countdown picks nearest', examD2[0]?.dedupeKey === `exam_countdown:${near2}:3`, examD2[0]?.dedupeKey ?? 'none');
  check('exam_countdown in-app title', (await notices(examUser2)).some((n) => n.kind === 'exam_countdown' && n.title.includes('Chemistry Mock')));

  await processRetentionReminders(NOW);
  check('exam_countdown dedupe blocks resend', (await deliveries(examUser2)).filter((r) => r.kind === 'exam_countdown').length === 1);

  // ── 6. weeklyRecap: no double delivery for in_app ───────────────────────
  // Monday 18:07 UTC of the current week (today itself when it is Monday).
  const mondayNow = new Date(NOW.getTime() - dowMon * 86_400_000);
  const mondayNowFixed = atUtc(mondayNow);

  const recapInApp = await seedUser('recap-inapp', { channel: 'in_app', triggers: triggers({ weeklyRecap: true }) });
  const recapEmail = await seedUser('recap-email', { channel: 'email', triggers: triggers({ weeklyRecap: true }) });
  fixtureUserIds.push(recapInApp, recapEmail);

  await processRetentionReminders(mondayNowFixed);

  const inAppRecapNotices = (await notices(recapInApp));
  check('in_app recap notification once', inAppRecapNotices.filter((n) => n.kind === 'recap').length === 1);
  check('in_app recap no weekly_recap notice', !inAppRecapNotices.some((n) => n.kind === 'weekly_recap'));
  const inAppRecapD = await deliveries(recapInApp);
  check('in_app recap no :email delivery', !inAppRecapD.some((r) => r.dedupeKey.endsWith(':email')));
  check('in_app recap :app delivery sent', inAppRecapD.some((r) => r.dedupeKey.endsWith(':app') && r.status === 'sent'));

  const emailRecapNotices = (await notices(recapEmail));
  check('email recap gets recap notice', emailRecapNotices.some((n) => n.kind === 'recap'));
  check('email recap gets weekly_recap notice', emailRecapNotices.some((n) => n.kind === 'weekly_recap'));
  const emailRecapD = await deliveries(recapEmail);
  check('email recap :email delivery sent', emailRecapD.some((r) => r.dedupeKey.endsWith(':email') && r.status === 'sent' && r.channel === 'email'));

  // ── 7. #36 under-13 social enforcement ──────────────────────────────────
  // u13 holds a consent blob that already says social:true — enforcement must
  // override stored state, not just refuse new grants.
  const u13 = await seedUser('u13', {
    channel: 'in_app', triggers: ALL_OFF,
    user: { dateOfBirth: '2015-06-01', ageConsent: true },
    consent: { version: 1, choices: { social: true, notifications: true } },
  });
  const adult = await seedUser('adult', {
    channel: 'in_app', triggers: ALL_OFF,
    consent: { version: 1, choices: { social: true, notifications: true } },
  });
  const target = await seedUser('target', {
    channel: 'in_app', triggers: ALL_OFF,
    consent: { version: 1, choices: { social: true, notifications: true } },
  });
  fixtureUserIds.push(u13, adult, target);

  const patchSocial = async (userId: string, choices: Record<string, boolean>) => {
    const token = await signAccessToken({ id: userId, email: `${userId}@verify.invalid`, role: 'student', totpEnabled: false });
    const req = new NextRequest('http://verify.local/api/v1/consent', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ choices }),
    });
    return patchConsent(req, { params: {} });
  };

  const u13Patch = await patchSocial(u13, { social: true });
  const u13PatchBody = (await u13Patch.json().catch(() => null)) as { error?: { code?: string } } | null;
  check('u13 PATCH social grant refused', u13Patch.status === 403);
  check('u13 PATCH error code', u13PatchBody?.error?.code === 'social_underage', u13PatchBody?.error?.code ?? 'none');

  const u13Overview = await getSocialOverview(u13);
  check('u13 overview hides social despite stored consent', u13Overview.consentSocial === false && u13Overview.connections.length === 0);
  check('u13 friend board empty', (await friendBoard(u13)).length === 0);

  let u13SendStatus = 0;
  try { await sendConnection(u13, { userId: target }); } catch (e) { u13SendStatus = e instanceof ApiError ? e.status : -1; }
  check('u13 sendConnection 403', u13SendStatus === 403, `status ${u13SendStatus}`);

  const connAccept = `${MARK}-conn-accept`;
  const connDecline = `${MARK}-conn-decline`;
  await db.insert(studyConnections).values([
    { id: connAccept, pairKey: socialPairKey(target, u13), requesterId: target, addresseeId: u13, kind: 'buddy', status: 'pending' },
    { id: connDecline, pairKey: `${MARK}-pair2`, requesterId: target, addresseeId: u13, kind: 'buddy', status: 'pending' },
  ]);
  let u13AcceptStatus = 0;
  try { await respondConnection(u13, connAccept, 'accept'); } catch (e) { u13AcceptStatus = e instanceof ApiError ? e.status : -1; }
  check('u13 connection accept 403', u13AcceptStatus === 403, `status ${u13AcceptStatus}`);
  let u13DeclineOk = true;
  try { await respondConnection(u13, connDecline, 'decline'); } catch { u13DeclineOk = false; }
  check('u13 decline stays consent-exempt', u13DeclineOk);

  const adultPatch = await patchSocial(adult, { social: true });
  check('DOB-less PATCH social allowed', adultPatch.status === 200, `status ${adultPatch.status}`);
  check('DOB-less overview shows consent', (await getSocialOverview(adult)).consentSocial === true);
  const adultSend = await sendConnection(adult, { userId: target });
  check('DOB-less sendConnection works', adultSend.status === 'pending', adultSend.status ?? 'none');
} finally {
  // ── cleanup: every fixture row, children first ──────────────────────────
  for (const u of fixtureUserIds) {
    await db.delete(studyConnections).where(or(eq(studyConnections.requesterId, u), eq(studyConnections.addresseeId, u)));
    await db.delete(notificationDeliveries).where(eq(notificationDeliveries.userId, u));
    await db.delete(notifications).where(eq(notifications.userId, u));
    await db.delete(examPlans).where(eq(examPlans.userId, u));
    await db.delete(leagueMemberships).where(eq(leagueMemberships.userId, u));
    await db.delete(streaks).where(eq(streaks.userId, u));
    await db.delete(cardUserStates).where(eq(cardUserStates.userId, u));
    await db.delete(notificationPrefs).where(eq(notificationPrefs.userId, u));
    await db.delete(userAchievements).where(eq(userAchievements.userId, u));
    await db.delete(users).where(eq(users.id, u));
  }
  if (fixtureContentIds.card) await db.delete(cards).where(eq(cards.id, fixtureContentIds.card));
  if (fixtureContentIds.topic) await db.delete(topics).where(eq(topics.id, fixtureContentIds.topic));
  if (fixtureContentIds.subject) await db.delete(subjects).where(eq(subjects.id, fixtureContentIds.subject));
  if (fixtureContentIds.achievement) await db.delete(achievements).where(eq(achievements.id, fixtureContentIds.achievement));
  console.log('cleanup: all fixture rows removed');
}

await closeDb();
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
