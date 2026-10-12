# Frontend UX and PWA Remediation Implementation Plan

> **Status (2026-10-10, local build on `:3115`):** Tasks 1–5 and Task 6 steps 1–3 are implemented and verified. `npm run typecheck`, `npm run build`, `npm run verify:pwa` and `npm run e2e:public-ux` all pass — the public gate runs **69 checks with 0 axe violations** across 9 routes × light/dark plus the consent panel at 390px and 320px (`artifacts/e2e-public-ux/report.json`). The check-boxes below are left as authored; this note is the receipt. Still open: Task 6 step 4 (signed-in `e2e:a11y`/`e2e:smoke` on isolated staging) and step 5 (device release gate) — both need a staging base URL and real devices, and must never run against production.

> **For agentic workers:** Use a task-by-task execution workflow and track each checkbox. Read the audit specification below before implementation.

**Goal:** Restore a buildable public website and deliver a consent-safe, accessible website/PWA experience whose public and signed-in flows can be verified without mutating production accounts.

**Architecture:** First repair the current source parse blockers, then make consent state usable without an account and give it a single durable shape. Follow with accessible motion/heading and PWA lifecycle work, then add a no-auth browser suite and run the existing signed-in suite only on isolated staging. Keep the service worker's static-only cache and the review offline pack/outbox separate.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Tailwind CSS v4, `motion/react`, `playwright-core`, `axe-core`, existing Node verification scripts.

**Spec:** `docs/FRONTEND-UX-UI-AUDIT-2026-10-09.md`.

## Global Constraints

- Preserve WCAG 2.2 AA requirements: 4.5:1 normal-text contrast, 3:1 large-text contrast and non-text contrast, keyboard operation, visible/unobscured focus, semantic labels/states, and 24×24 CSS-pixel minimum target size; retain the product's preferred 44px touch targets.
- Do not cache authenticated HTML, RSC payloads, `/api/` responses or other dynamic/private responses in the service worker.
- Do not interrupt or discard an active review when an update becomes available; preserve local pack/outbox and server re-grading behavior.
- Never run DB-writing browser suites against production. Signed-in testing requires isolated staging and the dedicated throwaway account/restore process documented in `AGENTS.md`.
- Reuse installed `playwright-core`, `axe-core`, existing verification scripts and CSS tokens; do not add another UI, animation or browser-test dependency.
- Do not trust production screenshots as current checkout evidence until routes/build version align. Do not change generated native files or grading/scheduling logic.

## Review Focus

- **Anonymous consent, including a storage-disabled browser:** a visitor can decide without signing in; persistence failure is explained and does not dead-end the page. Pin with public-browser consent tests.
- **Rejected and partial consent on reload/navigation:** an explicit rejection is a decision, not “no decision”; it must not be re-prompted and partial choices must remain editable. Pin with reload and route-change tests.
- **Reduced motion and slow reading:** system and saved preference stop autoplay and non-essential transitions while leaving all content and controls available. Pin with reduced-motion browser context checks.
- **Small viewport, keyboard, and zoom together:** consent, sticky chrome and sheets cannot hide the focused target or create horizontal overflow at 320px/200% zoom. Pin with viewport, keyboard and target-bounds checks.
- **Worker update during an active review/offline session:** a new version must wait for an explicit safe action and must not change cache privacy or lose queued work. Pin with worker lifecycle tests and the review offline regression suite.

---

### Task 1: Restore a compilable frontend baseline

**Files:**
- Modify: `src/lib/consent.ts`
- Modify: `src/app/(app)/settings/ConsentSection.tsx`
- Modify: `src/app/privacy/page.tsx`
- Verify: `src/app/terms/page.tsx`, `src/app/cookie-policy/page.tsx`, `src/app/layout.tsx`

**Interfaces:**
- Consumes: existing `ConsentKey` union.
- Produces: `ConsentChoice` remains a `Record`-like mapping from every `ConsentKey` to `boolean`; no runtime API shape changes in this task.

- [ ] **Step 1: Confirm the current red baseline**

Run:

```bash
npm run typecheck
```

Expected: errors at the stray `)` in `ConsentSection.tsx` and malformed JSX in `privacy/page.tsx`. Also run the existing PWA contract before source changes:

```bash
npm run verify:pwa
```

Expected: static-cache/privacy and offline fallback contract passes.

- [ ] **Step 2: Make the mapped consent type valid TypeScript**

Replace the mapped `interface` in `src/lib/consent.ts` with:

```ts
export type ConsentChoice = {
  [K in ConsentKey]: boolean;
};
```

Do not widen `ConsentKey` or omit the required `essential` key.

- [ ] **Step 3: Repair the two parser blockers**

In `src/app/(app)/settings/ConsentSection.tsx`, delete the standalone closing parenthesis after the “Merge a single toggle…” comment so the `apply()` declaration follows the comment directly.

In `src/app/privacy/page.tsx`, correct all literal backslash-escaped JSX attribute quotes to normal JSX quotes, for example:

```tsx
<Link href="https://revisio-srs.vercel.app">
```

Replace the malformed service-name fragment with valid JSX text:

```tsx
(&quot;the Service&quot;)
```

Search the entire file for additional `\\\"` and malformed `&quot;` fragments; repair each actual parser error without rewriting legal policy content.

- [ ] **Step 4: Verify parse/type and build**

Run:

```bash
npm run typecheck
npm run build
```

Expected: both exit 0. If build has environment-dependent failures, report the exact failure separately; do not treat typecheck alone as proof the route renders.

- [ ] **Step 5: Check public legal routes in a local browser**

Use a fresh local server on an available non-default port. In Chromium, assert `/privacy`, `/terms`, and `/cookie-policy` return successful page responses, render one page `h1`, and have no page exception. Do not change `.env` or use the production database for this route-only pass.

**Review gate:** no plan tasks depending on UI behavior proceed until the checkout builds and the legal pages render.

---

### Task 2: Make cookie consent operable and consistent for anonymous and signed-in visitors

**Files:**
- Modify: `src/components/cookie-banner.tsx`
- Modify: `src/lib/consent.ts`
- Verify/modify only if required by the chosen persistence contract: `src/app/api/v1/consent/route.ts`
- Test: `scripts/e2e/public-ux.ts` (bootstrap the focused consent coverage in this task; Task 5 expands it into the full public gate)

**Interfaces:**
- Consumes: `ConsentState`, `ConsentChoice`, `blankConsent()`, `applyConsentChange()` and existing `GET/PATCH /api/v1/consent` account endpoint.
- Produces: one storage record for choices plus an explicit “decision made” marker. A false value for every non-essential category is still a completed reject-all decision.

- [ ] **Step 1: Bootstrap the focused public browser test and make it fail**

Create `scripts/e2e/public-ux.ts` using the installed `playwright-core` and `axe-core`; launch Chromium through `E2E_CHROME` or the existing `findChromium()` helper, but do not import `probe.ts`, sign in, or issue API writes. Use `E2E_BASE_URL` with a local URL default. Add a `public-ux` package script that runs only this file. In a fresh context with empty local storage, visit `/`, assert the named consent region exists, toggle Analytics and assert its checked state changes, click Reject all, reload, and assert the panel remains dismissed. Run `npm run e2e:public-ux` and confirm these consent assertions fail before implementation. Task 5 expands this same harness with all public routes, viewport, axe and PWA checks; do not create a second browser runner.

- [ ] **Step 2: Define one persisted consent record**

Use a versioned local record containing the `ConsentState` choice map and an explicit `decidedAt`/decision flag. Keep essential consent true. Read legacy storage defensively; do not cast `{show, hide}` to a `UserConsent`. Make malformed or unavailable storage fall back to an undecided essential-only state without throwing.

- [ ] **Step 3: Make anonymous consent immediately usable**

Initialize anonymous UI from the essential-only state; checkbox handlers must call the consent helper and actually update React state. Accept, reject and save-custom-choice actions must persist locally first, dismiss only after a successful local decision, and expose a concise inline error/retry state if persistence is unavailable. Do not disable Accept/Reject because the signed-in consent endpoint returned 401 or the network is down.

- [ ] **Step 4: Synchronize signed-in consent without losing anonymous choices**

