# Revisio

**Learn it once.**

![version](https://img.shields.io/badge/version-1.0.0--alpha.10-7AA2F7?style=flat-square)
![web](https://img.shields.io/badge/web-feature--complete-2EA043?style=flat-square)
![mobile](https://img.shields.io/badge/mobile-sideload%20alpha-FB8C00?style=flat-square)
![license](https://img.shields.io/badge/license-proprietary-BB9AF7?style=flat-square)

![Next.js](https://img.shields.io/badge/Next.js%2014-000000?style=flat-square&logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Drizzle](https://img.shields.io/badge/Drizzle-C5F74F?style=flat-square&logo=drizzle&logoColor=black)
![Tailwind](https://img.shields.io/badge/Tailwind%204-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![Kotlin](https://img.shields.io/badge/Kotlin-7F52FF?style=flat-square&logo=kotlin&logoColor=white)
![Swift](https://img.shields.io/badge/Swift-F05138?style=flat-square&logo=swift&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=flat-square&logo=vercel&logoColor=white)

A spaced-repetition learning platform: subjects → topics → lessons and cards, a
daily queue you actually finish, and a rank worth defending.

Revisio schedules every card it is confident you are about to forget, grades
your answer server-side, and turns the result into XP, streaks, leagues and a
transcript you can export. It is built for students first, with teacher and
admin surfaces for authoring content, running classes and reviewing what gets
published.

> [!IMPORTANT]
> **This is not open source.** Revisio is proprietary — all rights reserved.
> Copying, modifying, redistributing, deploying or training models on this code
> is prohibited. See [`LICENSE`](LICENSE) for the exact terms.

> [!NOTE]
> **Status: `1.0.0-alpha.10`.** The web app is feature-complete for v1. Both
> mobile clients are native — Kotlin + Compose over a native engine on Android,
> Swift + SwiftUI over the same engine on iOS — and each ships as a
> sideload-only alpha artefact. The iOS `.ipa` is unsigned and must be re-signed
> to run; see [Native clients](#native-clients) and [`docs/MOBILE.md`](docs/MOBILE.md).

---

## Contents

- [What it is](#what-it-is)
- [Product surfaces](#product-surfaces)
- [The four rules](#the-four-rules)
- [Architecture](#architecture)
- [Reads, writes and the mirror](#reads-writes-and-the-mirror)
- [The domain core](#the-domain-core)
- [Data model](#data-model)
- [Native clients](#native-clients)
- [Offline and PWA](#offline-and-pwa)
- [Getting started](#getting-started)
- [Environment](#environment)
- [Scripts](#scripts)
- [Verification](#verification)
- [Deployment](#deployment)
- [Limitations](#limitations)
- [Documentation](#documentation)
- [License](#license)

---

## What it is

Three roles share one application:

| Role | Gets |
| --- | --- |
| **Student** | Open registration, the daily review queue, cram, exam-style sessions, maths drills, progress and rank, exports, content imports |
| **Teacher** | Everything a student gets, plus classes with join codes, rosters, per-student progress, and authoring of public content |
| **Developer** | Everything a teacher gets, plus content review, roles, feature flags and SRS tuning behind `/staff/login` |

The queue is the product. Every other surface either feeds it (learn, author,
import), relieves it (cram, practice) or reports on it (progress, transcript,
teacher views).

---

## Product surfaces

| Surface | Route | For |
| --- | --- | --- |
| Landing | `/` | Everyone — what Revisio is |
| Dashboard | `/dashboard` | Today's queue, streak, rank, subjects |
| Review | `/review` | The daily SRS session: cloze, flashcard, multiple choice |
| Learn | `/learn` → `/learn/[subjectId]` → `/[topicId]` | Catalogue, topics with specification coverage, then the reading screen |
| Cram | `/cram` | Time-boxed practice that bypasses scheduling |
| Exam | `/exam` | Timed exam-style sessions with mark schemes |
| Practice | `/practice` | Generated maths drills — never touches scheduling or XP |
| Progress | `/progress` | Rank ladder, lobbies, achievements, transcript |
| Library | `/library` | Your content: author, import, merge, publish |
| Teacher | `/teacher` | Classes, rosters, per-student progress |
| Admin | `/admin` | Content review, seasons, roles, feature flags |
| Public profile | `/u/[handle]` | What a learner chooses to show |
| Staff | `/staff/login` | Hidden entry point for teacher and developer accounts |

Plus the expected auth and legal surfaces: register, login, verify-email,
password reset, privacy, terms, cookie policy and accessibility.

---

## The four rules

The codebase is organised around four rules, and most of the structure below
exists to keep them true.

1. **The server decides.** Grading, scheduling and XP are computed server-side
   and never re-derived in a client, so two clients cannot disagree. A review
   answered offline is graded by the same rules so it can be studied *now*, but
   it is a preview: the server re-grades it and awards the XP.
2. **Content that is visible is studyable.** If a topic reaches you, its
   questions are answerable — a rule with exactly one owner.
3. **Reviewing is append-only.** Every review is logged with its verdict, so a
   flaky network can never award XP twice.
4. **One owner per fact.** Version, theme, motion, navigation, visibility and
   the ranked snapshot each live in one module.

---

## Architecture

One Next.js application. The Rails service in the original design was never
built; the *boundaries* proposed for it survived, only the transport changed.

```text
        Web (PWA)          Android (Kotlin)        iOS (Swift)
            │                    │                     │
            └──────────── same /api/v1 contract, same JWT ─────┘
                                 │
                                 ▼
   src/app/**        routes · RSC shells · 43 /api/v1 handlers
                                 │
                                 ▼
   src/services/**   use cases, server-only (20 modules)
                                 │
                                 ▼
   src/domain/**     pure, dependency-free: grading · srs · gamification
                     ranked · seasons · maths · markdown · similarity
                                 │
                                 ▼
   src/db/**         pooled client · schema (33 tables) · replica · sync
                        │                              │
                        ▼                              ▼
                 Supabase primary                 Neon read mirror
```

Dependencies point one way only. `domain` imports nothing from `db`, `services`
or `app`; a route never reaches past a service to touch the database; and no
client imports a server-only module.

| Layer | Holds | May import |
| --- | --- | --- |
| `src/app/**` | Pages, RSC shells, `/api/v1` route handlers | services, lib, components |
| `src/services/**` | Use cases: auth, study, profile, content ops, seasons, rate limiting | domain, db |
| `src/domain/**` | Pure rules: grading, SRS, XP, ranked, seasons, maths, markdown | nothing |
| `src/db/**` | Schema, pooled client, replica reader, change-capture sync | — |
| `src/lib/**` | Non-React policy and client-safe rules (theme, motion, api, visibility) | — |
| `src/components/**` | Shared presentation | lib |
| `mobile/**` | Native engines and surfaces, per platform | `/api/v1` over HTTP |

Authorization lives in the API layer (`services/api.ts` → `requireUser`), with
Postgres RLS as defence in depth rather than the primary control. The client
never talks to Postgres or Supabase Auth directly: it holds a short-lived JWT in
memory and rotates a refresh cookie transparently.

---

## Reads, writes and the mirror

The primary is Supabase Postgres. A second Postgres on Neon carries most read
traffic, because the pooler's connection ceiling is a per-project budget shared
by every serverless instance — so every query moved off the primary is one that
cannot be refused a slot during a review submit or a token refresh.

`readDb()` returns the mirror when `NEON_DATABASE_URL` is set and the primary
otherwise, so the app is single-database when the mirror is absent and no caller
has to branch. The split is a correctness decision, not a performance tweak:

| Reads the mirror | Reads the primary, always |
| --- | --- |
| `/me` payloads, dashboard stats | Access-token verification |
| Leaderboards, lobbies, achievements | Refresh-token rotation |
| Subjects, topics, lessons, card text | Review submission — one scheduler, one grading path |
| Teacher rosters, admin listings, catalogues | Every queue the learner is *dealt* |

The rule: **a read that must not be stale for identity, XP or scheduling is a
primary read; everything else streams.**

Keeping the two honest needs no logical-replication slot, because every primary
key here is `text` — there is no key minting for two databases to disagree
about. Instead:

```text
  write ──► AFTER trigger on the app tables
                      │
                      ▼
             _sync_events (seq, table, op, pk, row jsonb)
                      │
                      ▼
      drain oldest-first ──► upsert on the other side
                      │            (parked + retried if a parent
                      │             row has not arrived yet)
                      ▼
            delete consumed events only after the batch commits
```

Replicated writes set a local flag so the mirror never re-captures, the drain is
deadline-bounded (`NEON_DRAIN_BUDGET_MS`, 25s) so an oversized backlog makes
*partial* progress instead of restarting each tick, and a per-review kick drains
eagerly without ever blocking the response.

---

## The domain core

Everything a client could get wrong lives here, with no I/O.

| Module | Owns |
| --- | --- |
| `domain/grading.ts` | The verdict: cloze normalisation, case/punctuation tolerance, keyword marking, MCQ |
| `domain/srs.ts` | Scheduling: stages, intervals, due dates, lapses |
| `domain/gamification.ts` | XP award rules and achievements |
| `domain/ranked.ts` | Ten tiers × three divisions, rank points, crest geometry |
| `domain/seasons.ts` | Season windows and placement |
| `domain/maths.ts` | Drill generation and semantic expression equality (mathjs) |
| `domain/markdown.ts` | Note rendering, with a safe-URL policy |
| `domain/similarity.ts`, `domain/cloze-gen.ts`, `domain/quiz-gen-from-notes.ts` | Near-miss feedback and generated questions |
| `domain/parse-import.ts` | Pure Anki/CSV parsing into a staged import |

Two of these move beyond the web. `domain/grading.ts` emits golden vectors that
both native ports must reproduce, and `domain/ranked.ts` / `domain/srs.ts` are
generated into Kotlin and Swift ladders. A rule change on the web therefore
**fails the mobile test suites** until the clients follow — deliberately.

---

## Data model

33 tables in `src/db/schema.ts`, grouped by what they describe:

| Group | Tables |
| --- | --- |
| Identity | `users`, `emailTokens`, `refreshTokens`, `approvalRequests` |
| Content | `subjects`, `topics`, `lessons`, `cards`, `cardAnswers`, `mathSets` |
| Study state | `userSubjects`, `userTopicStates`, `cardUserStates`, `reviewLogs`, `cramSessions` |
| Exams | `examQuestions`, `examPapers`, `examAttempts` |
| Progression | `xpEvents`, `streaks`, `achievements`, `userAchievements`, `leagueMemberships`, `seasons`, `seasonResults` |
| Teaching | `classes`, `classMemberships` |
| Operations | `imports`, `featureFlags`, `auditLog`, `mediaAssets`, `profileBadges`, `userProfileBadges` |

Design decisions worth knowing before changing anything:

- **Reviews are an append-only ledger.** `reviewLogs` records the verdict and
  which rule matched, so the UI can replay the exact reasoning and a retry can
  never double-count.
- **XP is derived, not stored as a total.** `xpEvents` is the ledger; totals come
  from aggregates. Season XP and season review counts are two aggregates, never
  a join.
- **Seasons are rows, not arithmetic.** `seasons` holds the window and state, a
  partial unique index makes two live seasons impossible, and the dates decide
  which season is live — so a forgotten flag is harmless. `seasonResults`
  records only what a season produced.
- **Visibility has one owner.** The profile filter lives in `services/profile.ts`;
  hidden fields return `null` and are never filtered on the client.

Migrations live in `drizzle/` and are applied to **both** databases; RLS policies
sit outside them and must be checked in `pg_policies` when writes fail wholesale.

---

## Native clients

The apps are native clients, not a wrapper around the website. They speak the
same `/api/v1` API and carry a port of the grading engine, so a review can be
marked with no server.

| | Android | iOS |
| --- | --- | --- |
| App | Kotlin + Jetpack Compose | Swift + SwiftUI |
| Engine | `mobile/android/engine` (plain Kotlin/JVM, no Android deps) | `RevisioEngine` Swift package |
| Project | `mobile/android/` | `mobile/ios/Revisio.xcodeproj` |
| Artefact | `Revisio-<version>-android.apk` | `Revisio-<version>-ios-unsigned.ipa` |
| Test | `npm run native:android:test` | `npm run native:ios:test` |
| Build | `npm run native:android:apk` | `npm run native:ios:build` |

Each client is split the same way, and the split is load-bearing: an **engine**
that carries the whole client's behaviour (`Grading`, `Models`, `OfflineStore`,
`SessionStore`, `SyncEngine`, `RevisioApi`, a storage seam) and a thin **surface**
that draws it. Engine tests run without a device.

The surface is generated from the web where possible — four generators own the
shared constants, all re-runnable via `npm run native:generate`:

| Generator | Source → output |
| --- | --- |
| `make-theme.mjs` | `globals.css` + `lib/motion.ts` → `Theme.kt` / `Theme.swift` |
| `make-icons.mjs` | The lucide registry → `Icons.kt` / `Icons.swift` |
| `make-account.mjs` | `lib/username.ts`, `lib/pronouns.ts` → `AccountRules.*` |
| `make-rank.mjs` | `domain/ranked.ts`, `domain/srs.ts` → `RankLadder.*`, `SrsLadder.*` |

Never hand-edit their outputs; change the web source and regenerate. Tagging a
release runs `.github/workflows/mobile-release.yml`, which builds the APK on
Linux and the unsigned IPA on macOS, runs both engines' conformance tests, and
attaches both artefacts to a GitHub Release.

---

## Offline and PWA

The web app is installable: `public/manifest.webmanifest`, a service worker, and
a real `offline.html` — with `/sw.js` served `max-age=0, must-revalidate` and
`Service-Worker-Allowed: /` so an update is never a stale one.

On the phones the offline story is structural rather than cached: the screen is
compiled in, so the app opens to its own UI with no network, today's session is
persisted across restarts, and queued reviews drain oldest-first when a
connection returns. An offline review is a preview of the verdict; the server
re-grades and awards.

---

## Getting started

```bash
npm install

cp .env.example .env      # then fill it in — see Environment below
npm run db:seed           # creates the schema and seeds a developer account

npm run dev               # http://localhost:3100
```

The seed script prints the developer credentials it created; override the
bootstrap address with `BOOTSTRAP_DEV_EMAIL`.

`next dev` loads `.env` itself, so an exported `DATABASE_URL` does not override
it — edit `.env` for local experiments rather than exporting variables.

---

## Environment

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres. Use the transaction pooler (port `6543`) for serverless; the session pooler caps at 15 clients. |
| `AUTH_SECRET` | yes | 64 hex characters. Signs access tokens; rotating it signs everyone out. |
| `APP_URL` | yes | Public origin, used for verification and reset links. |
| `PGPOOL_MAX` | no | Pool size per instance. Defaults to `5`. |
| `NEON_DATABASE_URL` | no | Enables the read mirror. Unset = single-database mode. |
| `NEON_POOL_MAX` | no | Mirror pool size. Defaults to `5`. |
| `CRON_SECRET` | no | Authenticates `GET /api/v1/sync` from the cron. |
| `RESEND_API_KEY` | no | Transactional email (verification, password reset). |
| `RESEND_FROM` | no | From address. Defaults to Resend's onboarding sender. |

Mirror setup is ordered: `npm run neon:bootstrap` → `npm run neon:init` → set
`NEON_DATABASE_URL` and deploy. Never point a local `DATABASE_URL` at the
mirror; it inverts the topology and makes local writes drain *back* into
production.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 3100 |
| `npm run build` / `npm start` | Production build and serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint via `next lint` |
| `npm run db:seed` | Create the schema and seed a developer account |
| `npm run db:reset` | Drop the local database file and re-seed |
| `npm run verify:content` | Grammar, visibility and merge checks against the database |
| `npm run verify:offline` | The offline contract: pack keys, queue cleanliness, preview/server agreement |
| `npm run verify:seasons` | Season windows, placement and the primary/replica gap |
| `npm run e2e:smoke` | Drive a real browser against the app, failing on any console error, 4xx/5xx or failed request |
| `npm run e2e:public-ux` | Credential-free UX and accessibility pass — safe to point at production |
| `npm run e2e:a11y` | axe scans in both themes |
| `npm run native:android:apk` | Build a debug APK |
| `npm run native:android:test` | Kotlin engine: grading conformance, pack, outbox |
| `npm run native:ios:test` / `native:ios:build` | Swift engine tests, then compile the SwiftUI surface |
| `npm run verify:native` | Boot an emulator, cut the network, complete a review |
| `npm run vectors:grading` / `vectors:copy` | Regenerate the shared vectors both native ports must replay |
| `npm run neon:status` / `neon:watch` | Backlog per side; always-on drain |

---

## Verification

There are 17 `verify:*` and `e2e:*` entry points, and they are the project's test
strategy: assertions against the real database, the real build and a real
browser, rather than unit tests that cannot see the wiring.

The rules they follow:

- A run fails on any uncaught error, console error, 4xx/5xx or failed request —
  a green check on a page that threw is not green.
- A downstream check is **skipped, never passed**, when its predecessor broke;
  skipped is reported separately.
- Waits are for the sentence being asserted, not "the page has text".
- The signed-out world is a separate browser context, never a cleared cookie jar.
- Writes go to a throwaway probe account, snapshotted before the first click and
  restored in a `finally`, so a killed run is recoverable.

---

## Deployment

A single Vercel project in `dub1`, co-located with the Supabase database in
`eu-west-1`, with the Neon mirror in an adjacent region.

`vercel.json` schedules one cron — `GET /api/v1/sync` daily at `03:00` — because
the Hobby plan rejects sub-daily schedules, and a config stricter than the plan
fails the *build* rather than the cron. Per-review kicks and `npm run neon:watch`
cover the gap between ticks.

The version is written once, in `package.json`; CI stamps it into the Android
module and the iOS app target, so the two artefacts of one release cannot
disagree about what they are. Release by tagging:

```bash
git tag v1.0.0-alpha.10 && git push origin v1.0.0-alpha.10
```

---

## Limitations

Known, and stated rather than implied:

- **The iOS artefact is unsigned.** The `.ipa` from a release must be re-signed
  before it will install; there is no App Store or TestFlight distribution.
- **Mobile authoring is not native.** Exam, library, teacher and admin remain
  web-only surfaces; the phones cover the learner paths.
- **The mirror is eventually consistent by design.** No logical replication and no
  wall-clock ordering: a same-key update landing after a delete is applied as an
  upsert and converges on the next real write. Fine for a study log, wrong for a
  ledger — which is why XP and scheduling never read it.
- **RLS lives outside migrations.** Policies are applied by hand and checked in
  `pg_policies`; a table that gains a trigger without a policy will fail writes
  while reads keep working.
- **Season 1 is grandfathered.** It counts a learner's whole XP history so the
  seasonal rank equals the rank actually earned; later seasons count only what
  they contain.
- **Verification is script-driven, not a unit-test suite.** The guarantees come
  from `verify:*` and `e2e:*` runs against real systems, which means they need a
  database, a browser or an emulator to mean anything.

---

## Documentation

| Document | Covers |
| --- | --- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | The authoritative description of the system, including which original decisions survived the change of shape |
| [`docs/MOBILE.md`](docs/MOBILE.md) | Native architecture, the generators, verification status and what remains |
| [`docs/UI-SYSTEM.md`](docs/UI-SYSTEM.md) | The design system the surfaces are written against |
| [`docs/DESIGN-NOTES.md`](docs/DESIGN-NOTES.md) | The interface rules the design encodes |
| [`docs/UX-AUDIT.md`](docs/UX-AUDIT.md), `docs/FRONTEND-UX-UI-AUDIT-*.md` | Audits, kept as the record of what was found and fixed |
| [`AGENTS.md`](AGENTS.md) | Non-obvious operational facts — environment, sync, native builds, deploy |

---

## License

**Proprietary — all rights reserved.** This is not open source. Copying,
modifying, redistributing, deploying or training models on this code is
prohibited. See [`LICENSE`](LICENSE) for the exact terms.
