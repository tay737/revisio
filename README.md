# Revisio

**Learn it once.** A spaced-repetition learning platform: subjects → topics →
lessons and cards, a daily queue you actually finish, and a rank worth
defending.

Revisio schedules every card it is confident you are about to forget, grades
your answer server-side, and turns the result into XP, streaks, leagues and a
transcript you can export. It is built for students first, with teacher and
admin surfaces for authoring content, running classes and reviewing what gets
published.

> **Status: v1.0.0-alpha.1.** The web app is feature-complete for v1. The
> Android and iOS apps are thin native shells around the same app and ship as
> sideload-only alpha artefacts — see [Mobile](#mobile) and
> [`docs/MOBILE.md`](docs/MOBILE.md).

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
- **Capacitor 7** for the iOS and Android apps (see [Mobile](#mobile))
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
| `NATIVE_APP_URL` | mobile | The deployment the native apps load. Build-time only. |

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
| `npm run native:prepare` | Generate the Android and iOS projects, then sync |
| `npm run native:apk` | Build a debug APK locally |
| `npm run native:open:android` | Open the Android project in Android Studio |

## Architecture

Layers, and the direction data flows:

```
src/app/**        routes: pages (client + RSC) and /api/v1 route handlers
src/services/**   use cases; server-only. May touch the database and the domain.
src/domain/**     pure logic, dependency-free: srs, grading, gamification, ranked
src/db/**         schema + pooled client
src/lib/**        non-React logic and cross-cutting policy (theme, motion, api)
src/components/** shared presentation
capacitor.config.ts, native-www/   the native shell (see Mobile)
```

`docs/ARCHITECTURE.md` is the authoritative description of the system, including
the decisions that survived the change of shape from the original plan.
`docs/UI-SYSTEM.md` and `docs/DESIGN-NOTES.md` cover the interface and the
rules it encodes.

## Mobile

The apps in [`Releases`](../../releases) are **Capacitor shells around the same
app**. Revisio is a thin client — every rule lives on the server — so there is
one codebase, not a port, and no logic is duplicated for mobile.

```bash
NATIVE_APP_URL=https://your-deployment.example.com npm run native:prepare
npm run native:apk          # Android — needs the Android SDK and JDK 21
npm run native:open:ios     # iOS — needs Xcode and CocoaPods
```

What the shell adds:

- a native status bar, splash screen and launcher icon (`assets/`)
- Android's hardware back button meaning "go back, or leave"
- **reviewing with no connection at all** — the app takes a session with it,
  grades locally using the same `domain/grading` the server uses, and hands the
  answers back when the signal returns (see [`docs/MOBILE.md`](docs/MOBILE.md) §7)
- a ledger, not a refusal, when offline: it counts what is saved and waiting
  rather than implying the work was lost

The native projects are **generated, not committed**. They are reproducible from
`capacitor.config.ts` and `assets/`, which means a machine without the Android
SDK or CocoaPods can still change the product, and CI builds the exact same
thing a developer does.

`docs/MOBILE.md` has the full story: build requirements, signing, and how a
release is produced.

## Releases

Pushing a tag builds both artefacts and publishes them:

```bash
git tag v1.0.0-alpha.2 && git push origin v1.0.0-alpha.2
```

`.github/workflows/mobile-release.yml` compiles the APK on Linux and the IPA on a
macOS runner, then attaches both to a GitHub Release (marked as a prerelease for
`alpha`/`beta`/`rc` tags). Set the `NATIVE_APP_URL` repository variable first, or
the apps will boot into the "not connected" shell.

The version is written once, in `package.json`; CI stamps it into both native
projects (`scripts/native/set-version.mjs`).

## License

**Proprietary — all rights reserved.** This is not open source. Copying,
modifying, redistributing, deploying or training models on this code is
prohibited. See [`LICENSE`](LICENSE) for the exact terms.
