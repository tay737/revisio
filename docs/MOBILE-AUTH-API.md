# Mobile API contract — auth (Flutter lane)

Server-side facts for the Flutter app. Everything below is already deployed behaviour, except the
`refreshToken`-in-body additions marked **NEW**, which land with this document. Error shape is the
same everywhere: `{"error":{"code","message","details","field"}}` — `field` names the one control
the sentence belongs under, so render the message under that field only.

Base URL: production `https://revisio-srs.vercel.app`; local dev `http://localhost:3100`.

The web client keeps a cookie-only refresh posture. A Flutter client must send
`"client": "native"` in the login and refresh bodies to receive the refresh token in the
response body (see the two **NEW** notes).

## POST /api/v1/auth/login

Request:

```json
{ "email": "...", "password": "...", "totp": "123456", "recoveryCode": "...", "client": "native" }
```

`totp` / `recoveryCode` only on the second call after `mfaRequired`. `client: "native"` is the
Flutter opt-in for a body refresh token.

Responses:

- `200 { "accessToken", "user": { id, email, name, role, status, totpEnabled } }` — plus
  **NEW** `"refreshToken"` when `client: "native"`.
- `200 { "mfaRequired": true }` — account has TOTP; retry with `totp` (6 digits) or a
  `recoveryCode`.
- `401 invalid_credentials` — wrong email or password.
- `401 invalid_mfa` — the TOTP/recovery code was wrong. There is a **third** rate-limit
  budget here, per-account on `totp` attempts: repeated wrong codes `429` even from one IP.
- `403 suspended` / `403 email_unverified` — the second means the learner never clicked the
  verification link; offer resend (`PUT /auth/verify-email?resend=1`, see below) and a
  retry affordance, never a silent retry loop.
- Rate limiting: attempts are counted **before** any password work, per IP and per email+IP
  (plus the per-account TOTP wall above). A `429` tells the truth about the window; show the
  message and a retry affordance, never a silent retry loop (a loop burns the same budget).

Store the `refreshToken` in `flutter_secure_storage` (not shared prefs), the `accessToken` in
memory only.

## POST /api/v1/auth/refresh

Request: `{ "refreshToken": "...", "client": "native" }` (cookie web clients send nothing).

Responses:

- `200 { "accessToken", "user": { id, email, name, role } }` — plus **NEW** `"refreshToken"`
  (the rotated replacement). **Persist the new one immediately** — rotation invalidates the old
  token; a client that crashes between call and persist forces a re-login.
- `401 no_refresh` / `401 invalid_refresh` — log the user out; there is no retry.
- `403 age_consent_required` / `403 suspended` — account unavailable; log out and say why.

## POST /api/v1/auth/register

One-shot request, but the server validates it as a wizard — send everything at once from your
last step:

```json
{
  "email": "...", "password": "...", "name": "...",
  "role": "student",            // omit = student; "teacher"/"developer" go to a staff-approval queue
  "requestedRole": "teacher",   // alias for `role` — the web staff form sends this one
  "dateOfBirth": "YYYY-MM-DD",  // learner-only, required, must not be in the future
  "ageConsent": true,           // ONLY when the server said so (see 403 below)
  "subjectIds": ["..."],        // optional, max 12
  "classCode": "ABC123",        // optional — silently ignored when no class matches
  "note": "..."                 // staff role requests only
}
```

Server-side facts the wizard should know:

- `dateOfBirth` is **retained only for under-13 learners**. For 13+ the server stores
  `dateOfBirth: null` and `ageConsent` stays false — do not promise the app "remembers" an
  adult's DOB; it does not, by design.
- `classCode` has no error path: an unknown code simply joins nothing and the 201 carries no
  signal. If the UI claims "joined class X", it must verify via `GET /classes/join` after
  registering, or drop the claim.
- Registration is rate-limited per IP (`registerIp`) — a `429` is possible on the submit step;
  show the message and a retry affordance.
- Staff requests (`role`/`requestedRole` = `teacher`/`developer`) always return
  `role: "student"` + `status: "pending"` — the account exists but waits in the approval queue.
  The response carries **`pendingApproval: true`** for those; show the approval-pending
  message, not "check your inbox" (that one is for learners).

