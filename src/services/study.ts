import 'server-only';
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { db, type Db } from '@/db/client';
import {
  cards, cardAnswers, cardUserStates, examQuestions, examPapers, lessons, reviewLogs, streaks, subjects,
  topics, userAchievements, userTopicStates, users, xpEvents, achievements,
  leagueMemberships, examAttempts, featureFlags,
} from '@/db/schema';
import { gradeClozeWithPolicy, gradeFlashcard, gradeMcq, type AcceptedAnswer, type Verdict } from '@/domain/grading';
import { resolveClozeMarking } from '@/services/grading-policy';
import { getScheduler, newCardState, srsInfoForState, srsLevelFor, srsLevelInfo, type Rating } from '@/domain/srs';
import { evaluateAchievements, levelForXp, utcDateKey, xpForReview } from '@/domain/gamification';
import { nextStreakState, type StreakEvent } from '@/domain/retention';
import { recordNotification, recordStreakEvents } from '@/services/retention';
import { ApiError } from '@/services/api';
import { cardReaches, enrolledSubjectIds, lessonReaches, studiableCard, studiableCardIn, topicReaches } from '@/services/visibility';
import { recordServerEvent } from '@/services/analytics';
import { examAwareEnabled, examDatesForUser, type ExamDateEntry } from '@/services/exam-schedule';
import { requiredAssignmentTopicIds } from '@/services/class-assignments';

// ── algorithms config (dev-tunable via feature flag payload) ────────────────

type AlgoConfig = { default: string; params: Record<string, Record<string, number>> };

export async function getAlgorithmConfig(): Promise<AlgoConfig> {
  const [row] = await db.select().from(featureFlags).where(eq(featureFlags.key, 'srs_algorithms')).limit(1);
  const fallback: AlgoConfig = { default: 'sm2', params: {} };
  if (!row) return fallback;
  try {
    return JSON.parse((row as { description: string }).description) as AlgoConfig;
  } catch {
    return fallback;
  }
}

// ── daily queue ─────────────────────────────────────────────────────────────

export type QueueCard = {
  id: string;
  kind: 'cloze' | 'flashcard' | 'mcq';
  topicId: string;
  topicName: string;
  subjectId: string;
  subjectName: string;
  textWithBlank: string | null;
  prompt: string | null;
  question: string | null;
  options: { id: string; text: string }[] | null;
  stage: string;
  /** BunPro-style strength rung 1–12, derived from the scheduler state. */
  srsLevel: number;
  srsLabel: string;
  /** Scheduler fields the "why is this due" line reads. Null on a card the
   *  learner has never reviewed. */
  dueAt: Date | null;
  lastReviewedAt: Date | null;
  reps: number;
  lapses: number;
  /** The lesson this card was written for, when one exists *and* reaches the
   *  learner — the verdict's "Read the lesson" deep link (F7). Null means
   *  degrade to the topic notes link, never a dead anchor. */
  lessonId: string | null;
  lessonTitle: string | null;
  /** Days until the nearest exam covering this card's topic (#4). Null when
   *  exam-aware scheduling is off or the topic has no exam date. */
  examDaysLeft?: number | null;
  // answers are sent for cloze/flashcard only after grading (see submitReview);
  // for the queue we never send accepted answers to the client.
};

/** The strength pair every queue builder attaches, derived from the card's
 *  scheduler state — one helper so the three builders cannot drift. */
function srsFields(state: { stage: string; intervalDays: number } | null | undefined) {
  const info = srsInfoForState({ stage: state?.stage ?? 'new', intervalDays: state?.intervalDays ?? 0 });
  return { srsLevel: info.level, srsLabel: info.label };
}

