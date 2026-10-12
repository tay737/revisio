# Website & PWA UX Audit — 2026-10-10

**Audience:** frontend developer taking the next implementation pass.  
**Scope:** Revisio public website and PWA, public/auth/legal routes, shared consent and accessibility surfaces, plus source-level signed-in journey review.  
**Evidence:** local optimized build + Chromium browser exercise, axe-core spot scan, source review, and existing PWA contract tests. Findings are tagged **[browser]**, **[source]**, or **[prior live]**; historical reports are not represented as current observations.  
**Standards:** WCAG 2.2 AA, WAI-ARIA APG, Vercel Web Interface Guidelines (retrieved 2026-10-10). This is an engineering audit, not certification, legal advice, or a moderated user study.

## Executive summary

The site has a distinctive, coherent visual language and several strong user-centred foundations: the landing route now has one stable `h1`; reduced-motion policy combines OS and account preferences; an install/update surface exists; consent choices work anonymously and persist partial/reject-all decisions; legal and accessibility pages are present; mobile chips are designed around 44px targets; focus styling, skip links, offline fallback and static-only PWA caching have good implementation/test coverage.

The current checkout **typechecks and production-builds**. The main release concerns are not the stale parser failures from the Oct 9 report, but fresh browser evidence: an anonymous storage-disabled consent decision does not leave a working recovery route; a running UX suite records `__name is not defined` as a page error in one context; and a settled landing-page axe scan finds multiple serious WCAG contrast failures. A stale-in-progress test also prevented the full public route/axe/PWA sweep from completing, so report results are deliberately bounded.

The signed-in experience was not authenticated in-browser: existing suites provision/reset a database-backed probe account. Recommendations for those paths below are explicitly source-level, not claims that a live account journey was clicked. The PWA service-worker contract passes, but install/update behaviour and installed mode still need browser/device proof. The primary production alias was attempted read-only; its consent surface did not appear, so it could not serve as a valid current-source substitute.

## Verification performed

- `npm run typecheck` — **passed** (`tsc --noEmit`).
- `npm run build` — **passed**; current route table includes `/accessibility`, `/privacy`, `/terms`, `/cookie-policy`, `/forgot-password`, `/reset-password`, and `/api/v1/consent`. Build logs include Next dynamic-server-usage diagnostics for request-dependent API routes during static analysis; these did not fail the build.
- `npm run verify:pwa` — **passed**: static-only asset cache, API/RSC/dynamic HTML exclusion, offline-navigation page, old Revisio cache cleanup, and explicit worker activation message contract.
- Local optimized app served at `http://127.0.0.1:3122`, isolated to the built app; no DB mutation suite was invoked.
- `npm run e2e:public-ux` (local): tested first-Tab skip link/focus, anonymous purpose toggle, reject-all timestamp and essential-on invariant, reload dismissal, partial decision across navigation, and preservation of analytics choice. These eight assertions were reached; suite then failed at storage-disabled recovery and stopped before route/axe/mobile/PWA loops. Report: `artifacts/e2e-public-ux/report.json` (ignored run artifact; not a green report).
- Failure detail: with `localStorage` reads/writes throwing `SecurityError`, the public suite's body-text assertion did not see the updated write error after selecting Reject all; the suite stops before clicking “Continue for now”. An isolated Chromium run observed both the initial read-error alert and the write-error alert. A separate direct browser check clicked Continue and confirmed it dismisses the consent region for the current session. The remaining issue is competing alert/error clarity and the suite's assertion target, not a proven dead-end. Anonymous context made no API requests or writes.
- The same report recorded `__name is not defined` once in `pageErrors`; a separate minimal clean-browser landing load did **not** reproduce it. Treat as an intermittent/chunk/context issue requiring isolation, not as a consistently reproduced root cause.
- Local axe spot scan of the landing page after its initial render found **serious `color-contrast`** violations. Sample evidence: `.badge-quiet` 4.02:1 (expected 4.5:1); `.btn-good` 3.85:1 in the rendered state; 11px tier label on black 4.17:1; 15px muted feature copy on soft gray 4.38:1. Scan output came from the current local build with consent visible. Re-run with the public suite after fixes across full/settled animation, light/dark, and consent visible/dismissed. It is a set of source-pair defects, not merely the transient contrast issue described in the Oct 9 report.
- Production `E2E_BASE_URL=https://revisio-srs.vercel.app npm run e2e:public-ux` was attempted read-only; it timed out waiting for the named consent region before recording route checks. No production writes were made. Do not infer current deployment health from the failed scan.
- No `e2e:smoke` or `e2e:a11y` run: both touch a DB-backed probe account; no isolated staging approval/credentials were supplied. No real iOS/Android installed-mode, VoiceOver/TalkBack, 200% zoom, high-contrast, or assistive-tech test was done.

