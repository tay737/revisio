# SRS Platform — Architecture

Status: design (v1.0, 2026-09-23)

> **Reading note.** Sections 2–17 below are the original *plan*, written around a
> separate Rails API service. The system was actually built as a single Next.js
> application with route handlers and Drizzle (see §18, "As built"), which is the
> authoritative description of the running system. Treat the Rails sections as
> the design rationale that survived the change of shape, not as a description
> of the repository.
Kind: spaced-repetition learning platform (Bunpro-like) — subjects → topics → lessons/notes → SRS reviews (cloze, flashcard, multiple-choice), cram, learn content, exam simulator, classes/teaching, publishing with review, gamification (XP/streak/leagues/leaderboards/achievements), exports, imports (Anki/CSV), teacher/developer tooling.

## 1. Context & requirements

### 1.1 Product pillars
- Students: daily SRS reviews, flashcards, cram, learn content, exam simulator, progress tracking, exports.
- Teachers: create courses/subjects/topics/notes/questions, manage classes with join codes, monitor student progress.
- Developers (admins): everything a teacher can do, plus SRS algorithm tuning, feature flags, and the public-content review queue.

### 1.2 Hard requirements (from brief)
1. Web first (Vercel), PWA installable; later native Android/iOS via Expo without a rewrite.
2. Next.js + TypeScript + Tailwind + Framer Motion + SWR frontend; Rails API backend; Supabase for auth-adjacent storage (files), email delivery, and — where it wins — Postgres hosting.
3. Three account roles: student (open registration), teacher and developer (behind approval + hidden entry points).
4. Registration: email/password, name, subject selection, optional class join code.
5. Email authentication and 2FA (TOTP) for all roles; mandatory for teacher/developer.
6. Answer checking: cloze fill-in-the-blank with case/punctuation tolerance but hard-fail on wrong content; multiple accepted answers; keyword-based marking for long-form flashcards; one-attempt multiple choice.
7. Imports: Anki (`*.apkg`/tsv/csv), notes, flashcards — uploaded to backend, never only local.
8. User-created private topics/notes; optional publish → manual developer review → public.
9. Gamification: XP, streaks, achievements, leagues/ranks, daily/weekly/monthly leaderboards; opt-out honored everywhere.
10. Exports: transcript as PDF/XLSX/CSV covering covered/uncovered spec points, per-topic rankings, strengths/weaknesses.
11. Teacher dashboard: class rosters, per-student SRS frequency and progress, aggregate heatmap.

### 1.3 Non-goals for v1
- Native mobile store builds (architected for, not built).
- Real-time multiplayer or chat.
- Payments/marketplace payouts.
- Rich WYSIWYG note authoring beyond Markdown + MathJax/KaTeX + images.

## 2. High-level shape

```
┌──────────────────────────────────────────────────────────────────┐
│  Clients                                                          │
│  • Next.js 14 PWA (App Router, RSC for shell, SWR for client)     │
│  • Expo app (later) — same REST API, same JWT                     │
└───────────────┬──────────────────────────────────────────────────┘
                │ HTTPS, JSON:api-ish REST, JWT (short-lived) + refresh
┌───────────────▼──────────────────────────────────────────────────┐
│  Rails 7.1 API-only (.Render/Fly; or Vercel-adjacent container)   │
│  app/ (rails-auth, srs, content, classes, gamification,           │
│        review, import, export, search)                            │
└───────┬──────────────────────────────┬───────────────────────────┘
        │                              │
┌───────▼──────────┐        ┌──────────▼───────────┐
│ PostgreSQL       │        │ Supabase             │
│ (Neon/Supabase)  │        │ • Storage (files)    │
│ — source of truth│        │ • Auth email sending │
│ + RLS defense-   │        │   (or Rails Action-  │
│   in-depth       │        │   Mailer + SES)      │
└──────────────────┘        └──────────────────────┘
```

**Key structural decision — who owns the database:** Supabase is used for **Storage (images/past papers), email delivery integration, and optionally hosted Postgres**, but the **Rails API remains the sole authority for authorization and domain logic**. The Next.js client never talks to Supabase directly. Rationale: SRS scheduling, grading, XP, and content visibility rules are too subtle to duplicate in Postgres RLS; RLS is still enabled as defense-in-depth for direct-connection emergencies, but the app treats Rails as the only door.

## 3. Monorepo layout

