# Admin progress/insights UX audit — 2026-11-14

Scope: `/admin` user-management table and the `StudentProgressPanel` insights
sheet it opens (shared with `/teacher` roster). Audited against production
(`revisio-srs.vercel.app`) with Playwright at 1440×900 and 390×844, light and
dark, against the data-rich account (1,132 reviews) and an empty fixture.

Probe: `scripts/e2e/admin-insights-probe.ts` · reports in
`artifacts/admin-insights/2026-11-14T15-28-50/report.json` (+ `expand-check`).

## What already passes

- Sheet: axe 0 violations, no page/dialog horizontal overflow, Escape closes,
  focus returns to the "Progress" trigger, body scroll locked, no sub-44px
  targets, loading + error states present.
- "Show all 60" expands 8 → 60 card rows (~1.8s settle, 132 `li`, no jank).
- Insights numbers, SRS ladder, struggling list, recent answers all render.

## Findings

### AP1 — Role change fires instantly, no confirmation (critical)
`admin/page.tsx:641-652` — the role `<NativeSelect>` calls `act()` on
`onChange`. One stray selection promotes or demotes an account to/from
`developer` with zero friction or undo. Every other privileged action on the
same row goes through `InlineConfirm`; this one doesn't.
**Fix:** confirm before `set_user_role` — `InlineConfirm`-style dialog naming
the user and the role ("Make Tay a developer? They get admin access."), or a
two-step "select → Save role" pattern.

### AP2 — Badge and class chips revoke/remove on a single click (high)
`admin/page.tsx:665-675` (badge) and `:739-750` (class) — clicking a worn
chip/`chipActive` badge immediately revokes the badge or removes the class
membership. The only hint is a 10px `×` icon and a `title` tooltip (dead on
touch). Destructive, irreversible-looking, one tap.
**Fix:** route both through `InlineConfirm` (same pattern as "Sign out
everywhere" two cells to the right), or split view/edit: chips display state,
a dedicated remove affordance confirms. Keep the accessible name
("Revoke badge X from Tay").

### AP3 — Staff cannot read the learner's actual answers (high)
`InsightsBody.tsx:222-226` — `userAnswer` renders in a `<code>` chip capped
at `max-w-[40%]` with `truncate`; the full text exists only in `title`, a
hover-only tooltip unreachable on touch and keyboard. Prompts
(`:215-217`, `:255`) truncate the same way with no fallback. For a progress
insights tool this hides the single most diagnostic datum — what the learner
actually typed.
**Fix:** make answer/prompt text expandable in place (tap/Enter toggles full
text, or a detail disclosure per row). At minimum, keyboard-focusable full
text — `title` alone fails WCAG 1.4.13-ish expectations and touch entirely.

### AP4 — Desktop sheet metaphor and navigation (medium)
`StudentProgressPanel.tsx:41-46` — `side="bottom"`, `max-w-[720px]`, renders
792px tall in a 900px viewport: effectively a modal page wearing a bottom-
sheet costume, centred, covering 88% of the screen. No prev/next between
users — reviewing a class means close → scroll table → find next → reopen.
**Fix:** on `sm+` viewports use a right-side sheet (or a centred dialog
with honest proportions); add prev/next user controls fed by the table's
user list. Keep bottom-sheet on mobile — it's correct there.

### AP5 — Users table is a control wall; page is 12k–21k px (medium)
`admin/page.tsx:618-847` — every row carries role select + badge cluster +
class cluster + status + 2FA + up to 4 action buttons (170px desktop,
400px mobile per row; page scrollHeight 12,132 @1440 / 21,281 @390 with 11
users). No search, filter, or sort. Badge/class pickers expand *inside* the
row, doubling its height.
**Fix:** collapse per-user management into a "Manage" disclosure or move
badges/classes/role into the progress sheet's header area (one place per
user); add a filter input over name/email; keep the table scannable —
identity, role, status, 2FA, actions.

### AP6 — 2FA column is icon-only and aria-hidden (medium)
`admin/page.tsx:793-799` — `<Icon aria-hidden>` for `totpEnabled`; the cell
has no text or `aria-label`, so screen readers announce an empty cell. The
enabled/disabled meaning exists only visually (green vs grey glyph).
**Fix:** `aria-label={u.totpEnabled ? 'Two-factor on' : 'Two-factor off'}` on
the cell/icon, or render "On"/"Off" text.

### AP7 — Held achievements are `disabled` buttons (low-medium)
`admin/page.tsx:708-718` — granted achievements render `disabled`, which
removes them from tab order and (with `title` only) hides *why* they're
disabled from keyboard/SR users.
**Fix:** keep focusable with `aria-pressed`/`aria-disabled` + visible "held"
state, or render held achievements as non-interactive badges outside the
picker.

### AP8 — Minor polish (low)
- Duplicate accessible name: sr-only `SheetTitle` "Progress for Tay" +
  visible `<h2>Tay</h2>` — screen reader hears the name twice. Drop one.
- "Due now" stat uses destructive/alarm styling whenever `dueCount > 0`
  (`InsightsBody.tsx:118`) — due cards are a normal state, not an alarm;
  reserve alarm for genuinely bad signals (e.g. accuracy < 60%).
- `when()` granularity: "1m ago" vs "4h ago" is fine, but "last miss 1m ago"
  on a 30-day window reads oddly — consider date for >24h.

## Acceptance criteria for the fix pass

1. No privileged/destructive user action completes without an explicit
   confirm (role change, badge revoke, class removal, suspend, session
   revoke). `act()` calls for these go through `InlineConfirm` or equivalent.
2. Full answer/prompt text readable by tap and keyboard inside the sheet.
3. Sheet is a side panel on `sm+`, bottom sheet on mobile; prev/next user
   navigation present.
4. Users table scannable: filter box; badges/classes/role management not
   permanently expanded per row.
5. 2FA state announced to AT; held achievements reachable by keyboard.
6. Re-run `npm run audit:staff` + this probe: 0 axe, `smallTargets: []`,
   `docOverflowX: 0`, sheet `innerOverflow` only `truncate`/`sr-only` noise.
