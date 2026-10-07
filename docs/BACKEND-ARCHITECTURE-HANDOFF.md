# Backend Architecture Handoff: Opt-in Study Reminders

**Owner:** Backend architect
**Status:** Proposal for implementation; frontend does not expose reminder controls until contracts are implemented.
**Date:** 2026-10-07
**Context:** Revisio currently has a Next.js App Router frontend and `/api/v1` route handlers, Postgres/Drizzle on the primary, a Neon read mirror, existing email infrastructure, and an offline-capable web review loop. Daily reminders are a retention feature requested by the UX audit. The frontend must remain functional if this backend work is not yet deployed.

## Product behavior

- A learner may opt into one daily reminder at a chosen local time and timezone.
- A reminder is sent only when the learner has cards due, according to the primary database's authoritative due count at send time.
- Notification content is privacy-safe: generic title/body only (for example, “Your study queue is ready” / “You have cards waiting. Open Revisio when you’re ready.”). Do not include subject, topic, question, answer, email or other study content.
- Ask notification permission only after a clear user action, never on page load.
- A reminder must not be sold as working until the subscription and delivery flow exists. “Local notifications” are not a valid web implementation of a daily reminder: browsers do not provide reliable closed-app scheduled web notifications without push infrastructure and a server-side trigger.
- The first release may support browser push on supported installed/regular web browsers. Unsupported browsers should retain a clear disabled/unsupported state and the rest of the app must work.

## Proposed architecture

1. **Web Push provider and credentials**
   - Use the Web Push protocol with VAPID keys and a vetted maintained server-side library. Confirm Node/Next runtime compatibility and license before selecting a package.
   - Keep VAPID private key server-only in deployment secrets. Expose only the public key through an authenticated or public configuration endpoint, as appropriate.
   - Do not store private credentials in the database or return them to any client.
2. **Subscription persistence**
   - Add a `push_subscriptions` table on primary and mirror with: UUID id, user_id FK, endpoint, encrypted/authenticated P-256DH and auth keys (or protected payload), user-agent/platform summary, created_at, last_used_at, disabled_at, and a unique hash of endpoint. Never include raw endpoint/key material in logs.
   - One learner may have several subscriptions (multiple browsers/devices); do not overwrite a different device subscription.
   - Apply RLS/policies and least-privilege grants using the repository’s migration pattern that works on Supabase and Neon (resolve role dynamically; no hard-coded `revisio_app` grant on mirror).
3. **Reminder preference**
   - Store enabled, local time (`HH:mm`), IANA timezone and optional quiet-hour fields as validated user preferences, either in a dedicated table or a rigorously typed `users.prefs` schema. The backend architect should choose one owner and preserve the existing `/me` preference compatibility contract.
   - Validate timezone through `Intl.supportedValuesOf('timeZone')` or an equivalent server-side allowlist; reject invalid values. Define DST behavior explicitly (send at the next valid local occurrence; do not duplicate a repeated wall-clock time).
4. **Authenticated endpoints** (all under `/api/v1`; exact paths to align with app conventions)
   - `GET /me/reminders`: return capability, current preference and subscription state, without endpoints/keys.
   - `PUT /me/reminders`: update `{ enabled, localTime, timeZone }`; disabling is idempotent and must stop subsequent sends.
   - `POST /push/subscriptions`: validate authenticated user, HTTPS endpoint, endpoint host/size limits and required key shape; upsert for that endpoint only; return sanitized status.
   - `DELETE /push/subscriptions`: remove/disable only the caller’s exact subscription; repeated deletion succeeds.
   - `GET /push/config`: return VAPID public key and capability metadata only.
   - Every endpoint must authenticate, validate with the project’s Zod conventions, return stable machine-readable error codes, and use `Cache-Control: private, no-store` for user-specific responses.