```
srs-platform/
├── apps/
│   ├── web/                      # Next.js 14 (App Router, TS, PWA)
│   │   ├── app/                  # routes (see §8)
│   │   ├── components/           # design-system + feature components
│   │   ├── lib/api/              # typed API client + SWR hooks
│   │   ├── lib/domain/           # pure TS: client-side answer preview, XP math mirror
│   │   └── public/manifest.json  # PWA manifest + service worker
│   └── mobile/                   # Expo (later) — shares packages/
├── services/
│   └── api/                      # Rails 7.1 --api
│       ├── app/
│       │   ├── controllers/      # thin: auth, parse, authorize, serialize
│       │   ├── models/           # AR models + invariants
│       │   ├── services/         # use cases (ReviewSession, GradeAnswer, …)
│       │   ├── domain/           # pure logic: SRS algorithms, grading, XP/league
│       │   ├── policies/         # Pundit policies per resource
│       │   ├── serializers/      # JSON serializers (one per entity)
│       │   └── jobs/             # Sidekiq/GoodJob async work
│       ├── db/migrate/           # schema (see §5)
│       └── spec/                 # RSpec: domain unit > service > request
├── packages/
│   ├── shared-types/             # zod schemas → TS types shared by web+mobile
│   └── ui-tokens/                # colors, motion tokens shared across clients
└── docs/
```

Boundaries and flow direction:
- `web → api` (HTTP only). `mobile → api` (HTTP only). Nothing bypasses Rails.
- Inside Rails: `controllers → services → domain`, never sideways; `domain` imports nothing from `controllers`/`serializers`.
- Grading correctness lives in ONE place (`services/api/app/domain/grading`); the web app may *preview* the same rules by compiling the same zod `GradingRule` schema, but the server's verdict is final.

## 4. Cross-cutting decisions

| Concern | Decision | Why |
|---|---|---|
| Auth | Rails-issued JWT (15 min) + rotating refresh token (30 d, httpOnly cookie on web); Supabase Auth not used as source of truth | One identity model across web + future native; native can't rely on cookies |
| Passwords | bcrypt | Rails default, battle-tested |
| 2FA | TOTP (rotp gem), mandatory for teacher/dev, optional for students; recovery codes hashed | Brief requirement; TOTP avoids SMS cost |
| Teacher/dev approval | Registration creates `pending` user + `ApprovalRequest`; dev approves in admin UI; hidden entry at `/staff` (not linked in nav, noindex) | Brief requirement |
| Hidden portals | `/staff/login` (teacher+dev). Obscurity is a UX feature, not a security control — authorization does the real work | Correct security posture |
| Background jobs | GoodJob (Postgres-backed) v1; Sidekiq+Redis if scale demands | Fewer moving pieces at launch |
| Search | Postgres `pg_trgm` + `tsvector` | Avoid Elastic for v1 |
| File uploads | Direct-to-Supabase-Storage presigned PUT from client; Rails validates type/size and records the DB row | Keeps large payloads off the API dyno |
| Emails | Rails ActionMailer + SES (or Supabase SMTP); Devise-style confirmations, password resets | Brief requires email auth |
| Observability | Sentry (both apps), structured logs, `/health` | Vercel + container parity |
| Feature flags | `features` table + dev-only admin toggle; cached 30 s in API, surfaced via `/me` payload | Brief: dev can enable/disable test features |

## 5. Data model (Postgres)

Core ERD (arrows = belongs_to):

```
users ─┬─< enrollments >─ classes
       ├─< user_subjects >─ subjects
       ├─< user_topic_states >─ topics          # SRS queue anchor
       ├─< review_logs >─ reviews >─ cards
       ├─< xp_events, streaks, achievements, league_memberships
       └─< exports

subjects ─< topics ─< lessons (notes) ─< lesson_revisions
subjects ─< specifications ─< spec_points (exam spec coverage)
topics ─< spec_point_links > spec_points                  # many-to-many
topics ─< cards ─< card_answers                            # cloze/flashcard/MCQ
topics ─< exam_questions (past-paper; file + metadata)
users ─< user_content (private topics/notes/flashcards) ─< publishes ─ content_reviews
classes ─< class_join_codes, class_assignments (topics + due dates)
```

Table-by-table (abridged, types in migrations):

