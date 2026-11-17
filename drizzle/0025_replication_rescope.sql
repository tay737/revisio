-- Replication re-scope (#52): one-way primary→Neon.
--
--   • refresh_tokens / email_tokens leave replication entirely — auth reads
--     and writes are primary-only, the tokens were ~39% of capture volume,
--     and bearer-equivalent credentials do not belong on the mirror.
--   • The Neon mirror stops being a replication peer: every __sync_trg
--     trigger is dropped, its _sync_events queue is dropped, and the token
--     rows already replicated there are deleted (dead weight + sensitive-
--     adjacent). Schema stays — bootstrapSchemaFromMigration replays all
--     files, so table parity is preserved; only data and triggers go.
--
-- Applied to BOTH databases by scripts/apply-migrations.ts, so the file is
-- idempotent and branches on facts that differ per side:
--   shared  — drop the two token triggers and purge their queued events
--             (correct everywhere, including fresh databases with no
--             _sync_events yet);
--   mirror  — keyed on current_database() = 'neondb' (the only database
--             name the mirror is known by; the primary is 'postgres', a
--             developer database is neither and correctly takes only the
--             shared steps).
--
-- DDL safety: bounded lock/statement waits; RESET at the end so pooled
-- connections do not inherit the limits.

SET lock_timeout = '5s';
SET statement_timeout = '30s';

-- ── shared: token tables leave replication on every database ──────────────

DROP TRIGGER IF EXISTS "refresh_tokens__sync_trg" ON "refresh_tokens";
DROP TRIGGER IF EXISTS "email_tokens__sync_trg" ON "email_tokens";

DO $$
BEGIN
  IF to_regclass('public._sync_events') IS NOT NULL THEN
    DELETE FROM _sync_events WHERE table_name IN ('refresh_tokens', 'email_tokens');
  END IF;
END
$$;

-- ── mirror only: no capture machinery, no queue, no token rows ────────────

DO $$
DECLARE
  r record;
BEGIN
  IF current_database() <> 'neondb' THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT tg.tgname, c.relname
    FROM pg_trigger tg
    JOIN pg_class c ON c.oid = tg.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND tg.tgname LIKE '%\_\_sync\_trg'
      AND NOT tg.tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', r.tgname, r.relname);
  END LOOP;

  EXECUTE 'DROP TABLE IF EXISTS _sync_events';

  DELETE FROM refresh_tokens;
  DELETE FROM email_tokens;
END
$$;

RESET lock_timeout;
RESET statement_timeout;
