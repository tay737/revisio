# Sync drain stalls on orphaned events — handoff to Full-Stack Dev & QA

Date: 2026-11-14
Severity: **High** — caused ~5 weeks of silent replica staleness; user-visible as missing/reverted content on the live site.
Status: **Fixed** — §5 items 1–3 implemented in `src/db/sync.ts` (per-drain compaction, orphan drop + target convergence, stuck events still fail loudly); item 4 partially (kickSync now survives via `waitUntil`, cron comment corrected — per-minute freshness still needs Pro or an external pinger).

---

## 1. What happened

The Neon read replica (`NEON_DATABASE_URL`) serves lesson/topic content on the deployed site via `readReplica()` (`src/db/replica.ts`). It fell **5,188 events behind** the Supabase primary — oldest pending event dated **2026-10-07** — so the live site was serving month-old content: 37 of 53 lessons, 29 of 45 topics, 401 of 481 cards.

Users reported rewritten study notes "not appearing for a lot of topics." The rewrites were correctly written to the primary; they simply never replicated.

## 2. Root cause

`_sync_events` is drained oldest-first in batches of up to 2,000 by `drainEvents()` / `applyEventBatch()` (`src/db/sync.ts`). A batch is applied in **one transaction**; if *any* event raises a non-FK-retryable error, the whole batch aborts and **no events are deleted** — the next tick restarts from the same head. One poisoned event therefore blocks the entire queue indefinitely.

The poison: `media_assets` INSERT events whose `user_id` references users **deleted from the primary** (test accounts). The FK parent exists on neither side, so the INSERT fails `23503` on every pass, every run, forever. Verified orphans:

| seq | table | pk | missing user_id |
|-----|-------|----|-----------------|
| 5578 | media_assets | `882d2eda-5b15-4c30-ab12-92b1e1b05a19` | `f1dbb309-…` (deleted) |
| 5604/5606 | media_assets | `qa-queued-1794618076` | `66855055-…` (deleted) |
| 5645 | media_assets | `756ee1f7-…` | `8a7a9368-…` (deleted) |

Each was followed by a DELETE event for the same row — net effect zero — but the INSERT at the head of the batch killed the run before the DELETE could ever apply.

## 3. What was done (mitigation, 2026-11-14)

1. Ran `tsx scripts/neon-sync.ts status` → confirmed 5,188 pending primary→neon, 27 neon→primary.
2. Compacted `_sync_events` on the **primary** to the last event per `(table_name, pk)` — safe because `applyOne()` treats INSERT and UPDATE identically (`upsertRow`), so only each row's final state matters. 3,197 → 1,947 events; all stale intermediate INSERT/UPDATEs for since-deleted rows collapsed into their terminal DELETE.
   ```sql
   DELETE FROM _sync_events e
   USING (SELECT DISTINCT ON (table_name, pk) seq, table_name, pk
          FROM _sync_events ORDER BY table_name, pk, seq DESC) k
   WHERE e.seq <> k.seq AND e.table_name = k.table_name AND e.pk = k.pk;
   ```
3. Drained locally per AGENTS.md recipe (`DATABASE_URL` → Supabase **session pooler** `:5432`, `NEON_DATABASE_URL` = Neon URL): **1,947 applied, 0 pending both directions.**
4. Verified row counts now identical: 53 lessons / 45 topics / 3 subjects / 481 cards / 11 users on both sides.

## 4. Why it will happen again

- **Any** future write whose row references a since-deleted parent (deleted test users are the known source — see the e2e throwaway account pattern in AGENTS.md) produces the same stranded INSERT.
- The safety nets are thin: `vercel.json` schedules `/api/v1/sync` **once daily** (`0 3 * * *`) despite code comments claiming every minute; `kickSync()` after each review is fire-and-forget inside a serverless invocation and likely never completes after the response is sent. So a single bad event can sit at the head for ~24h even when the daily cron does run — and once pending > one batch, the daily 60s `maxDuration` may not finish the backlog either.

## 5. Recommended fix (Full-Stack Dev)

Make the drain **self-healing** instead of all-or-nothing:

1. In `applyEventBatch`, treat FK violations (`23503`) where the event's row **no longer exists on the source** as skippable — park-and-drop rather than retry-then-abort. Concretely: on repeated `23503`/`23505` failure after REORDER_PASSES, re-check the row against the *source* DB; if absent (or if a later event for the same pk supersedes it), delete the event and continue.
2. Alternatively/additionally: compact pending events per `(table_name, pk)` inside `drainEvents` before applying (same SQL as §3) — collapses bursts and removes stale intermediates automatically.
3. Consider a dead-letter path: after N failed runs, quarantine the offending seqs to `_sync_events_dead` and alert, rather than silently stalling forever.
4. Reconcile the cron story: either document that Vercel Hobby only allows daily crons and add an external per-minute pinger for `/api/v1/sync` (with `CRON_SECRET`), or make `kickSync` actually survive the serverless freeze (e.g., `waitUntil`).

## 6. QA verification checklist

- [ ] After the fix, delete a test user who owns cards/media, submit writes that generate child events, and confirm `_sync_events` on the primary drains to 0 without manual intervention (`scripts/neon-sync.ts status` or `GET /api/v1/sync?action=status` as developer).
- [ ] Confirm lesson/topic content edited on the primary appears on the deployed site within one sync interval (previously took weeks).
- [ ] Regression: normal review → dashboard/leaderboard freshness still holds (kick path unaffected).
- [ ] Load case: seed >2,000 pending events and confirm partial progress per run rather than a full stall.

## 7. References

- `src/db/sync.ts` — `drainEvents` (L431), `applyEventBatch` (L494), `applyOne`/`upsertRow` (L553–599), `REPLICATED_TABLES` (L52)
- `src/db/replica.ts` — read routing; lesson text served from Neon when `NEON_DATABASE_URL` is set
- `vercel.json` — cron `0 3 * * *`
- `scripts/neon-sync.ts` — `status` / `run` operator CLI
- AGENTS.md § "Draining a big sync backlog" — session-pooler recipe and stranded-event warning (this incident is that warning coming true)
