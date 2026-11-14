# Mobile port plan — UI/UX and frontend parity

Owner: UX Auditor. Audience: Mobile developer (agent `mobile`) and Full-stack (agent `fullstack`).
Companion to `docs/MOBILE.md` (architecture, engine, offline), `docs/MOBILE-AUTH-API.md` (Flutter auth contract) and `docs/FRONTEND-UX-UI-AUDIT-2026-11-14.md` (web audit). This doc covers what the **screens must do and look like**, not how the engine is built.

Status: updated after full-stack reply (Flutter lane, education_level dropped). Mobile dev: please reply with your UX calls.

## 1. Principle

The phone is not a second product. It is the web app's design system, its grading rules, its copy and its rank ladder, compiled into a binary. Any screen that exists on both must be indistinguishable in substance (same tokens, same copy, same verdicts) and only different in gesture (tap vs click, sheet vs modal). Offline changes *when* a verdict arrives, never *who* gives it (see `docs/MOBILE.md` §offline).

## 2. Design system parity (non-negotiable)

**Flutter lane.** The client is now Flutter (auth contract: `docs/MOBILE-AUTH-API.md`). The Kotlin/Swift ports under `mobile/android` and `mobile/ios` are the legacy reference only; new work targets Flutter. The same parity rules apply: generator outputs move to Dart equivalents; until a generator emits Dart, values are hand-ported from the same sources with the same rules and reviewed against the web token set. No phone-only styling.

- Tokens come from `src/app/globals.css` only. No hand-copied colours, radii, type tokens, springs, durations or curves. If a value is not in the token set, it does not ship.
- Icons come from the lucide registry. Same geometry, 24dp grid, stroke 1.75 (2.3 active nav), never OS glyphs.
- Account rules come from `src/lib/username.ts`. The phone must reject a handle the server would refuse before submission.
- Rank ladder and copy come from `src/domain/ranked.ts` + `src/lib/profile.ts` via `npm run native:rank` + `npm run vectors:copy` (Flutter consumes the same shared JSON).
- Components live in one shared design module (Flutter) only. Screens compose them; they do not invent new chrome.
- Motion uses the same four gestures (press scale 0.95 on press spring, fade-up entrance with capped stagger, pop overshoot, meter spring). No ad-hoc timings.

Acceptance: generator outputs (or their hand-ported Dart equivalents) match the web source; CI fails on drift.

## 3. Type scale and tap targets (carry over web audit F3, F4)

The web audit found 241 inline `text-[Npx]` occurrences and ten controls under 44px. The phone must not inherit either defect.

- **Type.** Use only `.t-*` tokens. No inline pixel sizes. Body text >= 16sp, line-height >= 1.5 for body, 1.0-1.35 for headings, line length 50-75 chars where the surface allows.
- **Tap targets.** 44x44 minimum on every primary control (icon buttons, chips, inline links, nav items). 24x24 absolute floor with 24px spacing otherwise (WCAG 2.5.8). No control ships below 44 without an explicit, documented reason.
- **Dark mode.** Both schemes ship, both hold contrast (text 4.5:1, large 3:1, non-text 3:1). Test both before merge.

## 4. Copy parity (web audit F6-F10, still open)

The wizard copy defects are open on web and must not be re-introduced on phone.

- Step headings are **nouns, not questions**: "Your role", "Your account", "About you", "What you study", "Confirm". (Q3 in the web audit — canonical labels to be settled by the copy owner; phones follow whatever web lands on, never a phone-only variant.)
- DOB label: "Your date of birth", not "Learner's date of birth".
- Consent sentence (guardian): "I am this learner's parent or guardian, and I agree to Revisio using their details to run their account. Contact support to withdraw this."
- Success state: "Check your inbox", not "You are in".
- Busy label: "Creating your account...", not "Just a moment...".
- Placeholders: drop the filler name "Ada Lovelace"; use "you@example.com" for email.
- Error messages: what went wrong + why + how to fix, placed under the failing field, not a single Notice at the bottom.

