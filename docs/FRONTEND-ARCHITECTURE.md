# Frontend architecture

Status: **plan for the UI/UX rework** (2026-11-13). This document describes the
structure the frontend is moving to, the component contracts it will be built
from, and the order in which the move happens. The design rules themselves are in
`docs/UI-SYSTEM.md`; the findings that motivate the rework are in
`docs/ONBOARDING-REVIEW.md`.

Scope: the web frontend (Next.js App Router) — onboarding first, then app
surfaces. Backend layering is unchanged and remains described by
`docs/ARCHITECTURE.md` §18–§22.

---

## 1. Stack decisions

| Decision | Choice | Why |
|---|---|---|
| Animation runtime | **`motion` (`motion/react` v13)** — one runtime | Already the app standard; `MotionConfig` + `AnimatePresence` handle enter/exit and reduced motion declaratively; springs for taps. The direct `framer-motion@^11` dependency was removed: `motion` v13 already ships `framer-motion@^13` as its engine, so the tree had two copies of one runtime. One copy, one import path. |
| CSS motion | **CSS transitions/keyframes only for press, hover, lip, meter** | A tap must respond before React can; the lip is a `:active` box-shadow, not a JS animation. |
| Route transitions | **None** (entrance only) | `AnimatePresence mode="wait"` inserts a dead beat per navigation; the current "animate in, unmount outgoing" rule stays. |
| View Transitions API | **Theme toggle only** | Already implemented in `animated-theme-toggler`; it is chrome, not content, and degrades to a cross-fade. |
| Component primitives | **shadcn (Base UI, `base-maia`)** — kept, owned locally | `components.json` + tokens are already wired; components live in the repo, so they can be edited to the language instead of wrapped. No second kit. |
| Effect components | **Magic UI effects retired from product surfaces** | They are locally vendored code (not a dependency), so removal is safe; `ShimmerButton`, `MagicCard`, `BorderBeam`, `GlareHover` stop being used in onboarding/app. |
| Icons | `lucide-react` behind `components/ui/icons.tsx` | One registry, semantic keys; call sites never import the library. |
| Styling | Tailwind v4 `@theme` + token classes in `globals.css` | Single source for values; utilities read live variables so `.band` and `.dark` re-resolve. |
| Data | SWR for remote state (`lib/useMe`, `lib/useRanked`), server components for shells | Unchanged; the rework does not introduce a state library. |

**Why not GSAP / Anime.js / React Spring.** GSAP is imperative and timeline-based;
the interactions here are state-driven (a notice entering, a step leaving, a
sheet opening) and need declarative exit animation with React ownership.
React Spring is a fine runtime but would be a second one alongside `motion`,
with its own reduced-motion story and bundle. Nothing here needs a scroll
timeline, which is the one thing GSAP would win.

**Bundle rule.** At most one JS animation runtime reaches the client. `motion`
is imported through `motion/react` only; `lib/motion.ts` is the only module that
declares timings; page code imports tokens and variants, never raw durations.

---

## 2. Layering

```
src/app/**                  routes: composition + data loading
  └── src/components/**     presentation (see §5 for the four families)
        └── src/lib/**      policy and logic: api, motion, theme, profile, username
              └── src/domain/**   pure maths: srs, grading, gamification, ranked, seasons
src/services/**             server-only use cases
src/db/**                   pools, schema, sync
```

Rules that are already enforced and must survive the rework:

- **Imports point down only.** `app → components → lib → domain`. A component
  never imports from `app`; `lib` never imports React.
- **`server-only` never enters a client component.** Shared validation lives in
  `lib/*` (client-safe), and server modules import it.
- **Never import a value from a `'use client'` module into a server module** — a
  re-export is enough to break the build (`buttonVariants` lives in `lib/` for
  exactly this reason).
- **The client never talks to Postgres or Supabase.** `lib/api.ts` holds the
  token and the refresh dance.
- **One owner per piece of state** (see §3). Two owners is how the auth shells,
  the card recipes and the motion policy drifted in the first place.

