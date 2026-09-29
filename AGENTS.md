# AGENTS.md — learnings for future sessions

Non-obvious facts about this repo that cannot be recovered by reading the code. Keep entries to 1–3 lines; put them in the section that fits.

## Environment

- `next dev`/`next build` loads `.env` itself and shell-exported `DATABASE_URL` does **not** survive — Next's dotenv values win. For local runs against a test DB, temporarily rewrite `.env` (back it up first) rather than exporting vars.
- Background servers die when a terminal command ends in this harness: `( nohup <cmd> > log 2>&1 < /dev/null & )` inside the same command as the tests, and run server + curl suite in ONE command.
- If port 3100 is taken by an orphaned process, Next silently binds 3101+ (`-p 3100` is not a guarantee). Check `lsof -nP -iTCP:3100 -sTCP:LISTEN` when curl gets `000` but the log says Ready; `pkill -f "next dev"` clears orphans.
- macOS `netstat -an` shows ports as `127.0.0.1.3100`; `/etc/services` may mislabel (3100 shows as "autocuelog", which is 3104). Trust `lsof -p <pid>`.
- Production domains: **revisio-srs.vercel.app** is the primary alias; `revisio-tay737.vercel.app` also maps to the project but has served stale builds. Check the production domain, not just the project.
- A silent `readyState: ERROR` with **only 4 log lines** (dies right after "Downloading N deployment files") and no `errorMsg` in the events stream = invalid config detected post-creation; get `errorCode` from `GET /v13/deployments/:id` itself (e.g. `invalid_vercel_json`, `enoent`).
- The Vercel CLI (`npx vercel deploy --prod --token=…`) needs no `.env` and gives full error output the raw v13 API hides — use it when API-created builds fail opaquely. A committed `vercel.json` applies to API deployments too, not just git ones.

## Database & sync

- **Production primary = Supabase** `iqdfvselxyaszjcqygib` (eu-west-1), pooled: `aws-1-eu-west-1.pooler.supabase.com:6543`, user `postgres.iqdfvselxyaszjcqygib`. Vercel production `DATABASE_URL` connects as dedicated role **`revisio_app`**. The Neon mirror lives at `ep-bold-sunset-b2qnuxik` (eu-central-1, `neondb`); the OTHER Neon project (`quiet-wave-72124711`, branch `production`) is EMPTY of app schema — not the mirror. `/api/v1/sync` is a no-op without `NEON_DATABASE_URL`.
- The Supabase MCP token sees a different (Vercel-managed) org; the real project lives under the "tay737's projects" org read via the dashboard. MCP `execute_sql` runs READ-ONLY (25006) — writes need the dashboard SQL editor or a migration via `apply_migration`. Credentials of record: DB password given by user 2026-09-27.
- **2026-09-28 login 500 incident**: an RLS sweep enabled row security on every public table, but `_sync_events` (added later by the mirror) got RLS with **no policy** — and `media_assets` likewise. Every app write fires `sync_capture_event()` → INSERT into `_sync_events` → RLS denial → 500, while reads worked (login looked dead, `/dashboard` looked alive). Fixed by migration `sync_events_rls_for_app_role` (`app_full_access` for `revisio_app` on both tables + `GRANT USAGE ON ALL SEQUENCES`). `ensureSyncWriteAccess()` in `src/db/sync.ts` now probes and self-heals this on every sync run. Trigger functions are NOT security definer — role privileges matter.
- Supabase RLS state lives OUTSIDE drizzle migrations — check `pg_policies` when writes fail wholesale. Symptom signature: reads fine + `route()` 500 on every write + stuck `_sync_events` rows.
- **Never repoint local `.env` `DATABASE_URL` at the Neon mirror** — it inverts topology: local writes go to the mirror and sync-drain *back* into prod, and drizzle-kit generate diffs the wrong schema. Local `.env` was found pointing at Neon on 2026-09-28; restore Supabase pooled URL first.
- `scripts/seed.ts` env-var precedence: an **exported** `DATABASE_URL` survives `dotenv/config` (dotenv skips existing vars) — so seeding prod needs no `.env` rewrite, unlike `next dev`.

- Local Postgres 16 E2E: `/opt/homebrew/opt/postgresql@16/bin`, clusters under `/tmp/srs-e2e-p|srs-e2e-r` on ports 54329/54330, `export LC_ALL=C` needed (locale bug), seed with `psql -f drizzle/0000_init.sql` + `0001_*.sql`, then `npm run db:seed`.
- New `users` columns replicate through the mirror automatically (triggers capture `to_jsonb(NEW)`) — but the drizzle migration must be applied to BOTH Supabase and Neon (`npm run neon:bootstrap` handles fresh targets; for an existing mirror apply the SQL by hand on both).
- drizzle-kit `generate` diffs against `DATABASE_URL`'s live schema; if that URL points at Neon (not Supabase) the generated migration can be wrong — point `DATABASE_URL` at the primary first.

