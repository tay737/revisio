import 'server-only';
import { and, desc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  cards, cardUserStates, examAttempts, examPlans, guardianLinks,
  notificationDeliveries, notificationPrefs, notifications, reviewLogs, seasons,
  streakEvents, streaks, studyConnections, topics, userChallenges, userGoals,
  users, xpEvents,
} from '@/db/schema';
import {
  CHALLENGES, REMINDER_TRIGGERS, challengePeriodStart, daysUntil,
  isValidTimeZone, planPace, reminderDedupeKey, reminderWindowOpen,
  socialPairKey, type ChallengeDef, type ChallengeMetric, type ReminderPrefs,
  type StreakEventKind, type StreakState,
} from '@/domain/retention';
import { consentFromBlob } from '@/lib/consent';
import { sendRetentionEmail } from '@/services/email';
import { enrolledSubjectIds, studiableCard, studiableCardIn } from '@/services/visibility';
import { seasonAt, seasonConfigs } from '@/domain/seasons';
import { ApiError } from '@/services/api';

// ── shared helpers ──────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isDate(value: unknown): value is string {
  return typeof value === 'string' && DATE_RE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function isHHMM(value: unknown): value is string {
  return typeof value === 'string' && HHMM_RE.test(value);
}

function consentChoices(consent: unknown) {
  return consentFromBlob(consent).choices;
}

async function requireActiveUser(userId: string) {
  const [row] = await db.select({ id: users.id, status: users.status }).from(users).where(eq(users.id, userId)).limit(1);
  if (!row || row.status !== 'active') throw new ApiError(403, 'forbidden', 'Account not active.');
  return row;
}

async function publicUser(userId: string) {
  const [row] = await db
    .select({ id: users.id, name: users.name, username: users.username, avatarColor: users.avatarColor, bannerColor: users.bannerColor, leaderboardOptOut: users.leaderboardOptOut })
    .from(users).where(eq(users.id, userId)).limit(1);
  return row ?? null;
}

// ── streak protection (#12) ─────────────────────────────────────────────────

export async function getStreakSummary(userId: string) {
  const [[row], events] = await Promise.all([
    db.select().from(streaks).where(eq(streaks.userId, userId)).limit(1),
    db.select().from(streakEvents).where(eq(streakEvents.userId, userId)).orderBy(desc(streakEvents.occurredAt)).limit(25),
  ]);
  const state: StreakState = {
    current: row?.current ?? 0,
    best: row?.best ?? 0,
    lastActiveDate: row?.lastActiveDate ?? null,
    freezes: row?.freezes ?? 0,
  };
  const comeback = events.find((e) => e.kind === 'comeback');
  return {
    ...state,
    events: events.map((e) => ({
      id: e.id, kind: e.kind, streakBefore: e.streakBefore, streakAfter: e.streakAfter,
      meta: e.meta ?? null, occurredAt: e.occurredAt.toISOString(),
    })),
    lastComeback: comeback
      ? { previousStreak: comeback.streakBefore, occurredAt: comeback.occurredAt.toISOString() }
      : null,
    freezeEveryDays: 7,
    maxFreezes: 3,
  };
}

/** Insert streak history rows produced by `nextStreakState`. */
export async function recordStreakEvents(userId: string, events: { kind: StreakEventKind; streakBefore: number; streakAfter: number; meta?: Record<string, unknown> }[]) {
  if (events.length === 0) return;
  await db.insert(streakEvents).values(events.map((e) => ({
    id: crypto.randomUUID(), userId, kind: e.kind,
    streakBefore: e.streakBefore, streakAfter: e.streakAfter, meta: e.meta ?? null,
  })));
}

// ── notifications (#11) ─────────────────────────────────────────────────────

export const DEFAULT_NOTIFICATION_PREFS = {
  enabled: false,
  localTime: '18:00',
  timezone: 'UTC',
  quietStart: null as string | null,
  quietEnd: null as string | null,
  triggers: { dueCards: true, streakRisk: true, seasonEnding: true, achievement: true } as Record<string, boolean>,
  channel: 'email' as const,
};

export async function getNotificationPrefs(userId: string) {
  const [[row], [user]] = await Promise.all([
    db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, userId)).limit(1),
    db.select({ email: users.email, consent: users.consent }).from(users).where(eq(users.id, userId)).limit(1),
  ]);
  const prefs = row ?? { userId, ...DEFAULT_NOTIFICATION_PREFS, updatedAt: new Date() };
  return {
    prefs: {
      enabled: prefs.enabled,
      localTime: prefs.localTime,
      timezone: prefs.timezone,
      quietStart: prefs.quietStart,
      quietEnd: prefs.quietEnd,
      triggers: { ...DEFAULT_NOTIFICATION_PREFS.triggers, ...(prefs.triggers ?? {}) },
      channel: prefs.channel,
      updatedAt: 'updatedAt' in prefs && prefs.updatedAt ? prefs.updatedAt.toISOString() : null,
    },
    email: user?.email ?? null,
    consentNotifications: consentChoices(user?.consent).notifications,
  };
}

