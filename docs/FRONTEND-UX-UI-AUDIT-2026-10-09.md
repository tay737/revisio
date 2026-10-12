# Website & PWA UX Audit — 2026-10-09

**Scope:** Revisio's Next.js website and installable web app (PWA), including public/auth entry points, manifest, service worker, consent surface, shared interaction and accessibility patterns.

**Standards checked:** WCAG 2.2 AA (including keyboard access, contrast, focus visibility, zoom/reflow, and target sizing) and the current Vercel Web Interface Guidelines retrieved on 2026-10-09. This is a browser-and-source audit, not a certification or user study.

**Handoff plan:** `docs/superpowers/plans/2026-10-09-frontend-ux-remediation.md`.

## Executive summary

The repository has good foundations: valid PWA icons and manifest, a privacy-conscious static-only service-worker cache, a dedicated offline fallback, responsive public/auth page layouts at tested narrow widths, a first-focus skip link on the public/auth/app shells, semantic selected states in the review and cram MCQs, and an existing axe/Playwright harness.

There is nevertheless a release-blocking local baseline problem: the current checkout does not compile. `npm run typecheck` reports a syntax error in Settings consent code and a large parse-error cascade in the privacy page; starting Next.js separately identifies malformed mapped-type syntax in `src/lib/consent.ts`. This prevented reliable local rendering or a complete current-source audit. Do not treat the older deployed bundle as the source of truth: the production alias is out of sync with this checkout and returned 404 for legal routes that exist locally.

The highest-priority UX issues to address after restoring a build are the unusable/contradictory consent flow, rotating headings and reduced-motion behavior, a missing public accessibility statement, and missing user-facing PWA install/update lifecycle affordances. A serious contrast failure was detected in the deployed landing page and must be re-measured against a successful build before release.

## Verification performed

- Installed Playwright Chromium locally under the already-gitignored `.browsers/`; no package dependencies were added.
- `npm run verify:pwa` **passed**: the worker keeps personalized HTML/RSC/API requests out of Cache Storage, keeps static assets, removes old Revisio caches, and serves the dedicated offline page for failed navigations.
- Headless Chromium against `https://revisio-srs.vercel.app` rendered the landing/login/register/forgot-password routes with HTTP 200; 390px and 320px layouts had no horizontal overflow; first Tab focused “Skip to content” and activating it focused `main#main`.
- Production PWA metadata returned `display: standalone`, `/dashboard` start URL, all four PNG icon variants and the SVG icon returned HTTP 200, and the worker activated. With the browser taken offline, navigation produced the branded offline page and retry action.
- An initial production axe scan during landing-page entrance animations reported a **serious `color-contrast` violation** (sampled text at 3.4:1 and 1.91:1, and a CTA at 1.81:1 while fading in). A second landing scan after a 2.5-second settle found no axe violations. Treat this as an animation/transient contrast finding to reproduce and investigate—not a confirmed persistent token failure. The signed-out auth pages also showed a moderate `region` violation because some auth-shell content sat outside landmarks. Re-run against the locally repaired build both during and after transitions and retain moderate findings for human review.
- Production landing DOM exposed two `h1` elements: “Learn it once.” and a changing companion sentence.
- Production `/privacy`, `/terms` and `/cookie-policy` returned 404 despite corresponding route source files existing in this checkout. A signed-out request to `/api/v1/consent` returned 404 on that deployed alias.
- `npm run typecheck` **failed**. Errors begin at `src/app/(app)/settings/ConsentSection.tsx:228` and `src/app/privacy/page.tsx:37` and cascade through the privacy document. Local `next dev` additionally reported `src/lib/consent.ts:21` cannot be parsed. Its attempt to run on the repo's default port 3100 also found that port already occupied; the separate-port attempt could not serve pages because of the compile error.
- The signed-in app was not exercised in the browser. The existing `e2e:smoke` and `e2e:a11y` flows create/reset a probe account and write to a database; they were not run against production without explicit staging approval. Signed-in review findings below are source-level observations, not claimed rendered results.

## What is working (preserve)

- `src/app/layout.tsx`: English document language, viewport zoom is not disabled (`maximumScale: 5`), `viewportFit: cover`, manifest, and light/dark theme colors.
- `public/manifest.webmanifest`: standalone display, correct canvas colors, regular and maskable 192/512 PNGs.
- `public/sw.js`: allowlisted static caching; no API, dynamic document or RSC caching; navigation-only fallback; versioned-cache cleanup.
- `public/offline.html`: clear offline explanation, retry button, 44px controls, visible keyboard focus, and accurate reassurance for answers already saved during a session.
- `src/components/AppShell.tsx`, `AuthShell.tsx`, and `src/app/page.tsx`: skip links lead to focusable main landmarks. The public first-Tab and activation path were tested live.
- `src/app/globals.css`: shared focus-visible treatment, readable 44px primary controls and compact mobile touch controls, semantic state color tokens, safe-area utilities and reduced-motion CSS.
- Review and cram MCQ options already use `aria-pressed`; avoid reintroducing the stale audit's finding that selection was only visual.
- `src/app/(app)/learn/*`: catalogue and topic search already exist; do not plan a duplicate search feature.

