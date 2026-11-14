# Mobile API contract — signed-in surface (Flutter lane)

Server-side facts for the Flutter app's signed-in screens. Companion to
`docs/MOBILE-AUTH-API.md` (auth) and `docs/MOBILE-MEDIA-API.md` (uploads). Everything here is
deployed behaviour. Bearer token on every call; error shape is
`{"error":{"code","message","details","field"}}` — render `message` under the control `field`
names, never as one blanket notice.

The read endpoints (queue, learn, cram, gamification, profile, offline pack, catalogue) are
field-walked by `npm run verify:native:api` — the script is the spelling authority for what a
screen decodes. This document covers what the walk does **not**: the write payloads and the
endpoints added since it was written. If a route here ever disagrees with the server, the
server wins and this doc is the bug.

## Screen → endpoint map

| Screen | Reads | Writes |
|---|---|---|
| Today | `GET /me`, `GET /queue/today`, `GET /gamification?scope=weekly` | — |
| Review | `GET /queue/today`, `GET /offline/pack` | `POST /reviews` (one per answer; outbox drains oldest-first) |
| Learn | `GET /subjects`, `GET /content`, `GET /lessons`, `GET /learn` | `POST /reviews` with `mode:"learn"` |
| Cram session | `GET /cram`, `POST /cram` | `POST /reviews` with `mode:"cram"` |
| Rank | `GET /gamification?scope=weekly`, `GET /seasons` | `PATCH /seasons` (claim reward) |
| Settings | `GET /me`, `GET /consent`, `GET /classes/join`, `GET /version` | `PATCH /me`, `POST /me/email`, `POST /me/password`, `POST /media`, `PATCH /consent`, `POST /subjects`, `POST /classes/join`, `DELETE /data-deletion` |
| Transcript | — | `GET /exports?format=csv\|json` (a read that returns a file) |

## POST /api/v1/reviews — the only write the review loop makes

```json
{ "cardId": "...", "answer": "...", "selectedOptionId": "...",
  "durationMs": 4200, "mode": "daily", "sessionId": "..." }
```

- `cardId` required. `answer` is the learner's text (cloze/flashcard); `selectedOptionId` is the
  MCQ choice; `durationMs` optional. `mode`: `daily` (default) | `cram` | `exam` | `learn`.
  `sessionId` ties answers to a cram session.
- The server **re-grades**: the offline outbox may show a local preview verdict, but the
  response below is authoritative — replace the preview with it on drain.
- `mode:"cram"` grades but does **not** move the schedule; `mode:"learn"` is first exposure
  (schedule moves, UI shows notes beside the card). XP, streaks and achievements are identical
  across modes.

Response `200`:

```json
{ "verdict": { "correct": true, "feedbackKind": "...", "note": "...",
               "matchedPhrases": ["..."], "missedPhrases": ["..."] },
  "primaryAnswer": "...", "modelAnswer": "...", "explanation": "...",
  "xpAwarded": 12, "totalXp": 840, "level": 4, "streak": 6,
  "newAchievements": [{ "id", "name", "icon", "description" }],
  "nextDueAt": "ISO-8601", "srsLevel": 3, "srsLabel": "..." }
```

`verdict.correct` is the pass/fail the UI renders; `srsLevel`/`srsLabel` are the strength rung
the card moved to. Errors: `400 bad_request` (no `cardId`), `401`, `404` unknown card.

## PATCH /api/v1/me — profile, privacy and preferences in one door

All fields optional; send only what changed. Both `profileVisibility` **and** `prefs` merge
server-side — absent keys keep their stored value, so a partial write cannot blank the rest.

```json
{ "name": "...", "nickname": "...", "username": "...", "bio": "...",
  "pronouns": "...", "avatarEmoji": "🌿", "avatarColor": "moss",
  "bannerColor": "dusk", "leaderboardOptOut": false,
  "profileVisibility": { "bio": true },
  "prefs": { "noteDensity": "detailed", "reducedMotion": false } }
```

- `avatarColor` must be one of `ink | moss | bee | dawn | sky`; `bannerColor` one of
  `dusk | rose | sea | moss | bee | ember` — the same palettes the web picker offers. Anything
  else is `400 bad_avatar_color` / `400 bad_banner_color`.
- `username` is validated like registration (`lib/username.ts` rules); a taken handle is
  `409 username_taken`, not a silent overwrite.
- `prefs.noteDensity`: `"detailed" | "summary"`. `pronouns` over-length/punctuation is
  `400 bad_pronouns`.
- Response `200 { "updated": true }` — refetch `GET /me` for the new state rather than
  predicting it.

## Account writes (Settings → Account / Security)

- `POST /me/email` `{ "password", "newEmail" }` → `200 { "pending": true }`. This is a
  **request**, not a write: the address moves only when the link mailed to the *new* address is
  clicked. Errors: `403 wrong_password`, `409 email_taken`, `400 bad_request`.