- `users`: id (uuid), email (citext, unique), password_digest, name, role (enum: student/teacher/developer, single role per user — simpler and sufficient), status (pending/active/suspended), totp_secret_enc, totp_enabled, recovery_codes (jsonb, hashed), last_login_at, leaderboard_opt_out, preferences (jsonb: default note density, motion reduced).
- `approval_requests`: user_id, role_requested, note, reviewed_by, decided_at.
- `subjects`, `topics`, `lessons`: `visibility` (public/pending_review/private), `owner_id` nullable (null ⇒ official), `position`, `metadata` jsonb. `lessons.content_md` text + `summary_md` text (brief: detailed vs summary notes).
- `specifications` (e.g. "AQA GCSE Biology 8461") → `spec_points` (code "3.4.1.2", body, order). `spec_point_links` ties topics/lessons/cards to spec points — powers "covered/uncovered" transcript.
- `cards`: polymorphic-lite via `kind` (cloze/flashcard/mcq) + columns used per kind:
  - common: topic_id, author, visibility, difficulty (a/b test hook), srs fields: `stage int`, `due_at timestamptz`, `stability real`, `difficulty_real real` (FSRS-style), `lapses`.
  - cloze: `text_with_blank`, `blank_positions jsonb`.
  - flashcard: `prompt`, `explanation_md`.
  - mcq: `question`, `options jsonb` [{id, text}], `correct_option_id`.
- `card_answers`: card_id, `text` (accepted string), `weight` (keyword matching), `is_primary`. Cloze may have many; flashcard answers carry `keywords jsonb` (arrays of {phrase, required, synonyms}).
- `reviews`: user_id, card_id, rating (again/hard/good/easy), `user_answer`, `graded jsonb` (machine verdict + which rule matched), `duration_ms`, `reviewed_at`, `session_id`. Immutable, append-only.
- `review_sessions`: user_id, mode (daily/cram/exam), topic_ids jsonb, started/ended, counts.
- `cram_jobs`: user_id, topic_ids, max_per_topic, note_density (asked up-front per brief), expiry (cram reviews bypass SRS scheduling but log to review_logs).
- `exam_questions`: topic_id, file_path (Supabase), mark_scheme_md, difficulty, source_year, board.
- `classes`: teacher_id, name, subject_id, join_code (6-char, rotating). `class_memberships`: class_id, user_id, joined_at. `class_assignments`: class_id, topic_ids, due_at.
- Gamification: `xp_events` (user, amount, source enum, occurred_at — append-only ledger; totals derived), `streaks` (user, current, best, last_active_date, freezes), `achievements` + `user_achievements`, `leagues` (season + tier bronze→legend), `league_memberships` (user, league, week_start, xp_week).
- `imports`: user_id, kind (anki/csv), file_path, status (pending/parsed/failed/done), report jsonb (per-row errors).
- `content_reviews`: publishable_id/type, reviewer_id, verdict (approved/rejected/changes_requested), note.
- `exports`: user_id, format (pdf/xlsx/csv), scope jsonb, file_path, created_at.

Indexing notes: `user_topic_states (user_id, due_at)` drives the daily queue; `reviews (user_id, reviewed_at)` drives streaks/leaderboards; partial index on `cards WHERE visibility='public'`; `pg_trgm` GIN on topics.title + lessons search vector.

## 6. Roles & authorization

- Pundit, one policy per resource. Matrix:

| Capability | Student | Teacher | Developer |
|---|---|---|---|
| Study, review, cram, export own data | ✅ | ✅ | ✅ |
| Import Anki/CSV, create private content | ✅ | ✅ | ✅ |
| Publish content for review | request | request | request |
| Approve publishes | — | — | ✅ |
| Create/edit public subjects/topics/notes/cards/exam resources | — | ✅ | ✅ |
| Create classes, view class analytics | — | ✅ (own) | ✅ (all) |
| Tune SRS algorithms, feature flags, review approvals, manage users | — | — | ✅ |

- Enforcement is three-layer: route/controller guard (`before_action :authorize_user!` + Pundit), model-level default scopes (public OR owner), and DB RLS as backstop. Client-side role checks are UX only.
- Teachers see only students in their own classes (scoped in `ClassPolicy` / analytics services).

## 7. Grading engine (the heart of correctness)

Location: `services/api/app/domain/grading/`. Pure, dependency-free, 100% unit-tested; services call it; nothing else re-implements it.

