# PWA Privacy and Entry-Point Accessibility Implementation Plan

> **For agentic workers:** Native implementation in this session; use the checked-in plan task-by-task and verify each deliverable.

**Goal:** Keep private/dynamic app responses out of the service-worker cache, provide a clear offline navigation fallback, and make landing/auth pages keyboard-skippable.

**Architecture:** Keep the service worker as a small static-file/offline-navigation layer; preserve the app’s separate local offline review pack/outbox. Add skip links to public and auth shells using the existing global style and keep page content in a focusable `main` landmark. Verify service-worker behavior in an isolated Node VM harness without a live database or browser.

**Tech Stack:** Next.js 14 App Router, React/TypeScript, plain service worker JavaScript, Node built-in `vm`/`assert`, existing `npm` scripts.

**Spec:** `docs/FRONTEND-UX-UI-AUDIT.md`; backend-dependent reminder design is documented separately in `docs/BACKEND-ARCHITECTURE-HANDOFF.md` and is not part of this frontend implementation.

## Global Constraints

- Never cache authenticated HTML, RSC payloads, or `/api/` responses.
- The offline fallback is only for top-level navigations; never substitute HTML for an asset response.
- Preserve `/review`’s existing local offline pack and outbox behavior.
- Do not add reminder UI before its backend contracts and delivery job exist.
- Keep browser zoom enabled and respect existing reduced-motion and safe-area styles.
- Do not include unrelated pre-existing/untracked files in a commit.
- Do not run database-mutating production E2E scripts or deploy/push without confirmed safe target and credentials.

## Review Focus

- An authenticated document or Next.js RSC response is requested while online: expect no Cache Storage entry.
- A navigation fails offline: expect the dedicated offline page, not cached `/` or private HTML.
- A script/image request fails offline: expect the request to remain failed, not receive HTML.
- A returning browser requests an already cached static asset while offline: expect that asset to load.
- Landing and auth visitors press Tab then Enter: expect focus to move to the main landmark.

---

### Task 1: Isolate service-worker caching and offline navigation

**Files:**
- Modify: `public/sw.js`
- Create: `public/offline.html`
- Test: `scripts/verify-pwa.mjs`
- Modify: `package.json` to add `verify:pwa`

**Interfaces:**
- Service worker handles `GET` requests on its own origin only.
- Eligible static paths: `/_next/static/`, `/manifest.webmanifest`, `/offline.html`, `/icon.svg`, `/icon-192.png`, `/icon-512.png`, `/icon-192-maskable.png`, `/icon-512-maskable.png`.
- Failed navigation resolves to cached `/offline.html`; other failed requests do not.
- `npm run verify:pwa` exits nonzero on any cache/privacy/fallback contract failure.

- [x] **Step 1: Build the VM test harness**

Create a Node script that loads `public/sw.js` using `node:vm`, captures registered listeners and simulates Cache Storage, `fetch`, `self.skipWaiting()`, and `clients.claim()`. The harness must be deterministic, make no network request, and assert the five review-focus cases above plus cache-version activation cleanup.

- [x] **Step 2: Use the contract test to catch implementation mismatches**

Run: `node scripts/verify-pwa.mjs`
Observed during implementation: the first run caught defects in the VM cache mock; after correcting it, the worker contracts passed.

- [x] **Step 3: Add the standalone offline document**

Create a self-contained accessible `public/offline.html` with `lang="en"`, a viewport meta that permits zoom, one `h1`, plain offline status copy, a native retry button implemented with a small inline `location.reload()` handler, and a link to `/` that works when a connection returns. Do not load external fonts, scripts, or images.

- [x] **Step 4: Narrow cache policy**

In `public/sw.js`, bump the cache version, precache the manifest/icons/offline document, clean only older `revisio-*` caches, and claim clients. Handle same-origin `GET` navigations network-first without storing their response; on failure use only cached `/offline.html`. Cache only explicit static paths and `/_next/static/`; exclude APIs, mutations, RSC navigation payloads and all other dynamic paths. If a static request fails and has no cache hit, let it fail rather than returning HTML.

- [x] **Step 5: Run the PWA contract test**

Run: `node scripts/verify-pwa.mjs`
Expected: every install/activate/fetch contract passes, including zero cached private/document/API responses and correct fallback type.

- [x] **Step 6: Expose the test in package scripts**

Add exactly: `"verify:pwa": "node scripts/verify-pwa.mjs"` to `package.json` scripts. Run `npm run verify:pwa` and expect exit 0.

### Task 2: Add skip navigation to public and authentication shells

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/AuthShell.tsx`
- Modify: `src/app/globals.css` only if testing exposes a styling issue

**Interfaces:**
- First keyboard stop on each shell is the existing `.skip-link` anchor with visible text `Skip to content`.
- Each anchor targets a unique `id="main"` on that page’s primary content landmark, which has `tabIndex={-1}`.
- Auth content retains one page-level `h1`, supplied by `AuthForm`; the decorative “Ten minutes a day.” line is not a heading.

- [x] **Step 1: Add public landing skip link and target**

Place `<a href="#main" className="skip-link">Skip to content</a>` before the sticky header in `src/app/page.tsx`; set the content `<main>` to `id="main" tabIndex={-1}`.

- [x] **Step 2: Restructure the auth shell landmark**

Make the auth shell root a `div`, add the skip link before its banner, and make the form/footer wrapper `<main id="main" tabIndex={-1}>`. Convert the banner’s decorative `<h2>` to a paragraph while retaining its visual classes. Keep one main landmark and one meaningful form h1.

- [x] **Step 3: Check source and type correctness**

Run: `npm run typecheck`
Expected: exit 0 with no JSX or type errors.

### Task 3: Verify and record release boundaries

**Files:**
- Existing: `docs/FRONTEND-UX-UI-AUDIT.md`
- Existing: `docs/BACKEND-ARCHITECTURE-HANDOFF.md`
- Test: `scripts/verify-pwa.mjs`

- [x] **Step 1: Re-run deterministic tests**

Run: `npm run verify:pwa && npm run typecheck`
Expected: both exit 0.

- [x] **Step 2: Build production output**

Run: `npm run build`
Expected: Next.js production build exits 0. If environment-specific database/build configuration prevents completion, report the exact blocking evidence and do not claim a successful build.

- [x] **Step 3: Recheck changed-file scope**

Inspect `git diff -- public/sw.js public/offline.html scripts/verify-pwa.mjs package.json src/app/page.tsx src/components/AuthShell.tsx docs/FRONTEND-UX-UI-AUDIT.md docs/BACKEND-ARCHITECTURE-HANDOFF.md docs/superpowers/plans/2026-10-07-pwa-privacy-ux.md`. Confirm unrelated pre-existing files are excluded and do not stage anything until the user confirms the target branch/deploy and commit workflow.

---

## Handoff decisions

The reminder feature is backend-dependent and intentionally not implemented as client-only fake functionality. The backend architect should resolve the scheduler cadence, Web Push provider/library, persistence/migration shape, DST and quiet-hours policy, delivery idempotency/retries, and rollout/kill switch in `docs/BACKEND-ARCHITECTURE-HANDOFF.md` before frontend controls are enabled.
