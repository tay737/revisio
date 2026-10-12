# Revisio — UX Audit & Development Handoff

**Status:** current as of `1.0.0-alpha.6` (audited 2026-09-30)
**Audience:** the agent/engineer implementing the changes described here.
**Scope:** the website (`src/`), the Android client (`mobile/android/`), and the iOS client (`mobile/ios/`).

Evidence tags used throughout:

- **[verified]** — confirmed by reading the code; the cited file/symbol is the thing to change.
- **[verify-first]** — strongly indicated by the code but not fully traced; confirm before building.

---

## 1. How to use this document

This is a work order, not a essay. Each finding has: **what a user experiences today**, **why it matters**, **where it lives in the code**, **how to fix it**, and **how to know it is fixed**.

Work the priorities in order (P0 → P3). Within a priority, the items are roughly in user-impact order. Everything here was written to respect the repo's own law — read §3 **before** changing anything, because several "obvious fixes" would violate the architecture this project is built on.

**Companion docs you must read before writing code:**

| Doc | Why |
|---|---|
| `docs/UI-SYSTEM.md` | The one page describing how the UI is owned. Structure and rules, not values. |
| `docs/DESIGN-UBER.md` + `docs/DESIGN-DUOLINGO.md` | The two halves of the design language ("Uber owns the chrome; Duolingo owns the state"). |
| `docs/MOBILE.md` | The native architecture: engine apart from interface, the generators, the verification gates. Note: partially stale — see finding **P3-2**. |
| `AGENTS.md` | Operational landmines (DB topology, deploy, ports). |
| `docs/ARCHITECTURE.md` | System structure and the decisions that survived. |

---

## 2. Product snapshot

Revisio is a spaced-repetition study platform: subjects → topics → lessons/cards, a daily queue you finish, and a persistent rank (15 rungs) plus a weekly 30-seat lobby. Grading, scheduling and XP are computed **server-side only**; clients may preview but never decide. Three surfaces share one `/api/v1` backend and one design language:

| Surface | Stack | State |
|---|---|---|
| Web | Next.js 14 (App Router), Tailwind 4 tokens, `motion/react`, SWR | Feature-complete for v1 |
| Android | Kotlin + Compose over a JVM `:engine` (offline pack, outbox, grading port) | Alpha; sideload APK |
| iOS | SwiftUI over the `RevisioEngine` Swift package | Alpha; unsigned `.ipa` |

The mobile clients are **offline-first native ports**, not WebViews: the daily session, its answer keys, and the learner identity survive a restart with no network. This property is the product's spine — every finding below is written so that fixing it never breaks it.

---

## 3. Ground rules for development (do not violate)

1. **Generated files are never hand-edited.** `Theme.kt/.swift`, `Icons.kt/.swift`, `AccountRules.kt/.swift`, `RankLadder.kt/.swift` are emitted by `npm run native:generate` from web sources (`globals.css`, `icons.tsx`, `lib/username.ts`, `domain/ranked.ts`). Change the web source, regenerate. A trailing comma in an argument list (Swift ≥6.1 syntax) also fails the release runner's older Swift — `make-theme.mjs` refuses to emit one; keep that discipline in any new generated code.
2. **One owner per fact.** Navigation lives in `src/components/nav/routes.ts` (web) and the `Destination` enum (both phones). Copy for voice/greetings lives in `lib/profile.ts` (web) and `engine Copy.*` (phones), conformance-tested by `mobile/shared/copy-vectors.json`. Grading lives in `src/domain/grading.ts` + golden vectors. If you add a fact, give it one owner; if you change one, expect the conformance tests to fail until the ports follow.
3. **The server decides.** Never re-derive grading, XP or scheduling in a client beyond the existing preview rule (offline pack keys → preview verdict → server re-grades).
4. **`server-only` modules never import into client components**; shared validation goes in `src/lib/*`.
5. **Verification is not optional.** After changes:
   - Web: `npm run typecheck`, `npm run lint`, `npm run build`.
   - Engines: `npm run native:android:test`, `npm run native:ios:test`.
   - Surfaces: `npm run native:ios:build` (compiles the SwiftUI surface for iOS), `npm run verify:native` (drives the APK offline on an emulator) when you touch anything the smoke test asserts against (it reads real screen text — copy changes break it by design).
   - Copy changes: `npm run vectors:copy` and update both `CopyConformanceTest(s)`.
6. **Colour means state.** Five game tokens (`--good`, `--streak`, `--gold`, `--info`, `--destructive`), each with exactly one meaning. Green carries the in-session CTA only. Chrome is ink/canvas. Any new UI must follow this — see §8 for the contrast work that fits *inside* the rule.

---

## 4. What is already excellent (do not regress)

Fixing the issues below must not undo these; they are the product's competitive texture:

- **The offline contract.** Compiled-in destinations, the pack + outbox, "Saved on this device… …the server re-grades it when you reconnect", and a refused refresh ending the session *with a reason*. Nothing in this audit should trade this away.
- **The verdict discipline.** The right answer is stated once; the verdict says only what was wrong; on phones the verdict scrolls into view only when it is actually out of sight. Enter checks; Shift+Enter breaks lines.
- **The rank crest.** Geometry-coded (chevrons, pips, ticks) instead of hue-coded — the only honest way to show 15 rungs in a one-accent system.
- **Honest empty states.** Placement is shown as placement, not a fake Bronze III; a lobby with unclaimed seats says so; a topic with no questions says "its notes are still worth reading".
- **The travelling active indicator** on all three nav surfaces (3px ink bar, layout spring), and the due-count badge living on the Review slot.
- **Focus work on the exam page** (`role="status"`, focus moved to the result heading, `aria-expanded` disclosures, styled range inputs).
- **The token→scope system** (`.band`/`.tile-dark` remapping semantic variables) — components written once render correctly on either ground.

---

## 5. P0 — Blockers: users are locked out or broken today

### P0-1. A 2FA-enabled account cannot sign in on either phone at all

**Experience.** Any learner who enabled two-factor on the web is permanently locked out of the mobile apps. The apps don't offer a TOTP field; the engines *throw* on `mfaRequired`.

**Evidence [verified]:**
- Android: `mobile/android/engine/.../RevisioApi.kt` — `login()` raises `ApiException(409, "mfa_required", "This account needs a 2FA code, which this build cannot yet enter.")`.
- iOS: `mobile/ios/Sources/RevisioEngine/RevisioApi.swift` — `login()` throws `ApiError(409, "mfa_required", "This account needs a 2FA code.")`.
- Both Settings screens *display* 2FA state ("2FA on/off") but cannot enrol, disable, or use it. The web's Settings chip that should lead to enrolment is also broken — see P1-4.

**Why it matters.** Security features that lock people out of the product they enrolled to protect are worse than no feature: the user's only escape is to disable 2FA on the web (if they can even get there). For students this is a silent wall; the error message is at least honest, but honesty doesn't sign them in.

**Fix (both platforms, same shape):**
1. Engine: stop throwing on `mfaRequired`; surface it as a first-class outcome of `login()` (e.g. an `AuthOutcome.MfaRequired` / sealed result), and add `totp` (and `recoveryCode`) parameters to the login call. The backend already accepts both (`src/app/api/v1/auth/login/route.ts` accepts `totp` and `recoveryCode`).
2. Surface: after submit, if `mfaRequired`, reveal a six-digit TOTP field in the same auth screen (`keyboardType: number/otp`, `inputMode numeric`, autofill hint `oneTimeCode` on iOS; `KeyboardOptions(keyboardType = KeyboardType.NumberPassword, autoCorrect = false)` + `AutofillHints`/`contentType` on Android) with copy mirroring the web's: "Enter the six-digit code from your authenticator app." Keep the user's email/password in state; the retry sends the same body + `totp`.
3. Accept recovery codes in the same field (the server decides which it got) — say so in the hint: "Or one of your recovery codes."
4. Conformance: add an engine test that a `mfaRequired` login response maps to the new outcome, and a vector in `mobile/shared/` if you extend the copy set.

**Acceptance:** a 2FA-enabled account signs in on both phones with a TOTP code and with a recovery code; `verify:native:api` still passes; the smoke test still passes.

### P0-2. There is no password reset anywhere

**Experience.** A learner who forgets their password has no recovery path on any surface. Registration, email verification and email change all exist; "forgot password" does not (web search for `forgot|reset-password` returns nothing).

**Why it matters.** This is the single most expected affordance in any authenticated product. Its absence converts every forgotten password into a support email — and there is no support channel. Email delivery already exists (Resend is wired for verification), so the missing piece is entirely product surface.

**Fix:**
1. Server: `POST /api/v1/auth/password-reset` (email → always respond 200 with the same neutral copy, whether or not the account exists; issue a single-use, ~30-minute token) and `POST /api/v1/auth/password-reset/confirm` (token + new password → set, revoke all refresh tokens, respond with a session or force sign-in). Reuse the verification-email plumbing in `services/` and the token patterns already there. Rate-limit per email.
2. Web: a "Forgot password?" link on `AuthForm` (login mode) → a `/forgot-password` route using `AuthShell`; a `/reset-password?token=` route with new-password + confirm fields; success copy states that other devices were signed out.
3. Mobile: out of scope for v1 (sign-in only) — but the *copy* on the phones' auth screens should add a one-liner: "Forgot your password? Reset it on the web at <domain>." Both `AuthScreen.kt` and `AuthView.swift` already have a fine-print slot for exactly this.
4. Email template: same voice as the verification mail (short, one link, one sentence of context).

**Acceptance:** full round-trip on web; phones state the recovery path; typecheck/build/tests green.

### P0-3. Android: no edge-to-edge / window-inset handling (targetSdk 35)

**Experience.** On Android 15+ devices (targetSdk 35 forces edge-to-edge) content draws under the status bar and behind gesture navigation; on older devices the theme pins black system bars over a white app.

**Evidence [verified]:**
- `mobile/android/app/src/main/res/values/themes.xml` — `statusBarColor`/`navigationBarColor` hardcoded `black`, `windowBackground` black.
- Zero matches for `WindowInsets|systemBars|statusBarPadding|navigationBars` anywhere in `mobile/android/`.
- Every screen starts with fixed padding (`padding(20.dp)`) or fixed spacers (e.g. `Spacer(72.dp)` on auth) that assume no system bars overlap.
- `build.gradle.kts` — `targetSdk = 35`.