Education level is NOT collected: removed from the server per the DPO's ruling (UK GDPR
Art 5(1)(c) — no lawful basis, no feature consumed it). Do not show a level picker; a
`level` key sent by an older client is simply ignored.

Field errors (each arrives with a `field` key — mark that field, not the whole form):

- `400 bad_request` on `email` / `password` / `name` / `role`
- `400 weak_password` on `password` (< 8 chars)
- `400 invalid_date_of_birth` on `dateOfBirth`
- `403 age_consent_required` on `ageConsent` — the server decided from the DOB that a guardian
  must consent; show the guardian-consent step, then resend with `ageConsent: true`.
- `409 email_taken` on `email` — offer sign-in instead.

Success `201`:

```json
{ "id", "email", "name", "role": "student", "status": "pending",
  "pendingApproval": true,                    // ONLY for teacher/developer requests
  "unavailableSubjects": ["..."]?,          // only when some subjectIds had vanished
  "verifyUrl": "/verify-email?token=..." }  // ONLY when the server has no mail provider (dev)
```

In production the verification link is emailed; the response carries no `verifyUrl`. Status
stays `pending` until the learner opens the emailed link; login then answers
`403 email_unverified` until they do.

For a mobile verification handoff, the token path composes with the production origin:
`https://revisio-srs.vercel.app/verify-email?token=...` (only exists in dev responses), or the
learner opens the email themselves on the device. If you'd rather the server return a full URL
in dev responses, ask — that is a one-line change in the same file.

## POST /api/v1/auth/verify-email

`{ "token": "...", "kind": "verify" | "email_change" }` → `200`.

- `kind` **must be echoed from the link's query string** — email-change links arrive as
  `/verify-email?token=..&kind=email_change`, and the token store is kind-scoped: posting an
  `email_change` token without `kind` answers `400 invalid_token` even though the link is
  valid. `verify` (and omitted `kind`) activates a new account → `{ "verified": true }`.
- `email_change` → `{ "verified": true, "email": "<new address>" }`; errors `400 invalid_token`,
  `409 conflict` (no change waiting), `409 email_taken` (address registered meanwhile — the
  pending change is cancelled server-side).

## PUT /api/v1/auth/verify-email?resend=1

`{ "email": "..." }` → always `200 { "sent": true }` — the neutral answer, whether or not the
address exists, is verified, or is rate-limited (no registration oracle). Rate-limited per
mailbox. This is the app's "check your inbox" screen: on login `403 email_unverified`, offer
this resend plus a "I've verified — try again" button that simply retries the login.

## GET /api/v1/auth/subjects-public

`200 { "subjects": [{ "id", "name" }] }` — no auth. Powers the register wizard's subject
picker; cache it for the session.

## POST /api/v1/auth/password-reset + /confirm

Forgot-password, two calls:

1. `POST /api/v1/auth/password-reset` `{ "email" }` → always `200 { "sent", "message" }` —
   neutral whether or not the address exists (no account oracle).
2. `POST /api/v1/auth/password-reset/confirm` `{ "token", "password", "client": "native" }` →
   `200 { "accessToken", "signedOutElsewhere": true, "user": {...} }` — **plus
   `"refreshToken"` when `client: "native"`**, same opt-in as login. Every prior session is
   revoked; the response signs the caller straight in. Errors: `400 invalid_token` (expired
   or used — links are single-use), `400 weak_password`.

## POST /api/v1/auth/logout

Send the stored refresh token — `{ "refreshToken": "..." }` in the body for native (the
cookie path is what web uses). The server revokes **that one token**; other devices'
sessions survive (a password change is what signs everything out). Flutter must still
delete its local copy — server revocation cannot reach `flutter_secure_storage`. Response
`200 { "ok": true }` either way.

## 2FA management (web-only for v1)

`GET/POST/DELETE /api/v1/auth/2fa` exist (enrolment secret+URI, confirm code, disable) but
the plan keeps enrolment on web — the phone shows 2FA state read-only and deep-links to
`/settings`. Errors if ever called: `400 no_secret` / `invalid_code` / `not_enabled`.

## Authenticated calls

`Authorization: Bearer <accessToken>` on every call except the four above. On `401`, run the
refresh dance once, retry the original call, and only log out if the refresh itself failed.
