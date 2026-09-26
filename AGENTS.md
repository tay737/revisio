# AGENTS.md — learnings for future sessions

Non-obvious facts about this repo that cannot be recovered by reading the code. Keep entries to 1–3 lines; put them in the section that fits.

## Environment

- `next dev`/`next build` loads `.env` itself and shell-exported `DATABASE_URL` does **not** survive — Next's dotenv values win. For local runs against a test DB, temporarily rewrite `.env` (back it up first) rather than exporting vars.
- Background servers die when a terminal command ends in this harness: `( nohup <cmd> > log 2>&1 < /dev/null & )` inside the same command as the tests, and run server + curl suite in ONE command.
- If port 3100 is taken by an orphaned process, Next silently binds 3101+ (`-p 3100` is not a guarantee). Check `lsof -nP -iTCP:3100 -sTCP:LISTEN` when curl gets `000` but the log says Ready; `pkill -f "next dev"` clears orphans.
- macOS `netstat -an` shows ports as `127.0.0.1.3100`; `/etc/services` may mislabel (3100 shows as "autocuelog", which is 3104). Trust `lsof -p <pid>`.

## Database & sync

- Local Postgres 16 E2E: `/opt/homebrew/opt/postgresql@16/bin`, clusters under `/tmp/srs-e2e-p|srs-e2e-r` on ports 54329/54330, `export LC_ALL=C` needed (locale bug), seed with `psql -f drizzle/0000_init.sql` + `0001_*.sql`, then `npm run db:seed`.
- New `users` columns replicate through the mirror automatically (triggers capture `to_jsonb(NEW)`) — but the drizzle migration must be applied to BOTH Supabase and Neon (`npm run neon:bootstrap` handles fresh targets; for an existing mirror apply the SQL by hand on both).
- drizzle-kit `generate` diffs against `DATABASE_URL`'s live schema; if that URL points at Neon (not Supabase) the generated migration can be wrong — point `DATABASE_URL` at the primary first.

## App conventions

- `server-only` modules must never be imported from client components (build fails with a pages/-directory error). Shared validation lives in client-safe `src/lib/*` (e.g. `lib/username.ts`); server modules import it.
- Profile privacy is enforced server-side in `src/services/profile.ts` (`getPublicProfile`); never filter on the client. Hidden fields return as `null`.
- Bash in this sandbox: `UID` is readonly (use another var name); python3 is 3.9 (no `json.dumps` fancy args needed but keep scripts simple).
EOF