## Preserve — working UX foundations

- `src/app/layout.tsx`: `lang="en"`, zoom remains enabled (`maximumScale: 5`), safe-area viewport, theme colors and app metadata.
- `src/app/page.tsx`, `src/components/AuthShell.tsx`, `src/components/AppShell.tsx`: skip links land on focusable main regions. The local public browser assertions confirmed first Tab reaches the link and activation focuses `main#main`.
- Landing content uses one stable `h1`; `src/components/ui/word-rotate.tsx` currently renders the first supplied copy rather than rotating. Do not reintroduce autoplay or duplicate headings while simplifying it.
- `src/components/ui/motion/motion-provider.tsx` combines OS reduce-motion with account preference; Settings updates the shared policy. Still verify all custom CSS/Motion surfaces and same-session transitions.
- `src/components/PwaRegister.tsx` now captures install prompt, presents iOS instructions, detects waiting updates and defers update action on `/review`; `public/sw.js` only activates on explicit message. Preserve these behaviours, but test the full lifecycle (see P1-4).
- Consent panel's ordinary anonymous flows passed targeted local browser checks: individual toggle; explicit reject decision timestamp; essentials stay on; decision survives reload; partial choice persists across navigation. Account-sync and unavailable-storage edge conditions are not green.
- `public/sw.js`, `public/offline.html`, and `scripts/verify-pwa.mjs`: good static-only cache/privacy boundary and offline fallback. Do not cache private HTML/RSC/API or change review outbox semantics.
- `src/app/accessibility/page.tsx` exists and accurately avoids claiming conformance; landing footer and policy links include legal/accessibility routes. Prior Oct 9 claims that these routes were missing are stale.
- `src/app/(app)/learn/*` catalogue/topic search exists. Do not duplicate it. Review/Cram MCQ options already expose `aria-pressed`; no stale recommendation to add this again.
- Touch-oriented globals use 44px chips on small viewports, 44px primary/ghost buttons, visible focus, and CSS reduced-motion fallback.

## Prioritized developer handoff

### P0 — Fix measured contrast pairs (WCAG 1.4.3 / 1.4.11)

**Evidence:** local settled axe scan reports serious `color-contrast` nodes; examples and measured ratios are in Verification. WCAG AA normal text needs 4.5:1; large text 3:1; meaningful UI graphics/boundaries need 3:1. Tiny 11–12px badges and labels are normal text, not large text.

**User impact:** low-vision, older, glare-affected and dark-environment users may not distinguish helper copy, buttons, or tier state. The in-session action and consent overlay are high-frequency/decision controls.

**Likely owners:** `src/app/globals.css` semantic pairs (`--muted-foreground`, `.badge-quiet`, `.btn-good`, tier color tokens and `.band` scope); `src/app/page.tsx` feature/tier text contexts; `src/components/cookie-banner.tsx` if scan finds contextual overlays.

**Action:** use axe node evidence to trace each actual foreground/background pair. Darken text/icon variants or change the local surface; do not globally darken unrelated fills or break the one-accent/state-token rules. Avoid opacity-composed muted text over secondary surfaces. Keep theme-specific tokens scoped to light, dark, and `.band` grounds. Add focused contrast tests or a token-pair verification script if existing design tokens own the pairs.