## Findings and developer recommendations

### P0 — Restore a compilable baseline before judging visual behavior

**Evidence:** `npm run typecheck` fails in `ConsentSection.tsx` and `privacy/page.tsx`; Next's compiler reports malformed mapped-type syntax in `src/lib/consent.ts`.

**User impact:** legal documents, consent and all pages importing the shared root layout cannot be trusted to render or ship from this checkout. Live results are from a different bundle, so they cannot validate local fixes.

**Source/action:**
- `src/lib/consent.ts`: `ConsentChoice` is declared as an `interface` containing a mapped member (`[K in ConsentKey]`), which Next's current compiler rejects. Declare it as a mapped `type`.
- `src/app/(app)/settings/ConsentSection.tsx`: remove the stray `)` following the “Merge a single toggle…” comment.
- `src/app/privacy/page.tsx`: repair the escaped attribute quotes (`href=\\\"…`) and malformed quoted JSX entity around “the Service”; fix all similar malformed quote/entity instances rather than suppressing parser errors.

**Acceptance:** `npm run typecheck` and `npm run build` exit 0; `/privacy`, `/terms`, `/cookie-policy`, and the other public routes render from the local build with correct page content and non-404 responses.

### P1 — Consent has inconsistent state ownership and can be impossible to complete signed out

**Evidence [source]:**
- `src/components/cookie-banner.tsx` fetches `/api/v1/consent` before enabling Accept/Reject. The route currently requires an authenticated user (`src/app/api/v1/consent/route.ts`); on an unauthenticated request the client catches the error, sets `saved` to `null`, and disables both actions.
- Each non-essential checkbox's `onChange` returns an object containing a setter instead of calling `setSaved`; toggling cannot update its state.
- `writeConsentGate()` persists `{show, hide}`, but `readConsentGate()` parses the same key as a `UserConsent` and reads `parsed.choices`. The types and data shapes disagree. A reject-all state is also indistinguishable from no prior decision because “all false” is interpreted as “show the banner again.”

**User impact:** the consent panel can be inert for signed-out visitors, choices do not reliably change, and a saved rejection can be asked again on a later page load. The source and the observed deployed 404 make consent behavior especially important to test only against the repaired local/staging deployment.

**Recommendation:** give the banner one explicit stored record containing the consent choices and whether a decision was made; initialize anonymous users from a safe essential-only state; update the UI immediately with the existing pure consent helpers; persist locally for signed-out users; synchronize to the account endpoint only when authenticated, without disabling the visitor's choice on an auth/network failure. Preserve the ability to re-open/manage choices. Provide a bounded, internally scrollable mobile panel and ensure fixed content never obscures keyboard focus.

**Acceptance:** on a fresh signed-out context, each checkbox toggles and is announced with its label, Accept/Reject saves and dismisses, reload does not re-prompt, and a partial choice survives reload; signed-in consent synchronizes; failed sync remains visible and recoverable without losing the local decision. Cover 320×720 and 390×844.

### P1 — Landing page has duplicate headings and unpaused auto-changing content

**Evidence:** rendered production landing DOM had two `h1`s. `src/components/ui/word-rotate.tsx` always renders `motion.h1` and changes the text indefinitely on a 5-second interval; it has no pause control and does not stop text replacement for `prefers-reduced-motion`. The landing uses it for a companion line; the dashboard also uses it.

**User impact:** heading navigation is ambiguous, and a screen-reader user or a person who needs more time can have the apparent heading/content change while reading. Motion reduction currently cannot make the timer stop.

**Recommendation:** preserve one meaningful page `h1`; use a non-heading semantic element for companion copy. Prefer a stable landing companion line over autoplay. If any rotation remains, provide an accessible pause control, do not announce every tick aggressively, and freeze it when reduced motion is requested. Audit both call sites and make the heading level intentional.

**Acceptance:** exactly one `h1` per route; no unattended text rotation; system reduced-motion and the account preference both reduce/stop non-essential motion; content remains available without animation.

### P1 — Production alias and repository are not release-aligned; transient contrast/auth landmark findings need a stable retest

**Evidence:** the live primary alias served 404 for three legal routes present in source and an unauthenticated consent endpoint 404. An axe scan during entrance transitions reported serious contrast nodes which were absent from a second settled landing scan; the auth routes had a moderate landmark-region issue. Existing `docs/FRONTEND-UX-UI-AUDIT.md` is explicitly code-only and dated 2026-10-07; older `docs/UX-AUDIT.md` has several findings now resolved (manifest, search, skip links, branded errors, 2FA) and several stale claims.