When the caller has a signed-in session, hydrate from the account API and synchronize changes through `PATCH /api/v1/consent`. If signed out or sync fails, preserve the local record and the active choice; avoid an unauthenticated API call loop. On sign-in, merge only according to an explicit rule (server choice wins when it has a recorded decision; otherwise upload the local decision); keep this merge behavior in one helper and test both cases.

- [ ] **Step 5: Meet fixed-banner keyboard and mobile requirements**

Give every purpose checkbox a stable associated name (wrapping label is acceptable), ensure the panel has a bounded height with an internally scrollable body and an available action row at 320×720, and use safe-area padding. A keyboard-focused checkbox/button must remain visible above/within the panel. Use correct live announcement semantics for a save/error; do not create a focus trap unless the panel is intentionally upgraded to a modal dialog.

- [ ] **Step 6: Verify consent state transitions**

Run public-browser checks for: fresh anonymous visitor, individual toggle, accept all, reject all, partial save, reload, navigation to another public route, malformed local storage, storage write failure, server sync failure, signed-in remote state, and signed-in/out merge. Re-run axe for the consent-visible view at 320px and 390px; verify there are no serious/critical violations and no focus-obscuring overlap.

**Acceptance:** consent is operable without an account; decisions persist; reject-all is not re-prompted; account sync is additive and recoverable; consent cannot cover the focused control or overflow the viewport.

---

### Task 3: Normalize headings, autoplay and reduced-motion behavior

**Files:**
- Modify: `src/components/ui/word-rotate.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx`
- Modify if needed: `src/components/companion.tsx`, `src/components/ui/motion/motion-provider.tsx`, `src/app/globals.css`
- Test: `scripts/e2e/public-ux.ts` and staging signed-in checks

**Interfaces:**
- Consumes: existing design tokens, `MotionConfig reducedMotion="user"`, `prefers-reduced-motion`, and `me.prefs.reducedMotion`.
- Produces: each route has one intentional `h1`; non-heading copy does not render as a heading; reduced-motion policy is available to all route-level motion.

- [ ] **Step 1: Add semantic/motion assertions**

Assert exactly one `h1` on `/`, `/login`, `/register`, `/forgot-password`, `/privacy`, `/terms`, and `/cookie-policy`. Add a reduced-motion context check that samples the landing/companion text before and after six seconds and asserts it does not change, and that the page remains readable without transitions.

- [ ] **Step 2: Give rotating text explicit semantics**

Replace the unconditional `motion.h1` behavior with an explicit semantic variant (heading only where it owns the page heading; paragraph/span for companion copy). Update each call site intentionally. Keep a single stable landing `h1`; the landing's companion line should not be a second heading.

- [ ] **Step 3: Stop unattended message rotation**

Prefer fixed copy for the landing companion and dashboard headline. If a rotating message remains for a product reason, add a keyboard-operable, clearly named pause/resume control and stop rotation whenever the system or saved account setting requests reduced motion. Do not use `aria-live` to announce every automatic tick.

- [ ] **Step 4: Propagate the user's reduced-motion preference**

Keep OS `prefers-reduced-motion` as the default and make Settings' saved `reducedMotion` preference affect the same global motion policy after it loads or changes. Implement this through one provider/class/context path rather than one-off ad hoc checks. Preserve layout/state changes and all content; suppress non-essential transforms, blur, confetti and autoplay. Keep focus and completion feedback understandable without movement.

- [ ] **Step 5: Verify keyboard and motion behavior**

Run typecheck/build, the public-browser heading tests, and browser tests with both `reducedMotion: 'reduce'` and `'no-preference'`. On staging, change the account setting and navigate without a reload; confirm behavior updates immediately. Verify normal-motion content still renders and the account setting does not override an OS reduce request.

**Acceptance:** one route `h1`, no unpaused autoplay, correct semantics for companion text, OS/account motion preferences honored, no content or action disappears when motion is reduced.

---

### Task 4: Add user-controlled PWA installation and safe service-worker updates

**Files:**
- Modify: `src/components/PwaRegister.tsx`
- Modify: `public/sw.js`
- Modify if needed: `public/offline.html`
- Add or reuse UI in: `src/components/` and `src/app/(app)/settings/page.tsx`
- Test: `scripts/verify-pwa.mjs`, `scripts/e2e/public-ux.ts`