export async function updateNotificationPrefs(userId: string, input: Record<string, unknown>) {
  await requireActiveUser(userId);
  const current = (await getNotificationPrefs(userId)).prefs;
  const next: ReminderPrefs & { quietStart: string | null; quietEnd: string | null; channel: string } = {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : current.enabled,
    localTime: typeof input.localTime === 'string' ? input.localTime : current.localTime,
    timezone: typeof input.timezone === 'string' ? input.timezone : current.timezone,
    quietStart: input.quietStart === null || input.quietStart === undefined ? current.quietStart : String(input.quietStart),
    quietEnd: input.quietEnd === null || input.quietEnd === undefined ? current.quietEnd : String(input.quietEnd),
    triggers: { ...current.triggers, ...((input.triggers as Record<string, boolean>) ?? {}) },
    channel: typeof input.channel === 'string' ? input.channel : current.channel,
  };
  if (!isHHMM(next.localTime)) throw new ApiError(400, 'bad_request', 'localTime must be HH:mm.');
  if (!isValidTimeZone(next.timezone)) throw new ApiError(400, 'bad_request', 'timezone must be a valid IANA timezone.');
  if (next.quietStart !== null && !isHHMM(next.quietStart)) throw new ApiError(400, 'bad_request', 'quietStart must be HH:mm.');
  if (next.quietEnd !== null && !isHHMM(next.quietEnd)) throw new ApiError(400, 'bad_request', 'quietEnd must be HH:mm.');
  const triggers = { ...(next.triggers ?? {}) };
  for (const key of Object.keys(triggers)) {
    if (!(REMINDER_TRIGGERS as string[]).includes(key)) delete triggers[key];
  }
  if (!['email', 'push', 'in_app'].includes(next.channel)) throw new ApiError(400, 'bad_request', 'channel must be email, push or in_app.');
  const channel = next.channel as 'email' | 'push' | 'in_app';
  // Enabling reminders also requires the notifications consent purpose; the
  // settings UI sets both, but the API refuses to half-enable.
  if (next.enabled) {
    const [user] = await db.select({ consent: users.consent }).from(users).where(eq(users.id, userId)).limit(1);
    if (!consentChoices(user?.consent).notifications) {
      throw new ApiError(409, 'conflict', 'Notification consent is required before reminders can be enabled.');
    }
  }
  await db.insert(notificationPrefs).values({
    userId, enabled: next.enabled, localTime: next.localTime, timezone: next.timezone,
    quietStart: next.quietStart, quietEnd: next.quietEnd, triggers,
    channel, updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: notificationPrefs.userId,
    set: { enabled: next.enabled, localTime: next.localTime, timezone: next.timezone, quietStart: next.quietStart, quietEnd: next.quietEnd, triggers, channel, updatedAt: new Date() },
  });
  return getNotificationPrefs(userId);
}

export async function listNotifications(userId: string, limit = 30) {
  const rows = await db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(Math.min(limit, 100));
  const unread = rows.filter((r) => !r.readAt).length;
  return {
    notifications: rows.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, href: n.href, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() })),
    unread,
  };
}