**Acceptance:** zero serious/critical contrast findings across local public/auth/legal pages and consent-visible state, in light and dark, with entrance motion both active and settled; manually confirm token pairs at actual rendered font size/weight. Record any axe incomplete nodes for human judgment.

### P1 — Make consent usable when browser storage is unavailable

**Evidence:** local public suite passes ordinary anonymous and persistence flows, but fails at the storage-denied branch (`scripts/e2e/public-ux.ts`, `src/components/cookie-banner.tsx`). UI warns storage was blocked and offers “Continue for now”; a manual isolated reproduction saw both the initial read-failure alert and the later write-failure alert at once, while the suite's body-text assertion did not observe the expected update. A separate direct Chromium check confirmed the Continue button dismisses for this session. Fix the competing alert lifecycle and make the suite assert the live region that actually changes.

**User impact:** privacy-restrictive browsers, private mode, webviews or managed school devices may see competing error announcements and may not understand that the saved decision could not persist. The app must neither imply persistence nor block all content when storage is restricted.

**Action:** reproduce in headed Chromium; inspect accessibility tree and focus after rejecting. Clear or update the initial read-failure alert when the write-failure alert replaces it; provide one stable live region and a reliably reachable, visible native `Continue for now` button. Prove pressing it dismisses only for the current session and tells the truth that persistence failed. Do not silently convert failed writes into a durable rejection or assume analytics was stored off. Check all actions at 320×720 and keyboard focus visibility.

**Acceptance:** with get/set/remove blocked, visitor can inspect choices, accept/reject for current page, proceed without a dead-end, and understand the choice is not saved; no API writes for anonymous context; reload may ask again and must not claim otherwise. Axe and keyboard test the exact failure state.

### P1 — Isolate and remove the intermittent browser runtime error

**Evidence:** the first complete local public-suite attempt recorded `__name is not defined` from a page error; a minimal clean Chromium load did not reproduce it. Public suite correctly treats any page exception as failure.

**Impact:** chunk/hydration runtime errors can leave portions interactive-looking but broken; inconsistency suggests race, stale artifact, or browser-only code path.

**Action:** capture full stack, route, build ID, timing, and failed request using a headed repeat and a cache/service-worker-cleared context. Compare production-built local vs dev only after reproducing. Do not weaken or whitelist the page-error listener to make the suite pass.

**Acceptance:** repeated runs in fresh contexts have no unhandled exceptions, console errors, or unexplained failed requests; any known third-party/browser noise is narrowly documented and not used to suppress application errors.

### P1 — Verify PWA install/update in real browser lifecycle and protect active work

**Evidence:** source has install prompt and waiting-worker UI; unit/VM test confirms explicit activation message, and update UI defers on the `/review` pathname. The public suite aborted before its manifest/service-worker checks. Source-only route detection cannot prove an active review is protected if a future nested/session route or user-generated work remains open.

**Action:** add deterministic browser coverage for `beforeinstallprompt` supported/unsupported, installed standalone state, iOS Safari instruction path (manual device), updatefound→waiting state, Later/dismiss, explicit update click, exactly-once reload, failed registration/retry visibility, and active review with pending outbox. Ensure updates cannot reload while a session is active; pathname-only review check should be sufficient only if `/review` is the exclusive active session surface and that assumption is documented/tested.

**Acceptance:** no unsolicited install prompt or permission; install affordance appears only when appropriate; iOS instructions are accurate; worker waits until user action; review is not interrupted; offline queued answers survive update; `npm run verify:pwa` remains green.

### P1 — Complete focused browser gate; keep production and database boundaries explicit

**Evidence:** existing `scripts/e2e/public-ux.ts` is credentialless and does no API writes, but currently bails before route, axe, responsive, and PWA passes. Primary production run also bailed waiting on consent region. Existing signed-in browser scripts write/reset only the dedicated probe account and require DB configuration.

