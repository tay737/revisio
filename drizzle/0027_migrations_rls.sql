-- _migrations RLS repair: an earlier RLS sweep enabled row security on the
-- primary's _migrations ledger with no policy, which trips the prod
-- verification sweep (RLS enabled, zero policies). The mirror never got it.
-- The ledger is ops infrastructure written by apply-migrations/bootstrap
-- as the table owner — the app role has no business reading it — so RLS
-- off matches the mirror and the table's actual access pattern.
-- Idempotent: DISABLE ROW LEVEL SECURITY is a no-op where already off.

ALTER TABLE _migrations DISABLE ROW LEVEL SECURITY;