## Native clients (Android + iOS)

- Four generators own the clients' constants, all re-runnable via `npm run native:generate`: `make-theme.mjs` (globals.css + `lib/motion.ts` → Theme.kt/.swift), `make-icons.mjs` (lucide registry → Icons.kt/.swift), `make-account.mjs` (`lib/username.ts` → AccountRules.kt/.swift), `make-rank.mjs` (`domain/ranked.ts` → RankLadder.kt/.swift). Never hand-edit their outputs; edit the web source and regenerate.
- `Copy.kt`/`Copy.swift` and the generated `RankLadder.*` are parity-checked, not just hand-ported: `npm run vectors:copy` freezes `domain/ranked.ts` + `lib/profile.ts` into `mobile/shared/copy-vectors.json`, which both engines' `CopyConformanceTest(s)` replay. Change the web copy and both native test suites fail until they follow.
- The offline smoke asserts against real screen text, so it breaks on copy changes: it now reads the dashboard's `Start review`, the More sheet behind `More`, and the *first-name* greeting (`Copy.greetingFor` uppercases and shortens the name). Numbers in `NumberTicker` read as 0 in an accessibility dump taken mid-spring.
- The account destination is `ui/SettingsScreen.kt` / `Revisio/SettingsView.swift` (the old `YouScreen`/`YouView` are gone). Renaming an app-target Swift file also means editing `Revisio.xcodeproj/project.pbxproj` by hand — the SwiftPM target picks files up automatically, the Xcode target does not.
- In Compose, calling `kotlinx.coroutines.launch { }` as a bare expression inside `LaunchedEffect` does not compile (the scope is the receiver, not a namespace) — import `kotlinx.coroutines.launch` and call `launch { }`.
- `Avatar` takes an explicit `color` token matching the web's `SURFACE` map (ink/moss/bee/dawn/sky); it does not derive a tint from the glyph, because a picker must show the colour it will actually save.

## App conventions

- `server-only` modules must never be imported from client components (build fails with a pages/-directory error). Shared validation lives in client-safe `src/lib/*` (e.g. `lib/username.ts`); server modules import it.
- Profile privacy is enforced server-side in `src/services/profile.ts` (`getPublicProfile`); never filter on the client. Hidden fields return as `null`.
- Bash in this sandbox: `UID` is readonly (use another var name); python3 is 3.9 (no `json.dumps` fancy args needed but keep scripts simple).
- **Vault content imports** go through `scripts/vault/manifests/*.ts` (idempotent upserts keyed on deterministic ids) — see `.claude/skills/vault-import/SKILL.md`. The importer updates an existing subject by its DB id; never invent a new id for a live subject. `exam_papers_doc_idx` makes (subject, board, series, paperCode, kind) unique — placeholder codes like Pearson's `P00XXXXX` need a suffix. Locally the Neon sync drain hangs (pgbouncer parameterisation); drain via production `/api/v1/sync` after deploy.

## Deploy & CI

- **A `vercel.json` cron stricter than the Hobby plan (finer than daily) fails builds with `invalid_vercel_json`** — a one-line config silently killed every deploy for 24h while git and the dashboard all looked healthy. When "pushed but not deployed", first diff the config files added since the last successful build.
- Deploying to an existing project via raw API: `POST /v13/deployments?teamId=…` with `{name, target, projectSettings:{framework}, files:[{file, data(base64)}]}` (inline `data` mode forbids `sha`/`size`; sha-list mode needs a second upload pass). Works with a dashboard-created token when the MCP token is expired.
- Vercel MCP token expiry shows up as 403 "Not authorized … scope \"tay737\"" on even read-only endpoints; check the account token list ("An MCP client from Vercel…" row) — expired tokens can be replaced by creating a fresh dashboard token.
- The project's git link is the credential/Login-Connection style (`gitCredentialId` present, link type `github`); GitHub App install is "All repositories". A push that produces **no deployment object at all** within minutes means the push→build wiring is broken (or config-invalidated), not slow — verify via `GET /v6/deployments?app=<name>` for the SHA.
- **The mobile-release runner's Swift is older than the local Xcode.** Syntax legal only from Swift 6.1 (e.g. a trailing comma in an argument list, SE-0439) compiles locally and fails the release's `swift test`/`xcodebuild` — `make-theme.mjs` now refuses to emit one. `swift -parse`/`swift build` locally cannot catch this class of drift.
- A failed run's log needs auth, but `GET /repos/:o/:r/check-runs/:jobId/annotations` and the in-page log fetch (`/commit/:sha/checks/:id/logs`, signed in) both work anonymously-ish — the annotation carries the step, the log carries the compiler error.
EOF