**Action:** fix local storage-denied assertion and rerun the public suite to completion. Do not relax exception/HTTP finding rules. Make the report retain partial results and screenshots when it fails early; record browser/build id and scan stage. Only run signed-in `npm run e2e:a11y` / `npm run e2e:smoke` against isolated staging with a throwaway probe account and restore receipt. Do not use production without task-specific authorization.

**Acceptance:** public suite passes locally for all expected routes, language/headings/landmarks, no-overflow 320/390, light/dark axe, consent states, manifest/icons and service-worker lifecycle; each incomplete axe item is reviewed. Signed-in routes receive a separately labeled staging receipt.

### P1 — Review accuracy and access path for child/guardian consent before treating registration as complete

**Evidence [source]:** server registration route (`src/app/api/v1/auth/register/route.ts`) expects optional `dateOfBirth` and `ageConsent` and returns `age_consent_required` for a learner below 13 without guardian consent. Current `src/components/AuthForm.tsx` submit payload does not send those fields or visibly collect a date/guardian confirmation. Registration UX therefore appears unable to satisfy its own under-13 API requirement.

**User impact:** a family may be blocked with an unexplained API error, or the interface may suggest that a learner can register when the policy requires a guardian. This is a high-sensitivity data-protection decision, not a cosmetic form omission.

**Action:** ask product/legal owner to confirm jurisdiction/age threshold, parent vs learner account model, consent evidence, verification and withdrawal process. Then design explicit, accessible age/guardian steps and neutral errors that explain who must act. Avoid collecting DOB unless necessary; do not silently send `ageConsent: true`. Reconcile legal copy with actual behavior.

**Acceptance:** documented policy agrees with backend and form; eligible ages can register; underage users receive a clear guardian-led path; no silent or fabricated consent; tests cover threshold boundaries, leap-day/date handling and refusal.

### P2 — Make data deletion CTA truthful and navigable

**Evidence [source]:** Settings' “Delete my data” link points to `/privacy#deletion`, a policy paragraph rather than an interactive deletion request. A `DELETE /api/v1/data-deletion` API exists and requires `x-data-deletion-confirm: 1` after a confirmation response, but no user-facing confirmation/request flow is evident in Settings.

**User impact:** a learner who chooses deletion lands on explanatory policy text and cannot complete the advertised action. Privacy rights are hard to exercise, especially for a child/guardian.

**Action:** provide an authenticated confirmation flow in Settings with clear, reversible pre-confirmation summary, re-authentication/confirmation, consequences and support/guardian route as required; invoke the existing endpoint through the intended two-step protocol; handle expiry, errors, session revocation and success navigation. Coordinate deletion scope with counsel/data owner before coding irreversible retention semantics.

**Acceptance:** user can request and confirm deletion end-to-end; no accidental one-click destructive action; confirmation expires as documented; signed-out users cannot act as another account; all retained data and sync effects are explained accurately. This audit did not call the endpoint.

### P2 — Align privacy/cookie policy claims with actual implementation

**Evidence [source]:** Cookie policy says optional cookies/analytics are loaded only after consent and withdrawal applies “on your next request”; it describes “anonymous, aggregated” analytics. Current settings/banner persist purpose choices, but the current browser suite did not verify any optional analytics script/cookie gating. The consent categories include preferences/profile/school/research, which are not all necessarily cookies.

**Action:** inventory every cookie, local-storage key, third-party request, email purpose, analytics/research use, and account preference. Use a precise purposes table and distinguish account settings from cookies. Ensure consent is actually wired to each optional processing path; otherwise remove claims of enforcement and/or defer collection until implementation. Get qualified privacy review for legal basis and child provisions.

**Acceptance:** each optional processing path has one source of consent truth, withdraw takes effect promptly, no non-essential tracker fires pre-choice, policy accurately describes actual storage, and counsel signs off legal text.

### P2 — Improve auth form resilience and task feedback

**Evidence [source]:** auth form has labels/autocomplete and MFA staging; password-reset routes exist. The new MFA input has `inputMode="numeric"` and `maxLength=6`, but needs accessible associated errors/status and focus review after stage transition. Reset forms report errors, but exact keyboard/focus sequence was not tested.