export async function markNotificationsRead(userId: string, ids?: string[]) {
  const now = new Date();
  if (ids && ids.length > 0) {
    await db.update(notifications).set({ readAt: now }).where(and(eq(notifications.userId, userId), inArray(notifications.id, ids), isNull(notifications.readAt)));
  } else {
    await db.update(notifications).set({ readAt: now }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  }
  return listNotifications(userId);
}

/** Insert an in-app notification; used by reviews, challenges, goals, social. */
export async function recordNotification(userId: string, input: { kind: string; title: string; body?: string; href?: string }) {
  const id = crypto.randomUUID();
  await db.insert(notifications).values({ id, userId, kind: input.kind, title: input.title, body: input.body ?? '', href: input.href ?? '/dashboard' });
  return { id, kind: input.kind, title: input.title, body: input.body ?? '', href: input.href ?? '/dashboard', readAt: null, createdAt: new Date().toISOString() };
}

async function waitingCount(userId: string) {
  const enrolled = await enrolledSubjectIds(userId);
  const [dueRow, newRow, reviewRow] = await Promise.all([
    db.select({ c: sql<number>`count(*)::int` }).from(cardUserStates).where(and(eq(cardUserStates.userId, userId), sql`${cardUserStates.dueAt} <= now()`)),
    db.select({ c: sql<number>`count(*)::int` })
      .from(cards).innerJoin(topics, eq(cards.topicId, topics.id))
      .leftJoin(cardUserStates, and(eq(cardUserStates.cardId, cards.id), eq(cardUserStates.userId, userId)))
      .where(and(studiableCard(userId, enrolled), isNull(cardUserStates.cardId))),
    db.select({ c: sql<number>`count(*)::int` }).from(reviewLogs).where(and(eq(reviewLogs.userId, userId), gte(reviewLogs.reviewedAt, startOfToday()))),
  ]);
  return { due: dueRow[0]?.c ?? 0, fresh: newRow[0]?.c ?? 0, total: (dueRow[0]?.c ?? 0) + (newRow[0]?.c ?? 0), reviewedToday: reviewRow[0]?.c ?? 0 };
}

function startOfToday(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function currentSeason(now: Date) {
  const rows = await db.select().from(seasons);
  const configs = seasonConfigs(rows);
  return configs.length ? seasonAt(configs, now) : null;
}

/**
 * Scheduler entrypoint. Intended to be called by `/api/v1/cron/retention` on a
 * short interval (GitHub Actions every 10–15 min). For each opted-in learner
 * whose local send window is open, it sends at most the due-cards reminder and
 * a once-per-season countdown — both privacy-safe, both deduped per local day.
 */
export async function processRetentionReminders(now = new Date(), limit = 200) {
  const rows = await db
    .select({ user: users, prefs: notificationPrefs })
    .from(notificationPrefs)
    .innerJoin(users, eq(users.id, notificationPrefs.userId))
    .where(and(eq(notificationPrefs.enabled, true), eq(users.status, 'active')))
    .limit(Math.min(limit, 500));

  let attempted = 0, sent = 0, suppressed = 0, failed = 0;
  for (const { user, prefs } of rows) {
    if (!user.email) { suppressed++; continue; }
    if (!consentChoices(user.consent).notifications) { suppressed++; continue; }
    const reminderPrefs: ReminderPrefs = {
      enabled: prefs.enabled, localTime: prefs.localTime, timezone: prefs.timezone,
      quietStart: prefs.quietStart, quietEnd: prefs.quietEnd,
      triggers: { ...DEFAULT_NOTIFICATION_PREFS.triggers, ...(prefs.triggers ?? {}) },
    };
    if (!reminderWindowOpen(reminderPrefs, now)) { suppressed++; continue; }

    const candidates: { kind: string; title: string; body: string; href: string; dedupe: string }[] = [];
    const triggers = reminderPrefs.triggers ?? {};

    if (triggers.dueCards !== false || triggers.streakRisk !== false) {
      const w = await waitingCount(user.id);
      if (w.total > 0) {
        const [streakRow] = await db.select({ current: streaks.current }).from(streaks).where(eq(streaks.userId, user.id)).limit(1);
        const streakAtRisk = (streakRow?.current ?? 0) > 0 && w.reviewedToday === 0 && triggers.streakRisk !== false;
        candidates.push({
          kind: 'due_cards',
          title: 'Your study queue is ready',
          body: streakAtRisk
            ? `You have ${w.total} card${w.total === 1 ? '' : 's'} waiting, and your streak is still alive. A short review keeps it going.`
            : `You have ${w.total} card${w.total === 1 ? '' : 's'} waiting. Open Revisio when you're ready.`,
          href: '/review',
          dedupe: reminderDedupeKey('due_cards', now, prefs.timezone),
        });
      }
    }

    if (triggers.seasonEnding !== false) {
      const season = await currentSeason(now);
      if (season && season.daysLeft <= 3) {
        candidates.push({
          kind: 'season_ending',
          title: `Season ${season.number} ends soon`,
          body: `${season.daysLeft} day${season.daysLeft === 1 ? '' : 's'} left in ${season.name}. Your lobby placement is waiting — a few reviews can still move it.`,
          href: '/progress',
          dedupe: `season_ending:${season.number}`,
        });
      }
    }

    for (const candidate of candidates) {
      attempted++;
      const delivery = await claimDelivery(user.id, candidate.kind, prefs.channel, candidate.dedupe);
      if (!delivery) { suppressed++; continue; }
      try {
        await sendRetentionEmail(user.id, user.email, {
          subject: candidate.title,
          title: candidate.title,
          body: candidate.body,
          ctaLabel: 'Open Revisio',
          ctaUrl: `${process.env.APP_URL ?? 'http://localhost:3000'}${candidate.href}`,
        });
        await db.update(notificationDeliveries).set({ status: 'sent', detail: { attempt: delivery.attempt } }).where(eq(notificationDeliveries.id, delivery.id));
        await recordNotification(user.id, { kind: candidate.kind, title: candidate.title, body: candidate.body, href: candidate.href });
        sent++;
      } catch (err) {
        await db.update(notificationDeliveries).set({ status: 'failed', detail: { attempt: delivery.attempt, error: err instanceof Error ? err.message : 'send failed' } }).where(eq(notificationDeliveries.id, delivery.id));
        failed++;
      }
    }
  }
  return { attempted, sent, suppressed, failed, scanned: rows.length };
}

/** Claim a delivery slot; returns the row to update, or null when already sent/claimed. */
async function claimDelivery(userId: string, kind: string, channel: string, dedupeKey: string) {
  const id = crypto.randomUUID();
  const inserted = await db.insert(notificationDeliveries).values({
    id, userId, kind, channel, dedupeKey, status: 'failed',
    detail: { attempt: 1, stage: 'claimed' },
  }).onConflictDoNothing().returning({ id: notificationDeliveries.id });
  if (inserted.length > 0) return { id, attempt: 1 };
  const [existing] = await db.select().from(notificationDeliveries)
    .where(and(eq(notificationDeliveries.userId, userId), eq(notificationDeliveries.kind, kind), eq(notificationDeliveries.dedupeKey, dedupeKey)))
    .limit(1);
  if (!existing) return null;
  if (existing.status === 'sent' || existing.status === 'suppressed') return null;
  const attempt = Number((existing.detail as { attempt?: number } | null)?.attempt ?? 1) + 1;
  if (attempt > 3) return null;
  // Retry only after a short delay so a failing provider is not hammered.
  if (existing.createdAt.getTime() > Date.now() - 10 * 60_000) return null;
  await db.update(notificationDeliveries).set({ status: 'failed', detail: { attempt, stage: 'claimed' } }).where(eq(notificationDeliveries.id, existing.id));
  return { id: existing.id, attempt };
}

// ── challenges & goals (#13) ────────────────────────────────────────────────

async function periodStats(userId: string, periodStart: string, periodDays: number) {
  const since = new Date(`${periodStart}T00:00:00Z`);
  const until = new Date(since.getTime() + periodDays * 86_400_000);
  const [reviews, correct, xp, sessions] = await Promise.all([
    db.select({ c: sql<number>`count(*)::int` }).from(reviewLogs).where(and(eq(reviewLogs.userId, userId), gte(reviewLogs.reviewedAt, since))),
    db.select({ c: sql<number>`count(*)::int` }).from(reviewLogs).where(and(eq(reviewLogs.userId, userId), gte(reviewLogs.reviewedAt, since), sql`(${reviewLogs.graded} ->> 'correct')::boolean is true`)),
    db.select({ c: sql<number>`coalesce(sum(${xpEvents.amount}),0)::int` }).from(xpEvents).where(and(eq(xpEvents.userId, userId), gte(xpEvents.occurredAt, since), sql`${xpEvents.occurredAt} < ${until.toISOString()}`)),
    db.select({ sessionId: reviewLogs.sessionId, total: sql<number>`count(*)::int`, correct: sql<number>`count(*) filter (where (${reviewLogs.graded} ->> 'correct')::boolean)::int` })
      .from(reviewLogs).where(and(eq(reviewLogs.userId, userId), gte(reviewLogs.reviewedAt, since), sql`${reviewLogs.sessionId} is not null`))
      .groupBy(reviewLogs.sessionId),
  ]);
  return {
    reviews: reviews[0]?.c ?? 0,
    correct: correct[0]?.c ?? 0,
    xp: xp[0]?.c ?? 0,
    perfectSessions: sessions.filter((s) => (s.correct ?? 0) === (s.total ?? 0) && (s.total ?? 0) > 0).length,
  };
}

async function masteredTopicCount(userId: string) {
  const enrolled = await enrolledSubjectIds(userId);
  const rows = await db
    .select({ topicId: topics.id, total: sql<number>`count(distinct ${cards.id})::int`, mastered: sql<number>`count(distinct case when ${cardUserStates.stage} = 'mastered' then ${cards.id} end)::int` })
    .from(topics).innerJoin(cards, eq(cards.topicId, topics.id))
    .leftJoin(cardUserStates, and(eq(cardUserStates.cardId, cards.id), eq(cardUserStates.userId, userId)))
    .where(studiableCard(userId, enrolled))
    .groupBy(topics.id);
  return rows.filter((r) => (r.total ?? 0) > 0 && (r.mastered ?? 0) >= (r.total ?? 0)).length;
}

async function metricProgress(userId: string, metric: ChallengeMetric, periodStart: string, periodDays: number) {
  if (metric === 'streak') {
    const [row] = await db.select({ current: streaks.current }).from(streaks).where(eq(streaks.userId, userId)).limit(1);
    return row?.current ?? 0;
  }
  if (metric === 'topics_mastered') return masteredTopicCount(userId);
  const stats = await periodStats(userId, periodStart, periodDays);
  if (metric === 'reviews') return stats.reviews;
  if (metric === 'correct') return stats.correct;
  if (metric === 'xp') return stats.xp;
  if (metric === 'perfect_session') return stats.perfectSessions;
  return 0;
}

export async function listChallenges(userId: string, now = new Date()) {
  await requireActiveUser(userId);
  const out: { def: ChallengeDef; periodStart: string; progress: number; target: number; completed: boolean; rewardXp: number }[] = [];
  for (const def of CHALLENGES) {
    const periodStart = challengePeriodStart(now, def.period);
    const periodDays = def.period === 'daily' ? 1 : 7;
    const progress = Math.min(def.target, await metricProgress(userId, def.metric, periodStart, periodDays));
    const [existing] = await db.select().from(userChallenges)
      .where(and(eq(userChallenges.userId, userId), eq(userChallenges.challengeId, def.id), eq(userChallenges.periodStart, periodStart))).limit(1);
    const wasCompleted = !!existing?.completedAt;
    const completed = progress >= def.target;
    await db.insert(userChallenges).values({
      userId, challengeId: def.id, periodStart, progress, target: def.target,
      completedAt: completed ? (existing?.completedAt ?? now) : null, updatedAt: now,
    }).onConflictDoUpdate({
      target: [userChallenges.userId, userChallenges.challengeId, userChallenges.periodStart],
      set: { progress, completedAt: completed ? (existing?.completedAt ?? now) : null, updatedAt: now },
    });
    if (completed && !wasCompleted) {
      await db.insert(xpEvents).values({ id: crypto.randomUUID(), userId, amount: def.rewardXp, source: 'achievement', refId: `${def.id}:${periodStart}` });
      await recordNotification(userId, { kind: 'challenge', title: `Challenge complete: ${def.title}`, body: `${def.description} +${def.rewardXp} XP.`, href: '/progress' });
    }
    out.push({ def, periodStart, progress, target: def.target, completed, rewardXp: def.rewardXp });
  }
  return out;
}

// ── personal goals (#13) ────────────────────────────────────────────────────

const GOAL_KINDS = ['reviews', 'correct', 'xp', 'streak', 'topics_mastered', 'exam_score'] as const;
type GoalKind = typeof GOAL_KINDS[number];

async function goalProgress(userId: string, kind: GoalKind) {
  if (kind === 'streak') {
    const [row] = await db.select({ current: streaks.current }).from(streaks).where(eq(streaks.userId, userId)).limit(1);
    return row?.current ?? 0;
  }
  if (kind === 'topics_mastered') return masteredTopicCount(userId);
  if (kind === 'xp') {
    const [row] = await db.select({ c: sql<number>`coalesce(sum(${xpEvents.amount}),0)::int` }).from(xpEvents).where(eq(xpEvents.userId, userId));
    return row?.c ?? 0;
  }
  if (kind === 'exam_score') {
    const [row] = await db.select({ best: sql<number>`coalesce(max(round(100.0 * ${examAttempts.score} / nullif(${examAttempts.maxScore},0))),0)::int` }).from(examAttempts).where(eq(examAttempts.userId, userId));
    return row?.best ?? 0;
  }
  const correctOnly = kind === 'correct';
  const conditions = [eq(reviewLogs.userId, userId)];
  if (correctOnly) conditions.push(sql`(${reviewLogs.graded} ->> 'correct')::boolean is true`);
  const [row] = await db.select({ c: sql<number>`count(*)::int` }).from(reviewLogs).where(and(...conditions));
  return row?.c ?? 0;
}

export async function listGoals(userId: string) {
  await requireActiveUser(userId);
  const rows = await db.select().from(userGoals).where(eq(userGoals.userId, userId)).orderBy(desc(userGoals.createdAt));
  const now = new Date();
  const out = [];
  for (const goal of rows) {
    const progress = await goalProgress(userId, goal.kind as GoalKind);
    const completed = progress >= goal.target;
    if (completed && !goal.completedAt) {
      await db.update(userGoals).set({ completedAt: now, updatedAt: now }).where(eq(userGoals.id, goal.id));
      await db.insert(xpEvents).values({ id: crypto.randomUUID(), userId, amount: 25, source: 'achievement', refId: `goal:${goal.id}` });
      await recordNotification(userId, { kind: 'goal', title: `Goal reached: ${goal.title}`, body: 'Nice work — the target is yours.', href: '/progress' });
    }
    out.push({ ...goal, progress, completed, completedAt: completed && !goal.completedAt ? now.toISOString() : goal.completedAt?.toISOString() ?? null });
  }
  return out;
}

export async function createGoal(userId: string, input: Record<string, unknown>) {
  await requireActiveUser(userId);
  const kind = String(input.kind ?? '');
  if (!GOAL_KINDS.includes(kind as GoalKind)) throw new ApiError(400, 'bad_request', `kind must be one of ${GOAL_KINDS.join(', ')}.`);
  const title = String(input.title ?? '').trim();
  if (!title || title.length > 120) throw new ApiError(400, 'bad_request', 'title is required (max 120 chars).');
  const target = Number(input.target);
  if (!Number.isFinite(target) || target <= 0 || target > 1_000_000) throw new ApiError(400, 'bad_request', 'target must be a positive number.');
  const deadline = input.deadline === undefined || input.deadline === null ? null : String(input.deadline);
  if (deadline !== null && !isDate(deadline)) throw new ApiError(400, 'bad_request', 'deadline must be YYYY-MM-DD.');
  const id = crypto.randomUUID();
  await db.insert(userGoals).values({ id, userId, kind: kind as GoalKind, title, target: Math.round(target), deadline, scope: (input.scope as Record<string, unknown>) ?? null });
  return listGoals(userId);
}

export async function updateGoal(userId: string, id: string, input: Record<string, unknown>) {
  await requireActiveUser(userId);
  const [goal] = await db.select().from(userGoals).where(and(eq(userGoals.id, id), eq(userGoals.userId, userId))).limit(1);
  if (!goal) throw new ApiError(404, 'not_found', 'Goal not found.');
  const patch: Partial<typeof userGoals.$inferInsert> = { updatedAt: new Date() };
  if (input.title !== undefined) {
    const title = String(input.title).trim();
    if (!title || title.length > 120) throw new ApiError(400, 'bad_request', 'title is required (max 120 chars).');
    patch.title = title;
  }
  if (input.target !== undefined) {
    const target = Number(input.target);
    if (!Number.isFinite(target) || target <= 0 || target > 1_000_000) throw new ApiError(400, 'bad_request', 'target must be a positive number.');
    patch.target = Math.round(target);
  }
  if (input.deadline !== undefined) {
    const deadline = input.deadline === null ? null : String(input.deadline);
    if (deadline !== null && !isDate(deadline)) throw new ApiError(400, 'bad_request', 'deadline must be YYYY-MM-DD.');
    patch.deadline = deadline;
  }
  if (input.scope !== undefined) patch.scope = input.scope as Record<string, unknown>;
  await db.update(userGoals).set(patch).where(eq(userGoals.id, id));
  return listGoals(userId);
}

export async function deleteGoal(userId: string, id: string) {
  await requireActiveUser(userId);
  await db.delete(userGoals).where(and(eq(userGoals.id, id), eq(userGoals.userId, userId)));
  return listGoals(userId);
}

// ── exam countdown & cram planner (#17) ─────────────────────────────────────

async function topicProgressMap(userId: string, topicIds: string[]) {
  if (topicIds.length === 0) return new Map<string, { total: number; mastered: number; name: string }>();
  const rows = await db
    .select({
      topicId: topics.id, name: topics.name,
      total: sql<number>`count(distinct ${cards.id})::int`,
      mastered: sql<number>`count(distinct case when ${cardUserStates.stage} = 'mastered' then ${cards.id} end)::int`,
    })
    .from(topics).innerJoin(cards, eq(cards.topicId, topics.id))
    .leftJoin(cardUserStates, and(eq(cardUserStates.cardId, cards.id), eq(cardUserStates.userId, userId)))
    .where(and(studiableCardIn(userId, topicIds), inArray(topics.id, topicIds)))
    .groupBy(topics.id, topics.name);
  return new Map(rows.map((r) => [r.topicId, { total: r.total ?? 0, mastered: r.mastered ?? 0, name: r.name }]));
}

async function planTopicIds(plan: typeof examPlans.$inferSelect) {
  if (plan.topicIds.length > 0) return plan.topicIds;
  if (!plan.subjectId) return [];
  const rows = await db.select({ id: topics.id }).from(topics).where(eq(topics.subjectId, plan.subjectId));
  return rows.map((r) => r.id);
}

async function planSummary(userId: string, plan: typeof examPlans.$inferSelect, now = new Date()) {
  const topicIds = await planTopicIds(plan);
  const progress = await topicProgressMap(userId, topicIds);
  const topics = topicIds.map((id) => {
    const p = progress.get(id) ?? { total: 0, mastered: 0, name: '' };
    return { id, name: p.name || 'Topic', total: p.total, mastered: p.mastered, remaining: Math.max(0, p.total - p.mastered) };
  }).filter((t) => t.total > 0);
  const topicsTotal = topics.length;
  const topicsRemaining = topics.filter((t) => t.remaining > 0).length;
  const pace = planPace({ examDate: plan.examDate, topicsTotal, topicsRemaining, dailyTarget: plan.dailyTarget, now });
  const weakest = [...topics].filter((t) => t.remaining > 0).sort((a, b) => (a.mastered / Math.max(1, a.total)) - (b.mastered / Math.max(1, b.total))).slice(0, 3);
  return {
    id: plan.id, title: plan.title, examDate: plan.examDate, subjectId: plan.subjectId,
    dailyTarget: plan.dailyTarget, status: plan.status, reflection: plan.reflection ?? null,
    createdAt: plan.createdAt.toISOString(), updatedAt: plan.updatedAt.toISOString(),
    daysLeft: pace.daysLeft, topicsTotal, topicsRemaining, perDayNeeded: pace.perDayNeeded, onTrack: pace.onTrack,
    topics, weakestTopics: weakest,
  };
}

export async function listExamPlans(userId: string, now = new Date()) {
  await requireActiveUser(userId);
  const rows = await db.select().from(examPlans).where(eq(examPlans.userId, userId)).orderBy(desc(examPlans.createdAt));
  const out = [];
  for (const plan of rows) out.push(await planSummary(userId, plan, now));
  return out;
}

export async function createExamPlan(userId: string, input: Record<string, unknown>) {
  await requireActiveUser(userId);
  const title = String(input.title ?? '').trim();
  if (!title || title.length > 120) throw new ApiError(400, 'bad_request', 'title is required (max 120 chars).');
  const examDate = String(input.examDate ?? '');
  if (!isDate(examDate)) throw new ApiError(400, 'bad_request', 'examDate must be YYYY-MM-DD.');
  if (daysUntil(examDate) < 0) throw new ApiError(400, 'bad_request', 'examDate must be today or in the future.');
  const subjectId = input.subjectId === undefined || input.subjectId === null ? null : String(input.subjectId);
  if (subjectId) {
    const [subject] = await db.select({ id: topics.id }).from(topics).where(eq(topics.subjectId, subjectId)).limit(1);
    if (!subject) throw new ApiError(400, 'bad_request', 'subjectId does not match a known subject.');
  }
  const topicIds = Array.isArray(input.topicIds) ? input.topicIds.map(String).filter(Boolean) : [];
  if (topicIds.length > 100) throw new ApiError(400, 'bad_request', 'topicIds is too large.');
  const dailyTarget = Math.min(50, Math.max(1, Number(input.dailyTarget ?? 10) || 10));
  const id = crypto.randomUUID();
  await db.insert(examPlans).values({ id, userId, subjectId, title, examDate, topicIds, dailyTarget });
  const [plan] = await db.select().from(examPlans).where(eq(examPlans.id, id)).limit(1);
  return planSummary(userId, plan!);
}

export async function updateExamPlan(userId: string, id: string, input: Record<string, unknown>) {
  await requireActiveUser(userId);
  const [plan] = await db.select().from(examPlans).where(and(eq(examPlans.id, id), eq(examPlans.userId, userId))).limit(1);
  if (!plan) throw new ApiError(404, 'not_found', 'Exam plan not found.');
  const patch: Partial<typeof examPlans.$inferInsert> = { updatedAt: new Date() };
  if (input.title !== undefined) {
    const title = String(input.title).trim();
    if (!title || title.length > 120) throw new ApiError(400, 'bad_request', 'title is required (max 120 chars).');
    patch.title = title;
  }
  if (input.examDate !== undefined) {
    const examDate = String(input.examDate);
    if (!isDate(examDate)) throw new ApiError(400, 'bad_request', 'examDate must be YYYY-MM-DD.');
    patch.examDate = examDate;
  }
  if (input.subjectId !== undefined) patch.subjectId = input.subjectId === null ? null : String(input.subjectId);
  if (input.topicIds !== undefined) patch.topicIds = Array.isArray(input.topicIds) ? input.topicIds.map(String).filter(Boolean) : [];
  if (input.dailyTarget !== undefined) patch.dailyTarget = Math.min(50, Math.max(1, Number(input.dailyTarget) || 10));
  if (input.status !== undefined) {
    if (!['active', 'completed', 'archived'].includes(String(input.status))) throw new ApiError(400, 'bad_request', 'status must be active, completed or archived.');
    patch.status = String(input.status) as 'active' | 'completed' | 'archived';
  }
  await db.update(examPlans).set(patch).where(eq(examPlans.id, id));
  const [updated] = await db.select().from(examPlans).where(eq(examPlans.id, id)).limit(1);
  return planSummary(userId, updated!, new Date());
}

export async function deleteExamPlan(userId: string, id: string) {
  await requireActiveUser(userId);
  await db.update(examPlans).set({ status: 'archived', updatedAt: new Date() }).where(and(eq(examPlans.id, id), eq(examPlans.userId, userId)));
  return listExamPlans(userId);
}

export async function reflectExamPlan(userId: string, id: string, input: Record<string, unknown>) {
  await requireActiveUser(userId);
  const [plan] = await db.select().from(examPlans).where(and(eq(examPlans.id, id), eq(examPlans.userId, userId))).limit(1);
  if (!plan) throw new ApiError(404, 'not_found', 'Exam plan not found.');
  const reflection: Record<string, unknown> = { reflectedAt: new Date().toISOString() };
  if (input.score !== undefined && input.score !== null) reflection.score = Number(input.score);
  if (input.maxScore !== undefined && input.maxScore !== null) reflection.maxScore = Number(input.maxScore);
  if (input.note !== undefined) reflection.note = String(input.note).slice(0, 2000);
  await db.update(examPlans).set({ reflection, status: 'completed', updatedAt: new Date() }).where(eq(examPlans.id, id));
  const [updated] = await db.select().from(examPlans).where(eq(examPlans.id, id)).limit(1);
  return planSummary(userId, updated!);
}

// ── safe social (#15) ───────────────────────────────────────────────────────

export async function getSocialOverview(userId: string) {
  await requireActiveUser(userId);
  const [user] = await db.select({ consent: users.consent }).from(users).where(eq(users.id, userId)).limit(1);
  const socialConsent = consentChoices(user?.consent).social;
  const links = await db.select().from(studyConnections)
    .where(and(
      or(eq(studyConnections.requesterId, userId), eq(studyConnections.addresseeId, userId)),
      inArray(studyConnections.status, ['pending', 'accepted']),
    ));
  const connections = [];
  for (const link of links) {
    const otherId = link.requesterId === userId ? link.addresseeId : link.requesterId;
    const other = await publicUser(otherId);
    if (!other) continue;
    connections.push({
      id: link.id, kind: link.kind, status: link.status, direction: link.requesterId === userId ? 'outgoing' : 'incoming',
      createdAt: link.createdAt.toISOString(), respondedAt: link.respondedAt?.toISOString() ?? null,
      user: { id: other.id, name: other.name, username: other.username, avatarColor: other.avatarColor, bannerColor: other.bannerColor },
    });
  }
  return { consentSocial: socialConsent, connections };
}

export async function sendConnection(userId: string, input: Record<string, unknown>) {
  await requireActiveUser(userId);
  const [user] = await db.select({ consent: users.consent }).from(users).where(eq(users.id, userId)).limit(1);
  if (!consentChoices(user?.consent).social) throw new ApiError(409, 'conflict', 'Social features require social consent.');
  let target: { id: string } | undefined;
  if (input.userId) {
    [target] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, String(input.userId)), eq(users.status, 'active'))).limit(1);
  } else if (input.username) {
    [target] = await db.select({ id: users.id }).from(users).where(and(eq(users.username, String(input.username)), eq(users.status, 'active'))).limit(1);
  } else {
    throw new ApiError(400, 'bad_request', 'userId or username is required.');
  }
  if (!target) throw new ApiError(404, 'not_found', 'User not found.');
  if (target.id === userId) throw new ApiError(400, 'bad_request', 'You cannot connect with yourself.');
  const kind = input.kind === 'accountability' ? 'accountability' : 'buddy';
  const pairKey = socialPairKey(userId, target.id);
  const [existing] = await db.select().from(studyConnections).where(eq(studyConnections.pairKey, pairKey)).limit(1);
  if (existing) {
    if (existing.status === 'blocked' || existing.status === 'declined') throw new ApiError(409, 'conflict', 'This connection is not available.');
    if (existing.status === 'accepted') throw new ApiError(409, 'conflict', 'Already connected.');
    return { id: existing.id, status: existing.status, kind: existing.kind, direction: existing.requesterId === userId ? 'outgoing' : 'incoming' };
  }
  const id = crypto.randomUUID();
  await db.insert(studyConnections).values({ id, pairKey, requesterId: userId, addresseeId: target.id, kind, status: 'pending' });
  const targetUser = await publicUser(target.id);
  await recordNotification(target.id, { kind: 'social', title: `${targetUser?.name ?? 'Someone'} wants to study with you`, body: 'Accept to add them to your private study circle.', href: '/progress' });
  return { id, status: 'pending', kind, direction: 'outgoing' };
}

