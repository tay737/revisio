# Staff UX/UI audit — teacher and developer surfaces, 2026-11-14

Scope: every screen a `teacher` or `developer` account can reach, plus the staff
auth shell and the role gates that keep students out. Companion to
`FRONTEND-UX-UI-AUDIT-2026-11-14.md` (student/public surfaces); the rules are the
same — `docs/UI-SYSTEM.md`, WCAG 2.2 AA, the 44px house floor.

Evidence run: `npm run audit:staff` (`scripts/e2e/staff-audit.ts`) against the
production alias `https://revisio-srs.vercel.app`, plus three follow-up DOM probes
(`staff-probe*.ts`, since removed) that measured the exact overflowing element and
composited contrast. Real Chromium via `findChromium()`, dedicated probe accounts
(`ux-audit-teacher@revisio.probe`, `ux-audit-dev@revisio.probe`), light and dark,
1440px and 390px.

| Run | Target | Result |
|---|---|---|
| `npm run audit:staff` | production, teacher + developer + student-gate contexts | 17 screens, 4 axe findings, 0 page findings, 30 screenshots — report `artifacts/staff-audit/2026-11-14T13-29-36/report.json` |
| DOM probe | `/admin` @390 | `scrollWidth` 619 vs `clientWidth` 390 → +229px; root cause isolated to the feature-flag row |
| DOM probe | `/admin`, `/library` Marking tab | composited contrast pass over every text node except the badge chip children axe already flagged |
| Functional pass | teacher class/subject/member/progress/delete; admin approve/badge/season/topic/merge/progress | all writes succeeded, no page/console/network findings |

Verified clean (no action needed):

- **Role gates.** `/teacher` renders "Teachers only" and `/admin` "Developers only"
  for a student session; the student shell nav contains no Teaching/Admin links
  (`studentNavHasStaffLinks: false`).
- **Keyboard.** Tab order on the signed-in shell is logical (skip link → rail →
  top bar → content); every sampled stop shows a visible 2px `--ring` outline.
- **Responsive.** `/teacher`, `/library`, staff auth and every gate state: 0px
  overflow at 390. The `/admin` users table scrolls inside its own
  `overflow-x-auto` container and does not push the page.
- **Writes.** Class create/code-copy/member-add/progress-sheet/delete, subject
  create, badge mint, approval action, season editor, topic open/merge — all
  completed with success notices and no console/page/network findings.
- **Type scale, radii, inline px type, tinted chrome.** All `typeScale: []` and
  `findings: []` across the 17 screens.

Not assessed: screen-reader output (no AT available — accessibility claims rest on
the axe run, the accessibility tree and the keyboard probe), and the teacher
Import/Generate/Maths library tabs beyond their presence in the tab order (they
are shared student surfaces already covered by `audit:app`).

---

## Verification update, 14 Nov (frontend delivery `9c487b4`, re-audit on production)

`npm run audit:staff` re-run against the deployed build — report
`artifacts/staff-audit/2026-11-14T13-53-13/report.json` — plus a DOM probe that
isolated the residual overflow element:

- **SF2 closed.** axe `color-contrast` 4 → 0 on `/admin` at 1440 light, 1440 dark
  and 390. The ×N count now uses `text-background/60` and the remove control
  renders outside the inverted chip.
- **SF3 closed.** `smallTargets: []` on `/staff/login` and `/staff/register` at
  both viewports — the logo anchor holds 44px.
- **SF4 closed.** No small target on the range input; the shared
  `input[type='range']` rule now gives a 44px hit area with the 6px track painted
  as a centred gradient.
- **SF1 partially closed.** `/admin` @390 overflow dropped +229px → +33px
  (`scrollWidth` 423 vs 390). The flag-description `break-all` worked; the
  residual is the new badge row: the `span.flex.items-center.gap-1.5` group
  (chip + "Remove badge …" ghost button, ~316–386px, atomic) cannot wrap inside
  the 316px card row. Returned to frontend with the fix spec (`flex-wrap` on the
  group and/or a shorter visible label). Acceptance: `scrollWidth ===
  clientWidth` at 390, axe still clean.
- One expected-conflict 409 (`create_subject` "UX Audit Subject" already exists)
  was logged; `teacher/page.tsx:122` surfaces it in the bad `Notice` — correct
  error UX, fixture artifact only.

---

## 1. Summary

The staff surfaces are in better shape than the student app was at the start of
this audit: one shell, one button grammar, inline confirms instead of native
dialogs, and every write path exercised clean. The teacher console in particular
is tight — create class, copy code, add member, read progress, delete, all with
visible feedback and no dead ends found.

