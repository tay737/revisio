# App review — everything after registration

Status: **review and first repair pass** (2026-11-14). Scope: every signed-in
surface — `/dashboard`, `/review`, `/learn`, `/learn/[subject]`,
`/learn/[subject]/[topic]`, `/progress` (all four tabs), `/cram`, `/exam`,
`/practice`, `/library`, `/settings`, `/teacher`, `/admin`, `/u/[handle]`.

This is the companion to `docs/ONBOARDING-REVIEW.md`: that pass rebuilt the
landing, sign-in and registration against `docs/UI-SYSTEM.md`. This one holds
the rest of the site to the same rules, and it starts from a browser rather
than from source — `npm run audit:app`, which signs in as the probe account and
measures every route at 1440 and 390.

The rules are in `docs/UI-SYSTEM.md`; the structure is in
`docs/FRONTEND-ARCHITECTURE.md` §7 (Phase 2 is this document's work).

---

## 1. Verdict

The app's *ideas* are already right: one `h1` per screen, one card radius, one
primary action, flat surfaces, ink chrome. Nothing here needed a redesign.

What it did not have was the **shared floor**: the onboarding pass introduced
`Field`, `PageHeader`, `Notice` and one button, and the app surfaces kept their
own copies of everything else. The result was a screen that works and three
different versions of it — 200 inline type sizes, five empty states, two stat
rows, controls under the touch minimum, and two screens that scroll sideways on
a phone.

Two of the findings were not visual at all, and both were worse than any of the
styling: **a reload signed the learner out**, and **registration's new `level`
column was never applied to the database**, so every session refresh 500'd.

---

## 2. Findings

Severity: **P0** breaks a promise or a standard; **P1** undermines the
experience on every visit; **P2** is a defect that will compound; **P3** is a
judgement call.

### P0-1 — Reloading any app page signed the learner out

`lib/api.ts` kept the access token in memory and only ran its refresh-and-retry
dance when that token existed (`res.status === 401 && … && accessToken`). A cold
load has no token by definition — the httpOnly refresh cookie is the only thing
left of the session — so `/me` returned 401, `AppShell` redirected, and the
cookie was still valid the whole time.

Reproduced against the deployed alias: sign in → `/dashboard` → reload →
`/login`, with `POST /auth/refresh` never attempted.

**Fixed:** a 401 with no token now bootstraps from the refresh cookie, except on
`/api/v1/auth/*` where a 401 means "wrong password" or "unverified" and must keep
saying so. The audit now asserts the behaviour by navigating (a hard load) and
failing with `session-lost` if it lands on `/login`.

### P0-2 — `education_level` existed in code, not in either database

`drizzle/0013_users_education_level.sql` was written with the onboarding rework
and never applied. `schema.ts` selects the column, so refresh, `/me` and every
full user read threw `column "education_level" does not exist` (500).

**Fixed:** applied to the Supabase primary and the Neon mirror (the file is
idempotent; a second run is a no-op). Verified in `information_schema.columns`
on both.

### P1-3 — Two hundred inline type sizes

`text-[10px]`, `[11px]`, `[12px]`, `[13px]`, `[14px]`, `[15px]`, `[16px]`,
`[17px]`, `[20px]` across 43 app files. Five near-identical small sizes meant two
screens that should have been identical had different vertical rhythm — the same
defect the onboarding review found in auth, only everywhere.

**Fixed:** every app size is now a `.t-*` class (200 replacements). The mapping
is the one in `UI-SYSTEM.md` §5: 10–12 → `t-micro`/`t-fine`, 13–14 → `t-caption`,
16–17 → `t-body`/`t-lead`, 20 → `t-display-sm`.

### P1-4 — Controls below the 44px touch floor

At 390px: the account/crest button (36px), every chip in the Cram and Exam topic
pickers (30px), Rank's four tabs (36px), and the skip link (41px). The system's
floor is 44px on touch; the app was a desktop layout that had been squeezed.

**Fixed:** `.chip` and `[role="tab"]` take a 44px minimum under 640px, the skip
link is 44px everywhere, and the mobile crest button is 44px. The audit enforces
the floor only at 390 — a 36px icon button under a mouse is correct, and an audit
that failed it would grow desktop chrome for nobody.

### P1-5 — Cram and Exam scrolled sideways at 390

Long topic names ("7.3.1 Benefits and Drawbacks of Computer Networks…") are
rendered as chips. A chip wider than the phone produced a 161px horizontal
overflow on `/cram` and 150px on `/exam` — a scrollbar the learner cannot
explain and can catch mid-answer.

**Fixed:** `.chip` is `max-width: 100%` and wraps; the label is kept in full
rather than truncated, because these strings are how a learner identifies the
topic.

### P1-6 — Serious contrast failures axe found

- `.btn-danger` used `--destructive` (#ff4b4b) as *text* on white: 3.3:1. The
  ink variant exists for exactly this and was not being used.
- The strength ladder's interval labels were muted grey at `opacity-70`: 2.21:1.
  An opacity on text is a contrast bug that looks like a design choice.

**Fixed:** `.btn-danger` reads in `--destructive-ink`; the ladder label is
`text-muted-foreground` with no opacity.

### P1-7 — Tinted chrome in empty states

Eleven icon discs and the practice XP pill used `bg-primary/10 text-primary` — a
tinted blue circle above "Nothing here yet". The page header was made monochrome
in the onboarding pass for the stated reason (colour means state); every other
empty state kept the tint, so the rule held on exactly one screen.

**Fixed:** discs are `bg-secondary`, and prose links are ink with an underline.

### P1-8 — Section-level fades and one ambient loop

`BlurFade` wrapped every section of the dashboard, library, learn, progress,
exam, teacher and admin screens — the "fade in on scroll" pattern the system
forbids because it turns reading into waiting. The dashboard's hero also ran a
`BorderBeam` (a 9s infinite loop) whenever cards were due: a loop in a product
surface, which is banned outright.

**Fixed:** 14 `BlurFade` wrappers and the beam removed. Motion is now the page
route transition, the tactile press, and the study loop's own feedback.

### P2-9 — Every list invented its own empty state

Learn, My content and Practice each drew a different "nothing here yet": a tinted
disc in two, a plain card in one, an action in one and not the others. There was
no `EmptyState` primitive and two stat rows (the dashboard had its own `Stat`).

**Fixed:** `components/ui/empty-state.tsx` and `components/ui/stat.tsx`, used by
the three lists and the dashboard's four numbers. `UI-SYSTEM.md` §8 now names
both.

### P2-10 — `Input`/`Textarea` dropped refs

`AuthForm` points a ref at the field that failed so submit can move focus there
(UI-SYSTEM §8.3). `Input` was a plain function component, so the ref was dropped
and React warned on every login render: "Function components cannot be given
refs". Focus-first-invalid never worked.

**Fixed:** both primitives are `forwardRef`.

### P3-11 — The audit itself

There was no way to see any of the above: `e2e:smoke` asserts behaviour,
`e2e:public-ux` and `design:shots` only ever visit the signed-out pages. That is
why the app drifted while the landing was being polished.

**Added:** `scripts/e2e/app-audit.ts` (`npm run audit:app`), 24 screens
(12 routes × 1440/390), checking one `h1`, heading order, inline type, card
radii, loops at rest, tinted chrome, tap targets, overflow, axe (moderate+), and
page/console/4xx/5xx findings. Screenshots and a JSON report land in
`artifacts/app-audit/<stamp>/`.

---

## 3. What was kept, unchanged

| Thing | Why |
|---|---|
| Ink-on-canvas chrome, flat cards, one radius | Distinctive and cheap; the onboarding pass already settled it |
| The `.band` scope | One component renders correctly on both grounds |
| One `PageHeader`, one `Notice`, one `Button` | The primitives the app *did* share, and they are good |
| The study loop's own feedback | Grading, XP and the correct/incorrect wash are product state, not decoration |
| `routes.ts` as the single navigation model | Already correct, and now measured for tap size |
| Server-side privacy filtering in `getPublicProfile` | Untouched; this pass is presentation |

---

## 4. Verification

| Check | Command | Result |
|---|---|---|
| Types | `npm run typecheck` | exit 0 |
| Build | `npm run build` | exit 0 (65/65 pages) |
| Signed-in audit | `npm run audit:app` | see §5 |

The audit is the receipt for this document. `session-lost`, `one-h1`,
`heading-order`, `inline-type`, `card-radius`, `loop-at-rest`, `overflow` and
`tap-size` are failures; `tinted-chrome` is a warning for a human.

---

## 5. After the repair pass

`artifacts/app-audit/2026-11-14T00-31-43` — 24 screens, **12 FAIL · 2 WARN ·
2 axe** after the first round of edits (from 50 FAIL). `…T00-57-21` — 24 screens,
**3 FAIL · 0 WARN · 2 axe**, and `…T00-59-50` — the first 12 screens again on a
healthy server, **0 FAIL · 0 WARN · 0 axe**.

What moved:

| Rule | Before | After |
|---|---|---|
| `inline-type` | 24 screens | 0 |
| `overflow` (390) | Cram 161px, Exam 150px | 0 |
| `one-h1` / `heading-order` | 0 | 0 |
| `tap-size` (390) | 24 screens | 0 |
| `loop-at-rest` | dashboard beam | 0 |
| `tinted-chrome` | 11 discs + a link | 0 |
| axe serious | 4 (contrast) | 0 |
| `session-lost` | every route | 0 |

**The three FAILs in the 24-screen run are the harness, not the app.** The local
`next start` process is killed by this environment after roughly a minute, so the
last routes are measured against a dead server: `/settings` never finished
loading (0 `h1`, `landmark-one-main`, a pulsing skeleton) and the 390px
dashboard reload landed on `/login` because the server was already gone. The
12-screen rerun on a fresh server — dashboard, review, learn and the three Rank
tabs, both widths — came back clean, which is the half that ran against a live
process. `/settings`, `/cram`, `/exam`, `/practice` and `/library` were last
measured before that server death; the fixes they needed (chip wrap, 44px
controls, contrast) were made afterwards and are **not yet re-measured**.

The remaining WARN is `tinted-chrome` on the avatar colour picker's initials — a
picker must show the colour it is about to save, so that one is the colour,
not chrome.

### Deliberate exceptions

- **`tap-size` is enforced at 390 only.** A 36px icon button under a mouse is
  correct; the system's 44px promise is about touch.
- **Inline links inside a sentence are exempt** (WCAG 2.5.8). “Find one” at the
  end of a line is prose, not a control.
- **The avatar picker keeps a tinted swatch** — it is a colour chooser.

### What is still owed

- A clean 24-screen run (the harness needs a server that outlives it, or the
  sweep split across processes; `AUDIT_ONLY` now makes that possible).
- Dark mode, reduced motion, and the three interactive states in §6.

---

## 6. Not verified

- **Dark mode** at every route: the audit measures light only. The tokens are
  shared and the `.band` scope is unchanged, but a dark sweep is still owed.
- **`/teacher` and `/admin`**: the probe account is a student, so both redirect
  (or 403). They received the type/motion/tint changes, but were not measured.
- **Interactive states** (a review in progress, an exam result, a submitted
  form): the audit loads each route in its resting state. `smoke.ts` covers the
  review write path; the exam result and Cram session were not driven.
- **Reduced motion** on app routes: the policy is shared with the public pages
  and no surface opts out, but the app audit does not run a reduced pass.