**Action:** run signed-out keyboard/voiceover checks for login, registration role/subject controls, MFA, forgot/reset, resend verification, server errors and loading. After errors, associate message with the field (`aria-describedby`/`aria-invalid`) and focus first invalid control; after MFA appears, move focus deliberately without stealing focus on unrelated updates. Verify pasted one-time codes/autofill and that browser Back preserves sensible recovery context.

**Acceptance:** all forms complete using keyboard and password manager; errors are announced and actionable; submit/busy state is clear; no forced paste restriction; route headings and landmarks are valid.

### P3 — Feature opportunities after reliability and accessibility gates

These are discovery opportunities, not blockers; validate with learners before adding scope:

- **First-week guided setup:** after account creation, help learner follow one subject, explain the due queue and schedule a first review; avoid sending students to authoring tools unless they choose to create.
- **Reminder preferences:** a learner-controlled due-time reminder with opt-in, quiet hours/timezone and privacy-safe copy. Do not add notification permission to install flow; requires delivery/API design and child-safety review.
- **Progressive PWA education:** small contextual “install for offline study” explanation after a meaningful session has been cached, rather than a top-level nag.
- **Study recovery:** clear, non-blaming recovery when offline pack is absent, sync is pending, or queue is empty; preserve server grading and local outbox promises.
- **Data access center:** export, account deletion, consent management and contact route in one discoverable Settings section, with guardian pathways where required.

## Journey map: what the next frontend pass should exercise

1. **First visit:** landing claim → policies/accessibility → consent choice → registration/login. Test fresh, reject-all, partial consent, storage denied, 320/390, keyboard.
2. **Account recovery:** login → forgot password → request neutral result → email-token reset → return to account. Test invalid/expired tokens and focus/error announcement; no production email required for unit/browser stub.
3. **First study:** registration → choose/follow a subject → dashboard empty/due state → start review → answer/check/continue → early exit/summary → offline/reconnect. Signed-in tests only on isolated staging/probe account.
4. **Returning/install:** browser suggests install → user chooses → app opens standalone → cache offline pack → lose network mid-review → queue answer → reconnect/sync → update becomes available → finish session then explicitly update.
5. **Account/privacy:** change visibility → verify public view in separate signed-out context; change consent; request export/deletion; account recovery. Do not test as a real learner.

## Standards and acceptance references

- WCAG 2.2 AA: especially 1.4.3 Contrast (Minimum), 1.4.11 Non-text Contrast, 2.1.1 Keyboard, 2.4.3 Focus Order, 2.4.7 Focus Visible, 2.4.11 Focus Not Obscured (Minimum), 2.5.8 Target Size (Minimum), 3.3.1 Error Identification, 3.3.2 Labels or Instructions, 4.1.2 Name/Role/Value and 4.1.3 Status Messages.
- WAI-ARIA APG: use native controls first; `switch`/dialog semantics only when their interaction patterns are actually implemented.
- Vercel Web Interface Guidelines (retrieved 2026-10-10): inputs with labels/autocomplete; visible focus; reduced motion; async live status; content-safe overflow; user-controlled updates; destructive actions confirmed; URL supports meaningful state.
- References: [WCAG 2.2 Quick Reference](https://www.w3.org/WAI/WCAG22/quickref/), [WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/), [Vercel Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md).

## Handoff boundaries

- Do not deploy, modify production accounts/consent, run DB-writing browser suites on production, or call deletion endpoints as part of UX audit.
- Do not reintroduce stale Oct 9 findings now addressed: build/parser failures, missing accessibility route/footer links, duplicate/rotating landing `h1`, missing PWA install/update UI, missing reduced-motion account wiring, missing catalogue search or missing MCQ `aria-pressed`.
- Treat `docs/FRONTEND-UX-UI-AUDIT-2026-10-09.md`, `docs/UX-AUDIT.md`, and the plan as historical input that must be reconciled against current source. This 2026-10-10 handoff is the current source of audit status, subject to rerunning browser checks after fixes.