export async function respondConnection(userId: string, id: string, action: string) {
  await requireActiveUser(userId);
  const [link] = await db.select().from(studyConnections).where(eq(studyConnections.id, id)).limit(1);
  if (!link) throw new ApiError(404, 'not_found', 'Connection not found.');
  const isRequester = link.requesterId === userId;
  const isAddressee = link.addresseeId === userId;
  if (!isRequester && !isAddressee) throw new ApiError(403, 'forbidden', 'Not your connection.');
  const now = new Date();
  if (action === 'accept') {
    if (!isAddressee) throw new ApiError(403, 'forbidden', 'Only the recipient can accept.');
    const [user] = await db.select({ consent: users.consent }).from(users).where(eq(users.id, userId)).limit(1);
    if (!consentChoices(user?.consent).social) throw new ApiError(409, 'conflict', 'Social consent is required to accept.');
    await db.update(studyConnections).set({ status: 'accepted', respondedAt: now }).where(eq(studyConnections.id, id));
  } else if (action === 'decline') {
    if (!isAddressee) throw new ApiError(403, 'forbidden', 'Only the recipient can decline.');
    await db.update(studyConnections).set({ status: 'declined', respondedAt: now }).where(eq(studyConnections.id, id));
  } else if (action === 'block') {
    if (!isAddressee) throw new ApiError(403, 'forbidden', 'Only the recipient can block.');
    await db.update(studyConnections).set({ status: 'blocked', respondedAt: now }).where(eq(studyConnections.id, id));
  } else if (action === 'remove' || action === 'cancel') {
    if (action === 'cancel' && !isRequester) throw new ApiError(403, 'forbidden', 'Only the requester can cancel.');
    await db.delete(studyConnections).where(eq(studyConnections.id, id));
  } else {
    throw new ApiError(400, 'bad_request', 'action must be accept, decline, block, remove or cancel.');
  }
  return getSocialOverview(userId);
}