```ruby
# domain/grading/verdict.rb
Verdict = Struct.new(:correct, :normalized_user, :matched_answer_id,
                     :matched_rule, :feedback_kind, keyword_init: true)
# feedback_kind: :correct | :case_only | :punctuation_only | :whitespace_only
#              | :near_miss | :wrong | :multiple_choice_wrong
```

1. **Cloze** (`ClozeGrader`): normalize (Unicode NFKC, trim, collapse whitespace) → exact match against any `card_answers.text` → if no exact hit, compare case-folded / punctuation-stripped to classify `:case_only` / `:punctuation_only` (count as correct, show gentle note) → else `:wrong` and surface `primary_answer` (brief: red + display answer).
2. **Flashcard long-form** (`KeywordGrader`): tokenize answer, stem (light Snowball), then: all `required` keyword groups present AND ≥ `min_points` (default 2) matched → correct; partial → `:near_miss` with "you mentioned X, Y — also include Z" style feedback from `explanation_md`; server-side only, never client-trusted.
3. **MCQ** (`McqGrader`): one attempt enforced by request idempotency (`reviews.uniq [user, card, session]` + client disables options); verdict is binary, no partial credit.
4. **Multiple accepted answers**: first-class via `card_answers` rows; ordering by `weight` when explanations differ.
5. All graders receive an immutable `Card` value object and return a `Verdict`; services persist it into `reviews.graded` so the UI replays the exact reasoning.

## 8. SRS engine

Location: `services/api/app/domain/srs/`. Swappable algorithms behind one interface — dev requirement "edit/add algorithms" is satisfied by this seam, not by forking logic.

```ruby
class Scheduler
  def next_interval(card:, rating:, now:) -> ActiveSupport::Duration
  def on_review(card:, rating:) -> new_state(stability:, difficulty:, stage:, due_at:)
end
```

- **v1 default: FSRS-4.5 port** (parameters in `srs_algorithms` table, versioned JSONB) with a simple SM-2 fallback per algorithm selection.
- Stages retained for UI semantics: new → learning → review → mastered (derived from stability thresholds, not stored independently).
- **Cram mode** bypasses scheduling: reviews logged with `mode: 'cram'`, cards returned to prior state, `cram_jobs.expires_at` governs the session window.
- **Daily queue construction** (service `BuildDailyQueue`): due cards across enrolled subjects, interleaved by topic, capped (default 200, user-adjustable), prioritizing overdue > new.
- Algorithm parameters are tenant-level (one global set + optional per-user overrides later); changes create a new `srs_algorithms` row and are audited (`algorithm_audits`), satisfying the dev requirement safely.

## 9. Gamification engine

- `domain/gamification/xp.rb`: pure functions — base XP per correct review by kind & streak multiplier; level curve `xp_for_level(n) = 50 * n^1.5` (tunable); anti-grind: XP per card decays 50% after 5 same-card reviews/day.
- Streaks: incremented by a nightly GoodJob job reading `reviews` for yesterday; freeze tokens earned at 7-day milestones (opt-in spending).
- Leagues: weekly buckets; top-N per league promote, bottom-M demote (Bronze→Silver→Gold→Diamond→Legend); opt-out users (`leaderboard_opt_out`) are excluded from all queries at the service layer and never rendered.
- Leaderboards: materialized via nightly rollup table `leaderboard_snapshots(daily|weekly|monthly)` — no on-request full-table scans; live "your rank" computed from `xp_events` with an index.
- Achievements: rule-based evaluator run post-review (`CheckAchievements` job): first review, 7/30/100-day streaks, topic mastery, exam simulator scores.

## 10. Import pipeline

1. Client uploads file → Supabase Storage (presigned) → `POST /imports {file_path, kind}`.
2. `ParseImportJob` (GoodJob): Anki via `ruby-anki`-style apkg unzip (SQLite `collection.anki2`) or CSV/TSV per template; maps to `cards` + `card_answers`; topics matched by name (fuzzy) else created as user-private.
3. Row-level errors collected into `imports.report`; UI shows an import report with per-row retry (only failed rows re-run).
4. Notes imports create `user_content` lessons (Markdown passthrough; sanititized with sanitize gem, allowlist).

## 11. Export pipeline

- `POST /exports {format, scope}` → `GenerateExportJob` → file to Supabase Storage → signed URL to client.
- CSV/XLSX via `caxlsx` (topics, spec coverage, per-topic mastery %, weakest/strongest lists).
- PDF via `Grover` (Puppeteer) rendering a print stylesheet of the same HTML partial — one template, two formats.
- Coverage computation: for each enrolled subject, spec_points left-joined to linked topics' user_topic_states → covered / in-progress / not started. Teacher-visible class export reuses the same service with a class scope.