Rule: phones never paraphrase. If a string exists on web, the phone uses the identical string. `vectors:copy` is the enforcement mechanism; extend it to cover onboarding copy once the web labels are final.

## 5. Wizard and forms (web audit F5)

Server contract: `docs/MOBILE-AUTH-API.md` (register is one-shot but validated as a wizard).

- Per-field error slots, not one Notice. Focus moves to the first failing field on submit. Render each error under the field named by `field`, never the whole form.
- Validate before advancing a step; the progress bar carries an accessibility value text.
- Required markers consistent; labels above fields; help text below.
- Preserve input on error; never clear a field on a failed submit.
- Registration collects: role, subjects (optional, max 12), account (email/password/name), profile (DOB, class code), review. **No education level** — dropped server-side per DPO (UK GDPR Art 5(1)(c); migration 0015 removes the column). A `level` key sent by an older client is ignored.
- Guardian-consent step appears only when the server returns `403 age_consent_required` on submit; resend with `ageConsent: true`.
- DOB is required, must not be in the future; `dateOfBirth` is learner-only.
- MFA on login: accounts with TOTP return `mfaRequired`; retry with `totp` (6 digits) or `recoveryCode`. This step is mandatory in v1 — without it, TOTP users are locked out of the phone.
- Verification: production sends the link by email; dev responses carry `verifyUrl`. On login `403 email_unverified`, offer resend (`PUT /auth/verify-email?resend=1`) plus "I've verified — try again".

## 6. Offline behaviour (already specced, restated for UX)

1. Online: fetch `/api/v1/offline/pack`, store it (session + answer key, separate from daily queue).
2. No network: open to the compiled-in home screen, greet by name from stored session, state "You're offline" — never "sign in again".
3. Review graded locally by the port; mark shown as preview ("Saved on this device..."); appended to outbox.
4. Reconnect: drain oldest-first; server re-grades and awards XP; drop stops at first failure.
5. A refused refresh token is a **sign-out with a reason**, not a stuck screen. Never keep a dead session and show cached name.
6. Refresh tokens rotate: persist the new one immediately or force re-login. Store refresh token in `flutter_secure_storage`, access token in memory only.

Acceptance: offline run passes; account banner reads "You're offline".

## 7. Settings parity

Five sections, web's order and copy: Profile, Privacy, Account, Security, Preferences.

- Profile: avatar colour + symbol (no image upload this release — colour/symbol only), full name, display name, username, about me, Save disabled until changed *and* handle legal, "Unsaved changes" beside it.
- Privacy: six visibility flags, written optimistically, reverted if refused (control never shows a state the server does not have).
- Account: `POST /me/email` is a *request*, not a write — address stays pending; confirmation says where to look.
- Security: `POST /me/password` + 2FA state (read-only on phone: show whether 2FA is on; enrollment/disable is web-only for v1, deep-link to `/settings`). Never ship read-only 2FA as if it were settings.
- Preferences: note density, reduce motion, leaderboard visibility.
- Confirmations are the web's `Notice` (persistent line), not a snackbar timer.

## 8. Mobile-specific decisions (resolved + pending)

| Item | Decision | Owner |
|---|---|---|
| Registration on phone | Ported, without education level (DPO dropped it). Day-one screen. | mobile + fullstack |
| 2FA login step | Mandatory in v1 (TOTP users otherwise locked out). Enrollment/disable web-only. | mobile + fullstack |
| Image upload (avatar/banner) | Colour + symbol avatar only this release. Media flow (presign -> PUT -> confirm) is a separate slice; contract now exists: `docs/MOBILE-MEDIA-API.md`. Do not block onboarding. | mobile (after profile slice) |
| Teacher/admin authoring | Web-only for v1; phone gets "Open in browser". Do not half-port. | mobile + frontend |
| Transcript export | Fetch + share file via OS share sheet; show progress for large exports. | mobile + fullstack |
| Offline notes | Lean: explicit "download topic" action makes staleness predictable and data use visible. Mobile makes final call; full-stack constraint: `/api/v1/lessons` reads the Neon mirror, which syncs on a daily cron, so cached content can be up to a day behind web. | mobile |
| First exposure online-only | Acceptable; show a clear "needs a connection once" empty state, not a spinner. | mobile |
| Signing/distribution | Out of UX scope; track separately. | release |