export async function friendBoard(userId: string) {
  await requireActiveUser(userId);
  const links = await db.select().from(studyConnections)
    .where(and(eq(studyConnections.status, 'accepted'), or(eq(studyConnections.requesterId, userId), eq(studyConnections.addresseeId, userId))));
  const weekStart = mondayUtc(new Date());
  const entries = [];
  for (const link of links) {
    const otherId = link.requesterId === userId ? link.addresseeId : link.requesterId;
    const other = await publicUser(otherId);
    if (!other || other.leaderboardOptOut) continue;
    const [[xp], [streak]] = await Promise.all([
      db.select({ c: sql<number>`coalesce(sum(${xpEvents.amount}),0)::int` }).from(xpEvents).where(and(eq(xpEvents.userId, otherId), gte(xpEvents.occurredAt, weekStart))),
      db.select({ current: streaks.current }).from(streaks).where(eq(streaks.userId, otherId)).limit(1),
    ]);
    entries.push({
      userId: other.id, name: other.name, username: other.username, avatarColor: other.avatarColor,
      weeklyXp: xp?.c ?? 0, streak: streak?.current ?? 0, kind: link.kind,
    });
  }
  entries.sort((a, b) => b.weeklyXp - a.weeklyXp);
  return entries.slice(0, 20).map((e, i) => ({ ...e, rank: i + 1 }));
}

