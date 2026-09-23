# Revisio — Architecture

Status: as-built (v1.0, 2026-09-23)

> **Note:** This document originated as the pre-build design (Rails API + Next.js web).
> During implementation the Rails API was replaced by Next.js Route Handlers running the
> same layered architecture (routes → services → domain), because the build environment
> had no Ruby toolchain. Every boundary below is preserved, so extracting a Rails (or
> any) API service later is mechanical: the domain layer is pure TypeScript with zero
> framework imports, and the REST contract at `/api/v1` is unchanged.

Kind: spaced-repetition learning platform (Bunpro-like) — subjects → topics → lessons/notes → SRS reviews (cloze, flashcard, multiple-choice), cram, learn content, exam simulator, classes/teaching, publishing with review, gamification (XP/streak/leagues/leaderboards/achievements), exports, imports (Anki/CSV), teacher/developer tooling.

## 1. Context & requirements

### 1.1 Product pillars
- Students: daily SRS reviews, flashcards, cram, learn content, exam simulator, progress tracking, exports.
- Teachers: create courses/subjects/topics/notes/questions, manage classes with join codes, monitor student progress.
- Developers (admins): everything a teacher can do, plus SRS algorithm tuning, feature flags, and the public-content review queue.

### 1.2 Hard requirements (from brief)
1. Web first (Vercel), PWA installable; later native Android/iOS via Expo without a rewrite.
2. Next.js + TypeScript + Tailwind + Framer Motion + SWR frontend.
3. Three account roles: student (open registration), teacher and developer (behind approval + hidden entry points).
4. Registration: email/password, name, subject selection, optional class join code.
5. Email authentication and 2FA (TOTP) for all roles; mandatory for teacher/developer.
6. Answer checking: cloze fill-in-the-blank with case/punctuation tolerance but hard-fail on wrong content; multiple accepted answers; keyword-based marking for long-form flashcards; one-attempt multiple choice.
7. Imports: Anki (tsv/csv exports), notes, flashcards — uploaded to backend, never only local.
8. User-created private topics/notes; optional publish → manual developer review → public.
9. Gamification: XP, streaks, achievements, leagues/ranks, daily/weekly/monthly leaderboards; opt-out honored everywhere.
10. Exports: transcript as XLSX/CSV covering covered/uncovered spec points, per-topic rankings, strengths/weaknesses.
11. Teacher dashboard: class rosters, per-student SRS frequency and progress.

### 1.3 Non-goals for v1
- Native mobile store builds (architected for, not built).
- Real-time multiplayer or chat.
- Payments/marketplace payouts.
- Rich WYSIWYG note authoring beyond Markdown.

## 2. High-level shape (as built)

```
┌──────────────────────────────────────────────────────────────────┐
│  Clients                                                          │
│  • Next.js 14 PWA (App Router, RSC for shell, SWR for client)     │
│  • Expo app (later) — same REST API, same JWT                     │
└───────────────┬──────────────────────────────────────────────────┘
                │ HTTPS, JSON REST, JWT (short-lived) + refresh
┌───────────────▼──────────────────────────────────────────────────┐
│  Next.js Route Handlers (/api/v1) — thin controllers             │
│    src/app/api/v1/**            auth → services → domain          │
└───────┬──────────────────────────────┬───────────────────────────┘
        │                              │
┌───────▼──────────┐        ┌──────────▼───────────┐
│ PostgreSQL       │        │ Supabase platform    │
│ (Supabase)       │        │ • hosted Postgres    │
│ — source of truth│        │ • Storage (files)    │
└──────────────────┘        └──────────────────────┘
```

**Key structural decision — who owns the database:** Supabase provides hosted
Postgres (via a dedicated least-privilege `revisio_app` role, not the service role)
and file storage. The application remains the sole authority for authorization and
domain logic — grading, SRS scheduling, XP, and content-visibility rules are too
subtle to duplicate in Postgres RLS, which stays disabled on app tables.

## 3. Repository layout (as built)