- `POST /me/password` `{ "currentPassword", "newPassword" }` → `200 { "changed": true }`.
  **Revokes every refresh token** — the device that changed it is signed out too. Treat the
  response as "re-authenticate now": clear the stored refresh token and route to login.
  Errors: `400 weak_password` (< 8), `400 bad_request` (same as current), `403 wrong_password`.

## Subjects, classes, consent

- `POST /subjects` `{ "subjectId" }` → `{ "enrolled": true }` (idempotent). Un-enrolment is
  web-only for v1.
- `GET /classes/join` → `{ "classes": [{ "id", "name", "subjectId" }] }`.
  `POST /classes/join` `{ "code" }` — exactly 6 `[A-Z0-9]` characters →
  `201 { "class": { "id", "name" } }` or `200 { ..., "alreadyJoined": true }`.
  Errors: `400 bad_request`, `404 not_found`, `403 forbidden` (non-students).
- `GET /consent` → `{ "consent": {...}, "decidedAt": "..."|null }`.
  `PATCH /consent` `{ "choices": { "essential": true, "analytics": false, ... }, "updatedAt"? }`
  → `200 { "consent": {...} }`. The server stamps `decidedAt` itself (UK GDPR Art 7(1)
  evidence); a client-supplied `updatedAt` is kept only as `clientReportedAt` and never
  backdates the record. Unknown choice keys are dropped; `essential` is always `true`.

## Deletion — two-step challenge, not a plain DELETE

`DELETE /api/v1/data-deletion` with the bearer token:

1. First call (no confirmation header) → `200 { "confirm": true, "message", "email",
   "expiresAt", "confirmationToken" }`. Show `message` verbatim on the confirm sheet.
2. Second call repeats `DELETE` with header `x-data-deletion-confirm: <confirmationToken>` →
   `200 { "deleted": true, "mediaQueued": <n>, "message" }`. `mediaQueued > 0` means uploaded
   images are still queued for removal — show the returned `message`, which already says so.
   `403 deletion_confirmation_expired` → start over at step 1.

After success every refresh token is revoked: clear local state and sign out.

## GET /api/v1/exports?format=csv|json

Transcript download. `csv` (default) returns `text/csv` with a
`Content-Disposition: attachment` header — fetch to a file and hand to the OS share sheet.
`json` returns the same data as JSON: `{ student, topics[], strongest[], weakest[],
examAttempts[] }`. `400 bad_request` on any other format. Reads the replica — up to a sync
cycle behind a just-finished review.

## GET /api/v1/version — update check, unauthenticated

`200 { "latest": "x.y.z", "build": <int>, "minBuild": 0 }`. Call on launch before sign-in;
compare `build` against the app's compiled-in build. `build < minBuild` means the update is
**required**, not optional. No auth, no rate limit concerns.

## GET /api/v1/seasons + PATCH /api/v1/seasons

`GET` → the live season plus `rewards[]`, `board[]` and `history[]` (closed seasons with
`rank`, `reviews`, `reward`, `rewardClaimedAt`). `PATCH { "seasonNumber" }` claims a closed
season's reward → response carries the claim state; claim is idempotent.

## GET /api/v1/insights

Own-progress payload for a stats surface: `{ student, overview{ totalReviews, totalCards,
correctPct, monthCorrectPct, monthReviews, xp, streak, bestStreak, dueCount }, srsLevels[],
distribution[], struggling[], upcomingReviews[] }`. All reads; nothing to write.

## POST /api/v1/media — deltas on top of docs/MOBILE-MEDIA-API.md

- `confirm` now verifies the object exists in the bucket before recording: a confirm without
  a completed PUT answers `400 upload_missing` — re-presign, PUT, then confirm again. A
  `contentType` outside the whitelist answers `415 bad_type`; a missing/invalid `kind` is
  `400 bad_kind`.
- `/api/v1/assets/<key>` 404s are plain text, not the JSON error shape — an image loader just
  fails. Treat any non-200 as "render the colour+symbol fallback".

## GET /api/v1/me — fields present but not for you

`/me` carries a few keys no screen needs: `gamification.intoLevel`/`forNext`,
`subjects[].slug`. Consent is NOT in `/me` — `GET /consent` is the source. There is no
`pendingEmail` either, so "email change pending" cannot be read back; the confirmation screen
lives in the mailbox.

## Spelling traps (recap from the field walk)

- `/content` and `/cram` count fields differ on purpose: `cards`/`lessons` vs
  `cardCount`/`lessonCount`. Decode both.
- Queue and pack cards never carry `key` — the answer key only exists inside
  `/offline/pack` cards (and learn/cram payloads the client already holds). Do not expect it
  on `/queue/today`.
- `avatarUrl`/`bannerUrl` on `/me` are app-proxied **relative** paths — prefix the API base
  URL (see `docs/MOBILE-MEDIA-API.md`).
- Rate limits answer `429` with the window in the message; show it and a retry affordance,
  never a silent retry loop.