export async function buildDailyQueue(userId: string, limit = 20, topicId?: string): Promise<QueueCard[]> {
  const [enrolled, examOn, assignedTopics] = await Promise.all([
    enrolledSubjectIds(userId),
    examAwareEnabled(),
    requiredAssignmentTopicIds(userId),
  ]);
  const now = new Date();
  // #4: active exam plans flattened to topicId → nearest exam date. Empty map
  // (flag off or no plans) leaves the queue byte-for-byte as before.
  const examMap: Map<string, ExamDateEntry> = examOn ? await examDatesForUser(userId, now) : new Map();
  const examTopicIds = [...examMap.keys()];
  // SQL-side pull-forward bound: the latest exam date across mapped topics.
  // The per-topic check (`dueAt` on/before *its* exam day) happens in JS below.
  const maxExamDate = examTopicIds.length
    ? examTopicIds.map((id) => examMap.get(id)!.examDate).sort().at(-1)!
    : null;

  // The early `return []` when unenrolled is gone on purpose: a deck you wrote
  // or imported yourself is yours to study whether or not you follow the
  // subject it sits under. That single line is why "no questions are ever
  // added" — 28 cards existed and none of them could be reached.
  const rows = await db
    .select({
      card: cards,
      topic: topics,
      subject: subjects,
      state: cardUserStates,
      lesson: lessons,
    })
    .from(cards)
    .innerJoin(topics, eq(cards.topicId, topics.id))
    .innerJoin(subjects, eq(topics.subjectId, subjects.id))
    .leftJoin(
      cardUserStates,
      and(eq(cardUserStates.cardId, cards.id), eq(cardUserStates.userId, userId))
    )
    // The lesson join carries its own reachability: an unreachable or missing
    // lesson resolves to NULL here, which the mapper turns into the topic-link
    // degrade rather than a 404 the learner can tap.
    .leftJoin(lessons, and(eq(lessons.id, cards.lessonId), lessonReaches(userId)))
    .where(
      and(
        studiableCard(userId, enrolled),
        // due: new cards, state with dueAt <= now — plus, when exam-aware
        // scheduling is on, exam-topic cards that will come due on or before
        // their exam day (the pull-forward; per-topic precision is applied
        // in JS after the fetch).
        or(
          isNull(cardUserStates.cardId),
          sql`${cardUserStates.dueAt} <= ${now.toISOString()}`,
          ...(maxExamDate
            ? [and(inArray(cards.topicId, examTopicIds), lte(cardUserStates.dueAt, new Date(`${maxExamDate}T23:59:59.999Z`)))]
            : []),
        )!,
        // Weak-topic review (#18): scope the same due queue to one topic so a
        // recommendation can be acted on in one tap.
        ...(topicId ? [eq(cards.topicId, topicId)] : [])
      )
    )
    // Wider fetch when reprioritisation is active: JS re-sorts and re-slices
    // below, so the SQL limit must leave headroom for cards it will drop.
    .orderBy(sql`CASE WHEN ${cardUserStates.cardId} IS NULL THEN 0 ELSE 1 END`, cardUserStates.dueAt, cards.createdAt)
    .limit(maxExamDate || assignedTopics.size > 0 ? limit * 4 : limit);

  const mapped = rows.map(({ card, topic, subject, state, lesson }) => ({
    id: card.id,
    kind: card.kind,
    topicId: topic.id,
    topicName: topic.name,
    subjectId: subject.id,
    subjectName: subject.name,
    textWithBlank: card.kind === 'cloze' ? card.textWithBlank : null,
    prompt: card.kind === 'flashcard' ? card.prompt : null,
    question: card.kind === 'mcq' ? card.question : null,
    options: card.kind === 'mcq' ? card.options ?? null : null,
    stage: state?.stage ?? 'new',
    ...srsFields(state),
    dueAt: state?.dueAt ?? null,
    lastReviewedAt: state?.lastReviewedAt ?? null,
    reps: state?.reps ?? 0,
    lapses: state?.lapses ?? 0,
    lessonId: lesson?.id ?? null,
    lessonTitle: lesson?.title ?? null,
    examDaysLeft: examMap.get(topic.id)?.daysLeft ?? null,
    // internal, stripped before return
    _topicId: topic.id,
  }));

  // #5: reprioritisation path runs when exams OR required class assignments
  // apply; with neither, the SQL order is returned untouched.
  if (!maxExamDate && assignedTopics.size === 0) return mapped.slice(0, limit).map(stripInternal);

  // Per-topic eligibility: a pulled-forward card stays only if its own exam
  // day is on/after its due date (UTC calendar day, same convention as
  // daysUntil). Everything else keeps the plain `dueAt <= now` rule.
  const nowDay = now.toISOString().slice(0, 10);
  const eligible = maxExamDate
    ? mapped.filter((c) => {
        if (!c.dueAt) return true; // new card
        const dueDay = c.dueAt.toISOString().slice(0, 10);
        if (dueDay <= nowDay) return true;
        const exam = examMap.get(c._topicId);
        return !!exam && dueDay <= exam.examDate;
      })
    : mapped;

  // Priority bands: exam-urgent topics, then required class assignments,
  // then everything else. Within a band: nearest exam first (exam band), new
  // cards before reviewed, then earliest due.
  const band = (c: (typeof mapped)[number]) =>
    c.examDaysLeft != null ? 0 : assignedTopics.has(c.topicId) ? 1 : 2;
  eligible.sort((a, b) => {
    const bd = band(a) - band(b);
    if (bd !== 0) return bd;
    if (band(a) === 0) {
      const d = (a.examDaysLeft ?? 0) - (b.examDaysLeft ?? 0);
      if (d !== 0) return d;
    }
    const aNew = a.dueAt === null ? 0 : 1;
    const bNew = b.dueAt === null ? 0 : 1;
    if (aNew !== bNew) return aNew - bNew;
    return (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0);
  });
  return eligible.slice(0, limit).map(stripInternal);
}

function stripInternal<T extends { _topicId?: string }>({ _topicId, ...rest }: T): Omit<T, '_topicId'> {
  return rest;
}

// ── review submission ───────────────────────────────────────────────────────

export type SubmitReviewInput = {
  cardId: string;
  answer?: string;          // cloze/flashcard
  selectedOptionId?: string; // mcq
  durationMs?: number;
  /**
   * `learn` is first exposure: the schedule still moves (meeting a card should
   * put it in the rotation), but the card was chosen as *new* rather than as
   * due, and the UI shows the notes beside it. It is a mode of the same loop,
   * not a second loop — grading, XP, streaks and achievements are identical.
   */
  mode?: 'daily' | 'cram' | 'exam' | 'learn';
  sessionId?: string;
  /** F5: pre-answer self-report, stored on review_logs.confidence. v1 stores
   *  without acting — it never touches grading, XP, SRS or streaks. */
  confidence?: 'knew' | 'guessed' | null;
};

export type SubmitReviewResult = {
  verdict: Verdict;
  primaryAnswer?: string;
  modelAnswer?: string;
  explanation?: string;
  xpAwarded: number;
  totalXp: number;
  level: number;
  streak: number;
  streakFreezes: number;
  /** Opt-in mastery streak (#8); null when the learner hasn't enabled it. */
  masteryStreak: { current: number; best: number } | null;
  streakEvents: { kind: string; meta?: Record<string, unknown> }[];
  newAchievements: { id: string; name: string; icon: string; description: string }[];
  nextDueAt: string;
  /** Strength rung the card now holds, so the verdict can say where it moved. */
  srsLevel: number;
  srsLabel: string;
};