```
revisio/
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── (app)/                # authed app: dashboard, review, cram, learn,
│   │   │                         # exam, progress, library, teacher, admin
│   │   ├── api/v1/               # REST controllers (thin)
│   │   ├── login|register/       # student auth pages
│   │   ├── staff/                # hidden teacher/developer portal (noindex)
│   │   └── page.tsx              # marketing landing
│   ├── components/               # AppShell, AuthForm, PwaRegister
│   ├── db/                       # drizzle schema + lazy pooled client
│   ├── domain/                   # PURE logic: grading, srs, gamification
│   ├── lib/                      # client fetcher (api), session hook
│   └── services/                 # use-cases: auth, api helpers, study,
│                                 # stats, roles
├── scripts/seed.ts               # demo data seeding
├── drizzle/                      # generated SQL migration
├── public/                       # manifest.webmanifest, sw.js, icon.svg
└── docs/ARCHITECTURE.md
```

Boundaries and flow direction:
- `pages → /api/v1 → services → domain`, never sideways.
- `domain/` imports nothing from `app/`, `services/`, or `db/` — it is pure and
  unit-testable (grading, SRS math, XP/league math).
- Grading correctness lives in ONE place (`src/domain/grading.ts`); the server's
  verdict is final — the client only renders it.

## 4. Cross-cutting decisions

| Concern | Decision | Why |
|---|---|---|
| Auth | JWT (15 min, `jose`) + rotating refresh token (30 d, httpOnly cookie) | One identity model across web + future native |
| Passwords | bcrypt (`bcryptjs`) | Battle-tested |
| 2FA | TOTP (`otplib`), mandatory for teacher/dev, optional for students | Brief requirement; TOTP avoids SMS cost |
| Teacher/dev approval | Registration creates `pending` user + `approval_requests` row; dev approves in admin UI; hidden entry at `/staff/*` (noindex) | Brief requirement |
| Hidden portals | `/staff/login` (teacher+dev). Obscurity is a UX feature, not a security control — authorization does the real work | Correct security posture |
| Background jobs | none in v1 — streaks/XP computed transactionally on review submit | Fewer moving pieces at launch |
| Emails | verification tokens stored in `email_tokens`; delivery deferred to Supabase SMTP/Resend integration | Brief requires email auth flow |
| Feature flags | `feature_flags` table + dev-only admin toggle; surfaced via `/me` payload | Brief: dev can enable/disable test features |
| SRS algorithms | `srs_algorithms`-style config in `feature_flags` (`srs.algorithm` = sm2 \| fsrs-lite) with params; dev-tunable | Brief: dev can edit/add algorithms |

## 5. Data model (Postgres, `src/db/schema.ts`)

Core ERD (arrows = belongs_to):

```
users ─┬─< class_memberships >─ classes
       ├─< user_subjects >─ subjects
       ├─< card_user_states >─ cards        # SRS queue anchor
       ├─< review_logs >─ cards
       ├─< xp_events, streaks, user_achievements >─ achievements
       └─< exports, exam_attempts

subjects ─< topics ─< lessons ─< lesson_progress
subjects ─< classes
topics ─< cards ─< card_answers           # cloze/flashcard/MCQ
topics ─< exam_questions
users ─< topics (owner_id, private) → visibility: public|pending_review|private
```

Key columns:

- `users`: role (student/teacher/developer), status (pending/active/suspended),
  `totp_secret`, `totp_enabled`, `leaderboard_opt_out`, `email_verified`, `preferences` jsonb.
- `approval_requests`: role_requested, note, reviewed_by, decided_at, status.
- `topics.visibility` (public/pending_review/private) + `owner_id` (null ⇒ official).
- `lessons`: `detailed_md` + `summary_md` (brief: detailed vs summary notes), `spec_refs`.
- `cards`: `kind` (cloze/flashcard/mcq) + per-kind columns (`text_with_blank`, `prompt`,
  `question` + `options` jsonb + `correct_idx`).
