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
  // ── public profile (v1.5) ─────────────────────────────────────────────────
  // username is the profile address (/u/<username>) and is optional until the
  // learner picks one; id remains the fallback handle so nobody is forced
  // through naming on day one. nickname is the display-only name shown beside
  // or instead of the legal name. Which of these a visitor may see is the
  // owner's call, held in profileVisibility.
  username: text('username'),
  nickname: text('nickname'),
  bio: text('bio'),
  avatarEmoji: text('avatar_emoji'),
  avatarColor: text('avatar_color').notNull().default('ink'),
  /** Uploaded avatar / banner — keys in the media bucket, served via /api/v1/assets. */
  avatarUrl: text('avatar_url'),
  bannerUrl: text('banner_url'),
  /** Token key of the banner wash shown when no image is uploaded ('rose' | 'sea' | …). */
  bannerColor: text('banner_color').notNull().default('dusk'),
  /** Email awaiting confirmation by link — the only thing that swaps it in. */
  pendingEmail: text('pending_email'),
  /** Which profile fields a signed-out visitor may see. Absent key = hidden. */
  profileVisibility: jsonb('profile_visibility')
    .$type<ProfileVisibility>()
    .notNull()
    .default(sql`'{"name":true,"nickname":true,"bio":true,"subjects":true,"stats":true,"achievements":true}'::jsonb`),
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
  usernameIdx: uniqueIndex('users_username_idx').on(t.username),
}));

/** The fields of a profile whose exposure the owner controls. */
export type ProfileVisibility = {
  name: boolean;
  nickname: boolean;
  bio: boolean;
  subjects: boolean;
  stats: boolean;
  achievements: boolean;
};

