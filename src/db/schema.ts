import { pgTable, text, integer, real, boolean, jsonb, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ── Users & auth ────────────────────────────────────────────────────────────
// Single-role model (student | teacher | developer), status gates login.
// totpSecret should be encrypted at rest in production.

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['student', 'teacher', 'developer'] }).notNull().default('student'),
  status: text('status', { enum: ['pending', 'active', 'suspended'] }).notNull().default('pending'),
  emailVerifiedAt: timestamp('email_verified_at', { mode: 'date' }),
  totpSecret: text('totp_secret'),
  totpEnabled: boolean('totp_enabled').notNull().default(false),
  recoveryCodes: jsonb('recovery_codes').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  leaderboardOptOut: boolean('leaderboard_opt_out').notNull().default(false),
  prefs: jsonb('prefs')
    .$type<{ noteDensity?: 'detailed' | 'summary'; reducedMotion?: boolean }>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  emailIdx: uniqueIndex('users_email_idx').on(t.email),
}));

export const emailTokens = pgTable('email_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['verify', 'reset'] }).notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
  usedAt: timestamp('used_at', { mode: 'date' }),
}, (t) => ({
  tokenIdx: index('email_tokens_hash_idx').on(t.tokenHash),
}));

export const refreshTokens = pgTable('refresh_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
  revokedAt: timestamp('revoked_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  tokenIdx: index('refresh_tokens_hash_idx').on(t.tokenHash),
}));

export const approvalRequests = pgTable('approval_requests', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  roleRequested: text('role_requested', { enum: ['teacher', 'developer'] }).notNull(),
  note: text('note').notNull().default(''),
  status: text('status', { enum: ['pending', 'approved', 'rejected'] }).notNull().default('pending'),
  reviewedBy: text('reviewed_by'),
  decidedAt: timestamp('decided_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
});

// ── Content tree: subjects → topics → lessons ───────────────────────────────
// visibility: public = official or approved; pending_review = awaiting dev
// approval; private = owner-only user content.

export const subjects = pgTable('subjects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description').notNull().default(''),
  ownerId: text('owner_id'), // null = official/public subject
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  slugIdx: uniqueIndex('subjects_slug_idx').on(t.slug),
}));

export const topics = pgTable('topics', {
  id: text('id').primaryKey(),
  subjectId: text('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description').notNull().default(''),
  visibility: text('visibility', { enum: ['public', 'pending_review', 'private'] }).notNull().default('public'),
  ownerId: text('owner_id'),
  position: integer('position').notNull().default(0),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  slugIdx: uniqueIndex('topics_slug_idx').on(t.slug),
  subjIdx: index('topics_subject_idx').on(t.subjectId),
}));

export const lessons = pgTable('lessons', {
  id: text('id').primaryKey(),
  topicId: text('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  detailedMd: text('detailed_md').notNull().default(''),
  summaryMd: text('summary_md').notNull().default(''),
  specRefs: text('spec_refs').notNull().default(''), // e.g. "3.4.1.2; 3.4.1.3"
  visibility: text('visibility', { enum: ['public', 'pending_review', 'private'] }).notNull().default('public'),
  ownerId: text('owner_id'),
  position: integer('position').notNull().default(0),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  topicIdx: index('lessons_topic_idx').on(t.topicId),
}));

// ── Cards & answers ─────────────────────────────────────────────────────────