---

## 3. Ownership

| State / concern | Owner | Not allowed |
|---|---|---|
| Motion policy (OS + account preference) | `components/ui/motion/motion-provider.tsx` | a page-level `MotionConfig` override |
| Motion values | `lib/motion.ts` | inline durations/easings |
| Theme | `lib/theme.ts` + `theme-toggle` | a second `localStorage` key |
| Session / `/me` | `lib/useMe.ts` | page-local `useSWR('/me')` |
| Rank + gamification payload | `lib/useRanked.ts` | reassembling the response per page |
| Navigation destinations | `components/nav/routes.ts` | arrays inside shell components |
| Voice (greeting, companion, empty states) | `lib/profile.ts` | copy written inline in a page |
| Design tokens | `globals.css` | inline hex, inline px type |
| Onboarding step order and validation | `components/onboarding/steps.ts` (new) | spread across the wizard JSX |
| Button variants | `lib/button-variants.ts` | per-call-site class strings |

---

## 4. Routes and the onboarding journey

### 4.1 Map

| Route | Rendering | Purpose |
|---|---|---|
| `/` | static / RSC | Landing: claim, fact, live demo, ladder, close |
| `/register` | RSC shell + client wizard | Five-step sign-up |
| `/verify-email` | RSC shell + client status | Token verification, resend |
| `/login` | RSC shell + client form | Sign in, 2FA second stage |
| `/forgot-password` | RSC shell + client form | Neutral reset request |
| `/reset-password` | RSC shell + client form | Token + new password |
| `/staff/login`, `/staff/register` | RSC shell | Hidden staff portal |
| `/dashboard`, `/review`, `/learn`, `/progress`, … | `(app)` group | Signed-in product |
| `/u/[handle]` | RSC | Public profile (privacy filtered server-side) |

### 4.2 Journey states

```
anonymous ──register──> registering ──submit──> unverified
   │                                               │
   └──login───────────────────────────────────────>│
                                                   ▼
                                            authenticated ──> onboarded
                                                   │
                                    (staff) pending_approval ──approve──> authenticated
```

- **unverified** is a real state, not an error: `/verify-email` is the only place
  that resolves it, and every entry point into it must say so in the same words.
- **pending_approval** applies to staff only. The copy names who acts (a
  developer) and what happens next (an email).
- **onboarded** means the learner has at least one subject followed; until then
  the dashboard shows the first-run companion card rather than an empty grid.

### 4.3 Registration: steps as data

The wizard stays one `<form>` (Enter advances; focus moves to the new step's
heading; the progressbar keeps `aria-valuetext`). What changes is that the steps
become declarative and the content becomes value-first.

**Target order**

| # | Step | Asks | Why here |
|---|---|---|---|
| 1 | Goal | Student or teacher | Splits the flow; one decision, one screen |
| 2 | Study | Level (GCSE / A-level / IB / University / Other) and subjects | The most useful signal, asked while motivation is highest |
| 3 | Account | Name, email, password | The friction point comes after the investment |
| 4 | About you | Date of birth → guardian consent only when required | Collected solely because consent depends on it |
| 5 | Confirm | Review rows + Create account | Re-validates every earlier step |

**Step model**

```ts
// components/onboarding/steps.ts
export type Role = 'student' | 'teacher';
export type Level = 'gcse' | 'alevel' | 'ib' | 'university' | 'other';

export type StepKey = 'goal' | 'study' | 'account' | 'about' | 'confirm';

export type Step = {
  key: StepKey;
  label: string;            // the progress caption
  title: string;            // the step heading (names a noun)
  validate: (draft: Draft) => FieldError[]; // per field, not one string
  appliesTo: Role[];
};
```

Rules:

- **`validate` returns per-field errors** (`{ field, message }[]`), so the error
  renders under its control (§8.3 of the UI system) and focus goes to the first
  failing field.
- **One draft object** (`useReducer` or a single state object) — no seven
  `useState` calls that must be kept in sync by hand.