The developer console has two real defects, both on `/admin` and both machine-
measured: a 229px horizontal overflow on phones caused by one feature-flag row
printing raw JSON, and a serious colour-contrast failure inside the inverted
"chip-active" badge where muted and destructive text sit on the flipped surface.
Two smaller items: the staff auth logo link is 36px tall against the 44px house
floor, and the cloze-marking typo slider is a 6px-tall target.

Nothing found suggests the information architecture is wrong — the admin page is
long (14 sections) but each card is self-contained and the order (content →
approvals → queue → coverage → seasons → subjects → marking → algorithms → flags →
badges → users → classes → audit log) matches how a developer actually works
through it.

## 2. Top actions, ranked

1. **SF1** — stop the `/admin` mobile overflow (one class on one element).
2. **SF2** — fix contrast inside `chip-active` badges on `/admin` (axe serious).
3. **SF3** — raise the staff auth logo link to the 44px floor.
4. **SF4** — give the range slider a real hit area.

## 3. Scorecard

| Surface | Viewports | Axe | Overflow | Small targets | Contrast | Keyboard | Verdict |
|---|---|---|---|---|---|---|---|
| `/staff/login` | 1440 / 390 / dark | clean | 0 | logo link 36px (SF3) | pass | n/a | pass with SF3 |
| `/staff/register` | 1440 / 390 | clean | 0 | logo link 36px (SF3) | pass | n/a | pass with SF3 |
| `/teacher` | 1440 / 390 / dark | clean | 0 | none | pass | shared shell | pass |
| `/library` (staff tabs) | 1440 / 390 / dark | clean | 0 | slider 6px (SF4) | pass | shared shell | pass with SF4 |
| `/admin` | 1440 light+dark | **4× serious** (SF2) | **+229px @390** (SF1) | none | **fail** (SF2) | shared shell | **fail — SF1, SF2** |
| Gates (`/teacher`, `/admin` as student/teacher) | 1440 | clean | 0 | none | pass | n/a | pass |

## 4. Findings

### SF1. `/admin` overflows horizontally by 229px on a 390px phone

- **Route/state:** `/admin`, populated developer session, 390×844.
- **Source:** browser (DOM probe) + code.
- **What:** `documentElement.scrollWidth` is 619 against a 390 viewport. The
  culprit is the Feature flags card: the `cloze_marking` flag's description is a
  raw JSON blob (`{"default":{"mode":"similar","typoThreshold":0.75,…}}`) with no
  break opportunities, rendered in
  `src/app/(app)/admin/page.tsx:520` inside
  `div.min-w-0 > p.t-caption.text-muted-foreground`. The paragraph's scrollWidth
  is 566px in a 190px box with `overflow: visible`, and the excess propagates all
  the way up through `section.card` → `main` → body. The users table is *not* the
  cause — it is correctly clipped by its own `overflow-x-auto`.
- **Why it matters:** the whole page scrolls sideways on the exact viewport the
  audience's phones use; every section drifts with it.
- **Fix:** let the description break anywhere — `wrap-anywhere` (or `break-all`)
  on the flag description paragraph at `admin/page.tsx:520`. Optionally also
  store a human-readable description for `cloze_marking` instead of raw JSON, but
  the CSS fix is the contract: no flag description may push the page.
- **Severity:** high · **Effort:** XS · **Confidence:** certain (measured).

### SF2. Serious colour-contrast failure inside `chip-active` badges on `/admin`

- **Route/state:** `/admin`, Profile badges card, light **and** dark.
- **Source:** axe-core (`color-contrast`, serious) + composited contrast probe.
- **What:** `Badge variant="chip-active"` flips the surface
  (`.chip-active { background: var(--foreground); color: var(--background) }`,
  `globals.css:914`). Inside it, two children keep their page-level ink:
  - the grant count `×N` — `num t-fine text-muted-foreground`
    (`admin/page.tsx:548`);
  - the `InlineConfirm` remove button — `btn-ghost … text-destructive-ink`
    (`src/components/ui/inline-confirm.tsx:44`).
  Measured: light theme 3.24:1 (count) and 3.42:1 (remove); dark theme 2.19:1 and
  2.27:1. All below the 4.5:1 AA floor for small text.
- **Why it matters:** the count and the delete affordance are the two things a
  developer most needs to read on that chip, and they are the two that fail.