export const cards = pgTable('cards', {
  id: text('id').primaryKey(),
  topicId: text('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
  lessonId: text('lesson_id'),
  kind: text('kind', { enum: ['cloze', 'flashcard', 'mcq'] }).notNull(),
  // cloze
  textWithBlank: text('text_with_blank'),
  // flashcard
  prompt: text('prompt'),
  // mcq
  question: text('question'),
  options: jsonb('options').$type<{ id: string; text: string }[]>(),
  correctOptionId: text('correct_option_id'),
  explanationMd: text('explanation_md').notNull().default(''),
  visibility: text('visibility', { enum: ['public', 'pending_review', 'private'] }).notNull().default('public'),
  ownerId: text('owner_id'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  topicIdx: index('cards_topic_idx').on(t.topicId),
}));

export const cardAnswers = pgTable('card_answers', {
  id: text('id').primaryKey(),
  cardId: text('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
  text: text('text').notNull(), // accepted answer (cloze) or model answer (flashcard)
  isPrimary: boolean('is_primary').notNull().default(false),
  // flashcard keyword rules: [{ required: true, phrase: 'mitochondria', synonyms: ['mitochondrion'] }]
  keywords: jsonb('keywords').$type<{ required: boolean; phrase: string; synonyms?: string[] }[]>(),
  minPoints: integer('min_points'),
}, (t) => ({
  cardIdx: index('card_answers_card_idx').on(t.cardId),
}));

// ── User ↔ content state ────────────────────────────────────────────────────

export const userSubjects = pgTable('user_subjects', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  subjectId: text('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  pk: uniqueIndex('user_subjects_pk').on(t.userId, t.subjectId),
}));

export const userTopicStates = pgTable('user_topic_states', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  topicId: text('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
  stage: text('stage', { enum: ['new', 'learning', 'review', 'mastered'] }).notNull().default('new'),
  dueAt: timestamp('due_at', { mode: 'date' }),
  startedAt: timestamp('started_at', { mode: 'date' }),
  masteredAt: timestamp('mastered_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  pk: uniqueIndex('user_topic_states_pk').on(t.userId, t.topicId),
  dueIdx: index('user_topic_states_due_idx').on(t.userId, t.dueAt),
}));

export const cardUserStates = pgTable('card_user_states', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  cardId: text('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
  stage: text('stage', { enum: ['new', 'learning', 'review', 'mastered'] }).notNull().default('new'),
  dueAt: timestamp('due_at', { mode: 'date' }).notNull().default(sql`'epoch'::timestamp`), // epoch = immediately due
  intervalDays: real('interval_days').notNull().default(0),
  ease: real('ease').notNull().default(2.5),
  stability: real('stability').notNull().default(0),
  difficulty: real('difficulty').notNull().default(5),
  lapses: integer('lapses').notNull().default(0),
  reps: integer('reps').notNull().default(0),
  algorithm: text('algorithm').notNull().default('sm2'), // which scheduler last touched this card
  lastReviewedAt: timestamp('last_reviewed_at', { mode: 'date' }),
}, (t) => ({
  pk: uniqueIndex('card_user_states_pk').on(t.userId, t.cardId),
  dueIdx: index('card_user_states_due_idx').on(t.userId, t.dueAt),
}));

// ── Reviews (append-only ledger) ────────────────────────────────────────────

export const reviewLogs = pgTable('review_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  cardId: text('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
  sessionId: text('session_id'),
  mode: text('mode', { enum: ['daily', 'cram', 'exam'] }).notNull().default('daily'),
  rating: text('rating', { enum: ['again', 'hard', 'good', 'easy'] }).notNull(),
  userAnswer: text('user_answer'),
  graded: jsonb('graded').$type<{
    correct: boolean;
    feedbackKind: string;
    matchedAnswerId?: string;
    note?: string;
  }>(),
  durationMs: integer('duration_ms').notNull().default(0),
  xpAwarded: integer('xp_awarded').notNull().default(0),
  reviewedAt: timestamp('reviewed_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  userTimeIdx: index('review_logs_user_time_idx').on(t.userId, t.reviewedAt),
  cardIdx: index('review_logs_card_idx').on(t.cardId),
}));

export const cramSessions = pgTable('cram_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  topicIds: jsonb('topic_ids').$type<string[]>().notNull(),
  maxPerTopic: integer('max_per_topic').notNull().default(20),
  noteDensity: text('note_density', { enum: ['detailed', 'summary'] }).notNull().default('detailed'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
});

// ── Exam simulator ──────────────────────────────────────────────────────────