function mondayUtc(d: Date): Date {
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
}

// ── guardian summaries (#15) ────────────────────────────────────────────────

export async function listGuardianLinks(userId: string) {
  await requireActiveUser(userId);
  const asStudent = await db.select().from(guardianLinks).where(eq(guardianLinks.studentId, userId));
  const asGuardian = await db.select().from(guardianLinks).where(eq(guardianLinks.guardianId, userId));
  const out = [];
  for (const link of asStudent) {
    const guardian = await publicUser(link.guardianId);
    out.push({ id: link.id, role: 'student', status: link.status, scope: link.scope, createdAt: link.createdAt.toISOString(), respondedAt: link.respondedAt?.toISOString() ?? null, user: guardian });
  }
  for (const link of asGuardian) {
    const student = await publicUser(link.studentId);
    out.push({ id: link.id, role: 'guardian', status: link.status, scope: link.scope, createdAt: link.createdAt.toISOString(), respondedAt: link.respondedAt?.toISOString() ?? null, user: student });
  }
  return out;
}

export async function createGuardianLink(userId: string, input: Record<string, unknown>) {
  await requireActiveUser(userId);
  // Only the learner can open a summary link — that act is the consent.
  let guardian: { id: string } | undefined;
  if (input.guardianId) {
    [guardian] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, String(input.guardianId)), eq(users.status, 'active'))).limit(1);
  } else if (input.guardianUsername) {
    [guardian] = await db.select({ id: users.id }).from(users).where(and(eq(users.username, String(input.guardianUsername)), eq(users.status, 'active'))).limit(1);
  } else {
    throw new ApiError(400, 'bad_request', 'guardianId or guardianUsername is required.');
  }
  if (!guardian) throw new ApiError(404, 'not_found', 'Guardian account not found.');
  if (guardian.id === userId) throw new ApiError(400, 'bad_request', 'You cannot be your own guardian.');
  const [existing] = await db.select().from(guardianLinks).where(and(eq(guardianLinks.studentId, userId), eq(guardianLinks.guardianId, guardian.id))).limit(1);
  if (existing) {
    if (existing.status === 'revoked' || existing.status === 'declined') {
      await db.update(guardianLinks).set({ status: 'pending', respondedAt: null }).where(eq(guardianLinks.id, existing.id));
      return listGuardianLinks(userId);
    }
    return listGuardianLinks(userId);
  }
  await db.insert(guardianLinks).values({ id: crypto.randomUUID(), studentId: userId, guardianId: guardian.id, status: 'pending' });
  await recordNotification(guardian.id, { kind: 'social', title: 'A learner shared a study summary with you', body: 'Accept to see their progress summary.', href: '/progress' });
  return listGuardianLinks(userId);
}

