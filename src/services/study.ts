import 'server-only';
import { and, desc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  cards, cardAnswers, cardUserStates, examQuestions, reviewLogs, streaks, subjects,
  topics, userAchievements, userSubjects, userTopicStates, xpEvents, achievements,
  leagueMemberships, examAttempts, featureFlags,
} from '@/db/schema';
import { gradeCloze, gradeFlashcard, gradeMcq, type AcceptedAnswer } from '@/domain/grading';
import { getScheduler, newCardState, type CardState, type Rating } from '@/domain/srs';
import { evaluateAchievements, levelForXp, nextStreak, utcDateKey, xpForReview } from '@/domain/gamification';

// ── visibility (single source of truth for what a user can see) ────────────

export function visibleContentCondition(userId: string) {
  return or(
    eq(cards.visibility, 'public'),
    eq(cards.ownerId, userId)
  );
}

// ── algorithms config (dev-tunable via feature flag payload) ──────────────

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

// ── daily queue ────────────────────────────────────────────────────────────

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
};

export async function buildDailyQueue(userId: string, limit = 20): Promise<QueueCard[]> {
  const subs = await db.select({ subjectId: userSubjects.subjectId }).from(userSubjects).where(eq(userSubjects.userId, userId));
  const subjectIds = subs.map((s) => s.subjectId);
  if (subjectIds.length === 0) return [];

  const now = new Date();
  const rows = await db
    .select({
      card: cards,
      topic: topics,
      subject: subjects,
      state: cardUserStates,
    })
    .from(cards)
    .innerJoin(topics, eq(cards.topicId, topics.id))
    .innerJoin(subjects, eq(topics.subjectId, subjects.id))
    .leftJoin(
      cardUserStates,
      and(eq(cardUserStates.cardId, cards.id), eq(cardUserStates.userId, userId))
    )
    .where(
      and(
        inArray(topics.subjectId, subjectIds),
        eq(topics.visibility, 'public'),
        eq(cards.visibility, 'public'),
        // due: new cards, or state with dueAt <= now
        or(
          isNull(cardUserStates.cardId),
          sql`${cardUserStates.dueAt} <= ${now.toISOString()}`
        )!
      )
    )
    .orderBy(sql`CASE WHEN ${cardUserStates.cardId} IS NULL THEN 0 ELSE 1 END`, cardUserStates.dueAt, cards.createdAt)
    .limit(limit);

  return rows.map(({ card, topic, subject, state }) => ({
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
  }));
}

// ── review submission ──────────────────────────────────────────────────────

export type SubmitReviewInput = {
  cardId: string;
  answer?: string;          // cloze/flashcard
  selectedOptionId?: string; // mcq
  durationMs?: number;
  mode?: 'daily' | 'cram' | 'exam';
  sessionId?: string;
};

export type SubmitReviewResult = {
  verdict: ReturnType<typeof gradeCloze>;
  primaryAnswer?: string;
  modelAnswer?: string;
  explanation?: string;
  xpAwarded: number;
  totalXp: number;
  level: number;
  streak: number;
  newAchievements: { id: string; name: string; icon: string; description: string }[];
  nextDueAt: string;
};

