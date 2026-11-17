-- Missing capture triggers (#68): exam_papers, profile_badges and
-- user_profile_badges are in REPLICATED_TABLES but never got a __sync_trg on
-- either prod database — their writes silently never replicated, and the
-- cross-database trigger-parity check could not see it because the absence
-- was symmetric.
--
-- Primary keys come from the live catalog convention used by
-- installSyncInfrastructure/loadPrimaryKeys: single-column `id` PKs for
-- exam_papers and profile_badges, the `user_profile_badges_pk` UNIQUE index
-- (user_id, badge_id) for the join table.
--
-- Applied to BOTH databases by scripts/apply-migrations.ts, so the file is
-- idempotent and self-scoping: it only creates triggers where
-- `_sync_events` exists. Post-#52 the Neon mirror has no event queue (0025
-- drops it), so the same file is a no-op there; on any database without
-- sync infrastructure it also no-ops, leaving trigger installation to
-- `neon-sync init` / the sync route's ensureInfrastructure.
--
-- DDL safety: bounded lock/statement waits; RESET at the end so pooled
-- connections do not inherit the limits.

SET lock_timeout = '5s';
SET statement_timeout = '30s';

DO $$
DECLARE
  spec jsonb := '[
    {"t": "exam_papers",          "pk": "id"},
    {"t": "profile_badges",       "pk": "id"},
    {"t": "user_profile_badges",  "pk": "user_id,badge_id"}
  ]'::jsonb;
  s   jsonb;
  trg text;
BEGIN
  IF to_regclass('public._sync_events') IS NULL
     OR to_regprocedure('public.sync_capture_event()') IS NULL THEN
    RETURN;
  END IF;

  FOR s IN SELECT * FROM jsonb_array_elements(spec) LOOP
    trg := (s ->> 't') || '__sync_trg';
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trg, s ->> 't');
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I ' ||
      'FOR EACH ROW EXECUTE FUNCTION sync_capture_event(%L)',
      trg, s ->> 't', s ->> 'pk');
  END LOOP;
END
$$;

RESET lock_timeout;
RESET statement_timeout;