## 12. Exam simulator

- `ExamBuildService` selects `exam_questions` by topic/board/difficulty to a time budget; session persisted (`review_sessions.mode='exam'`).
- Questions may be MCQ (auto-graded) or free-response with `mark_scheme_md` — free-response graded with `KeywordGrader` + self-assessment ("did your answer include these points?" checklist) since past-paper answers are prose; auto-verdict only for objective parts.
- Score + per-topic breakdown feeds XP, achievements, and the transcript.

## 13. API surface (REST, versioned `/api/v1`)

Selected endpoints (full OpenAPI generated from rspec request specs via rswag):

```
POST /auth/register            POST /auth/login             POST /auth/refresh
POST /auth/verify-email        POST /auth/2fa/setup         POST /auth/2fa/verify
GET  /me                       PATCH /me (preferences, opt-out)
GET  /subjects                 GET  /subjects/:id/topics
GET  /topics/:id/lessons       GET  /lessons/:id
POST /reviews/sessions         POST /reviews (batch of verdicts applied server-side)
POST /cram                     GET  /queue/today
POST /imports                  GET  /imports/:id
POST /exports                  GET  /exports/:id (signed URL)
GET  /leaderboards?scope=daily|weekly|monthly&league=mine
GET  /achievements             GET  /stats/overview
--- teacher/dev ---
POST /classes                  GET  /classes/:id/students  GET  /classes/:id/analytics
POST /topics                   POST /lessons               POST /cards (bulk)
POST /exam_questions           POST /publications/:id/review   (dev)
GET  /admin/algorithms         PUT  /admin/algorithms/:id  (dev)
GET  /admin/feature_flags      PUT  /admin/feature_flags/:key (dev)
GET  /admin/approval_requests  PUT  /admin/approval_requests/:id (dev)
```

Conventions: cursor pagination, `?include=` sparse fieldsets kept minimal, errors as `{error: {code, message, details}}`, idempotency keys on review submission (`Idempotency-Key` header) so retries after flaky mobile networks never double-apply.

## 14. Frontend architecture (Next.js)

- **App Router** with RSC for shells (dashboards, browse) and client components for interactive review surfaces; SWR handles all client fetching with a single `fetcher` + typed `ApiError`.
- Route groups: `(marketing)` landing, `(auth)` login/register/staff, `(app)` everything behind auth, `admin` dev-only.
- State: SWR cache = remote state; local UI state via React context per feature; **no global Redux**. Optimistic UI for answers (render user input instantly, reconcile with server verdict when it arrives; wrong answers snap with a spring).
- Motion: Framer Motion with shared tokens (`packages/ui-tokens`): 200ms ease-out entrances, shared-layout transitions between review cards, `prefers-reduced-motion` honored globally via a `MotionConfig`.
- Answer input UX (Uber/Apple-like): single-field cloze with auto-advance, haptic-equivalent visual ticks, red shake on wrong + answer reveal, green pulse on correct; MCQ uses large tap targets, instant lock, explanation slide-in.
- PWA: `next-pwa` (service worker, offline shell, install prompt); offline review queue is v2 (conflict-safe because reviews are append-only with client timestamps).
- Design system: Tailwind + `shadcn/ui`-style primitives (owned in `components/ui/`), dark-mode default with light option.

## 15. Native port plan (Expo)

- `apps/mobile` (Expo SDK 51+, React Native) reuses `packages/shared-types` (zod schemas) and the same API.
- Auth: refresh token in `expo-secure-store`, JWT in memory.
- Push notifications (review reminders) via Expo Notifications; web uses web-push from a Rails job.
- Haptics on verdicts via `expo-haptics` — the UX the web approximates.
- Store screenshots/review-notes leverage the streak/league UI; IAP not in scope.
- Because all logic is server-side, the native app is a thin client: no porting of grading/SRS ever.

## 16. Environments, CI/CD, testing

- Environments: local (docker-compose: postgres+rails+web), preview (Vercel per-PR + Rails review app on Fly), staging, production.
- CI (GitHub Actions): web → `tsc`, `eslint`, `vitest`, `playwright` e2e smoke; api → `rspec` (domain unit tests are the bulk: grading, SRS, XP), `rubocop`, `brakeman`, bundle-audit; migrations reversible check.
- Test pyramid: domain > services > request specs > e2e. Grading engine has property-based tests (e.g., case-folding invariance).
- Migrations: expand/contract, no destructive v1; `strong_migrations` enforced.