export const examQuestions = pgTable('exam_questions', {
  id: text('id').primaryKey(),
  topicId: text('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
  questionMd: text('question_md').notNull(),
  markSchemeMd: text('mark_scheme_md').notNull().default(''),
  kind: text('kind', { enum: ['mcq', 'free_response'] }).notNull().default('free_response'),
  options: jsonb('options').$type<{ id: string; text: string }[]>(),
  correctOptionId: text('correct_option_id'),
  keywords: jsonb('keywords').$type<{ required: boolean; phrase: string; synonyms?: string[] }[]>(),
  minPoints: integer('min_points'),
  marks: integer('marks').notNull().default(1),
  sourceYear: integer('source_year'),
  board: text('board').notNull().default(''),
  visibility: text('visibility', { enum: ['public', 'private'] }).notNull().default('public'),
  ownerId: text('owner_id'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  topicIdx: index('exam_questions_topic_idx').on(t.topicId),
}));

export const examAttempts = pgTable('exam_attempts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  topicIds: jsonb('topic_ids').$type<string[]>().notNull(),
  score: integer('score').notNull().default(0),
  maxScore: integer('max_score').notNull().default(0),
  detail: jsonb('detail').$type<{ questionId: string; userAnswer: string; awarded: number; marks: number; correct: boolean }[]>(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
});

// ── Gamification ────────────────────────────────────────────────────────────

export const xpEvents = pgTable('xp_events', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  amount: integer('amount').notNull(),
  source: text('source', { enum: ['review', 'exam', 'streak', 'achievement', 'import'] }).notNull(),
  refId: text('ref_id'),
  occurredAt: timestamp('occurred_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  userTimeIdx: index('xp_events_user_time_idx').on(t.userId, t.occurredAt),
  timeIdx: index('xp_events_time_idx').on(t.occurredAt),
}));

export const streaks = pgTable('streaks', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  current: integer('current').notNull().default(0),
  best: integer('best').notNull().default(0),
  lastActiveDate: text('last_active_date'), // YYYY-MM-DD (UTC)
});

export const achievements = pgTable('achievements', {
  id: text('id').primaryKey(), // slug e.g. 'first-review'
  name: text('name').notNull(),
  description: text('description').notNull(),
  icon: text('icon').notNull().default('🏆'),
  rule: jsonb('rule').$type<{ kind: string; threshold?: number; scope?: string }>().notNull(),
});

export const userAchievements = pgTable('user_achievements', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  achievementId: text('achievement_id').notNull().references(() => achievements.id, { onDelete: 'cascade' }),
  unlockedAt: timestamp('unlocked_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  pk: uniqueIndex('user_achievements_pk').on(t.userId, t.achievementId),
}));

export const leagueMemberships = pgTable('league_memberships', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  league: text('league', { enum: ['bronze', 'silver', 'gold', 'diamond', 'legend'] }).notNull().default('bronze'),
  weekStart: text('week_start').notNull(), // YYYY-MM-DD Monday
  xpWeek: integer('xp_week').notNull().default(0),
}, (t) => ({
  pk: uniqueIndex('league_memberships_pk').on(t.userId, t.weekStart),
}));

// ── Classes (teacher tooling) ───────────────────────────────────────────────

export const classes = pgTable('classes', {
  id: text('id').primaryKey(),
  teacherId: text('teacher_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  subjectId: text('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  joinCode: text('join_code').notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  codeIdx: uniqueIndex('classes_join_code_idx').on(t.joinCode),
}));

export const classMemberships = pgTable('class_memberships', {
  classId: text('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  joinedAt: timestamp('joined_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  pk: uniqueIndex('class_memberships_pk').on(t.classId, t.userId),
}));

// ── Imports / publishing / feature flags / audit ────────────────────────────

export const imports = pgTable('imports', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['csv', 'tsv', 'anki_tsv'] }).notNull(),
  filename: text('filename').notNull(),
  status: text('status', { enum: ['pending', 'done', 'failed'] }).notNull().default('pending'),
  targetTopicId: text('target_topic_id'),
  report: jsonb('report').$type<{
    total: number; created: number; failed: number;
    errors: { row: number; message: string }[];
  }>(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
});

export const featureFlags = pgTable('feature_flags', {
  key: text('key').primaryKey(),
  description: text('description').notNull().default(''),
  enabled: boolean('enabled').notNull().default(false),
});

export const auditLog = pgTable('audit_log', {
  id: text('id').primaryKey(),
  actorId: text('actor_id'),
  action: text('action').notNull(),
  target: text('target').notNull().default(''),
  meta: jsonb('meta').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
});
