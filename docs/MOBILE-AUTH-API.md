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
- `403 suspended` / `403 email_unverified` — the second means the learner never clicked the
  verification link; offer resend (`PUT /auth/verify-email?resend=1`, see below) and a
  retry affordance, never a silent retry loop.
- Rate limiting: attempts are counted **before** any password work, per IP and per email+IP.
  A `429` tells the truth about the window; show the message and a retry affordance, never a
  silent retry loop (a loop burns the same budget).

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
  "dateOfBirth": "YYYY-MM-DD",  // learner-only, required, must not be in the future
  "ageConsent": true,           // ONLY when the server said so (see 403 below)
  "subjectIds": ["..."],        // optional, max 12
  "classCode": "ABC123",        // optional
  "note": "..."                 // staff role requests only
}
```

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
{ "id", "email", "name", "role", "status": "pending",
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

`{ "token": "..." }` → `200 { "verified": true }`; `400 invalid_token` when the link expired.
`kind: "email_change"` is a settings flow, not onboarding.

## PUT /api/v1/auth/verify-email?resend=1

`{ "email": "..." }` → always `200 { "sent": true }` — the neutral answer, whether or not the
address exists, is verified, or is rate-limited (no registration oracle). Rate-limited per
mailbox. This is the app's "check your inbox" screen: on login `403 email_unverified`, offer
this resend plus a "I've verified — try again" button that simply retries the login.

## GET /api/v1/auth/subjects-public

`200 { "subjects": [{ "id", "name" }] }` — no auth. Powers the register wizard's subject
picker; cache it for the session.

## POST /api/v1/auth/logout

Requires the bearer access token. Server revokes every refresh token for the user. Flutter
must also delete its stored refresh token locally — the server clear cannot reach
`flutter_secure_storage`.

## Authenticated calls

`Authorization: Bearer <accessToken>` on every call except the four above. On `401`, run the
refresh dance once, retry the original call, and only log out if the refresh itself failed.