## 17. Milestones

1. **M0 (wk 1–2)**: monorepo, CI, Rails auth (register/login/email/TOTP), roles + approval flow, hidden staff portal.
2. **M1 (wk 3–5)**: content model (subjects→topics→lessons), student onboarding (subjects + class code), daily queue + cloze/MCQ review loop with grading engine, RSC dashboard shell.
3. **M2 (wk 6–7)**: FSRS scheduling, flashcard keyword grading, cram, review history.
4. **M3 (wk 8–9)**: gamification (XP/streak/leagues/leaderboards/achievements), opt-out.
5. **M4 (wk 10–11)**: teacher tooling (classes, authoring, analytics), publishing + review queue, feature flags/algorithm admin.
6. **M5 (wk 12–13)**: imports (Anki/CSV), exports (PDF/XLSX/CSV), exam simulator, transcript coverage.
7. **M6**: PWA hardening, perf budgets, Expo app kickoff.

---

## 18. As built (v1.1, 2026-09-24)

The Rails service in §2 was never built. The API is Next.js route handlers
against Postgres via Drizzle, deployed as one Vercel project in `dub1`
(co-located with the Supabase database in `eu-west-1`). The *boundaries*
proposed in §2 survived the change; only the transport changed.

### 18.1 Layers, and the direction data flows

```
src/app/**            routes: client pages + /api/v1 route handlers
  └─ import from ↓
src/services/**       use cases; server-only. May touch the db and the domain.
  └─ import from ↓
src/domain/**         pure logic, dependency-free: srs, grading, gamification
src/db/**             schema + pooled client
```

- **Grading and scheduling are pure.** `domain/grading.ts`, `domain/srs.ts` and
  `domain/gamification.ts` import nothing from `db`, `services` or `app`. The
  server's verdict is final; the client never re-implements a rule.
- **Authorization lives in the API layer** (`services/api.ts` → `requireUser`),
  with RLS on all 26 tables as defence in depth, not as the primary control.
- **The client never talks to Postgres or Supabase Auth.** It holds a short-lived
  JWT in memory (`lib/api.ts`) and rotates a refresh cookie transparently.

### 18.2 Frontend structure

```
src/lib/              non-React logic and cross-cutting policy
  theme.ts              ← the only owner of theme policy
  motion.ts             ← the only owner of durations, easings, variants
  profile.ts            ← the only owner of copy/voice (pure, testable)
  useMe.ts              ← the only owner of the /me remote state (SWR)
  api.ts                ← token handling + refresh-on-401
src/components/       shared presentation
  AppShell.tsx          chrome, role-gated nav, signed-out redirect
  PageHeader.tsx        one page-title treatment
  Notice.tsx            one inline result-message treatment
  AuthShell.tsx         one shell for the four auth pages
  PageSkeleton.tsx      one route-loading shape
  ui/icons.tsx          the only importer of lucide-react
  ui/motion/*           Magic-UI-derived motion primitives
  ui/{button,splash,theme-toggle,smooth-cursor}.tsx
```

Rules this structure encodes:

1. **One owner per piece of state.** Theme, motion policy, `/me`, and the
   signed-out redirect each have exactly one home. See `docs/DESIGN-NOTES.md` §5.
2. **Logic apart from rendering.** Personalisation copy, level maths and theme
   resolution are plain functions, not JSX — so they are testable without a
   browser and cannot drift between two pages.
3. **Data apart from presentation.** The icon registry and the nav arrays hold
   keys, never glyphs or colours; colour comes from `currentColor` and the token
   variables.
4. **New pages compose, they do not re-specify.** A page opens with
   `PageHeader`, wraps in `GlassCard`/`.card`, moves with `lib/motion` tokens,
   and gets its words from `lib/profile`. The previous drift (eight page titles,
   eight result-message styles, six hardcoded animation timings, emoji as icons)
   is what this pass removed.

### 18.3 Verification

Each change is checked with `npx tsc --noEmit`, `npm run build`, and a real run
against the production build in a browser (light and dark, desktop and phone).
The design pass additionally verified against `docs/DESIGN.md` by inspection of
computed styles, not just screenshots.