export const emailTokens = pgTable('email_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // `email_change` widens the type only — the column is plain text, so old
  // rows and old databases need no migration for the new kind.
  kind: text('kind', { enum: ['verify', 'reset', 'email_change'] }).notNull(),
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
  /** Maths practice is opt-in per subject — it is a standalone tool, not part of the SRS. */
  mathsEnabled: boolean('maths_enabled').notNull().default(false),
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

// ── Maths practice (standalone — never touches the SRS) ─────────────────────
// A set pins which generator concepts a topic practises. Questions themselves
// are never stored: they are derived from "concept:difficulty:seed" ids by
// domain/maths.ts and marked from the same ids, so a set is just curriculum,
// not content.

export const mathSets = pgTable('math_sets', {
  id: text('id').primaryKey(),
  topicId: text('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  /** concept ids from domain/maths.ts CONCEPTS, e.g. ["linear-eq","expand"] */
  concepts: jsonb('concepts').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  defaultCount: integer('default_count').notNull().default(10),
  defaultDifficulty: text('default_difficulty', { enum: ['easy', 'medium', 'hard', 'mixed'] }).notNull().default('mixed'),
  /** Teachers and developers author sets; kept so staff can list their own. */
  ownerId: text('owner_id'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  topicIdx: index('math_sets_topic_idx').on(t.topicId),
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
  // `learn` is first exposure (see services/study.ts) — the column is plain
  // text with no check constraint, so this is a type-level widening only.
  mode: text('mode', { enum: ['daily', 'cram', 'exam', 'learn'] }).notNull().default('daily'),
  rating: text('rating', { enum: ['again', 'hard', 'good', 'easy'] }).notNull(),
  userAnswer: text('user_answer'),
  graded: jsonb('graded').$type<{
    correct: boolean;
    feedbackKind: string;
    matchedAnswerId?: string;
    note?: string;
    /** how a similar-marked near-answer related to the accepted one */
    similarity?: { relation: string; matchedAnswer: string };
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
  // ── exam-board fidelity (v1.8) ──────────────────────────────────────────
  /** Assessment objective split, e.g. [{ao:'AO1', marks:2}]. Marks sum to `marks`. */
  aoSplit: jsonb('ao_split').$type<{ ao: string; marks: number }[]>(),
  /** A model answer students can compare theirs against after marking. */
  modelAnswerMd: text('model_answer_md').notNull().default(''),
  /** How an examiner awards the marks, prose — the "why" beside the "what". */
  markingNotesMd: text('marking_notes_md').notNull().default(''),
  /** QWC marks ride beside the question's own marks (extended responses). */
  qwcMarks: integer('qwc_marks'),
  /** Which stored paper this question was transcribed from. */
  paperId: text('paper_id'),
  /** Question number as printed, e.g. "8" or "15a". */
  questionRef: text('question_ref').notNull().default(''),
  /** Spec/lesson coverage notes shown with the result. */
  specRefs: text('spec_refs').notNull().default(''),
  visibility: text('visibility', { enum: ['public', 'private'] }).notNull().default('public'),
  ownerId: text('owner_id'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  topicIdx: index('exam_questions_topic_idx').on(t.topicId),
}));

/**
 * A past paper, specimen or formulae sheet, stored verbatim so the exam
 * simulator can serve the real document beside its questions. The paper is
 * an index page (a link out) for the formulae-sheet kind; question papers
 * hold the full extracted text of the board document.
 */
export const examPapers = pgTable('exam_papers', {
  id: text('id').primaryKey(),
  subjectId: text('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  /** 'question_paper' | 'mark_scheme' | 'formulae_sheet' | 'other' */
  kind: text('kind', { enum: ['question_paper', 'mark_scheme', 'formulae_sheet', 'other'] }).notNull().default('question_paper'),
  board: text('board').notNull().default(''),
  /** e.g. 'Specimen 2020' or 'June 2022' */
  series: text('series').notNull().default(''),
  /** e.g. '1350/1' or 'Core Exam Paper A' */
  paperCode: text('paper_code').notNull().default(''),
  totalMarks: integer('total_marks'),
  durationMinutes: integer('duration_minutes'),
  /** Verbatim extracted text of the document, markdown. */
  contentMd: text('content_md').notNull().default(''),
  visibility: text('visibility', { enum: ['public', 'private'] }).notNull().default('public'),
  ownerId: text('owner_id'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  subjectIdx: index('exam_papers_subject_idx').on(t.subjectId),
  /** One stored copy per board+series+code+kind — re-importing a paper updates
   *  it in place rather than stacking duplicates. */
  uniqueDoc: uniqueIndex('exam_papers_doc_idx').on(t.subjectId, t.board, t.series, t.paperCode, t.kind),
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
  source: text('source', { enum: ['review', 'exam', 'streak', 'achievement', 'import', 'maths'] }).notNull(),
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

/**
 * A configured season.
 *
 * This table replaced the `SEASON_EPOCH_MS` arithmetic in `domain/seasons.ts`.
 * The epoch derived every boundary from two constants, which meant nobody could
 * open a season early, stretch one over a holiday, name it, or pay a different
 * reward — all of which are ordinary things an operator needs to do. The dates
 * are now rows, editable from the admin panel, and `domain/seasons.ts` became
 * the single pure reader of them so the web app, the API and both phones still
 * agree on what "now" means.
 *
 * `state` is the operator's intent; the dates are the truth. A row marked
 * `active` whose window has passed is closed by arithmetic regardless, so a
 * forgotten flag can never leave the app with two live seasons.
 */
export const seasons = pgTable('seasons', {
  /** 1-based; the primary key, and what `season_results.season_number` refers to. */
  number: integer('number').primaryKey(),
  /** Display name. Null means "Season N" — the generated default. */
  name: text('name'),
  /** Inclusive, 00:00 UTC. */
  startsAt: timestamp('starts_at', { mode: 'date' }).notNull(),
  /** Exclusive — the first instant of the next season. */
  endsAt: timestamp('ends_at', { mode: 'date' }).notNull(),
  state: text('state', { enum: ['draft', 'active', 'closed'] }).notNull().default('draft'),
  /** Per-tier reward overrides, `{ "gold": { name, detail, icon } }`. Empty means
   *  the built-in `SEASON_REWARDS` ladder. Sparse on purpose: an operator who
   *  renames one reward should not have to restate the other nine. */
  rewards: jsonb('rewards').$type<Record<string, { name: string; detail: string; icon: string }>>(),
  /** Free-text note for the operator, shown in the admin panel only. */
  note: text('note'),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  windowIdx: index('seasons_window_idx').on(t.startsAt, t.endsAt),
}));

/**
 * What a learner finished a season on.
 *
 * One row per (user, season), written once when the season closes and never
 * rewritten except to stamp `reward_claimed_at`. It exists because the
 * showcase is a *record*, not a calculation: a final rank is the one moment the
 * product wants to show off, and recomputing it from an XP ledger that keeps
 * taking entries would mean the crest on the wall moves under them.
 *
 * The season windows come from the `seasons` table above; this table records
 * what happened, not when.
 */
export const seasonResults = pgTable('season_results', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  seasonNumber: integer('season_number').notNull(),
  /** The tier held at the final whistle — the reward is keyed on this.
   *  Plain text rather than an enum: the ladder grew from five tiers to ten and
   *  an eleventh should be a one-line change in `domain/ranked.ts`, not an
   *  ALTER TYPE. */
  finalTier: text('final_tier').notNull(),
  finalDivision: integer('final_division').notNull(),
  /** Zero-based rung on the ladder, so a season board can be ordered without a re-read. */
  finalRankIndex: integer('final_rank_index').notNull(),
  /** Season RP earned inside the window. */
  finalRp: integer('final_rp').notNull().default(0),
  /** Reviews inside the window — the placement gate. */
  reviews: integer('reviews').notNull().default(0),
  /** `SEASON_REWARDS[tier].id`; empty when the season was not placed. */
  rewardId: text('reward_id').notNull().default(''),
  /** When the learner took the reward. Null until they do. */
  rewardClaimedAt: timestamp('reward_claimed_at', { mode: 'date' }),
  endedAt: timestamp('ended_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  pk: uniqueIndex('season_results_pk').on(t.userId, t.seasonNumber),
  seasonIdx: index('season_results_season_idx').on(t.seasonNumber, t.finalRankIndex),
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

// ── media (v1.6) ────────────────────────────────────────────────────────────
// The ledger of every object the app has presigned into the media bucket.
// The bytes live in S3-compatible storage; this table answers "who uploaded
// what, where is it" without listing the bucket.
export const mediaAssets = pgTable('media_assets', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['avatar', 'banner'] }).notNull(),
  key: text('key').notNull(),
  contentType: text('content_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index('media_assets_user_idx').on(t.userId),
  keyUnique: uniqueIndex('media_assets_key_idx').on(t.key),
}));

// ── profile badges (v1.7) ───────────────────────────────────────────────────
// A badge is a chip a developer mints — a label, an optional glyph and a
// colour treatment — and grants to a user's profile. Badges ride beside the
// role badge: a developer might grant '<3' to a community helper, or
// 'Alpha Tester' to everyone who used the app before launch. One row per
// (user, badge); the profile shows every grant in order.
export const profileBadges = pgTable('profile_badges', {
  id: text('id').primaryKey(),
  /** Short slug, e.g. 'heart', 'alpha-tester' — shown to admins in pickers. */
  slug: text('slug').notNull(),
  /** What the chip reads, e.g. '<3' or 'Alpha Tester'. */
  label: text('label').notNull(),
  /** Optional registry icon name; empty renders no glyph. */
  icon: text('icon').notNull().default(''),
  /** Chip treatment: 'gold' | 'primary' | 'good' | 'rose'. */
  color: text('color', { enum: ['gold', 'primary', 'good', 'rose'] }).notNull().default('gold'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  slugUnique: uniqueIndex('profile_badges_slug_idx').on(t.slug),
}));

export const userProfileBadges = pgTable('user_profile_badges', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  badgeId: text('badge_id').notNull().references(() => profileBadges.id, { onDelete: 'cascade' }),
  grantedBy: text('granted_by'),
  grantedAt: timestamp('granted_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  pk: uniqueIndex('user_profile_badges_pk').on(t.userId, t.badgeId),
}));