- **Fix:** children of an inverted chip must use the inverted pair, not the page
  tokens. Either render the count as `text-background/60` (or
  `color-mix(in oklab, var(--background) 60%, transparent)`) and give
  `InlineConfirm` an inverted-on-dark variant, or — cleaner — take the remove
  control out of the `chip-active` badge and sit it beside the chip as a normal
  ghost button. Same rule for any future child of `.chip-active`.
- **Severity:** high · **Effort:** S · **Confidence:** certain (axe + probe).

### SF3. Staff auth logo link is 36px tall — under the 44px house floor

- **Route/state:** `/staff/login` and `/staff/register`, 1440 and 390.
- **Source:** browser (`smallTargets`) — `a "RRevisio" 105×36` on all four runs.
- **What:** the logo anchor in the staff auth shell is 105×36. WCAG 2.5.8's 24px
  minimum passes, but the house rule (`UI-SYSTEM.md` §10, and F15's precedent on
  the student shell) is 44px at every width.
- **Fix:** raise the anchor's hit area to `min-h-11` (44px) — padding or a
  `min-height` on the link, keeping the visual logo unchanged.
- **Severity:** medium · **Effort:** XS · **Confidence:** certain.

### SF4. Cloze-marking typo slider is a 6px-tall target

- **Route/state:** `/library` → Marking tab (teacher and developer), and the
  matching section on `/admin`; the `input[type=range]` at
  `src/app/(app)/library/ClozeMarking.tsx:212-221` styled by
  `globals.css:1044-1050` (`height: 6px`).
- **Source:** browser — measured `h=6` (w=475/316) on both viewports.
- **What:** the input's clickable box is 6px tall. The 26px thumb is painted
  larger but the track — which is also click-to-seek — offers a 6px vertical
  target, under WCAG 2.5.8's 24px floor and far under the house 44px.
- **Fix:** keep the 6px *visual* track but give the input a real hit area —
  e.g. `height: 24px`+ on the input with the track drawn via a centred
  `linear-gradient` background (thumb stays 26px), or wrap it in a padded hit
  area. Apply in the shared `input[type='range']` rule so every slider inherits it.
- **Severity:** medium · **Effort:** S · **Confidence:** certain (measured);
  the precise pointer hit-region of the overflowing thumb was not isolated, so
  treat 24px as the acceptance floor, 44px as the goal.

## 5. Risks

- `/admin` is the longest page in the app (14 sections, ~1,750 words). It works,
  but a developer on a phone scrolls a very long document; if SF1's fix reveals
  more wide content inside the flags/algorithms cards, expect a second pass.
- The `chip-active` inversion is a shared class — SF2's fix must not special-case
  admin; check every `chip-active` consumer for muted/destructive children
  (`admin/page.tsx:184,240,289,709` and wherever teachers see worn badges).
- Flag descriptions live in the database. If `cloze_marking`'s description is
  ever rewritten as prose the overflow disappears by accident — the CSS fix is
  still required so the next JSON-valued flag cannot regress it.

## 6. Actions

1. Frontend: fix SF1–SF4 per §4 (all in `src/app/(app)/admin/page.tsx`,
   `src/app/(app)/library/ClozeMarking.tsx` or `globals.css`, and the staff auth
   shell component).
2. UX audit re-runs `npm run audit:staff` against the deployed build and
   re-probes `/admin` @390 and the badge chip in both themes.
3. On pass: hand the staff surfaces to QA with this document and the report
   path. On fail: return to frontend with the deltas.

## 7. Open questions

- Should flag descriptions keep embedding raw JSON at all? A human-readable
  description plus a "view config" expander would read better, but that is a
  content/design decision for the developer, not a defect.
- The admin page has no section-level navigation. At 14 sections on mobile,
  a sticky sub-nav or collapsible cards may be worth a follow-up — raised as a
  question, not a finding, since nothing measured fails because of it.

## 8. What is good

- `InlineConfirm` is the right pattern and it is used consistently — consequence
  sentence first, destructive styling, no `window.confirm` anywhere in staff.
- Empty states are honest ("No classes yet", "No badges minted yet") and the
  gated states ("Teachers only" / "Developers only") are single-purpose screens
  with one heading and one way out.
- The users table's `overflow-x-auto` wrapper means wide tabular data degrades
  by scrolling, not by breaking the page — SF1 is the one place that rule was
  missed.
- Teacher writes all round-trip with notices and restore cleanly; the class
  delete path used the same inline-confirm grammar as badge deletion.
