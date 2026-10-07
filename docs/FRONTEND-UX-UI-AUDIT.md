# Frontend UX/UI Audit — 2026-10-07

**Scope:** Next.js web/PWA entry points, app shell, global accessibility styles, service worker and manifest. This is a code-level audit, not a claim of complete device/browser certification.

**Guidance checked:** current Vercel Web Interface Guidelines (`web-interface-guidelines` command, retrieved 2026-10-07) and WCAG 2.2 AA principles. The repository also has a real Playwright + axe audit (`npm run e2e:a11y`) and a full browser smoke (`npm run e2e:smoke`).

## What is already in good shape

- `src/app/layout.tsx` declares `lang="en"`, responsive viewport scaling, safe-area support, manifest metadata and theme colors.
- `src/app/globals.css` defines visible `:focus-visible` styling, 44px primary controls, reduced-motion handling, safe-area utilities and a shared skip-link style.
- `src/components/AppShell.tsx` already provides a “Skip to content” link targeting a focusable main landmark.
- `public/manifest.webmanifest` has 192/512px standard and maskable PNG icons; `public/sw.js` does not cache `/api/` requests.
- The existing frontend is already wired for user-authorized 2FA, catalogue search, and local offline review/outbox behavior. Those features should be preserved; do not duplicate them with client-only approximations.

## Findings and changes in this pass

### P1 — Personalized documents could be retained in the service-worker cache

`public/sw.js` previously cached every successful same-origin GET except `/api/`. That includes authenticated HTML and Next.js route/RSC responses. On a shared device, those cached responses can outlive the visible session and are unnecessary for offline review, which already uses the dedicated local pack/outbox in `src/lib/offline.ts`.

**Change:** cache only explicitly static assets (Next hashed assets, manifest, icons and offline document); never cache navigation HTML, RSC payloads or dynamic requests. Activation removes the prior broad cache.

### P1 — Failed navigation returned an unrelated page

The previous catch-all fallback returned the cached `/` response for any failed request. That can return HTML to a CSS/script/image request or show the landing page when a learner expected a specific page, without explaining the outage.

**Change:** only failed top-level navigations receive `/offline.html`; failed asset requests remain failed normally. The offline screen gives a clear retry and explains that an active review keeps its locally stored answers for reconnection.

### P2 — Skip navigation was missing on public and authentication entry points

The authenticated `AppShell` had a skip link, but the public landing page and shared auth shell did not. Keyboard users had to tab through the header/form chrome on those entry points.

**Change:** provide the same first-focusable skip link and a focusable `main#main` target in the landing and auth shells. Change the auth banner's decorative tagline from an `h2` to a paragraph so the actual form title remains the page's first heading.

## Verification boundaries

- Service-worker behavior is covered with a Node VM harness that exercises navigation fallback, static caching and private/API request exclusion.
- Typecheck and production build are the code-level gates.
- The deployed Playwright/axe harness creates or resets its dedicated probe account in the configured database. Do not run it against production without explicit, task-specific approval; use an isolated staging database and probe account instead.
- This environment reports no installed Chrome. Therefore the current pass cannot claim a rendered axe score, keyboard walkthrough, screen-reader result, or measurements at real device/browser sizes. Those remain explicit release gates.

## Follow-on implementation roadmap

1. **Daily study reminders (backend-dependent; do not show an enabled-looking frontend control before the API and delivery job exist).** Implement subscription lifecycle, user-selected local reminder time/timezone, due-queue eligibility, durable idempotent delivery, opt-out and stale-subscription cleanup. See `docs/BACKEND-ARCHITECTURE-HANDOFF.md`.
2. **PWA lifecycle UX.** Add a user-initiated install explanation where the browser supports installation, and a non-blocking service-worker update notice with a reload action. Never interrupt an active review or prompt for notifications during page load.
3. **Device-level verification.** On isolated staging, run `npm run e2e:smoke` and `npm run e2e:a11y`, then manually keyboard-test skip links, dialogs, review controls, 200% zoom, reduced motion, high contrast and narrow 320/390px layouts. Include iOS Safari installed mode and Android Chrome installed mode.
4. **State deep-linking and recovery.** Review catalogue/search and progress-tab state for URL persistence where back/share behavior is useful; test browser Back and reload on each changed flow.

## Release acceptance for this pass

- Dynamic/private HTML, RSC and `/api/` responses are never inserted into the Cache Storage cache.
- Static assets remain available after a successful online visit; offline navigation displays only the dedicated offline page.
- Landing and auth entry points expose a first-tab skip link that targets the page main landmark.
- Existing local offline review/outbox behavior, auth and API behavior are not changed.