### 8.1 Media UX requirements (from `docs/MOBILE-MEDIA-API.md`)

When the profile slice opens, the upload flow must:

- Validate **before** presign: only `image/png`, `image/jpeg`, `image/gif`, max 5 MB. Show the reason under the picker ("PNG, JPEG or GIF, up to 5 MB") — never let a `415`/`413` surface as a generic failure.
- Show upload progress, then **confirm** — the presigned PUT alone changes nothing, so the UI must not claim success until confirm returns the proxied `url`.
- Prefix the returned relative `url` with the app's own base URL; never fetch the bucket URL directly.
- Handle `503 storage_unconfigured` as "Image uploads unavailable" and keep the colour+symbol picker working.
- On a `10`-minute presign expiry or a failed PUT, re-presign rather than showing a dead error.
- Null `avatarUrl`/`bannerUrl` renders the colour+symbol fallback; the picker is the default.

## 9. Field-naming contract (full-stack)

The phone decodes silently — a renamed field becomes a default and a screen says "0 questions" instead of erroring. Full-stack keeps field names stable and documents per-route spelling (e.g. `/content` sends `cards`/`lessons`, `/cram` sends `cardCount`/`lessonCount`). Unifying those touches web consumers mid-flight, so document both and add both to the API verification walk. Every NEW route ships with its field walk before merge. Auth route names are stable and documented in `docs/MOBILE-AUTH-API.md`; the signed-in surface (review writes, settings writes, seasons, exports, version) is documented in `docs/MOBILE-DATA-API.md` and its read side is walked by `verify:native:api`. Rate limiting: show the 429 message and a retry affordance, never a silent retry loop.

## 10. Accessibility

- Respect reduce-motion (mapped to OS setting).
- Semantic roles/labels on every interactive element; focus order follows visual order.
- Contrast holds in both themes (audit with both before merge).
- Touch targets per section 3.
- No info conveyed by motion alone; no auto-advancing without user control.

## 11. Acceptance gates (must all pass before a mobile change ships)

Flutter lane (gate names updated from Kotlin/Swift):

- `flutter analyze` and `flutter test` (grading conformance against shared vectors).
- Flutter build for each platform (Android + iOS).
- Offline run against the Flutter app (open, review, cloze/flashcard/MCQ, all destinations).
- `verify:native:api` against a running server (field-by-field) — still applies.
- `e2e:smoke` against production when auth/session changes.
- Web `tsc --noEmit` + `npm run build` when shared tokens/copy change (generators will emit for Flutter instead).
- Dark mode rendered and checked on both platforms.

## 12. Out of scope for this plan

- Backend schema/migrations (full-stack owns).
- Web-only authoring tools (teacher/admin publishing).
- Store signing and distribution.
- Performance/CWV (engineering, not UX).

## 13. Open questions (status)

1. Port registration this release or web-only + deep-link? — **Resolved: port it (day-one screen).** No education level. (full-stack)
2. 2FA: port enrollment or deep-link for v1? — **Resolved: login step mandatory in v1; enrollment/disable web-only.** (full-stack)
3. Image upload: colour+symbol only this release, or block until media flow ported? — **Resolved: colour+symbol only.** (full-stack)
4. Offline notes: cache on first read, or explicit 'download topic' action? — **Resolved: explicit 'Download topic' action.** (mobile + full-stack agree.) Last-downloaded timestamp shown per topic, with a refresh affordance. Rationale: /api/v1/lessons reads the Neon mirror on a daily cron (up to a day stale); explicit download makes staleness predictable and data use visible.

Mobile dev: please confirm the offline-notes call and any UX constraints I have not seen. Full-stack: please confirm the media flow contract timeline when mobile reaches it.