- **Persistence is limited and explicit.** `sessionStorage['revisio.register.v1']`
  holds `{ stepIndex, role, level, subjectIds }`. It never holds name, email,
  password or date of birth. Cleared on success and on "start over".
- **Back never loses work.** Going back keeps the draft; the confirm step's
  "Edit" jumps to the step that owns the row.
- **The submit re-validates all earlier steps** (already implemented) so a value
  edited on confirm cannot slip past.
- **One request, one contract.** `POST /api/v1/auth/register` with
  `{ email, password, name, requestedRole, role, subjectIds, classCode,
  dateOfBirth, ageConsent, level }`. `level` is additive; the API ignores unknown
  fields only if it already validates with a schema — it does not, so the field
  must be added server-side in the same change (§6.2).

**Error taxonomy** — one sentence per code, one owner:

| Code | Where it renders | Sentence |
|---|---|---|
| `email_taken` | under Email | "That address already has an account. Sign in instead." |
| `email_unverified` | under Email + resend action | "Check your inbox for the verification link, or send it again." |
| `rate_limited` | form-level notice | "Too many attempts. Try again in a few minutes." |
| `age_consent_required` | under the consent checkbox | "A parent or guardian must confirm consent before the account can be created." |
| `subject_unavailable` | form-level notice, step 2 | "That subject is not available right now. You can pick it later." |

**Events** (no PII, one module `lib/analytics.ts`):

- `onboarding_step_viewed { step, role }`
- `onboarding_step_completed { step }`
- `onboarding_failed { step, code }`
- `onboarding_completed { role, level }`

If no analytics sink exists, these are typed no-ops — but the call sites exist so
the funnel is measurable when a sink is added.

### 4.4 Landing page plan

One idea per screen, in order:

1. **Hero** — `h1` names the category and the buyer ("Revision that schedules
   itself, for GCSE to university"), one hard fact (free to start / ten minutes a
   day), the primary action, and the *real* review card (`ReviewDemo`) at real
   size. One entrance on load. No grid, no beam, no glare.
2. **The queue** — how a card comes back when it is about to be forgotten, with
   the forgetting-curve control (already built).
3. **What it is made of** — notes behind cards, past papers marked against the
   scheme, three cards, one icon each.
4. **The ladder** — rank as a record of retained work. One band, crests in their
   metals, no confetti.
5. **Close** — one action, one fact, footer.

Copy rules are in `docs/UI-SYSTEM.md` §9. The hero is not allowed a second
effect: if the demo card is alive, nothing behind it moves.

---

## 5. Component architecture

### 5.1 Families

```
src/components/
  ui/            primitives: Button, Card, Field, Input, Label, Notice, Sheet,
                 Tabs, Badge, Progress, Skeleton, Avatar, icons
  onboarding/    AuthShell, RegisterWizard, steps.ts, AuthForm, RecoveryForms
  marketing/     Hero, DemoSection, LadderBand, Close, (moved out of app/page.tsx)
  app/           AppShell, nav/*, companion, rank/*, insights/*, content/*
  landing/       the live demos (ReviewDemo, ForgettingCurve, WordReveal)
```

Rules:

- **`ui/` knows no product copy.** A primitive takes strings, never decides them.
- **A page composes; it does not re-specify.** No page creates a button, card,
  field or notice of its own.
- **A client boundary is explicit and small.** `'use client'` starts at the
  interactive leaf (the wizard, the form, the toggle), not at the page shell.
- **No component imports another family sideways.** `onboarding` may use `ui`;
  `ui` may not use `onboarding`.

### 5.2 Target primitives

Add:

| Primitive | Contract |
|---|---|
| `Field` | label + hint + control + error slot; ids wired; `aria-describedby` per field |
| `Stepper` | progressbar with `aria-valuetext`, one track/fill style |
| `EmptyState` | icon, one sentence, one action — used by every empty list |
| `Sheet` | already present; standardise header/close (one X, `showCloseButton={false}` when custom) |
| `SegmentedControl` | replaces the hand-rolled `.segment` buttons |