**Interfaces:**
- Consumes: `beforeinstallprompt`, `appinstalled`, `navigator.standalone`/`display-mode`, service-worker `waiting`, `updatefound`, `controllerchange`, current review route/state.
- Produces: a user-initiated install affordance where available, an honest iOS install instruction path, and an explicit “Update ready” action that messages a waiting worker and reloads only when safe.

- [ ] **Step 1: Extend PWA contract tests before changing the worker**

Update the Node VM worker tests to assert a newly installed worker waits by default, that only an explicit `SKIP_WAITING` message activates it, old cache cleanup remains scoped to `revisio-*`, and API/private/RSC requests are still never cached. Run `npm run verify:pwa` to see the expected red test for immediate `skipWaiting()`.

- [ ] **Step 2: Add worker waiting/activation messaging**

Remove automatic activation on install. Add a message handler for the explicit activation request. Keep static precache/versioning and cache allowlist unchanged. The client must handle a missing/waiting worker race and `controllerchange` without repeated reloads.

- [ ] **Step 3: Surface an update only at a safe point**

Track registration updates in `PwaRegister`. Present a dismissible, accessible, non-blocking notice with buttons labelled “Update now” and “Later”. If the user is on `/review` with an active session, retain the notice/defer action until session completion; never auto-reload or discard the offline outbox. On confirmation, message the waiting worker and reload once after controller change. Do not call `skipWaiting()` without the user action.

- [ ] **Step 4: Add install affordance without unsolicited prompts**

Capture `beforeinstallprompt` and call its `prompt()` only from an explicit user click. Hide the install action when already installed or unsupported. On iOS Safari, offer brief “Share → Add to Home Screen” instructions rather than a fake button. Do not prompt for notification permission here. Store dismissal in local storage without blocking the app if storage is unavailable.

- [ ] **Step 5: Verify PWA lifecycle and offline invariants**

Run `npm run verify:pwa`; in Chromium verify install-event present/absent paths, installed display mode hiding the action, update waiting then explicit activation, deferred active-review state, one reload, and failed asset requests remaining failed rather than receiving HTML. Toggle offline and confirm `/offline.html` remains usable. Re-run review offline/outbox checks on isolated staging.

**Acceptance:** installation is explicit and browser-appropriate; update is never forced; active review is safe; cache privacy and offline fallback tests remain green.

---

### Task 5: Expand the focused test into a credential-free public UX/a11y browser gate

**Files:**
- Modify: `scripts/e2e/public-ux.ts`
- Modify: `package.json` only if the Task 2 script needs refinement
- Optionally reuse: `scripts/e2e/lib/browser.ts` without calling `ensureProbeAccount()`
- Modify: `scripts/verify-pwa.mjs` only for any missing worker contract tests

**Interfaces:**
- Consumes: `E2E_BASE_URL`, optional `E2E_CHROME`, local Chromium, Playwright and axe.
- Produces: `npm run e2e:public-ux`, a no-auth/no-database report for the public, authentication, legal, 404/error, consent and PWA surfaces.

- [ ] **Step 1: Harden the existing safe test entry point**

Confirm the package script launches only `scripts/e2e/public-ux.ts`. Keep it free of `scripts/e2e/lib/probe.ts`, `ensureProbeAccount`, sign-in helpers and write requests. Default the browser base to localhost or require an explicit `E2E_BASE_URL`; never default this suite to production.

- [ ] **Step 2: Add route, runtime and heading checks**

Check `/`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/privacy`, `/terms`, `/cookie-policy`, `/accessibility`, and an unknown path. Assert expected 2xx or intentional 404 status, one `h1` on successful routes, `lang="en"`, one main landmark, no page errors, no unexpected HTTP 4xx/5xx, and all internal legal links resolve. Exempt only documented auth API statuses; do not hide route 404s.

- [ ] **Step 3: Add viewport and keyboard checks**

Run at 1280×900, 390×844 and 320×720; assert no horizontal document overflow. From a fresh context, first Tab must reach the skip link and Enter must focus `main#main`. Tab through consent and verify focus is visible and not covered. Check links are real links and actions are native buttons.

- [ ] **Step 4: Add axe and PWA checks**