5. **Delivery scheduler / worker**
   - Run at a supported schedule (the Vercel Hobby cron is daily-only per `AGENTS.md`; minute/hourly scheduling cannot be added there). For chosen reminder time, use a separately hosted worker/queue or another cron provider that supports the required cadence; make the provider decision before implementation.
   - Query primary Postgres, not the daily-lagging Neon mirror, for enabled reminders and due counts.
   - Process due subscriptions in bounded batches with a durable idempotency key per user + local reminder date + channel. Lock/claim rows transactionally so overlapping worker runs cannot deliver twice.
   - Re-check `enabled`, current due count, quiet hours and subscription status immediately before sending.
   - On Web Push 404/410, delete or disable the expired subscription. On 429/5xx, retry with bounded exponential backoff and jitter. Other permanent errors should be recorded with sanitized reason and not loop indefinitely.
   - Enforce per-user and global quotas; set a finite TTL on each notification; do not send after the user's local day has rolled over.
6. **Rate limits and abuse controls**
   - Limit subscription changes per user/IP; cap active subscriptions per user; validate endpoint origins and request body size; protect VAPID setup and scheduler trigger with separate auth.
   - The scheduler endpoint must never be publicly triggerable without a secret or platform-authenticated invocation.
7. **Observability and privacy**
   - Track attempts, sent, suppressed-no-due, expired, retried and terminal failure counts, grouped by provider/status only. Never log full endpoint, keys, message payload containing identity, or learning content.
   - Alert on consecutive worker failures, queue age, elevated 429s and provider auth/config failure.
   - Document data retention/deletion for subscription keys and reminder delivery history. Account deletion/disable must cascade or disable subscriptions.
8. **Web Push service-worker contract**
   - The service worker handles `push` by showing only the generic safe title/body and a same-origin URL (`/review` or `/dashboard`). Validate click URL to prevent open redirects.
   - Handle `notificationclick` by focusing an existing same-origin client or opening the safe default route.
   - Never cache push payloads, authenticated API results or private HTML. Keep offline caching limited to explicit static assets and the offline fallback page.

## Suggested delivery lifecycle

1. Frontend requests permission on explicit “Enable reminder” click.
2. Browser creates `PushSubscription` with the VAPID public key.
3. Frontend sends subscription JSON to the authenticated endpoint; backend validates and stores it, then saves reminder settings.
4. Frontend shows enabled state only after both writes succeed; partial failure rolls back/unsubscribes or clearly offers retry.
5. Scheduler sends a generic notification only when the primary says due > 0.
6. User disables reminders → preference becomes disabled and subscription is removed/disabled; worker checks both states to close race windows.

## Test requirements

- Unit: local-time conversion across DST boundaries; invalid timezone/time; duplicate local-date idempotency; safe body content; endpoint validation; due=0 suppression; preference disabled suppression; 404/410 cleanup; retry limits.
- Integration: authenticated ownership (cannot inspect/delete another user’s subscription); create/update/delete are idempotent; only authorized worker can trigger jobs; all DB migrations and grants work on Supabase primary and Neon mirror.
- Delivery adapter tests must use a fake Web Push transport. Never send real pushes from tests.
- E2E staging: permission denied, browser unsupported, permission granted, subscription save failure, settings disable, account logout, multiple devices, offline and reconnect, due count changes before delivery, click-through to same-origin route.
- Security: payload contains no personal or study data; VAPID private key never appears in browser bundle, API response, logs or generated artifacts.

## Rollout and compatibility

- Add schema and API behind a feature flag; deploy backend before enabling frontend controls.
- Old frontend must continue to work when new endpoints are absent; new frontend should hide or render an honest “not available yet” state until capability endpoint confirms support.
- Roll out to staging with a small internal allowlist, then progressively enable. Include a kill switch that disables dispatch without deleting subscriptions/preferences.
- No new frontend route may assume push delivery, a scheduler or backend preference persistence exists until the backend contract and staging E2E tests pass.

## Decisions required from backend architect

1. Which scheduler/worker supports the required cadence under the current Vercel Hobby cron restriction?
2. Which maintained Web Push library and deployment runtime will be used?
3. Is subscription material encrypted at rest at the application layer, or protected by database/volume encryption with separate access controls?
4. What reminder send window and quiet-hours policy is the product committing to?
5. Should email fallback be in the first release or a separate opt-in feature? It must not be silently substituted for a denied push permission.