Retire from product surfaces: `ShimmerButton`, `MagicCard`, `BorderBeam`,
`GlareHover`, `AnimatedShinyText`, `ScrollProgress`, `ScrollReveal`-style use of
`BlurFade` on sections beyond the hero.

`BlurFade` stays as the one entrance primitive, but may only be used for the
first screen's entrance (a page body does not fade in section by section).

### 5.3 CSS structure

`globals.css` is currently one large file. Split it, keeping the import order:

```
src/app/globals.css        → @import 'tailwindcss'; @import tokens; base; components; motion
src/styles/tokens.css      :root, .dark, .band, @theme
src/styles/base.css        reset, html/body, focus, selection, scrollbars
src/styles/components.css  .btn*, .card*, .input, .chip, .badge, .meter, .option, .rail, .skip-link
src/styles/motion.css      keyframes, reduced-motion branch
```

Rules: `@theme` stays at the top level of the entry file (Tailwind v4 requires
it); no page-level stylesheet; a new class is added to the family it belongs to,
never to a page.

---

## 6. Design-system implementation

### 6.1 Tokens

- Colour, radius and surface: `globals.css` (`:root` / `.dark` / `.band` /
  `@theme`). One definition each; a value used twice is a token.
- Type: the `.t-*` classes. A new size means a new class and a row in
  `docs/UI-SYSTEM.md` §5 — never an inline value.
- Motion: `lib/motion.ts`. A new gesture means a named export and a row in the
  motion table.

### 6.2 Adding a field (the four-place rule)

Registration's new **level** is a `users` column, so it follows the rule already
documented for profile fields:

1. Column + drizzle migration, applied to **Supabase and the Neon mirror**
   (`0011`/`0012` show the pattern; the mirror has no `revisio_app` role, so
   resolve the role instead of hardcoding it).
2. `db/schema.ts` and the duplicate `ProfileVisibility`/user type in `lib/useMe.ts`
   if the field is exposed on `/me`.
3. The service that reads/writes it (`services/profile.ts` for visibility,
   `auth/register` for sign-up).
4. The UI that collects and displays it — plus the native clients' generated
   constants if it becomes a shared rule.

The Neon mirror needs the column by hand: `sync`'s `upsertRow` only writes
columns the target has, so a missing column silently drops the value.

### 6.3 Native parity

`npm run native:generate` emits Theme, Icons, AccountRules, RankLadder and
SrsLadder from web sources. Any change to a token, a motion value, the username
or pronouns rules, or the rank ladder requires:

```bash
npm run native:generate
npm run vectors:copy      # freezes ranked.ts + profile.ts copy for both engines
npm run native:ios:build  # the only check that sees #if os(iOS) scope errors
```

Changing web copy that the native `CopyConformanceTest(s)` replay will fail both
native suites until the generated vectors are refreshed. That is intended.

---

## 7. Migration plan

Each phase is shippable on its own and must leave the app working.

### Phase 0 — Foundation (this pass, partially done)

- [x] One animation runtime (`framer-motion` removed).
- [x] One motion policy (landing opt-out removed).
- [x] One auth shell (`verify-email` moved into `AuthShell`).
- [ ] Split `globals.css` into `styles/*` (tokens first).
- [ ] Add `Field` and migrate `AuthForm` / `RegisterWizard` to per-field errors.
- [x] Collapse `MagicCard` + `Card` into one card on every auth surface.
- [x] Replace `ShimmerButton` with `Button` on auth and wizard submits.
- [x] Rebuild the landing hero to one screen with category, audience and facts;
      remove the effect stack (`BorderBeam`, `GlareHover`, `AnimatedGridPattern`,
      `AnimatedShinyText`, `ScrollProgress`, `WordReveal`, `NumberTicker`).

**Gate:** `npm run typecheck` + `npm run build`; `/login` and `/register` render
with one button style and one card radius (manual read of the DOM).

### Phase 1 — Onboarding

- Land the hero plan (§4.4): new `h1`, one entrance, demo at real size, no
  effect stack.