Inject the existing `axe-core` package after the page has settled; collect every impact level with route and node selectors. Fail on serious/critical; report moderate/minor for review. Wait until entrance animations settle before contrast sampling and capture both light/dark. Verify manifest response, icon status/MIME, standalone display, service-worker activation/update state and offline fallback. Store JSON and screenshots under ignored `artifacts/`.

- [ ] **Step 5: Verify suite isolation**

Run against local build and prove no database tables/account state change (the suite has no DB import and no write request). Re-run at the primary production alias only as a read-only comparison; annotate production/source drift rather than treating the live alias as implementation proof.

**Acceptance:** `npm run e2e:public-ux` is repeatable without credentials or DB writes and catches route errors, a11y regressions, small-screen overflow, skip-link failures and PWA regressions.

---

### Task 6: Complete the public legal/accessibility path and isolated signed-in audit

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/app/accessibility/page.tsx`
- Modify if required: legal pages' internal links/metadata
- Verify: `scripts/e2e/public-ux.ts`, `scripts/e2e/a11y.ts`, `scripts/e2e/smoke.ts`

**Interfaces:**
- Consumes: existing public legal pages and the support contact described in the privacy policy.
- Produces: footer discovery links and a truthful accessibility statement; staging-only receipts for signed-in screens.

- [ ] **Step 1: Add discoverable policy links**

Add footer links for Privacy, Terms, Cookie Policy and Accessibility. Use Next `Link` for internal routes. Keep footer language concise and preserve the current design tokens and responsive wrapping.

- [ ] **Step 2: Publish a truthful accessibility statement**

Create `/accessibility` with one `h1`, the WCAG 2.2 AA target, known support/contact path, a statement of the last review date, and clear distinction between automated axe findings and manual/device testing. Do not claim conformance/certification unless each criterion has been evaluated. Add a canonical title/description and ensure privacy's existing link resolves.

- [ ] **Step 3: Run public and route regression checks**

Run typecheck/build, `npm run verify:pwa`, and `npm run e2e:public-ux` against local build. Confirm legal footer links work with keyboard, browser Back, direct load and reload.

- [ ] **Step 4: Run signed-in audit only on isolated staging**

With explicit staging base URL and the dedicated probe account, snapshot/restore any fields before mutation and run `npm run e2e:a11y` and `npm run e2e:smoke`. Never point either suite at production. Record any skipped checks as skipped, not passes.

- [ ] **Step 5: Device release gate**

Manually verify iOS Safari installed mode and Android Chrome installed mode: install instructions, safe areas, bottom navigation, consent, review completion, offline loss/reconnect, update notice, focus/VoiceOver/TalkBack, 200% zoom, reduced motion, dark mode, and WCAG touch target minimums. Record browser/OS versions and remaining limitations.

**Acceptance:** legal/accessibility pages are discoverable and resolve; public suite passes locally; signed-in suite is evidenced on isolated staging; mobile installed-mode limitations are documented.

---

## Handoff order and release gates

1. Task 1 is a hard gate: no meaningful visual sign-off while the checkout does not compile.
2. Tasks 2–4 may proceed independently after Task 1; keep each in its own reviewable change.
3. Task 5 should land early enough to verify Tasks 2–4 rather than being deferred until the end.
4. Task 6 closes public discovery and completes authorized staging/device verification.
5. Before release, run `npm run typecheck`, `npm run build`, `npm run verify:pwa`, and `npm run e2e:public-ux`; on isolated staging run `npm run e2e:a11y` and `npm run e2e:smoke`. Review every serious/critical axe node and every browser finding, not just aggregate scores.
6. Recheck the primary alias after an authorized deployment: legal-route status, consent endpoint behavior and contrast were inconsistent with this source snapshot during this audit. Do not claim the drift resolved based on a successful local build alone.

## Deliberate non-goals

- No native Android/iOS redesign in this website/PWA handoff.
- No new notifications, reminders, background sync provider or auth system.
- No service-worker caching of personalized route documents to simulate an offline shell.
- No change to review grading, scheduling, XP, account deletion, teacher/admin feature scope, or design palette beyond measured contrast corrections.
- No deployment, production DB writes, destructive test account actions, or dependency install is part of this plan.
