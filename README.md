# Revisio

**Learn it once.** A spaced-repetition learning platform: subjects → topics →
lessons and cards, a daily queue you actually finish, and a rank worth
defending.

Revisio schedules every card it is confident you are about to forget, grades
your answer server-side, and turns the result into XP, streaks, leagues and a
transcript you can export. It is built for students first, with teacher and
admin surfaces for authoring content, running classes and reviewing what gets
published.

> **Status: v1.0.0-alpha.2.** The web app is feature-complete for v1. Both
> mobile clients are native — Kotlin + Compose over a native engine on Android,
> Swift + SwiftUI over the same engine on iOS — and each ships as a sideload-only
> alpha artefact. The iOS `.ipa` is unsigned and has to be re-signed to run; see
> [Mobile](#mobile) and [`docs/MOBILE.md`](docs/MOBILE.md).

---

## Contents

- [What it does](#what-it-does)
- [Stack](#stack)
- [Getting started](#getting-started)
- [Environment](#environment)
- [Scripts](#scripts)
- [Architecture](#architecture)
- [Mobile](#mobile)
- [Releases](#releases)
- [License](#license)

## What it does

| Surface | Route | For |
|---|---|---|
| Landing | `/` | Everyone — what Revisio is |
| Dashboard | `/dashboard` | Today's queue, streak, rank, subjects |
| Review | `/review` | The daily SRS session (cloze, flashcard, multiple choice) |
| Learn | `/learn` | First exposure to a topic: its notes, plus its unseen cards |
| Cram | `/cram` | Time-boxed practice that bypasses scheduling |
| Exam | `/exam` | Timed exam-style sessions with mark schemes |
| Practice | `/practice` | Generated maths drills per topic and difficulty — never touches scheduling or XP |
| Progress | `/progress` | Rank ladder, lobbies, achievements, transcript |
| Library | `/library` | Your content: author, import, merge, publish |
| Teacher | `/teacher` | Classes, rosters, per-student progress |
| Admin | `/admin` | Content review, roles, feature flags, SRS tuning |
| Staff | `/staff/login` | Hidden entry point for teacher and developer accounts |

**The four rules the product is built on**

1. **The server decides.** Grading, scheduling and XP are computed server-side
   and are never re-derived in the client, so two clients can never disagree. A
   review answered offline is graded by the same rules so it can be studied
   *now*, but it is a preview: the server re-grades it and awards the XP.
2. **Content that is visible is studyable.** If a topic reaches you, its
   questions are answerable — a rule with exactly one owner.
3. **Reviewing is append-only.** Every review is logged with its verdict, so a
   flaky network can never award XP twice.
4. **One owner per fact.** Version, theme, motion, navigation, visibility and
   the ranked snapshot each live in one module.

## Stack

- **Next.js 14** (App Router, React Server Components) + **TypeScript**
- **Postgres via Drizzle ORM** — 27 tables, RLS as defence in depth
- **Tailwind CSS 4** with a token-based design system, `framer-motion` for motion
- **SWR** for client data, with a single authenticated fetch helper
- **mathjs** for semantic expression equality in the maths practice engine
- **Kotlin + Jetpack Compose** (Android) and **Swift + SwiftUI** (iOS) for the
  native apps, each over a native engine that speaks the same `/api/v1` API
  (see [Mobile](#mobile))
- Auth is email/password with TOTP 2FA, short-lived JWTs and rotating refresh
  tokens. Passwords use bcrypt.

## Getting started

```bash
npm install

cp .env.example .env      # then fill it in — see Environment below
npm run db:seed           # creates the schema and seeds a developer account

npm run dev               # http://localhost:3100
```

The seed script prints the developer credentials it created. Override the
bootstrap email with `BOOTSTRAP_DEV_EMAIL` if you want a different one.

## Environment

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres. The transaction pooler (port `6543`) is recommended for serverless; the session pooler caps at 15 clients. |
| `AUTH_SECRET` | yes | 64 hex characters. Signs access tokens; rotating it signs everyone out. |
| `APP_URL` | yes | Public origin, used for verification links. |
| `PGPOOL_MAX` | no | Pool size per instance. Defaults to `5`. |
| `RESEND_API_KEY` | no | Transactional email (verification, password reset). |
| `RESEND_FROM` | no | From address. Defaults to Resend's onboarding sender. |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on port 3100 |
| `npm run build` | Production build |
| `npm start` | Serve the production build on port 3100 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint via `next lint` |
| `npm run db:seed` | Seed the database |
| `npm run db:reset` | Drop the local SQLite file and re-seed |
| `npm run verify:content` | Grammar, visibility and merge checks against the database |
| `npm run verify:offline` | The offline contract: pack keys, queue cleanliness, preview/server agreement |
| `npm run native:android:apk` | Build a debug APK locally |
| `npm run native:android:test` | Test the Kotlin engine: grading conformance, pack, outbox |
| `npm run native:ios:test` | Test the Swift engine against the same vectors |
| `npm run verify:native` | Boot an emulator and drive the APK with the network off |
| `npm run vectors:grading` | Regenerate the shared grading vectors from `domain/grading.ts` |
| `npx tsx scripts/verify-maths.ts` | Maths engine invariants: determinism, self-consistency, MCQ shape (no DB needed) |
| `npx tsx scripts/verify-markdown.ts` | Note renderer checks: block/inline parsing, safe-URL policy (no DB needed) |

## Architecture

Layers, and the direction data flows:

```
src/app/**        routes: pages (client + RSC) and /api/v1 route handlers
src/services/**   use cases; server-only. May touch the database and the domain.
src/domain/**     pure logic, dependency-free: srs, grading, gamification, ranked
src/db/**         schema + pooled client
src/lib/**        non-React logic and cross-cutting policy (theme, motion, api)
src/components/** shared presentation
mobile/**         the native clients: an engine per platform, plus its surface
```

`docs/ARCHITECTURE.md` is the authoritative description of the system, including
the decisions that survived the change of shape from the original plan.
`docs/UI-SYSTEM.md` and `docs/DESIGN-NOTES.md` cover the interface and the
rules it encodes.

## Mobile

The mobile apps are **native clients**, not a wrapper around this website. They
speak the same `/api/v1` backend API and reimplement the review surface natively
(Kotlin + Compose on Android, Swift + SwiftUI on iOS), each over an engine that
carries the whole client's behaviour and can be tested without a device.

```bash
npm run native:android:apk     # Android — needs the Android SDK and JDK 21
npm run native:android:test    # engine conformance + offline store tests
npm run native:ios:test        # the same tests, in Swift
npm run verify:native          # boot an emulator, cut the network, drive a review
```

What is native, and what it buys:

- the screen is compiled in, so the app opens to **its own UI** with no network —
  no cached landing page, no dead buttons
- **a review can be completed offline.** The app carries today's session, grades
  with a native port of `domain/grading`, and queues each review for the server
  to re-grade
- the session survives a restart, so losing signal never signs anyone out

Grading keeps a single owner: `src/domain/grading.ts` emits golden vectors that
both native ports must reproduce, so a rule change on the web fails the mobile
builds until they follow. `docs/MOBILE.md` has the architecture, the verification
status, and what remains — signing, feature coverage, an offline web fallback.

## Releases

Pushing a tag builds the artefacts and publishes them:

```bash
git tag v1.0.0-alpha.2 && git push origin v1.0.0-alpha.2
```

`.github/workflows/mobile-release.yml` builds both artefacts and runs both
engines' tests — the Kotlin port on Linux, the Swift port on macOS — then
attaches the APK and the unsigned `.ipa` to a GitHub Release (marked as a
prerelease for `alpha`/`beta`/`rc` tags). There is no server URL to configure:
the apps are native clients and the deployment they talk to is compiled in.

The version is written once, in `package.json`; CI stamps it into the Android
module and the iOS app target (`scripts/native/set-version.mjs`), so the two
artefacts of one release cannot disagree about what they are.

## License

**Proprietary — all rights reserved.** This is not open source. Copying,
modifying, redistributing, deploying or training models on this code is
prohibited. See [`LICENSE`](LICENSE) for the exact terms.
