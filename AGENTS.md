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

- **Production primary = Supabase** `iqdfvselxyaszjcqygib` (eu-west-1), pooled: `aws-1-eu-west-1.pooler.supabase.com:6543`, user `postgres.iqdfvselxyaszjcqygib`. The Neon project (`quiet-wave-72124711`, branch `production`) is EMPTY of app schema (only `neon_auth`) — the maths-session claim that "the primary is Neon" is wrong; `neon:bootstrap` was never run there. `/api/v1/sync` is a no-op without `NEON_DATABASE_URL`, so no `CRON_SECRET` is needed on Vercel.
- The Supabase MCP token sees a different (Vercel-managed) org; the real project lives under the "tay737's projects" org read via the dashboard. Credentials of record: DB password given by user 2026-09-27.
- `scripts/seed.ts` env-var precedence: an **exported** `DATABASE_URL` survives `dotenv/config` (dotenv skips existing vars) — so seeding prod needs no `.env` rewrite, unlike `next dev`.

- Local Postgres 16 E2E: `/opt/homebrew/opt/postgresql@16/bin`, clusters under `/tmp/srs-e2e-p|srs-e2e-r` on ports 54329/54330, `export LC_ALL=C` needed (locale bug), seed with `psql -f drizzle/0000_init.sql` + `0001_*.sql`, then `npm run db:seed`.
- New `users` columns replicate through the mirror automatically (triggers capture `to_jsonb(NEW)`) — but the drizzle migration must be applied to BOTH Supabase and Neon (`npm run neon:bootstrap` handles fresh targets; for an existing mirror apply the SQL by hand on both).
- drizzle-kit `generate` diffs against `DATABASE_URL`'s live schema; if that URL points at Neon (not Supabase) the generated migration can be wrong — point `DATABASE_URL` at the primary first.

## App conventions

- `server-only` modules must never be imported from client components (build fails with a pages/-directory error). Shared validation lives in client-safe `src/lib/*` (e.g. `lib/username.ts`); server modules import it.
- Profile privacy is enforced server-side in `src/services/profile.ts` (`getPublicProfile`); never filter on the client. Hidden fields return as `null`.
- Bash in this sandbox: `UID` is readonly (use another var name); python3 is 3.9 (no `json.dumps` fancy args needed but keep scripts simple).

## Deploy & CI

- **A `vercel.json` cron stricter than the Hobby plan (finer than daily) fails builds with `invalid_vercel_json`** — a one-line config silently killed every deploy for 24h while git and the dashboard all looked healthy. When "pushed but not deployed", first diff the config files added since the last successful build.
- Deploying to an existing project via raw API: `POST /v13/deployments?teamId=…` with `{name, target, projectSettings:{framework}, files:[{file, data(base64)}]}` (inline `data` mode forbids `sha`/`size`; sha-list mode needs a second upload pass). Works with a dashboard-created token when the MCP token is expired.
- Vercel MCP token expiry shows up as 403 "Not authorized … scope \"tay737\"" on even read-only endpoints; check the account token list ("An MCP client from Vercel…" row) — expired tokens can be replaced by creating a fresh dashboard token.
- The project's git link is the credential/Login-Connection style (`gitCredentialId` present, link type `github`); GitHub App install is "All repositories". A push that produces **no deployment object at all** within minutes means the push→build wiring is broken (or config-invalidated), not slow — verify via `GET /v6/deployments?app=<name>` for the SHA.
EOF