export async function submitReview(userId: string, input: SubmitReviewInput): Promise<SubmitReviewResult> {
  const [card] = await db.select().from(cards).where(eq(cards.id, input.cardId)).limit(1);
  if (!card) throw new Error('card not found');
  const answers = await db.select().from(cardAnswers).where(eq(cardAnswers.cardId, card.id));
  const accepted: AcceptedAnswer[] = answers.map((a) => ({
    id: a.id, text: a.text, isPrimary: a.isPrimary,
    keywords: a.keywords ?? null, minPoints: a.minPoints ?? null,
  }));

  // 1) grade (server-side, final)
  let verdict: SubmitReviewResult['verdict'];
  if (card.kind === 'cloze') verdict = gradeCloze(input.answer ?? '', accepted);
  else if (card.kind === 'flashcard') verdict = gradeFlashcard(input.answer ?? '', accepted);
  else verdict = gradeMcq(input.selectedOptionId ?? null, card.correctOptionId ?? '');

  // 2) schedule (unless cram — cram reviews don't move the schedule)
  const algoConfig = await getAlgorithmConfig();
  const [state] = await db
    .select()
    .from(cardUserStates)
    .where(and(eq(cardUserStates.userId, userId), eq(cardUserStates.cardId, card.id)))
    .limit(1);
  const scheduler = getScheduler(algoConfig.default, 'sm2');
  const params = { ...scheduler.defaultParams(), ...(algoConfig.params[algoConfig.default] ?? {}) };
  const prevState = state
    ? { ...state, stage: state.stage as CardStage }
    : newCardState(algoConfig.default);
  const scheduling = input.mode === 'cram' ? null : scheduler.schedule(prevState, ratingFromVerdict(verdict, card.kind), params, new Date());

  if (scheduling) {
    await db
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
  let xpAwarded = 0;
  let streakCurrent = 0;
  if (input.mode !== 'exam') {
    const timesToday = await db
      .select({ c: sql<number>`count(*)` })
      .from(reviewLogs)
      .where(and(eq(reviewLogs.userId, userId), eq(reviewLogs.cardId, card.id), gte(reviewLogs.reviewedAt, startOfToday())));
    const [streakRow] = await db.select().from(streaks).where(eq(streaks.userId, userId)).limit(1);
    const cur = streakRow ?? { current: 0, best: 0, lastActiveDate: null };
    const updated = nextStreak(cur, utcDateKey());
    streakCurrent = updated.current;
    await db
      .insert(streaks)
      .values({ userId, current: updated.current, best: updated.best, lastActiveDate: updated.lastActiveDate })
      .onConflictDoUpdate({ target: streaks.userId, set: { current: updated.current, best: updated.best, lastActiveDate: updated.lastActiveDate } });

    xpAwarded = xpForReview({
      cardKind: card.kind,
      correct: verdict.correct,
      nearMiss: verdict.feedbackKind === 'near_miss',
      streakDays: updated.current,
      timesToday: (timesToday[0]?.c ?? 0) + 1,
    });
    if (xpAwarded > 0) {
      await db.insert(xpEvents).values({ id: crypto.randomUUID(), userId, amount: xpAwarded, source: 'review', refId: card.id });
      await updateLeagueWeek(userId, xpAwarded);
    }
  }

  const totalXp = await totalXpFor(userId);
  const { level } = levelForXp(totalXp);

  // 4) log review (append-only)
  await db.insert(reviewLogs).values({
    id: crypto.randomUUID(), userId, cardId: card.id, sessionId: input.sessionId ?? null,
    mode: input.mode ?? 'daily', rating: ratingFromVerdict(verdict, card.kind),
    userAnswer: input.answer ?? input.selectedOptionId ?? null,
    graded: { correct: verdict.correct, feedbackKind: verdict.feedbackKind, matchedAnswerId: verdict.matchedAnswerId, note: verdict.note },
    durationMs: input.durationMs ?? 0, xpAwarded,
  });

  // 5) achievements
  const newAchievements = await checkAchievements(userId, verdict.correct);

  const primary = answers.find((a) => a.isPrimary) ?? answers[0];
  return {
    verdict,
    primaryAnswer: card.kind === 'cloze' ? primary?.text : undefined,
    modelAnswer: card.kind === 'flashcard' ? primary?.text : undefined,
    explanation: card.explanationMd || undefined,
    xpAwarded, totalXp, level, streak: streakCurrent, newAchievements,
    nextDueAt: (scheduling?.dueAt ?? new Date()).toISOString(),
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

export async function totalXpFor(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${xpEvents.amount}), 0)` })
    .from(xpEvents)
    .where(eq(xpEvents.userId, userId));
  return row?.total ?? 0;
}

async function updateLeagueWeek(userId: string, xp: number) {
  const weekStart = mondayOf(new Date()).toISOString().slice(0, 10);
  await db
    .insert(leagueMemberships)
    .values({ userId, weekStart, xpWeek: xp, league: 'bronze' })
    .onConflictDoUpdate({ target: [leagueMemberships.userId, leagueMemberships.weekStart], set: { xpWeek: sql`${leagueMemberships.xpWeek} + ${xp}` } });
}

export function mondayOf(d: Date): Date {
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
}

async function checkAchievements(userId: string, lastCorrect: boolean) {
  void lastCorrect;
  const all = await db.select().from(achievements);
  const owned = await db.select({ id: userAchievements.achievementId }).from(userAchievements).where(eq(userAchievements.userId, userId));
  const ownedIds = new Set(owned.map((o) => o.id));

  const [reviewCount] = await db.select({ c: sql<number>`count(*)` }).from(reviewLogs).where(eq(reviewLogs.userId, userId));
  const [streakRow] = await db.select().from(streaks).where(eq(streaks.userId, userId)).limit(1);
  const totalXp = await totalXpFor(userId);

  // session facts: last 20 reviews in the last hour
  const recent = await db
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
  await db.insert(userAchievements).values(unlocked.map((id) => ({ userId, achievementId: id }))).onConflictDoNothing();
  return all.filter((a) => unlocked.includes(a.id)).map((a) => ({ id: a.id, name: a.name, icon: a.icon, description: a.description }));
}

// ── cram ───────────────────────────────────────────────────────────────────

export async function buildCramQueue(userId: string, topicIds: string[], maxPerTopic: number): Promise<QueueCard[]> {
  void userId;
  const rows = await db
    .select({ card: cards, topic: topics, subject: subjects })
    .from(cards)
    .innerJoin(topics, eq(cards.topicId, topics.id))
    .innerJoin(subjects, eq(topics.subjectId, subjects.id))
    .where(and(inArray(cards.topicId, topicIds), eq(cards.visibility, 'public')))
    .limit(topicIds.length * maxPerTopic);
  return rows.map(({ card, topic, subject }) => ({
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
    stage: 'new',
  }));
}

// ── exam simulator ─────────────────────────────────────────────────────────

export async function buildExam(userId: string, topicIds: string[], questionCount = 5) {
  void userId;
  const rows = await db
    .select()
    .from(examQuestions)
    .where(and(inArray(examQuestions.topicId, topicIds), eq(examQuestions.visibility, 'public')))
    .limit(questionCount);
  return rows.map((q) => ({
    id: q.id,
    kind: q.kind,
    topicId: q.topicId,
    questionMd: q.questionMd,
    marks: q.marks,
    options: q.kind === 'mcq' ? q.options ?? null : null,
    board: q.board,
    sourceYear: q.sourceYear,
    // mark scheme & keywords stay server-side until submission
  }));
}

export type ExamSubmission = { questionId: string; answer?: string; selectedOptionId?: string }[];

export async function submitExam(userId: string, topicIds: string[], submission: ExamSubmission) {
  const qs = await db.select().from(examQuestions).where(inArray(examQuestions.topicId, topicIds));
  const detail: { questionId: string; userAnswer: string; awarded: number; marks: number; correct: boolean; feedback: string }[] = [];
  let score = 0;
  let maxScore = 0;
  for (const q of qs) {
    maxScore += q.marks;
    const sub = submission.find((s) => s.questionId === q.id);
    if (!sub) {
      detail.push({ questionId: q.id, userAnswer: '', awarded: 0, marks: q.marks, correct: false, feedback: 'Not answered.' });
      continue;
    }
    if (q.kind === 'mcq') {
      const correct = sub.selectedOptionId === q.correctOptionId;
      if (correct) score += q.marks;
      detail.push({
        questionId: q.id, userAnswer: sub.selectedOptionId ?? '', awarded: correct ? q.marks : 0, marks: q.marks,
        correct, feedback: correct ? 'Correct.' : `Incorrect. Mark scheme: ${q.markSchemeMd}`,
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
      });
    }
  }
  await db.insert(examAttempts).values({
    id: crypto.randomUUID(), userId, topicIds, score: Math.round(score * 2), maxScore: maxScore * 2,
    detail: detail.map((d) => ({ questionId: d.questionId, userAnswer: d.userAnswer, awarded: d.awarded, marks: d.marks, correct: d.correct })),
  });
  // exam XP
  const xpAwarded = Math.round(score * 5);
  if (xpAwarded > 0) {
    await db.insert(xpEvents).values({ id: crypto.randomUUID(), userId, amount: xpAwarded, source: 'exam' });
  }
  return { score, maxScore, detail, xpAwarded };
}