- Reorder the wizard, add level, add step persistence and the error taxonomy.
- `AuthShell` v2: one header, one overlap, one footer node, one loading state.
- Verify/forgot/reset: same shell, same notice vocabulary, same success rules.

**Gate:** keyboard-only completion of register → verify → login; a11y pass
(headings, labels, errors, focus); reduced-motion pass shows a complete page
with no motion.

### Phase 2 — App surfaces

- Dashboard, review, learn, progress, library to the same card/type system.
- Remove section-level entrance animations; keep the study loop's feedback.
- One empty-state primitive; one page-header treatment; one stat row.
- Nav: confirm one model (`routes.ts`) and the mobile sheet's single close.

**Gate:** `npm run e2e:smoke` on the throwaway probe account, with restore
receipt; axe light/dark.

### Phase 3 — Parity and polish

- Regenerate native clients; run `vectors:copy`; iOS release build.
- Screenshot matrix at 390 / 768 / 1024 / 1440, light and dark.
- Perf: no new JS runtime, no font growth, no layout shift on the landing.

**Gate:** `npm run native:generate && npm run vectors:copy && npm run native:ios:build`;
perf pass with no regression against the current numbers.

---

## 8. Verification

Run in this order; a green earlier step does not cover a later edit.

| Check | Command | Covers |
|---|---|---|
| Types | `npm run typecheck` | every edited file |
| Build | `npm run build` | client/server boundaries, `server-only`, route handlers |
| Public UX | `npm run e2e:public-ux` | 102 checks, axe light/dark, no credentials, writes nothing |
| Design capture | `npm run design:shots` | Screenshots + measured geometry at 1440/1280/768/390, light/dark, reduced motion (`artifacts/design/`) |
| Signed-in smoke | `npm run e2e:smoke` | probe account; snapshots and restores fields |
| Content rules | `npm run verify:content` | visibility + import/merge, when content is touched |
| Native | `npm run native:generate`, `npm run vectors:copy`, `npm run native:ios:build` | generated constants and the iOS target |

**Gaps to close (new checks the rework should add):**

1. `scripts/verify-tokens.ts` — assert every `.chip`/`.badge`/`.btn` colour pair
   resolves (no `var(--undefined)`), and every `--ink-*`-style name is defined.
   This would have caught the dead `.chip` declaration.
2. A reduced-motion browser pass on `/` and `/login`: content visible, no
   transform-driven entrance, no looping decoration.
3. A "one primary per viewport" check on onboarding routes.
4. A copy-lint pass for the onboarding strings (no exclamation marks, no
   "Oops", buttons as verb + object).

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| Token renames break the native generators silently | `npm run native:generate` in the same change; it is the only path that writes `Theme.kt/.swift` |
| CSS split changes cascade order | Keep the import order tokens → base → components → motion; verify computed styles on `/login` and `/dashboard`, not just screenshots |
| `@theme` moved out of the entry file | It must stay at top level in `globals.css` (Tailwind v4 constraint) |
| New `level` column missing on the Neon mirror | Apply by hand to both databases; `upsertRow` drops unknown columns without an error |
| Onboarding rewrite breaks the probe-account smoke | The smoke drives real copy; update assertions in the same change, never weaken the finding rules |
| Removing Magic UI components leaves dead imports | Delete the component files only after the last usage is gone; they are local code, not a dependency |
| `motion` v13 API drift (`motion/react` vs `framer-motion`) | One import path; a grep gate in review: `grep -rn "from 'framer-motion'" src` must be empty. `framer-motion` stays in the lockfile as `motion`'s engine — that is expected, not a duplicate. |

---

## 10. Non-goals

- No second component kit, CSS framework, state library or animation runtime.
- No design-token pipeline (Style Dictionary, Figma sync) — the token file is the
  source for now.
- No dark marketing page or theme-by-scroll.
- No redesign of the study loop's grading feedback beyond the shared tokens.
- No change to authentication, authorization, sync or scheduling behaviour.