- `card_answers`: `text` (accepted answer), `keywords` jsonb (flashcard marking), `is_primary`.
- `card_user_states`: per-user SRS state — `stage`, `ease`, `interval_days`, `due_at`,
  `stability`, `difficulty` (FSRS-lite), `lapses`. Index `(user_id, due_at)` drives the queue.
- `review_logs`: append-only; `mode` (daily/cram/exam), `verdict` jsonb (machine grading),
  `user_answer`, `duration_ms`. Cram reviews bypass scheduling but are logged.
- Gamification: `xp_events` (append-only ledger), `streaks`, `achievements` + `user_achievements`.
- `exam_questions` (mcq or free_response + `mark_scheme_md`, `board`, `source_year`), `exam_attempts`.

## 6. Roles & authorization

| Capability | Student | Teacher | Developer |
|---|---|---|---|
| Study, review, cram, export own data | ✅ | ✅ | ✅ |
| Import Anki/CSV, create private content | ✅ | ✅ | ✅ |
| Publish content for review | request | ✅ direct | ✅ direct |
| Approve publishes + staff approvals | — | — | ✅ |
| Create/edit public subjects/topics/notes/cards | — | ✅ | ✅ |
| Create classes, view class analytics | — | ✅ (own) | ✅ (all) |
| Tune SRS algorithms, feature flags, manage users | — | — | ✅ |

Enforced server-side in route handlers + `src/services/roles.ts` helpers;
client-side role checks are UX only. Teachers see only students in their own classes.

## 7. Grading engine (the heart of correctness)

Location: `src/domain/grading.ts`. Pure, dependency-free, deterministic.

1. **Cloze** — normalize (NFKC, trim, collapse whitespace) → exact match against any
   `card_answers.text` → if no exact hit, compare case-folded / punctuation-stripped
   to classify `case_only` / `punctuation_only` (counts as correct with a gentle note)
   → else `wrong` and surface the primary answer (red + display answer per brief).
2. **Flashcard long-form** — required/optional keyword groups; all required + ≥ min
   optional → correct; partial → `near_miss` with matched/missed phrases and the
   model answer. Multiple accepted answers are first-class.
3. **MCQ** — one attempt enforced by idempotent review submission; binary verdict.

Services persist the verdict into `review_logs.verdict` so the UI replays the exact reasoning.

## 8. SRS engine

Location: `src/domain/srs.ts`. Two algorithms behind one `Scheduler` interface —
the dev "edit/add algorithms" requirement is satisfied by this seam:

- **sm2** (default): classic SM-2 ease/interval math with learning steps.
- **fsrs-lite**: stability/difficulty model (FSRS-inspired) with requested-retention parameter.
- Stages: new → learning → review → mastered.
- **Cram** bypasses scheduling entirely (logged with `mode: 'cram'`).
- **Daily queue**: due cards across enrolled subjects, prioritizing overdue > new,
  interleaved by topic, capped per request.
- Parameters dev-tunable via the admin route (audit-logged).

## 9. Gamification engine

`src/domain/gamification.ts` — pure functions:
- XP per correct review by kind (cloze 10, mcq 8, flashcard 12) with streak multipliers;
  wrong answers earn nothing. Level curve `xp_for_level(n) = 50·n^1.5`.
- Streaks updated transactionally on review submit (current/best, last-active date).
- Leagues bronze→legend; daily/weekly/monthly leaderboards computed from `xp_events`
  with opt-out (`leaderboard_opt_out`) filtered at the service layer everywhere.
- Achievements evaluated post-review (first review, streak milestones, XP milestones).

## 10. Import pipeline

1. Client uploads file (multipart) → `/api/v1/import`.
2. Server parses CSV/TSV (Anki export format: front<TAB>back) or `cloze: stem | answer` lines;
   maps to `cards` + `card_answers` under a user-private topic (auto-created by name).
3. Row-level errors collected into a report returned to the UI.

## 11. Export pipeline