export async function submitReview(userId: string, input: SubmitReviewInput): Promise<SubmitReviewResult> {
  const mode = input.mode ?? 'daily';
  // Authorization lives here, not just in the routes: a cardId is guessable,
  // and the queue only *deals* reachable cards — the submit path must refuse
  // to *accept* one it never should have shown. Daily reviews follow the
  // queue's rule exactly (enrolment required for content that isn't yours);
  // cram/learn/exam cards come from topics the user picked by hand, so the
  // reachability rule is the same one buildCramQueue/buildFirstExposure use.
  const [enrolled, answersRes] = await Promise.all([
    mode === 'daily' ? enrolledSubjectIds(userId) : Promise.resolve([] as string[]),
    db.select().from(cardAnswers).where(eq(cardAnswers.cardId, input.cardId)),
  ]);
  const reach =
    mode === 'daily'
      ? studiableCard(userId, enrolled)
      : and(cardReaches(userId), topicReaches(userId));
  const [row] = await db
    .select({ card: cards })
    .from(cards)
    .innerJoin(topics, eq(cards.topicId, topics.id))
    .where(and(eq(cards.id, input.cardId), reach))
    .limit(1);
  const card = row?.card;
  if (!card) throw new ApiError(404, 'not_found', 'Card not found.');
  const accepted: AcceptedAnswer[] = answersRes.map((a) => ({
    id: a.id, text: a.text, isPrimary: a.isPrimary,
    keywords: a.keywords ?? null, minPoints: a.minPoints ?? null,
  }));

  // 1) grade (server-side, final). Cloze marking resolves its strictness
  // per card: topic override, else subject, else the global default.
  let verdict: SubmitReviewResult['verdict'];
  if (card.kind === 'cloze') {
    const [topicRow] = await db.select({ subjectId: topics.subjectId }).from(topics).where(eq(topics.id, card.topicId)).limit(1);
    const policy = await resolveClozeMarking(topicRow?.subjectId ?? null, card.topicId);
    verdict = gradeClozeWithPolicy(input.answer ?? '', accepted, policy);
  }
  else if (card.kind === 'flashcard') verdict = gradeFlashcard(input.answer ?? '', accepted);
  else verdict = gradeMcq(input.selectedOptionId ?? null, card.correctOptionId ?? '');

  // 2) schedule (unless cram — cram reviews don't move the schedule)
  const [algoConfigRes, stateRes] = await Promise.all([
    getAlgorithmConfig(),
    db.select().from(cardUserStates).where(and(eq(cardUserStates.userId, userId), eq(cardUserStates.cardId, card.id))).limit(1),
  ]);
  const algoConfig = algoConfigRes;
  const [state] = stateRes;
  const scheduler = getScheduler(algoConfig.default, 'sm2');
  const params = { ...scheduler.defaultParams(), ...(algoConfig.params[algoConfig.default] ?? {}) };
  const prevState = state
    ? { ...state, stage: state.stage as CardStage }
    : newCardState(algoConfig.default);
  const scheduling = input.mode === 'cram' ? null : scheduler.schedule(prevState, ratingFromVerdict(verdict, card.kind), params, new Date());

  // Schedule, streak, XP, review log, achievements and notifications are one
  // unit: a mid-path failure must not leave XP paid without its review log,
  // or a streak advanced without the review that caused it. Reads that feed
  // the writes stay outside — they were already snapshots, and the writes
  // they feed are idempotent upserts.
  let xpAwarded = 0;
  let streakCurrent = 0;
  let streakFreezes = 0;
  let streakEventList: StreakEvent[] = [];
  let masteryStreak: { current: number; best: number } | null = null;
  let totalXp = 0;
  let level = 0;
  let newAchievements: Awaited<ReturnType<typeof checkAchievements>> = [];
  await db.transaction(async (tx) => {
    if (scheduling) {
      await tx
        .insert(cardUserStates)
        .values({
          userId, cardId: card.id,
          stage: scheduling.stage, dueAt: scheduling.dueAt, intervalDays: scheduling.intervalDays,
          ease: scheduling.ease, stability: scheduling.stability, difficulty: scheduling.difficulty,
          lapses: scheduling.lapses, reps: scheduling.reps, algorithm: scheduling.algorithm,
          lastReviewedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [cardUserStates.userId, cardUserStates.cardId],
          set: {
            stage: scheduling.stage, dueAt: scheduling.dueAt, intervalDays: scheduling.intervalDays,
            ease: scheduling.ease, stability: scheduling.stability, difficulty: scheduling.difficulty,
            lapses: scheduling.lapses, reps: scheduling.reps, algorithm: scheduling.algorithm,
            lastReviewedAt: new Date(),
          },
        });
    }

    // 3) XP + streak (skip in exam mode; exam scoring handled separately)
    if (mode !== 'exam') {
      const [timesTodayRes, streakRes, prefsRes] = await Promise.all([
        tx
          .select({ c: sql<number>`count(*)` })
          .from(reviewLogs)
          .where(and(eq(reviewLogs.userId, userId), eq(reviewLogs.cardId, card.id), gte(reviewLogs.reviewedAt, startOfToday()))),
        tx.select().from(streaks).where(eq(streaks.userId, userId)).limit(1),
        tx.select({ prefs: users.prefs }).from(users).where(eq(users.id, userId)).limit(1),
      ]);
      const timesToday = timesTodayRes;
      const [streakRow] = streakRes;
      const cur = {
        current: streakRow?.current ?? 0,
        best: streakRow?.best ?? 0,
        lastActiveDate: streakRow?.lastActiveDate ?? null,
        freezes: streakRow?.freezes ?? 0,
      };
      const today = utcDateKey();
      const updated = nextStreakState(cur, today);
      streakCurrent = updated.state.current;
      streakFreezes = updated.state.freezes;
      streakEventList = updated.events;

      // Mastery streak (#8): opt-in via users.prefs.streakMastery; increments
      // only on a verified review — mode daily|learn AND graded correct.
      // cram reviews don't move the retention schedule, exam bypasses streaks.
      const masteryOn = prefsRes[0]?.prefs?.streakMastery === true;
      let masterySet: { masteryCurrent: number; masteryBest: number; masteryLastActiveDate: string | null } | null = null;
      if (masteryOn && verdict.correct && (mode === 'daily' || mode === 'learn')) {
        const mUpdated = nextStreakState(
          {
            current: streakRow?.masteryCurrent ?? 0,
            best: streakRow?.masteryBest ?? 0,
            lastActiveDate: streakRow?.masteryLastActiveDate ?? null,
            freezes: cur.freezes,
          },
          today,
        );
        masterySet = {
          masteryCurrent: mUpdated.state.current,
          masteryBest: mUpdated.state.best,
          masteryLastActiveDate: mUpdated.state.lastActiveDate,
        };
        masteryStreak = { current: mUpdated.state.current, best: mUpdated.state.best };
        const masteryEvents = mUpdated.events.map((e) => ({
          ...e,
          meta: { ...(e.meta ?? {}), track: 'mastery' as const },
        }));
        streakEventList = [...streakEventList, ...masteryEvents];
        // Shared freeze bank: both tracks started from the same balance, so the
        // smaller result already reflects the larger gap — coverage is never
        // double-spent and freezes are never invented.
        streakFreezes = Math.min(updated.state.freezes, mUpdated.state.freezes);
        await recordStreakEvents(userId, masteryEvents, tx);
      }

      await tx
        .insert(streaks)
        .values({
          userId, current: updated.state.current, best: updated.state.best,
          lastActiveDate: updated.state.lastActiveDate, freezes: streakFreezes,
          ...(masterySet ?? {}),
        })
        .onConflictDoUpdate({
          target: streaks.userId,
          set: {
            current: updated.state.current, best: updated.state.best,
            lastActiveDate: updated.state.lastActiveDate, freezes: streakFreezes,
            ...(masterySet ?? {}),
          },
        });
      await recordStreakEvents(userId, updated.events, tx);

      xpAwarded = xpForReview({
        cardKind: card.kind,
        correct: verdict.correct,
        nearMiss: verdict.feedbackKind === 'near_miss',
        streakDays: updated.state.current,
        timesToday: (timesToday[0]?.c ?? 0) + 1,
      });
      if (xpAwarded > 0) {
        await tx.insert(xpEvents).values({ id: crypto.randomUUID(), userId, amount: xpAwarded, source: 'review', refId: card.id });
        await updateLeagueWeek(userId, xpAwarded, tx);
      }
    }

    // 4) log review (append-only)
    await tx.insert(reviewLogs).values({
      id: crypto.randomUUID(), userId, cardId: card.id, sessionId: input.sessionId ?? null,
      mode, rating: ratingFromVerdict(verdict, card.kind),
      userAnswer: input.answer ?? input.selectedOptionId ?? null,
      graded: { correct: verdict.correct, feedbackKind: verdict.feedbackKind, matchedAnswerId: verdict.matchedAnswerId, note: verdict.note, similarity: verdict.similarity },
      durationMs: input.durationMs ?? 0, xpAwarded,
      confidence: input.confidence ?? null,
    });

    totalXp = await totalXpFor(userId, tx);
    level = levelForXp(totalXp).level;

    // 5) achievements + in-app notifications for streak/achievement moments
    newAchievements = await checkAchievements(userId, verdict.correct, tx);
    for (const a of newAchievements) {
      await recordNotification(userId, { kind: 'achievement', title: `Achievement unlocked: ${a.name}`, body: a.description, href: '/progress' }, tx);
    }
    for (const e of streakEventList) {
      if (e.meta?.track === 'mastery') continue; // mastery track is a signal, not a lever — no push copy in v1
      if (e.kind === 'freeze_used') {
        await recordNotification(userId, { kind: 'streak', title: 'Streak freeze used', body: 'A freeze covered a missed day — your streak is still alive.', href: '/dashboard' }, tx);
      } else if (e.kind === 'comeback') {
        await recordNotification(userId, { kind: 'streak', title: 'Back for another run', body: 'A new streak starts today. Your best is still yours.', href: '/dashboard' }, tx);
      } else if (e.kind === 'freeze_earned') {
        await recordNotification(userId, { kind: 'streak', title: 'Streak freeze earned', body: 'You banked a freeze for a rest day.', href: '/dashboard' }, tx);
      }
    }
  });

  const primary = answersRes.find((a) => a.isPrimary) ?? answersRes[0];
  // The rung the card holds after this review — cram mode leaves the schedule
  // (and therefore the rung) untouched.
  const nextSrsState = {
    stage: (scheduling?.stage ?? prevState.stage) as string,
    intervalDays: scheduling?.intervalDays ?? prevState.intervalDays,
  };
  return {
    verdict,
    primaryAnswer: card.kind === 'cloze' ? primary?.text : undefined,
    modelAnswer: card.kind === 'flashcard' ? primary?.text : undefined,
    explanation: card.explanationMd || undefined,
    xpAwarded, totalXp, level, streak: streakCurrent, streakFreezes, masteryStreak, streakEvents: streakEventList, newAchievements,
    nextDueAt: (scheduling?.dueAt ?? new Date()).toISOString(),
    srsLevel: srsLevelFor(nextSrsState),
    srsLabel: srsLevelInfo(srsLevelFor(nextSrsState)).label,
  };
}