**Why it matters.** The hero, the tab bar and every screen's first card sit under the status bar on current Android. The black bars also contradict the light theme (black chrome over canvas white) and the design system, which owns colour.

**Fix:**
1. In `MainActivity`, call `enableEdgeToEdge()` (androidx.activity) and drop the hardcoded bar colours; set the status-bar icon appearance from the current theme (dark icons in light mode).
2. Consume insets once, in `RevisioApp.kt`: apply `WindowInsets.statusBars.asPaddingValues()` to the root column (or `Modifier.windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Top))`) and `navigationBars`/`ime` around the `BottomBar` (the bar currently assumes no nav-bar inset; `pb-safe`'s equivalent is `WindowInsets.navigationBars` padding under the 64dp bar).
3. Remove the compensating fixed spacers on auth/Today that were guessing at bar height.
4. Ensure the keyboard (`ime`) insets push the answer field above it during a session.

**Acceptance:** on an Android 15 emulator, no screen's content intersects the status bar or gesture area; light/dark both draw correct system-bar icon contrast; `verify:native` passes.

### P0-4. Android: the system Back button is unhandled

**Experience [verified — zero matches for `BackHandler|onBackPressed` in `mobile/android/`].** Pressing system Back mid-review, with the More sheet open, or anywhere in the app, does the default thing (finishes the activity / exits the app). A learner mid-review who reflexively swipes back loses the session screen (the *answers* survive in the outbox, but the experience reads as a crash).

**Fix:**
1. `BackHandler(enabled = state.inReview)`: map back to `endSessionEarly()` (show the summary — same semantics as the web's "End session", where work already banked is kept).
2. `BackHandler(enabled = state.moreOpen)`: close the sheet.
3. `BackHandler(enabled = state.profileHandle != null)`: close the profile overlay.
4. Opt into Android 13+ predictive back in the manifest so the gesture animates instead of popping.

**Acceptance:** back during review opens the summary (never exits the app); back closes sheet/profile overlays; back on Today does nothing harmful.

### P0-5. iOS: free-response answers appear to be single-line [verify-first]

**Experience.** The web's flashcard answer is a `textarea` ("Key ideas count, not wording"); Android explicitly sets `singleLine = card.kind == "cloze"` so flashcards get a multi-line field. The iOS `Field` used in `SessionView.answerBlock` appears single-line for all kinds (`submitLabel: .done`), meaning a flashcard prose answer cannot wrap or contain newlines on iPhone.

**Fix:** confirm in `Common.swift`; if single-line, give `Field` a multiline mode (TextEditor styled to the input treatment, or `TextField(axis: .vertical)` with lineLimit 3…8) used for `kind != "cloze"`, with the same Enter-to-check convention as the web (return key inserts a line break; the Check button submits — mirror the web's Shift+Enter contract in copy).

**Acceptance:** a flashcard answer of three lines is possible on iOS; grading unchanged.

---

## 6. P1 — High: core-loop friction and cross-surface breaks

### P1-1. The reduce-motion preference does nothing on both phones

**Experience [verified].** Settings → Preferences offers "Reduce motion" on both platforms and persists it (`Prefs.reducedMotion`) — and nothing in either UI reads it (zero consumption matches). The web honours it twice over (`MotionConfig reducedMotion="user"` + CSS blanket). A learner who asks for calm keeps getting springs.

**Why it matters.** A toggle that visibly does nothing is a lie the learner can verify in two taps — worse than the missing feature. It is also an accessibility obligation (WCAG 2.3.3 / vestibular disorders), and the phones *have more motion* than the web (entrances, pop, press scale).

**Fix:** add a motion gate per platform and route every motion helper through it:
- Android: in `Design.kt`/`Theme.kt`, expose `LocalReducedMotion` (seeded from `state.me?.prefs?.reducedMotion`, with the system's `Settings.Global.TRANSITION_ANIMATION_SCALE == 0` as a default-on signal). Make `entrance()`, `pop()`, `pressScale`, the meter spring and the nav-indicator animation resolve to instant/`snap()` when set. Keep layout changes; kill the travel.
- iOS: in `Design.swift`, read the pref into the environment (alongside `@Environment(\.accessibilityReduceMotion)` — honour *either*), and gate `entrance()`, `pop()`, `PressScaleStyle`, `Meter` and the indicator animation.
- Preserve the confetti gate too once P1-2 lands (reduced motion ⇒ no confetti, as the web does).

**Acceptance:** toggling the setting changes screen-to-screen behaviour within the same session on both phones; system-level reduce-motion is honoured when no account pref exists.

### P1-2. The reward moment is missing on phones: Confetti exists but is never fired

**Experience [verified].** `Confetti` is fully implemented in both native design systems (`mobile/android/.../Design.kt` `Confetti(trigger: Int, …)`; `mobile/ios/Sources/Revisio/Design.swift` `struct Confetti`) — and has **zero call sites**. The web fires it on every correct answer (small, off-centre) and on promotion (full burst). The phones, the surfaces most used for the daily loop, celebrate nothing.

**Why it matters.** This is the Duolingo half of the design language — the one moment the whole gamified loop is built around. Its absence makes correct answers feel identical to wrong ones on a phone (both just show a panel). This is also the cheapest high-impact fix in this document: the component already exists.

**Fix:**
- Android: add `confettiTrigger` to `UiState`; bump it in the same places the web does — `submit()` when `verdict.correct` (small burst: the web uses ~46 particles, origin y≈0.46) and on `change?.promoted` at session end (full burst ~140). Render `<Confetti(trigger = state.confettiTrigger)>` inside `SessionScreen`'s root Box. Gate on reduced motion (P1-1).
- iOS: add `@Published var confettiTrigger = 0` to `AppModel`; increment on the same two events; overlay `Confetti(trigger:)` in `SessionView`/`SummaryView`.
- Copy-conformance is unaffected; the smoke test may need its verdict assertions updated if the overlay changes the accessibility dump.

**Acceptance:** correct answer → one small burst; promotion → full burst; reduced motion → none; both engines' tests still green.

### P1-3. Android lobby shows only 12 of 30 seats — a learner can be invisible in their own lobby

**Experience [verified].** `mobile/android/.../RankScreen.kt` `LobbyTable` renders `lobby.rows.take(12)`. The web renders all thirty, highlights you, and centres the ladder on your rank. On a phone, if you sit 13th–30th you cannot see your own seat, your position number, or the demotion band relative to you — the screen's entire question ("am I safe this week?") is unanswerable.

**Fix:** paginate rather than truncate: show seats 1–12, a "Show all 30 seats" expansion (or a `LazyColumn` section that scrolls the full table), and **always** render your own row even when out of the visible window (a "···" gap row + your row, like games do). The promotion/demotion `ConfidenceBand` stays.

**Acceptance:** a seat-25 learner sees their row and its position on Android without expanding; expansion shows all 30; iOS lobby verified to show all seats (or fix identically).

### P1-4. Web Settings: the 2FA chip is a self-link (fake affordance)

**Experience [verified].** `src/app/(app)/settings/page.tsx` Security section: `<Link href={me.totpEnabled ? '/settings' : '/settings'}>` — both branches are `/settings`. The chip announces "2FA on/off" and does nothing. Given P0-1, there is currently *no* way to enrol in 2FA from the UI at all (the API exists: `src/app/api/v1/auth/2fa/route.ts` supports start/confirm/disable and returns recovery codes).

**Fix:**
1. Build the enrolment flow on the Settings Security section: **Start setup** → `POST /api/v1/auth/2fa` (GET semantics: returns secret + otpauth URI) → render the URI as a QR (the `qrcode` dependency is already installed) + the secret in copyable text → **Confirm** with a code → show the returned recovery codes once, with "store these" copy and a copy-all button → enabled state.
2. Disable flow requires a code (`DELETE /api/v1/auth/2fa`).
3. Point the chip at this section (anchor + focus management), not at itself.
4. Mobile parity: the phones' Settings "2FA on/off" row should become honest copy until ported: e.g. "Two-factor is on. Manage it on the web." (tapping opens the deployment URL in a browser) — a stated path beats a dead chip.

**Acceptance:** a learner can enrol, save recovery codes, disable with a code; the chip always leads somewhere real.

### P1-5. Web: no branded failure states (`error.tsx` / `not-found.tsx`)

**Experience [verified — no `error.tsx`, `global-error.tsx`, or `not-found.tsx` anywhere under `src/app/`].** Any RSC/segment throw shows Next's default unstyled error overlay in production (white page, generic copy); any bad URL shows the framework 404. Both are off-brand in a product this precisely designed, and both dead-end the user (no "back to Today", no sign-in escape).

**Fix:**
1. `src/app/error.tsx` (client): the `Notice tone="bad"` treatment in a card, one retry button (`reset()`), one "Back to Today" link; copy in the app's voice ("Something on our side went wrong. Your work is safe — nothing was lost.").
2. `src/app/not-found.tsx`: same card, "That page does not exist", primary → `/dashboard`, secondary → `/learn`.
3. `src/app/global-error.tsx`: minimal but on-palette (it renders outside the shell).
4. Keep it server-render-safe and shadcn-free (these fire outside normal providers).

**Acceptance:** throwing in a route renders the branded card with working retry; an unknown URL renders the branded 404; both usable signed-out.

### P1-6. Phones have no haptic feedback in a design language built on tactility

**Experience [verified — zero matches for haptic APIs on both platforms].** The design system's central claim is *physicality* (the compressed lip, press-scale) — but the one channel that makes a phone feel physical is silent. Correct/incorrect, the in-session Check, promotion, and tab switches all land with no haptic.

**Fix (small, high-yield):**
- Android: `LocalHapticFeedback` — `HapticFeedbackType.LongPress`-grade confirm on correct and on promotion, light tick on Check press and on tab switch. Wire via the existing `pressScale`/`PillButton` so it is one owner.
- iOS: `UIImpactFeedbackGenerator(.light)` on Check/tab; `UINotificationFeedbackGenerator(.success/.error)` on verdict — fired once per verdict, not per render (guard in the model where the verdict is applied).
- Respect reduced motion *and* system haptics-off defaults; do not haptic on every keystroke.

**Acceptance:** a correct answer buzzes once; wrong buzzes differently; settings-off or system-off silences everything.

### P1-7. New-learner onboarding sends learners to the authoring tool

**Experience [verified].** Dashboard, no subjects: "Pick a subject and your queue fills itself. **Add one**" → `/library` ("My content" — compose/import/generate). A student who has never authored anything lands in a tabbed CMS. The correct first door for a learner is **Learn** (`/learn`), where subjects can be *followed* (`enroll`) and topics met; authoring is for teachers and the few students who create content.

**Why it matters.** First-run users with no subjects have an empty queue — the product's most dangerous state is "nothing to do", and this CTA leads them into the one place that won't fill it.

**Fix:**
1. Dashboard empty-subjects copy → "Follow a subject and your queue fills itself." → `/learn`.
2. Review empty state and TodayScreen empty copy (both platforms) — audit each "Add one"/"Manage" for audience: learners → Learn; authors → Library. Android TodayScreen already says "create your own in My content on the web" in LearnScreen's empty state — that one is fine.
3. Consider a first-run nudge from the companion (the state machine in `lib/profile.ts` already has an ordered policy; add a "no subjects at all" branch above "never reviewed": *welcome → follow a subject*).

**Acceptance:** a fresh student account reaches a followed subject in two taps from the dashboard; no CTA points learners at authoring.

### P1-8. Note density has three owners and the phones disagree with the web about "open by default"

**Experience [verified]:**
- Web `ReviewClient`: `notesOpen` starts `false` (collapsed) — while its own comment claims "open by default on the very first card".
- Android `RevisioViewModel`: `notesOpen: Boolean = true`; iOS `AppModel`: `notesOpen = true`.
- Density is stored in **three** places: server `prefs.noteDensity` (Settings; what phones read), `localStorage.revisio.noteDensity` (learn topic page), and cram's ephemeral local state (default `summary`, unpersisted).

**Why it matters.** The same learner experiences three different products: notes burst open on phones, hide on web; the density they chose in Settings doesn't follow them on web Learn; cram ignores both.

**Fix:**
1. Make server `prefs.noteDensity` the single owner on web: Learn topic page and Cram read it (and write through on toggle) instead of localStorage; keep localStorage as cache, not source. The learn screen's detailed/summary toggle should call the same `PATCH /me` prefs helper Settings uses.
2. Align the notes-open default (recommend: collapsed on all surfaces with a pulsing "Read first" affordance, or open on all — but pick one; the web's comment says open, the code says closed).
3. Persist cram's density through the same pref.

**Acceptance:** changing density in Settings is visible on Learn, Cram, and both phones without re-choosing; notes-open behaviour identical across surfaces.

### P1-9. Android's session screen has two exits with different, unlabeled behaviour

**Experience [verified].** `SessionScreen.kt` renders **both** an "End session" pill (top, `endSessionEarly()` → shows the summary) and a "Leave session" ghost button (bottom, `endReview()` → tears down with **no summary**). Nothing tells the learner these do different things; the labels are synonyms.

**Fix:** keep exactly one exit in the session body — "End session" (summary path, matching web/iOS semantics). Delete the bottom "Leave session" ghost. If a hard-abandon is needed at all it belongs behind the summary ("Discard summary"), not beside the question.

**Acceptance:** one exit control per session screen; both phones and web share the "ended → summary → Done" contract; `verify:native` updated to the new flow.

### P1-10. PWA manifest contradicts the design system

**Experience [verified].** `public/manifest.webmanifest`: `theme_color: #1c64f2` (a blue — the exact colour the design system purged), `background_color: #fafaf9` (warm off-canvas vs the system's pure `#ffffff`/`#000000`), and icons pointing only at an SVG. An installed PWA shows a foreign blue in the title bar and splash.

**Fix:** set `theme_color` from the same source as the viewport theme colors (`#ffffff` light / `#000000` dark — manifest only takes one, so pick canvas white or ship per-OS overrides), `background_color: #ffffff`, and add a real PNG icon set (192/512, maskable) generated from `public/icon.svg` (the iOS generator `make-ios-icon.mjs` already exists as a model). Also bump the service-worker cache version in the same pass if any shell asset changes (see `docs/UI-SYSTEM.md` history: stale shells were a real incident).

**Acceptance:** installed PWA chrome is canvas/ink; Lighthouse installability passes with maskable icons.

### P1-11. Keyboard users have no skip link on web

**Experience [verified — no skip link anywhere].** The desktop sidebar contains 11+ links before main content; every page load re-traps keyboard users in the nav.

**Fix:** one visually-hidden "Skip to content" link as the first focusable element in `AppShell`, targeting `<main id="main">` (`scroll-padding-top` already exists in globals). Same pattern in `AuthShell`/landing if they have their own nav.

**Acceptance:** first Tab on any page offers skip; activation moves focus (not just scroll) to main.

---

## 7. P2 — Medium: scale, polish and correctness-of-promise

### P2-1. No search or filter anywhere in the catalogue
**Experience.** Learn (web + phones) is an unfiltered accordion/list of every subject and topic. At 30+ topics a learner scrolls; at 100 they give up. Cram/Exam topic pickers have the same shape.
**Fix.** Add a single search field to Learn (subject name + topic name, client-side filter — the payloads are small) on all three surfaces; chips get a "clear filters" affordance. Native: same field in `LearnScreen`/`LearnView` above the subject list. Defer server-side search until content scale demands it.
**Acceptance:** typing "enzym" narrows to matching topics on all surfaces.

### P2-2. Cram is marketed as "time-boxed" and has no timer
**Experience [verified — zero timer code; the only "time" match is marketing copy].** README and route hints promise time-boxed practice; the session is untimed and unbounded.
**Fix (pick one honestly):** either (a) build it — an optional per-session timer in the Cram picker (off/5/10/20 min), a thin progress rail in the session header, and a gentle "time's up → summary" that keeps banked answers (same contract as End session); or (b) change the promise to "a bounded pile of questions" and fix the README/hints. Given the exam-prep audience, (a) is the better product and is a contained client-side change (nothing server-side; scheduling untouched).
**Acceptance:** a timed cram ends itself into the summary at zero with nothing lost.

### P2-3. No reminders — the biggest retention lever, absent
**Experience.** A streak-and-queue product with zero outbound nudges: no push (phones), no email digest, no "queue's waiting" touch. All retention rides on the learner remembering.
**Fix (phased):** (1) Web PWA: a daily local notification at a learner-chosen time when due > 0 (client-side, permission asked once from Settings' Preferences section — "Daily reminder"); (2) Email fallback via the existing Resend plumbing (weekly summary + streak-at-risk, opt-in in Preferences); (3) Native push later (requires APNs/FCM infrastructure — flag as its own project). Every variant must honour the privacy posture: no content in the notification, just counts.
**Acceptance:** a reminder setting exists in Preferences on all surfaces; a learner with it enabled is touched the moment their queue is ready.

### P2-4. Colour-contrast failures in the game palette (keep the palette, fix the pairs)
**Experience [verified in `globals.css`]:** `.badge-streak` is white text on `#ff9600` (≈2.2:1 — fails 4.5:1 at its 12px size); `text-streak` on white (streak flame icons, stat tint) is ≈2.2:1 against a 3:1 non-text requirement; the green CTA (`btn-good`, white on `#58cc02`) is ≈2.0:1. This is the classic Duolingo tension: the hues are right, the pairs are not.
**Fix (within the one-accents rule):** (1) badge-streak → dark ink text on the fox orange (the gold badge already does black-on-`#ffc800` — precedent inside the system); (2) icons/stats that *carry meaning* alone (streak flame on white) get a darker streak-pressed tone for text/icon contexts — add `--streak-pressed` alongside the existing `--good-pressed` pattern rather than changing the hue; (3) the CTA: darken the fill in *text-bearing* states (e.g. a `--good-strong` ≈ `#43a302` used for button fills and verdict text-on-soft, keeping `#58cc02` for meters/fills), or use ink text on green — decide once in globals and every surface inherits. Then re-run the native theme generator so the phones follow (they currently inherit the failing pairs via `Theme.kt/.swift`).
**Acceptance:** badge/streak/icon pairs ≥3:1; CTA text ≥4.5:1 (or a documented, deliberate exception recorded in `docs/UI-SYSTEM.md`); native themes regenerated.

### P2-5. Touch targets below 44px on mobile web
**Experience.** `.chip` is `min-height: 30px` and it is the primary control on Cram/Exam/Practice pickers (topic selection!) — thumb-magnet rows of 30px pills invite mistaps. `.btn-ghost` is 40px. WCAG 2.5.8 (24px) is met; Apple/Android guidance (44/48) is not, on the exact controls learners hammer.
**Fix:** on `< sm` viewports raise chips to `min-height: 40px` (44 preferred) via a media query in globals — desktop chips stay 30px; audit `Toggle` (36px in Learn/Topic rows, Android) and `IconPill` sizes similarly. Keep the 64px tab bar and 52px sheet rows (already good).
**Acceptance:** every tap target on a 390px viewport measures ≥44×44 (chips included).

### P2-6. Selection state isn't semantic on review/cram MCQs
**Experience [verified].** Exam-page options carry `aria-pressed`; Review and Cram option buttons mark selection with a class only (`option-selected`), so screen readers never hear which option is chosen; the Android/iOS option rows need the same audit (`OptionRow`/`OptionState` — verify they expose `selected`).
**Fix:** add `aria-pressed={selected}` to review/cram option buttons; native: ensure `semantics { selected(true) }` / `.accessibilityAddTraits(.isSelected)` on the chosen row. Verdict already announces via `aria-live` (web) — keep.
**Acceptance:** VoiceOver/TalkBack announces "selected" on the chosen option on all surfaces.

### P2-7. Android auth: password field's IME action is "Next" and does nothing
**Experience [verified].** `AuthScreen` uses `Field` defaults (`ImeAction.Next`) for both fields; pressing the action on the password field moves focus nowhere and doesn't submit.
**Fix:** password field gets `imeAction = ImeAction.Done` with `KeyboardActions { onDone { onSignIn(...) } }` (and the same on iOS — `submitLabel: .go` is already right there; ensure it triggers submit).

### P2-8. Android cold start / first sign-in shows a bare spinner
**Experience [verified].** `Loading()` is a naked `CircularProgressIndicator` on canvas. The web has skeleton pages shaped like the destination; the phones' loading has no shape and no words.
**Fix:** give the phones a minimal brand loading state: the wordmark + "Loading your queue…" caption (or skeleton `SurfaceCard`s), used for `state.loading` and first sign-in. Cheap, and it removes the "is it frozen?" moment on slow networks.

### P2-9. Transcript export is web-only
**Experience [documented known gap].** `/progress` offers CSV/JSON; the phones offer nothing.
**Fix:** engine: add `exportTranscript(token, format) -> bytes` hitting `/api/v1/exports`. Android: download to MediaStore/Downloads + share intent; iOS: fetch into a temp file + `ShareLink`/`UIActivityViewController`. Surface: a "Export transcript" row in Rank below achievements (both platforms).
**Acceptance:** the CSV arrives in the share sheet on both phones.

### P2-10. Teacher page mixes interaction systems
**Experience [verified].** `/teacher` uses `sonner` toasts for copy-code feedback and `window.confirm` for destructive actions — while the app's own law (and the phones' Settings design note) is *inline Notice, never a toast*, and confirmations should be on-system.
**Fix:** replace toasts with the `Notice` pattern (or a `chip` state on the code itself: "Copied"); replace `window.confirm` with a small styled confirm (the existing shadcn `AlertDialog` or a Sheet) carrying the same consequence copy ("Its 12 students lose the class; their questions and XP are untouched."). Admin page likely shares the `window.confirm` pattern — sweep both staff consoles.
**Acceptance:** no toast and no native dialog remains in teacher/admin; destructive actions state consequences in-app.

### P2-11. Native More sheet: no drag-to-dismiss, no edge-swipe back (iOS)
**Experience [verified].** The web's AccountSheet owns scrim/Escape/scroll-lock/drag; the native MoreSheets are tap-scrim or close-button only (iOS animates in with a fixed 600pt offset; Android an `Animatable`). SwiftUI without NavigationStack also means no system swipe-back anywhere.
**Fix:** (1) add drag-to-dismiss to both sheets (drag gesture on the grabber/header translating the sheet, dismiss past a threshold — the web spring already specifies the feel); (2) medium-term, adopt `NavigationStack` on iOS for Learn/Settings depth (subject → topic → notes currently mutate flat state) so the system back gesture and large-title behaviour come for free. That's a structural change — schedule it, don't hack it.

### P2-12. Today's "Start review" can be silently disabled with no reason (Android)
**Experience [verified].** `TodayScreen`: `enabled = home.packCards > 0`. If the pack hasn't downloaded (fresh install, flaky network) the primary button is grey with no explanation — the exact "page that never resolves" failure the app elsewhere refuses to be.
**Fix:** when `due > 0 && packCards == 0`, keep the button enabled and make the tap fetch the pack ("Downloading today's session…" while busy) with the existing message as the failure path; or show a status line where the disabled state is ("Today's session hasn't downloaded yet — tap to retry").

---

## 8. P3 — Low / parity notes (batch these)

1. **`MOBILE.md` is stale [verified].** It still lists exam, practice, library, teaching and admin as "web-only", but `ExamScreen/PracticeScreen/LibraryScreen/TeachingScreen/AdminScreen` (and both `*View.swift`) all exist and are routed. Update the doc's coverage table and "Remaining work" so the next agent doesn't re-plan shipped work. Same doc still says "You" instead of "Settings" in one table row.
2. **Web Learn empty-state deep-link `/learn?topic=` [verify-first].** First-exposure's empty state links `/learn?topic=…` ("Read the notes"); confirm the Learn index actually consumes `?topic` (CramClient does). If not, either consume it (auto-open that topic's subject) or link to `/learn/<subjectId>/…` directly.
3. **Session time estimates use `due`, not the pack (Android).** `ReviewScreen`'s "About 4 minutes" derives from `due`; the session deals `pack` cards (capped at 20). When due > pack the estimate over-promises. Derive from the pack size when offline/fromCache.
4. **Theme toggle parity.** Web has a manual toggle; phones are system-only. Acceptable, but a "Follow system / Light / Dark" segmented control in Preferences (both phones) is a cheap parity win; it must respect the generated token system (light/dark token sets already exist in `Theme.kt/.swift`).
5. **`enterKeyHint` honesty.** The cloze input says `enterKeyHint="done"` while the hint text promises "Enter to check"; "check" isn't a valid hint value — `go` or `done` is fine, but align the visible hint copy ("Done to check" / "✓ to check") so the keyboard's button label matches the promise.
6. **Web ReviewClient auto-advance nuance.** A correct typed cloze submits *and* advances on one Enter; a correct MCQ requires Check then Continue. Deliberate or not, it's inconsistent; consider one-Enter-advance for correct MCQ too (select → Enter checks; Enter again advances is already the pattern — keep, but the button label could say "Enter to continue" as the cloze path does).
7. **Dashboard subjects row truncation (Android).** `subjects.take(3)` with no "+N more" indicator; the web wraps. Add `+N` chip when >3.
8. **Lobby count line.** Android shows "12 of 30 seats taken" *while showing 12 rows* — after P1-3 the count must reflect the real table.
9. **Accessibility spot-audit for native icon-only controls [verify-first].** `IconPill` (close buttons), the crest (`RankCrest` — web has `role="img"` + `aria-label`; the natives likely need `contentDescription`/`.accessibilityLabel("Rank Silver II")`), and the due badge ("12 cards due"). Sweep with TalkBack/VoiceOver once; it's an hour of work.
10. **`NumberTicker` and assistive tech.** The Android smoke notes tickers read as 0 mid-spring; ensure the final value is what AT sees (render value immediately for AT, animate only visually — the web's component already handles reduced motion; add an AT path on both platforms).
11. **Landing page thinness for conversion.** The page is beautifully strict but has no social proof, no "who is it for" (students vs teachers), no FAQ, and the only CTA repetition is the footer. For an alpha this is fine; before any public push add: one testimonial or usage line, a "For teachers" secondary CTA (there is a teacher surface to sell), and a 3-item FAQ (price? — free in alpha; data? — exportable; boards? — named boards supported). Keep it to one band.
12. **Session "Load more" vs phones' "Done" (post-summary).** Web summary offers Load more + See the ladder; phones offer only Done. Add "Load more" (restart with the next batch) to `SummaryScreen`/`SummaryView` for parity.
13. **Delete-account absence.** No self-service account deletion on any surface (admin "suspend" is not deletion). For a school-deployable product this will be asked for; at minimum an "Delete my account" flow in Settings → Account with typed confirmation, server-side cascade respecting review-log append-only rules (anonymise, don't delete, per the append-only law).

---

## 9. Cross-cutting recommendations

1. **A "state colour for text" token pair.** §P2-4's root cause is that the game tokens were specified as *fills* and are being used as *text*. Add `--good-strong` / `--streak-pressed` (dark enough for 4.5:1 on light, 3:1 on dark) in `globals.css`, regenerate native themes, and adopt them wherever a game colour carries text or an icon on a light ground. One decision in one file fixes every surface.
2. **A touch-target token.** Add `--touch-min: 44px` to the token layer; chips, IconPill, Toggle consume it on `<sm`. The phones already meet it — keep them as the reference.
3. **A reward-moment spec.** One paragraph in `docs/DESIGN-DUOLINGO.md` stating the three celebrations (correct = small burst + success haptic; promotion = full burst + crest pop + haptic; achievement unlock = gold flourish) and their reduced-motion/haptic gates — then implement once per surface. P1-2/P1-6 should land *together*, governed by this spec.
4. **Parity checklist as CI.** The copy/grading vectors exist; add a `docs/PARITY.md` table (feature × surface) maintained by PR template checkbox, seeded from this audit's findings — the drift caught in P3-1/P1-8 is otherwise recurring.

---

## 10. Suggested build order

**Milestone 1 — Unlock (P0).** 2FA sign-in on phones → password reset → Android insets → Android back → iOS multiline. These are independence-blocking; nothing else matters while they stand.

**Milestone 2 — The loop feels the same everywhere (P1).** Reduced motion → confetti + haptics (the reward spec) → single exit on Android → lobby visibility → 2FA enrolment on web → error/404 pages → onboarding CTA fix → PWA manifest → skip link.

**Milestone 3 — Scale and promise (P2).** Search → cram timer → reminders (PWA first) → contrast/token work → touch targets → MCQ semantics → transcript export → teacher/admin interaction cleanup → drag-dismiss sheets.

**Milestone 4 — Batch (P3).** In one sweep: docs refresh, copy tweaks, a11y labels, small parity items.

Each milestone ends with the full verification suite from §3 rule 5 — `typecheck`, `lint`, `build`, both engine test suites, `native:ios:build`, and `verify:native` — plus a manual pass of the daily loop (open → start review → answer cloze/flashcard/MCQ → verdict → summary) on web, emulator and simulator.

---

## 11. Do not change (invariants)

- **The offline contract** (pack + outbox + preview-verdict + server re-grade) and the "refused refresh ends the session with a reason" behaviour.
- **Server-side grading/XP/scheduling** — clients preview, never decide.
- **The generated-file pipeline** and the one-owner-per-fact module map (§3).
- **The colour law** (chrome monochrome, state coloured, green = in-session only) — extend it via new tokens (§9), never by adding hues.
- **The nav model** (4 + More; `routes.ts`/`Destination` as single owners).
- **Copy conformance** — web copy changes flow through `vectors:copy` into both phones' tests.
- **Append-only reviews** — even the delete-account feature (P3-13) must anonymise, not erase.

---

*End of handoff. Start at Milestone 1; the daily loop is the product — keep it the fastest path on every surface.*