**User impact:** users may be receiving a different experience than the reviewed source, and there is no reliable basis for release acceptance until both align.

**Recommendation:** use the primary alias only for release validation, deploy only through the authorized release process, and compare build SHA/routes before declaring the discrepancy resolved. After the local build works, re-run axe after animations settle in light/dark mode. Fix each measured text pair to WCAG AA (4.5:1 normal, 3:1 large) without changing the product's monochrome chrome/state-color rule. Do not copy the stale audit's old blue/manifest/icon or missing-skip-link recommendations.

**Acceptance:** local and staging routes agree on page/status; no unexpected 4xx/5xx/page errors; no serious/critical axe findings in both transition and settled states; auth content is within appropriate landmarks; every moderate/minor finding is reviewed and documented; any real contrast issue is tied to its source pair and re-measured after animation settles.

### P1 — PWA lifecycle is silent after service-worker registration

**Evidence [source]:** `src/components/PwaRegister.tsx` registers `/sw.js` and swallows errors; no install prompt capture, installed-state affordance, `updatefound`/waiting-worker notice or user-controlled update action exists in source. Production confirms the worker activates and offline fallback works. Current worker uses `skipWaiting()` immediately, so a normal waiting-update prompt cannot work as designed without a worker lifecycle change.

**User impact:** people may not know they can install the app, and returning users receive no clear notice/action for a new shell. A forced update/reload during a review could disrupt the learning flow.

**Recommendation:** provide a small, dismissible install action only after an installable browser event and after a user gesture; explain the manual “Add to Home Screen” route on iOS Safari. Add a non-blocking update notice and explicit reload action. Keep a waiting worker until the learner chooses to update, then message it to activate; defer presenting/reloading while a review is active. Never request notification permission as part of install UX.

**Acceptance:** Chromium install event path, unsupported-browser fallback, iOS instructions, dismiss/reopen behavior, waiting update and explicit reload are covered; active review state is not interrupted; static cache/privacy invariants remain green.

### P2 — Legal and accessibility information is not a complete discoverable public path

**Evidence [source]:** the landing footer in `src/app/page.tsx` offers register/login only; privacy links to `/accessibility`, `CookieConsentBanner` exempts that route, but there is no `src/app/accessibility` route. The production bundle's legal routes returned 404 during the live check.

**User impact:** visitors cannot reliably discover legal/accessibility information from the marketing entry point, and the privacy policy contains a link to an absent accessibility statement.

**Recommendation:** add public footer links to privacy, terms, cookie policy and a real accessibility statement route (or remove/repoint the dangling link only if product owners explicitly do not intend to publish one). Keep the statement honest: target WCAG 2.2 AA, known limitations, contact route and review date; do not claim certified conformance based on axe alone.

**Acceptance:** every footer link returns 200, each document has a unique title and one `h1`, internal links resolve, and the accessibility statement describes the actual verification boundary.

### P2 — Browser coverage needs a read-only public suite plus an authorized signed-in pass

**Evidence:** `scripts/e2e/a11y.ts` and `scripts/e2e/smoke.ts` are useful but provision/reset a database-backed probe user. This audit intentionally avoided running them against production. The local build failure blocked a complete public route axe pass and all signed-in interactions.

**Recommendation:** add a browser suite for public/auth/legal/PWA paths that needs no credentials or database writes. Keep the current signed-in suite, but run it only with a dedicated probe account on isolated staging; follow `AGENTS.md` restore/snapshot precautions. Include keyboard, browser Back, error/empty/loading states, 200% zoom, 320/390px, light/dark, and reduced motion. Test iOS Safari and Android Chrome installed mode on real devices before calling the PWA verified.

**Acceptance:** public suite is safe against local/staging and never writes to an account; signed-in checks are gated on explicit staging credentials; both produce inspectable reports and screenshots.

## Standards references

- [WCAG 2.2 Quick Reference](https://www.w3.org/WAI/WCAG22/quickref/)
- [WAI-ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)
- [Vercel Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) (retrieved 2026-10-09)

## Scope boundaries

- This report does not certify WCAG conformance, legal correctness, conversion efficacy, or native Android/iOS accessibility.
- Do not run destructive account flows, modify production consent, run current DB-writing E2E suites against production, or deploy as part of plan implementation without explicit authorization.
- Keep the offline review/outbox contract, server-owned grading/scheduling/XP, PWA static-only cache policy, route single owners, and design token rules intact.
- Treat `docs/UX-AUDIT.md` as a backlog requiring re-verification, not a current defect list; search source/current routes before implementing it.