type CardStage = 'new' | 'learning' | 'review' | 'mastered';

function ratingFromVerdict(verdict: { correct: boolean; feedbackKind: string }, kind: string): Rating {
  if (!verdict.correct) return 'again';
  if (verdict.feedbackKind === 'case_only' || verdict.feedbackKind === 'punctuation_only' || verdict.feedbackKind === 'case_and_punctuation') return 'hard';
  if (kind === 'mcq') return 'easy';
  return 'good';
}

function startOfToday(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Executor = Db | Tx;

export async function totalXpFor(userId: string, exec: Executor = db): Promise<number> {
  // `::int` is load-bearing: a bare `sum` comes back from node-postgres as a
  // *string*, so the dashboard was adding and comparing text. Every other
  // aggregate in the app is cast; this one was missed.
  const [row] = await exec
    .select({ total: sql<number>`coalesce(sum(${xpEvents.amount}), 0)::int` })
    .from(xpEvents)
    .where(eq(xpEvents.userId, userId));
  return row?.total ?? 0;
}

/** Add XP to this week's league lobby. Shared by reviews and maths practice. */
export async function updateLeagueWeek(userId: string, xp: number, exec: Executor = db) {
  const weekStart = mondayOf(new Date()).toISOString().slice(0, 10);
  await exec
    .insert(leagueMemberships)
    .values({ userId, weekStart, xpWeek: xp, league: 'bronze' })
    .onConflictDoUpdate({ target: [leagueMemberships.userId, leagueMemberships.weekStart], set: { xpWeek: sql`${leagueMemberships.xpWeek} + ${xp}` } });
}

export function mondayOf(d: Date): Date {
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
}

async function checkAchievements(userId: string, lastCorrect: boolean, exec: Executor = db) {
  const all = await exec.select().from(achievements);
  const owned = await exec.select({ id: userAchievements.achievementId }).from(userAchievements).where(eq(userAchievements.userId, userId));
  const ownedIds = new Set(owned.map((o) => o.id));

  const [reviewCount] = await exec.select({ c: sql<number>`count(*)` }).from(reviewLogs).where(eq(reviewLogs.userId, userId));
  // The funnel's last step: this count already includes the review just
  // inserted, so exactly 1 means the learner's first ever. Server-side because
  // the client cannot know — and it fires for every review mode alike.
  if ((reviewCount?.c ?? 0) === 1) void recordServerEvent('first_review_completed', userId);
  const [streakRow] = await exec.select().from(streaks).where(eq(streaks.userId, userId)).limit(1);
  const totalXp = await totalXpFor(userId, exec);

  // session facts: last 20 reviews in the last hour
  const recent = await exec
    .select({ graded: reviewLogs.graded })
    .from(reviewLogs)
    .where(eq(reviewLogs.userId, userId))
    .orderBy(desc(reviewLogs.reviewedAt))
    .limit(20);
  const lastSessionTotal = recent.length;
  const lastSessionCorrect = recent.filter((r) => r.graded?.correct).length;

  const facts = {
    totalReviews: reviewCount?.c ?? 0,
    streakDays: streakRow?.current ?? 0,
    totalXp,
    lastSessionCorrect,
    lastSessionTotal,
  };
  const unlocked = evaluateAchievements(all.map((a) => ({ id: a.id, rule: a.rule })), facts).filter((id) => !ownedIds.has(id));
  if (unlocked.length === 0) return [];
  await exec.insert(userAchievements).values(unlocked.map((id) => ({ id: crypto.randomUUID(), userId, achievementId: id }))).onConflictDoNothing();
  return all.filter((a) => unlocked.includes(a.id)).map((a) => ({ id: a.id, name: a.name, icon: a.icon, description: a.description }));
}

// ── first exposure ──────────────────────────────────────────────────────────

export type FirstExposure = {
  topic: { id: string; name: string; description: string; subjectId: string; subjectName: string };
  notes: { id: string; title: string; detailedMd: string; summaryMd: string; specRefs: string }[];
  batch: QueueCard[];
  progress: { met: number; total: number; remaining: number };
};

/**
 * A topic's unseen cards, a few at a time, with the notes that explain them.
 *
 * The review queue is built for material you have already met: it deals
 * everything due, which for a freshly imported deck is all of it at once, with
 * nothing to read first. Learning a topic is a different intention, so it gets
 * its own selection rather than a flag on the daily one — cards are chosen for
 * being *new*, capped to a batch, and the notes come back with them so the first
 * attempt is informed rather than a guess.
 *
 * Progress is counted over the whole topic, not the batch, so "4 of 12 met"
 * means what it says and the session has somewhere to finish.
 */
export async function buildFirstExposure(userId: string, topicId: string, batchSize = 4): Promise<FirstExposure | null> {
  const [topic] = await db
    .select({ topic: topics, subjectName: subjects.name })
    .from(topics)
    .innerJoin(subjects, eq(topics.subjectId, subjects.id))
    .where(and(eq(topics.id, topicId), topicReaches(userId)))
    .limit(1);
  if (!topic) return null;

  const limit = Math.min(Math.max(1, batchSize), 20);
  const reachable = and(studiableCardIn(userId, [topicId]))!;

  const [notes, batchRows, tally] = await Promise.all([
    db
      .select()
      .from(lessons)
      .where(and(eq(lessons.topicId, topicId), lessonReaches(userId)))
      .orderBy(asc(lessons.position)),
    db
      .select({ card: cards, topic: topics, subject: subjects, state: cardUserStates, lesson: lessons })
      .from(cards)
      .innerJoin(topics, eq(cards.topicId, topics.id))
      .innerJoin(subjects, eq(topics.subjectId, subjects.id))
      .leftJoin(cardUserStates, and(eq(cardUserStates.cardId, cards.id), eq(cardUserStates.userId, userId)))
      .leftJoin(lessons, and(eq(lessons.id, cards.lessonId), lessonReaches(userId)))
      .where(and(reachable, isNull(cardUserStates.cardId)))
      .orderBy(asc(cards.createdAt))
      .limit(limit),
    db
      .select({
        total: sql<number>`count(*)::int`,
        met: sql<number>`count(${cardUserStates.cardId})::int`,
      })
      .from(cards)
      .innerJoin(topics, eq(cards.topicId, topics.id))
      .leftJoin(cardUserStates, and(eq(cardUserStates.cardId, cards.id), eq(cardUserStates.userId, userId)))
      .where(reachable),
  ]);

  const total = tally[0]?.total ?? 0;
  const met = tally[0]?.met ?? 0;

  return {
    topic: {
      id: topic.topic.id,
      name: topic.topic.name,
      description: topic.topic.description,
      subjectId: topic.topic.subjectId,
      subjectName: topic.subjectName,
    },
    notes: notes.map((l) => ({
      id: l.id, title: l.title, detailedMd: l.detailedMd, summaryMd: l.summaryMd, specRefs: l.specRefs,
    })),
    batch: batchRows.map(({ card, topic: t, subject, state, lesson }) => ({
      id: card.id,
      kind: card.kind,
      topicId: t.id,
      topicName: t.name,
      subjectId: subject.id,
      subjectName: subject.name,
      textWithBlank: card.kind === 'cloze' ? card.textWithBlank : null,
      prompt: card.kind === 'flashcard' ? card.prompt : null,
      question: card.kind === 'mcq' ? card.question : null,
      options: card.kind === 'mcq' ? card.options ?? null : null,
      stage: state?.stage ?? 'new',
      ...srsFields(state),
      dueAt: state?.dueAt ?? null,
      lastReviewedAt: state?.lastReviewedAt ?? null,
      reps: state?.reps ?? 0,
      lapses: state?.lapses ?? 0,
      lessonId: lesson?.id ?? null,
      lessonTitle: lesson?.title ?? null,
    })),
    progress: { met, total, remaining: Math.max(0, total - met) },
  };
}

// ── cram ────────────────────────────────────────────────────────────────────

/**
 * The most cards one cram session will deal per topic. The picker advertises
 * `min(cardCount, CRAM_MAX_PER_TOPIC)` so the number on a topic chip is a
 * number a session can actually deliver — advertising the raw total promised
 * questions the route would never deal.
 */
export const CRAM_MAX_PER_TOPIC = 50;

export async function buildCramQueue(userId: string, topicIds: string[], maxPerTopic: number): Promise<QueueCard[]> {
  if (topicIds.length === 0) return [];
  const condition = studiableCardIn(userId, topicIds);
  const [examOn, assignedTopics] = await Promise.all([examAwareEnabled(), requiredAssignmentTopicIds(userId)]);
  const examMap: Map<string, ExamDateEntry> = examOn ? await examDatesForUser(userId) : new Map();

  // One query per topic rather than one query with a shared LIMIT.
  // `maxPerTopic` is a promise per topic, and `.limit(topics.length * max)`
  // broke it the moment a single topic held more cards than the cap: that one
  // topic consumed the whole budget and the others contributed nothing.
  const perTopic = await Promise.all(
    topicIds.map((topicId) =>
      db
        .select({ card: cards, topic: topics, subject: subjects, state: cardUserStates, lesson: lessons })
        .from(cards)
        .innerJoin(topics, eq(cards.topicId, topics.id))
        .innerJoin(subjects, eq(topics.subjectId, subjects.id))
        .leftJoin(cardUserStates, and(eq(cardUserStates.cardId, cards.id), eq(cardUserStates.userId, userId)))
        .leftJoin(lessons, and(eq(lessons.id, cards.lessonId), lessonReaches(userId)))
        .where(and(condition, eq(cards.topicId, topicId)))
        .orderBy(cards.createdAt)
        .limit(maxPerTopic),
    ),
  );

  // #4/#5: cram groups order by nearest exam date, then required class
  // assignments, then the requested order (stable sort).
  const band = (topicId: string, days: number) =>
    days !== Number.MAX_SAFE_INTEGER ? 0 : assignedTopics.has(topicId) ? 1 : 2;
  const groups = perTopic
    .map((rows, i) => ({ rows, topicId: topicIds[i], days: examMap.get(topicIds[i])?.daysLeft ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => band(a.topicId, a.days) - band(b.topicId, b.days) || a.days - b.days);

  return groups.flatMap((g) => g.rows).map(({ card, topic, subject, state, lesson }) => ({
    id: card.id,
    kind: card.kind,
    topicId: topic.id,
    topicName: topic.name,
    subjectId: subject.id,
    subjectName: subject.name,
    textWithBlank: card.kind === 'cloze' ? card.textWithBlank : null,
    prompt: card.kind === 'flashcard' ? card.prompt : null,
    question: card.kind === 'mcq' ? card.question : null,
    options: card.kind === 'mcq' ? card.options ?? null : null,
    stage: state?.stage ?? 'new',
    ...srsFields(state),
    dueAt: state?.dueAt ?? null,
    lastReviewedAt: state?.lastReviewedAt ?? null,
    reps: state?.reps ?? 0,
    lapses: state?.lapses ?? 0,
    lessonId: lesson?.id ?? null,
    lessonTitle: lesson?.title ?? null,
    examDaysLeft: examMap.get(topic.id)?.daysLeft ?? null,
  }));
}

// ── exam simulator ──────────────────────────────────────────────────────────

/**
 * The subset of `topicIds` this user may actually examine — the picker's rule
 * (`topicReaches`), enforced inside the service so no caller can smuggle an
 * unreachable id through to the question pool. Order is preserved so the
 * seeded paper stays deterministic.
 */
async function reachableExamTopicIds(userId: string, topicIds: string[]): Promise<string[]> {
  if (topicIds.length === 0) return [];
  const rows = await db
    .select({ id: topics.id })
    .from(topics)
    .where(and(inArray(topics.id, topicIds), topicReaches(userId)));
  const allowed = new Set(rows.map((r) => r.id));
  return topicIds.filter((id) => allowed.has(id));
}

export async function buildExam(userId: string, topicIds: string[], questionCount = 5) {
  const scopedTopicIds = await reachableExamTopicIds(userId, topicIds);
  if (scopedTopicIds.length === 0) return [];
  // Interleaved build (#8): stratified across topics instead of first-N oldest.
  // Each topic gets a guaranteed seat, remaining seats go to topics weighted by
  // recent misses; within a topic, questions introducing unseen AO buckets are
  // preferred. Deterministic per (user, topic set, count) so a retry rebuilds
  // the same paper.
  const rows = await db
    .select()
    .from(examQuestions)
    .where(and(inArray(examQuestions.topicId, scopedTopicIds), eq(examQuestions.visibility, 'public')))
    .orderBy(asc(examQuestions.createdAt));
  if (rows.length <= questionCount) return toExamPayload(rows);

  const missRows = await db
    .select({ topicId: cards.topicId, c: sql<number>`count(*)::int` })
    .from(reviewLogs)
    .innerJoin(cards, eq(cards.id, reviewLogs.cardId))
    .where(and(
      eq(reviewLogs.userId, userId),
      inArray(cards.topicId, scopedTopicIds),
      gte(reviewLogs.reviewedAt, new Date(Date.now() - 30 * 86_400_000)),
      sql`(${reviewLogs.graded} ->> 'correct')::boolean = false`,
    ))
    .groupBy(cards.topicId);
  const missWeight = new Map(missRows.map((r) => [r.topicId, r.c]));

  const byTopic = new Map<string, typeof rows>();
  for (const q of rows) {
    const list = byTopic.get(q.topicId) ?? [];
    list.push(q);
    byTopic.set(q.topicId, list);
  }
  const rng = seededRng(`${userId}:${[...scopedTopicIds].sort().join(',')}:${questionCount}`);
  const active = [...byTopic.keys()]
    .filter((t) => byTopic.get(t)!.length > 0)
    .sort((a, b) => (missWeight.get(b) ?? 0) - (missWeight.get(a) ?? 0) || a.localeCompare(b));

  // Guaranteed coverage seat per topic, then weighted remainder by misses.
  const alloc = new Map<string, number>();
  let remaining = questionCount;
  for (const t of active) {
    alloc.set(t, 1);
    remaining -= 1;
  }
  const totalWeight = active.reduce((s, t) => s + 1 + (missWeight.get(t) ?? 0), 0);
  const quotas = active.map((t) => {
    const w = 1 + (missWeight.get(t) ?? 0);
    return { t, exact: (remaining * w) / totalWeight, floor: Math.floor((remaining * w) / totalWeight) };
  });
  for (const qota of quotas) {
    const extra = Math.min(qota.floor, byTopic.get(qota.t)!.length - 1);
    alloc.set(qota.t, (alloc.get(qota.t) ?? 0) + Math.max(0, extra));
  }
  let left = questionCount - [...alloc.values()].reduce((s, n) => s + n, 0);
  for (const qota of quotas.sort((a, b) => (b.exact - b.floor) - (a.exact - a.floor))) {
    while (left > 0 && (alloc.get(qota.t) ?? 0) < byTopic.get(qota.t)!.length) {
      alloc.set(qota.t, (alloc.get(qota.t) ?? 0) + 1);
      left -= 1;
    }
    if (left <= 0) break;
  }

  // Deal each topic's allocation: unseen AO buckets first, then seeded order.
  const picked: typeof rows = [];
  const seenAo = new Set<string>();
  for (const t of active) {
    const want = Math.min(alloc.get(t) ?? 0, questionCount - picked.length);
    if (want <= 0) continue;
    const queue = [...byTopic.get(t)!];
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    const fresh = queue.filter((q) => (q.aoSplit ?? []).some((a) => !seenAo.has(a.ao)));
    const rest = queue.filter((q) => !(q.aoSplit ?? []).some((a) => !seenAo.has(a.ao)));
    for (const q of [...fresh, ...rest].slice(0, want)) {
      picked.push(q);
      for (const a of q.aoSplit ?? []) seenAo.add(a.ao);
    }
  }
  return toExamPayload(picked);
}

function toExamPayload(rows: (typeof examQuestions.$inferSelect)[]) {
  return rows.map((q) => ({
    id: q.id,
    kind: q.kind,
    topicId: q.topicId,
    questionMd: q.questionMd,
    marks: q.marks,
    options: q.kind === 'mcq' ? q.options ?? null : null,
    board: q.board,
    sourceYear: q.sourceYear,
    aoSplit: q.aoSplit ?? null,
    qwcMarks: q.qwcMarks ?? 0,
    questionRef: q.questionRef,
    specRefs: q.specRefs,
    // mark scheme, keywords and model answer stay server-side until submission
  }));
}

/** Deterministic PRNG (mulberry32) seeded from a string — stable paper builds. */
function seededRng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The stored papers for a subject — question papers, mark schemes and
 * formulae sheets the simulator serves alongside generated papers. Ordered
 * so the reading flow works: question papers first, then mark schemes, then
 * reference material.
 */
export async function listExamPapers(subjectId: string) {
  const kindOrder = sql`case ${examPapers.kind} when 'question_paper' then 0 when 'mark_scheme' then 1 else 2 end`;
  return db
    .select({
      id: examPapers.id,
      title: examPapers.title,
      kind: examPapers.kind,
      board: examPapers.board,
      series: examPapers.series,
      paperCode: examPapers.paperCode,
      totalMarks: examPapers.totalMarks,
      durationMinutes: examPapers.durationMinutes,
    })
    .from(examPapers)
    .where(and(eq(examPapers.subjectId, subjectId), eq(examPapers.visibility, 'public')))
    .orderBy(kindOrder, desc(examPapers.createdAt));
}

/** One stored paper, verbatim. Public copies only, unless the owner is asking. */
export async function getExamPaper(paperId: string, userId?: string) {
  const [paper] = await db.select().from(examPapers).where(eq(examPapers.id, paperId)).limit(1);
  if (!paper) return null;
  if (paper.visibility !== 'public' && (!userId || paper.ownerId !== userId)) return null;
  return paper;
}

export type ExamSubmission = { questionId: string; answer?: string; selectedOptionId?: string }[];

export async function submitExam(userId: string, topicIds: string[], submission: ExamSubmission) {
  // Same reachability scope as buildExam: a mixed list must not let questions
  // from an unreachable topic be graded (or recorded on the attempt).
  const scopedTopicIds = await reachableExamTopicIds(userId, topicIds);
  if (scopedTopicIds.length === 0) {
    return { score: 0, maxScore: 0, detail: [], xpAwarded: 0, aoProfile: [] };
  }
  // Grade only the questions that were on the built paper (the submission
  // carries one entry per paper question) — not every question in the topic,
  // which would dilute the score with questions the student never saw.
  const askedIds = submission.map((s) => s.questionId);
  // The topic join is for the result's reference link (F7): every marked row
  // can point back at the notes it was written from. Reachability was already
  // enforced by scopedTopicIds, so the link target is always openable.
  const qs = askedIds.length
    ? await db
        .select({ q: examQuestions, topicId: topics.id, topicName: topics.name, subjectId: subjects.id })
        .from(examQuestions)
        .innerJoin(topics, eq(examQuestions.topicId, topics.id))
        .innerJoin(subjects, eq(topics.subjectId, subjects.id))
        .where(and(inArray(examQuestions.topicId, scopedTopicIds), inArray(examQuestions.id, askedIds), eq(examQuestions.visibility, 'public')))
    : [];
  const detail: {
    questionId: string; userAnswer: string; awarded: number; marks: number; correct: boolean; feedback: string;
    questionRef: string; aoSplit: { ao: string; marks: number }[] | null; modelAnswerMd: string;
    markSchemeMd: string; markingNotesMd: string; qwcMarks: number; matchedPhrases: string[]; missedPhrases: string[];
    topicId: string; subjectId: string; topicName: string;
  }[] = [];
  let score = 0;
  let maxScore = 0;
  for (const row of qs) {
    const q = row.q;
    // QWC marks ride beside the question as *information* — an examiner awards
    // them for written quality, which keyword marking cannot judge. They stay
    // out of the auto-marked maximum so a student is never docked marks they
    // cannot earn from the machine; the result still shows them.
    maxScore += q.marks;
    const sub = submission.find((s) => s.questionId === q.id);
    if (!sub) {
      detail.push({
        questionId: q.id, userAnswer: '', awarded: 0, marks: q.marks, correct: false, feedback: 'Not answered.',
        questionRef: q.questionRef, aoSplit: q.aoSplit ?? null, modelAnswerMd: q.modelAnswerMd,
        markSchemeMd: q.markSchemeMd, markingNotesMd: q.markingNotesMd, qwcMarks: q.qwcMarks ?? 0,
        matchedPhrases: [], missedPhrases: [],
        topicId: row.topicId, subjectId: row.subjectId, topicName: row.topicName,
      });
      continue;
    }
    if (q.kind === 'mcq') {
      const correct = sub.selectedOptionId === q.correctOptionId;
      if (correct) score += q.marks;
      detail.push({
        questionId: q.id,
        // MCQ submissions carry the chosen option id; the result view needs the words.
        userAnswer: sub.selectedOptionId
          ? (q.options ?? []).find((o) => o.id === sub.selectedOptionId)?.text ?? sub.selectedOptionId
          : '',
        awarded: correct ? q.marks : 0, marks: q.marks,
        correct, feedback: correct ? 'Correct.' : 'Incorrect. The mark scheme shows where the marks were.',
        questionRef: q.questionRef, aoSplit: q.aoSplit ?? null, modelAnswerMd: q.modelAnswerMd,
        markSchemeMd: q.markSchemeMd, markingNotesMd: q.markingNotesMd, qwcMarks: q.qwcMarks ?? 0,
        matchedPhrases: [], missedPhrases: [],
        topicId: row.topicId, subjectId: row.subjectId, topicName: row.topicName,
      });
    } else {
      // free response: keyword marking against the mark scheme
      const verdict = gradeFlashcard(sub.answer ?? '', [{
        id: q.id, text: q.markSchemeMd, isPrimary: true, keywords: q.keywords ?? null, minPoints: q.minPoints ?? null,
      }]);
      const ratio = verdict.correct ? 1 : verdict.feedbackKind === 'near_miss' ? 0.5 : 0;
      const awarded = Math.round(q.marks * ratio * 2) / 2; // half-mark granularity
      score += awarded;
      detail.push({
        questionId: q.id, userAnswer: sub.answer ?? '', awarded, marks: q.marks, correct: verdict.correct,
        feedback: verdict.note ?? (verdict.correct ? 'All key points covered.' : 'Compare with the mark scheme.'),
        questionRef: q.questionRef, aoSplit: q.aoSplit ?? null, modelAnswerMd: q.modelAnswerMd,
        markSchemeMd: q.markSchemeMd, markingNotesMd: q.markingNotesMd, qwcMarks: q.qwcMarks ?? 0,
        matchedPhrases: verdict.matchedPhrases ?? [], missedPhrases: verdict.missedPhrases ?? [],
        topicId: row.topicId, subjectId: row.subjectId, topicName: row.topicName,
      });
    }
  }
  await db.insert(examAttempts).values({
    id: crypto.randomUUID(), userId, topicIds: scopedTopicIds, score: Math.round(score * 2), maxScore: maxScore * 2,
    detail: detail.map((d) => ({ questionId: d.questionId, userAnswer: d.userAnswer, awarded: d.awarded, marks: d.marks, correct: d.correct })),
  });
  // exam XP
  const xpAwarded = Math.round(score * 5);
  if (xpAwarded > 0) {
    await db.insert(xpEvents).values({ id: crypto.randomUUID(), userId, amount: xpAwarded, source: 'exam' });
  }
  // The AO profile answers the question a percentage cannot: *what kind* of
  // marks am I losing? Aggregated over the paper's questions, per assessment
  // objective, it turns the mark scheme's structure into a revision directive.
  const aoTotals = new Map<string, { awarded: number; available: number }>();
  for (const d of detail) {
    for (const a of d.aoSplit ?? []) {
      const t = aoTotals.get(a.ao) ?? { awarded: 0, available: 0 };
      t.awarded += d.awarded > 0 ? a.marks : 0;
      t.available += a.marks;
      aoTotals.set(a.ao, t);
    }
  }
  const aoProfile = [...aoTotals.entries()]
    .map(([ao, t]) => ({
      ao,
      awarded: t.awarded,
      available: t.available,
      percentage: t.available > 0 ? Math.round((t.awarded / t.available) * 100) : 0,
    }))
    .sort((a, b) => a.ao.localeCompare(b.ao));
  return { score, maxScore, detail, xpAwarded, aoProfile };
}