`/api/v1/exports?format=csv|json|xlsx` renders the transcript from one data service:
per-subject spec coverage (covered/uncovered), per-topic mastery ranking, strongest/weakest
lists. XLSX via `exceljs`, CSV via `csv-stringize`... `csv-stringify`, JSON passthrough.

## 12. Exam simulator

- `/api/v1/exam` selects `exam_questions` by topic to the requested count.
- MCQ auto-graded; free-response graded against `mark_scheme_md` via the keyword grader
  with per-point feedback; score feeds XP and achievements.
- Attempts persisted (`exam_attempts`) and listed in the UI.

## 13. API surface (REST, `/api/v1`)

```
POST /auth/register        POST /auth/login        POST /auth/refresh
POST /auth/logout          POST /auth/verify-email POST /auth/2fa
GET  /me                   PATCH /me (preferences, opt-out)
GET  /subjects             POST /subjects (enroll)
GET  /content              POST /content (create topic/lessons/cards, publish)
GET  /lessons?topicId=     GET  /lessons/:id
GET  /queue/today          POST /reviews
GET  /cram                 POST /cram
GET  /gamification?scope=  GET/POST /exam
GET/POST /import           GET /exports?format=
POST /classes/join
GET/POST /teacher          (classes, join codes, roster, publish, subjects)
GET/POST /admin            (approvals, flags, algorithms, users, publish queue)
```

Conventions: JSON bodies, errors as `{ error: string }` with proper status codes,
cookie-based refresh rotation, `Authorization: Bearer <access>` for API clients.

## 14. Frontend architecture (Next.js)

- **App Router**: route group `(app)` for the authed app; `staff/` group for hidden portals;
  marketing landing at `/`.
- State: SWR cache = remote state; local UI state via React hooks; no global Redux.
- Motion: Framer Motion — 150–200ms ease-out entrances, shared card transitions,
  spring progress bar; `prefers-reduced-motion` respected.
- Answer UX: single-field cloze with instant server verdict; red reveal on wrong with
  the answer shown; green pulse on correct; MCQ large tap targets, instant lock.
- PWA: `public/manifest.webmanifest` + network-first service worker (`public/sw.js`),
  registered by `components/PwaRegister.tsx`; API calls never cached.
- Design system: Tailwind with CSS-variable theme tokens (`bg`, `panel`, `edge`, `ink`,
  `muted`, `accent`, `good`, `bad`); dark-first.

## 15. Native port plan (Expo)

- Reuse the same REST API + JWT; refresh token in `expo-secure-store`.
- Push reminders via Expo Notifications; haptics on verdicts via `expo-haptics`.
- All logic is server-side — the native app is a thin client.

## 16. Environments, CI/CD, testing

- Local: `npm run dev` against a local Postgres or the Supabase pooler (`DATABASE_URL`).
- Deploy: Vercel (web+API). Set `DATABASE_URL`, `AUTH_SECRET`, `APP_URL`.
- Schema: `npx drizzle-kit generate` + apply the SQL in `drizzle/` (already applied to Supabase).
- Seed: `npm run db:seed` (demo users/subjects/topics/cards; idempotent via TRUNCATE).
- Verification: `npm run typecheck`, `npm run build`, plus an end-to-end smoke of
  login → queue → review → XP → leaderboard.

## 17. Milestones shipped / next

1. ✅ Auth (register/login/refresh/verify/2FA), roles, hidden staff portal, approvals.
2. ✅ Content model + daily queue + cloze/flashcard/MCQ review loop with grading engine.
3. ✅ SM-2 + FSRS-lite scheduling, cram mode.
4. ✅ Gamification (XP/streak/leagues/leaderboards/achievements + opt-out).
5. ✅ Teacher tooling (classes, join codes, roster analytics, publish), dev admin
   (approvals, flags, algorithms, users, publish queue).
6. ✅ Imports (CSV/TSV/Anki export), exports (CSV/XLSX/JSON), exam simulator.
7. Next: Expo app, email delivery integration, spec-point coverage tables for the
   transcript's covered/uncovered view.