export async function respondGuardianLink(userId: string, id: string, action: string) {
  await requireActiveUser(userId);
  const [link] = await db.select().from(guardianLinks).where(eq(guardianLinks.id, id)).limit(1);
  if (!link) throw new ApiError(404, 'not_found', 'Link not found.');
  if (link.guardianId !== userId && link.studentId !== userId) throw new ApiError(403, 'forbidden', 'Not your link.');
  const now = new Date();
  if (action === 'accept') {
    if (link.guardianId !== userId) throw new ApiError(403, 'forbidden', 'Only the guardian can accept.');
    await db.update(guardianLinks).set({ status: 'accepted', respondedAt: now }).where(eq(guardianLinks.id, id));
  } else if (action === 'decline' || action === 'revoke') {
    const status = action === 'decline' ? 'declined' : 'revoked';
    await db.update(guardianLinks).set({ status, respondedAt: now }).where(eq(guardianLinks.id, id));
  } else {
    throw new ApiError(400, 'bad_request', 'action must be accept, decline or revoke.');
  }
  return listGuardianLinks(userId);
}

export async function guardianSummary(userId: string, studentId: string) {
  await requireActiveUser(userId);
  const [link] = await db.select().from(guardianLinks)
    .where(and(eq(guardianLinks.guardianId, userId), eq(guardianLinks.studentId, studentId), eq(guardianLinks.status, 'accepted'))).limit(1);
  if (!link) throw new ApiError(404, 'not_found', 'No accepted summary link for this learner.');
  const scope = { reviews: true, streak: true, accuracy: true, ...(link.scope ?? {}) };
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [[reviews], [correct], [streak], mastered] = await Promise.all([
    scope.reviews ? db.select({ c: sql<number>`count(*)::int` }).from(reviewLogs).where(and(eq(reviewLogs.userId, studentId), gte(reviewLogs.reviewedAt, since))) : Promise.resolve([{ c: 0 }]),
    scope.accuracy ? db.select({ c: sql<number>`count(*)::int` }).from(reviewLogs).where(and(eq(reviewLogs.userId, studentId), gte(reviewLogs.reviewedAt, since), sql`(${reviewLogs.graded} ->> 'correct')::boolean is true`)) : Promise.resolve([{ c: 0 }]),
    scope.streak ? db.select({ current: streaks.current }).from(streaks).where(eq(streaks.userId, studentId)).limit(1) : Promise.resolve([]),
    masteredTopicCount(studentId),
  ]);
  const reviewCount = reviews?.c ?? 0;
  const correctCount = correct?.c ?? 0;
  return {
    studentId,
    scope,
    last30Days: scope.reviews || scope.accuracy ? { reviews: reviewCount, correct: correctCount, accuracy: reviewCount > 0 ? Math.round((correctCount / reviewCount) * 100) : null } : null,
    streak: scope.streak ? (streak?.current ?? 0) : null,
    topicsMastered: mastered,
  };
}

