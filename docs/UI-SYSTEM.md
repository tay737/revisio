# UI system

Status: **current design language** (2026-11-13). This file is the executable
specification for how Revisio looks, moves and behaves. It replaces
`docs/DESIGN-UBER.md` and `docs/DESIGN-DUOLINGO.md` as *rules*; those two stay in
the repository as historical references for where the language came from, and
nothing may be built from them that contradicts this file.

Values live in one place each. If this document and the code disagree, the code
wins and this file is wrong — fix it in the same change.

| Concern | Owner |
|---|---|
| Colour, type, radius, surface, control, band tokens | `src/app/globals.css` (`:root` / `.dark` / `.band` / `@theme`) |
| Motion: durations, easings, springs, variants | `src/lib/motion.ts` |
| Motion policy (reduced motion, account preference) | `src/components/ui/motion/motion-provider.tsx` |
| Primitives (button, card, field, notice, sheet, tabs) | `src/components/ui/` |
| Button variant table | `src/lib/button-variants.ts` |
| Icons (one set, semantic keys, never raw lucide at call sites) | `src/components/ui/icons.tsx` |
| Destinations and their labels | `src/components/nav/routes.ts` |
| Voice: greeting, companion, empty states | `src/lib/profile.ts` |
| Rank maths and tier metadata | `src/domain/ranked.ts` |

---

## 1. Positioning

**A quiet study instrument with a ladder.**

Revisio is used by 13-year-olds and by final-year undergraduates. The surface
must never talk down to the older one or feel forbidding to the younger one. The
resolution is to be *plain and confident*, not playful and not corporate:

- The work is the picture. A real review card, a real queue, a real note, a real
  ladder. Never a decorative mock dashboard.
- Gamification is framed as a **record**, not a reward: "what you have retained",
  not "you unlocked a trophy". Crests and metals live inside rank surfaces only.
- No mascots, no confetti outside a milestone, no exclamation marks in chrome.

If a screen would look childish to a 21-year-old, it is wrong. If it would look
cold and administrative to a 14-year-old, it is also wrong.

---

## 2. Principles

1. **One screen, one job.** One `h1`, one primary action, one idea. A screen that
   argues two things argues neither.
2. **One system.** One button, one card, one field, one shell, one radius family,
   one link look. A second recipe is a bug even when it looks fine.
3. **Motion is feedback, never atmosphere.** If an animation does not explain a
   state change, it is decoration and it goes.
4. **Colour is state.** Ink is navigation. Colour appears only where the product
   has something to report (correct, wrong, streak, gold, note).
5. **Plain words.** Buttons are a verb and an object. Headings name a thing.
   Errors say what to do next. The interface never congratulates itself.
6. **Legible by default.** Contrast, target size, focus and reduced motion are
   floors, not polish.

---

## 3. Colour

### 3.1 Chrome

A two-colour duet — ink on canvas — over a grayscale ramp. Chrome never uses a
hue. Cards are flat with a hairline; depth comes from changing the surface, not
from shadows.

| Token | Means |
|---|---|
| `--background` / `--foreground` | the page ground and its ink |
| `--card` | a raised-by-colour surface (still Level 0, no shadow) |
| `--secondary`, `--muted` | quieter fills: wells, rails, soft cards |
| `--muted-foreground` | secondary text, labels, meta (≥ 4.5:1 on its ground) |
| `--border`, `--border-strong` | hairlines; the 2px input stroke |
| `--primary` / `--primary-foreground` | the action. Ink on light, white on dark. |

### 3.2 State

Each hue has exactly one meaning anywhere in the product.

| Token | Means | Never means |
|---|---|---|
| `--good` (`-strong`, `-soft`, `-pressed`) | correct, progress, the in-session submit | navigation, decoration |
| `--streak` | the day streak | a generic highlight |
| `--gold` | achievement, promotion | an accent |
| `--info` | notes, reference material | an action |
| `--destructive` (`-ink`) | a wrong answer, a destructive action | emphasis |
| `--tier-*` (ten) | the ten rank metals | anything outside crest, tier meter, tier chip |

Rules:

- **One accent at a time.** A viewport shows ink plus at most one state hue. The
  in-session green button and a gold badge never share a screen edge.
- **Fills are not text colours.** `--good` is a fill; anything that *reads* as
  green on a light ground uses `--good-strong`, and on a dark ground the lighter
  base. The same split exists for `--streak`, `--gold`, `--info`.
- **Never violet or lavender** in the product's own design. A tier metal is the
  only exception and it is already fixed by `domain/ranked.ts`.
- **`-ink` variants exist because a colour used as a fill is not legible as a
  glyph.** Use them; never reach for an opacity to fake it.

### 3.3 The band scope

`.band` and `.tile-dark` remap the semantic variables for their subtree. A
component written once with `text-foreground` / `text-muted-foreground` /
`bg-primary` renders correctly on either ground, including the inversion where a
`bg-primary` pill becomes white with ink text.

A hardcoded `text-white/70`, `#272729` or `bg-[#1a1a1a]` inside a band means the
component has not been given the scope yet. Inline hex is always a bug.

---

## 4. Surfaces

| Recipe | Use |
|---|---|
| `.card` | the canonical surface: 16px radius, 1px hairline, flat, 20/24px padding |
| `.card-soft` | a quiet well inside a card or a page: `--secondary`, no hairline |
| `.card-flat` | a compact row/inset: 12px radius, no hairline |
| `.tile` / `TileBand` | full-bleed page bands; the colour change *is* the divider |

- **Two boxes deep, maximum.** A card inside a card inside a card is a layout
  that has not been decided.
- **One radius per surface.** Never a 24px wrapper holding a 16px card.
- **No shadow on a static card.** `--shadow-float` is for something that
  genuinely floats over content (sheet, popover, skip link); `--shadow-card` is
  reserved for the auth card and dialogs.
- **Sections separate by ground or space.** Not by rules between sections, and
  not by an inset coloured box pretending to be a band.

---

## 5. Type

One family (`Inter`, variable), two roles: 700 for display, 400/500 for
everything else. Display is never letter-spaced or italic; sentence case
everywhere except the in-session CTA label.

| Class | Size (mobile → desktop) | Use |
|---|---|---|
| `.t-hero` | 32 → 52 | the landing `h1` only |
| `.t-display` | 28 → 36 | page and section `h2` |
| `.t-display-md` | 24 | a large card title |
| `.t-display-sm` | 20 | card titles |
| `.t-title` | 22 → 26 | modal/step titles, `h1` inside an app card |
| `.t-tagline` | 19 | product name, auth `h1` |
| `.t-lead` | 18 / 500 | a one-line intro |
| `.t-lead-airy` | 17 / 400 | longer intro |
| `.t-body` | 16 | body copy; **never smaller for prose** |
| `.t-caption` | 14 | secondary lines, helper text |
| `.t-fine` | 12 | legal, timestamps — never a paragraph |
| `.t-label` / `.t-eyebrow` | 14 / 12, uppercase, tracked | controls and eyebrows only, never prose |
| `.t-num` / `.t-num-sm` | 30–38 / 24 | statistics, tabular |

Rules:

- **Use the class, not a value.** `text-[15px]` outside a diagram or a visual is
  a defect. `font-semibold` on a `.t-*` display class is a contradiction (they
  are already 700).
- **One size per kind of element** across a page: every card title, every stat,
  every meta line.
- **Body is 16px.** A 14px paragraph is not a density decision, it is a
  legibility loss.
- **Line length** at most ~62 characters for prose (`max-w-prose` /
  `max-w-md`–`max-w-lg` on a full-width band).
- **Measure the hierarchy:** each display step is at least 1.25× the next.
- A figure never outgrows the `h2` it sits under.

---

## 6. Space, radius, elevation

- **4px base.** Tokens are steps 4/8/12/16/24/32/48/64; every gap, margin and
  padding is one of them. Arbitrary values (`p-[18px]`) are not allowed outside a
  visual.
- **Radius ladder:** 6 (`xs`), 8 (`sm`, inputs), 12 (`md`, panels), 16 (`lg`,
  cards), 20 (`xl`), 24 (`2xl`), 999 (`pill`). Cards are 16; controls are pills.
- **Elevation = surface colour.** Level 0 is flat and is the default. A shadow
  answers "this is above the page", not "this is important".
- **Page gutter:** the shell's padding (`px-5` → `sm:px-8`) and the content
  max-width (`max-w-[1200px]`) are owned by `AppShell` / the marketing `wrap`.
  A page does not invent its own.

---

## 7. Motion

### 7.1 Vocabulary

Everything comes from `lib/motion.ts`. Nothing hardcodes a duration, easing,
stiffness or delay.

| Gesture | Token | Where |
|---|---|---|
| **Enter** | `fadeUp` + `DUR.base` / `EASE.out` | once per screen, at most 3 staggered children (50ms) |
| **Presence** | `SPRING.soft` via `AnimatePresence` | a field appearing (2FA), a notice, a sheet |
| **Press** | CSS lip (`.btn`, `.option`) + `SPRING.press` scale 0.95 | every button, chip, option, tile |
| **Lift** | `lift` (y −2, `SPRING.settle`) | a *linked* card only |
| **Meter** | `SPRING.meter` | progress bars, counters |

Exits are faster than entrances and never block the next thing: routes animate
in, the outgoing view unmounts, and `AnimatePresence mode="wait"` is not used for
navigation.

### 7.2 Budget

- **One entrance per screen.** A landing hero may enter once on load. It may not
  also parallax, loop, sparkle, beam and drift.
- **One ambient effect per page, maximum**, and only where the product is
  technical (the landing may show the review demo working; that is the product,
  not an effect).
- **Nothing moves because the page scrolled.** No scroll-triggered reveals, no
  parallax on text, no scroll progress bar. Exception: a deliberate, contained
  moment inside its own section, one per page.
- **At most two concurrent JS animations** in a viewport.
- **Looping decoration is banned in product surfaces** (app, auth, study). On
  marketing, a loop must pause on hover, cycle in 2.5–4s, and have a pause
  control if it runs longer than 5s.
- **No tilt, no glare-follow, no cursor effects.**

### 7.3 Reduced motion contract

`MotionProvider` is the owner. Under reduced motion:

- transforms are dropped, opacity and colour are kept, so a state change is still
  visible;
- content is never left hidden: an entrance snaps to its finished state;
- nothing autoplays, nothing loops, nothing scrolls itself;
- the CSS branch in `globals.css` is the fallback for keyframes.

**No surface may opt out.** The landing's former `MotionConfig
reducedMotion="never"` and `.landing-motion` exception were removed on
2026-11-13 and may not come back.

### 7.4 Forbidden

Fade-in on every section; parallax on text; scroll-jacking; auto-rotating text
without a control; confetti outside a completed milestone; a spinner where a
skeleton belongs; animating `filter: blur()` on text at size; animating `width`.

---

## 8. Components

### 8.1 Button — one API

`components/ui/button.tsx` (behaviour) + `lib/button-variants.ts` (table) +
`.btn*` (geometry and states).

- Variants: `primary`, `secondary`, `subtle`, `ghost`, `danger`, `destructive`,
  `good` (in-session only), `chip`, `chipActive`, `chipSoft`, `link`.
- Sizes: default (44 → 48px), `sm`, `lg`, `icon`, `icon-sm`, `icon-lg`.
- **One primary per view.** A secondary action is `secondary`; a tertiary is
  `ghost` or a text link.
- **Every button carries the lip** and compresses into it on `:active`. This is
  the platform's tactile signature; no variant is exempt.
- **A navigable CTA is a link styled as a button** (`buttonVariants` on
  `<Link>`), never a `<button>` with a router push — and never a value import
  from a `'use client'` module into a server component.
- **Retired:** `ShimmerButton` as a product CTA. A marketing hero may own one
  treatment, but it must keep this geometry, lip, focus ring and disabled state.

### 8.2 Card

`components/ui/card.tsx` with `default` / `solid` / `soft` / `flat` and an `as`
tag switch (so a card can be a `<section>`, `<aside>` or `<form>` and keep its
landmark).

- Flat, hairline, 16px. One hover: `lift` if the whole card is a link, otherwise
  none.
- **Retired:** `MagicCard` as a wrapper. A pointer-tracked spotlight inside a card
  is two surfaces doing one job.

### 8.3 Field — the missing primitive

Every form control in the product must be built from one contract:

```
<Field
  label="Email"                 // visible, always
  hint="…"                      // optional, 14px, above or below
  error="…"                     // optional, under the control
  htmlFor="email"
/>
```

- Label above the control, visible; a placeholder is never the label.
- Error renders **under its own control**, with `aria-invalid` and
  `aria-describedby` pointing at that error only.
- On submit, the first invalid field takes focus.
- Leading glyph sits inside the control (`left-4`, `pl-11`), pinned to the
  control, not the field wrapper.
- 16px input text so mobile browsers do not zoom; 48px height.

`AuthForm`'s `error` string must therefore become per-field errors. This is a
P2 defect in the review, not a style preference.

### 8.4 Notice

One inline result treatment (`components/Notice.tsx`): `good` / `bad` / `note`,
one glyph each, `role="alert"` for `bad`, `role="status"` otherwise. A page does
not invent a banner.

### 8.5 Shells

- **`AuthShell`** is the only auth chrome: landing → sign-in → register →
  recovery → verify. Ink header band, one wordmark, one line, card overlapping
  its lower edge by a fixed amount, theme toggle, skip link. `footer` is always a
  node.
- **`AppShell`** is composition only; nav, sheet and route transitions each have
  their own owner.
- **`PageHeader`** is the one page-title treatment inside the app.

### 8.6 Empty state and stat row

- **`EmptyState`** (`components/ui/empty-state.tsx`): monochrome icon disc, a
  title that names what is missing, one sentence, one destination. Every empty
  list uses it — Learn, My content and Practice had three different recipes.
- **`Stat`** (`components/ui/stat.tsx`): icon + label + figure, with `tone`
  reserved for state (due, streak). The dashboard's four numbers are one row of
  this component, never a page-local copy.

### 8.7 Stepper (onboarding)

One progress treatment: a 4px track with an ink fill on a spring, plus a
`role="progressbar"` with `aria-valuetext` ("Step 2 of 5: What you study"). Used
by the registration wizard only; not a general-purpose tab bar.

---

## 9. Copy in UI

- Headings name a noun. "What you study", not "Let's get started".
- Buttons are verb + object: "Create account", "Send reset link", "Start review".
- One fact, one wording, everywhere. If the API says "Check your inbox", the UI
  says the same sentence.
- Errors: what happened, then what to do. Never "Something went wrong" alone.
- Empty states say what will appear and the one action that fills it.
- No exclamation marks, no "Oops", no "Let's", no congratulation in chrome.
- Curly quotes and apostrophes; no straight quotes in rendered copy.

---

## 10. Accessibility floors

Non-negotiable, checked in review:

- Text ≥ 4.5:1, large text ≥ 3:1, meaningful boundaries and icons ≥ 3:1, in
  light, dark and inside `.band`.
- Every control ≥ 44px tall on touch; ≥ 8px separation between targets.
- Visible focus at once (`:focus-visible`, 2px ring, never under the header).
- Tab order = reading order; no `tabindex` above 0; skip link first.
- One `h1`; headings step one level at a time; landmarks on every page.
- Forms: visible label, per-field error, focus to first failure, live status.
- Reduced motion: see §7.3.
- Nothing scrolls sideways at 320px.

---

## 11. Retired

| Retired | Replaced by |
|---|---|
| `DESIGN-UBER.md` / `DESIGN-DUOLINGO.md` as build rules | this document |
| `MagicCard` wrapper around `Card` | one `Card`, one radius |
| `ShimmerButton` as a product CTA | `Button variant="primary"` |
| `.landing-motion` reduced-motion opt-out | the global policy |
| Inline `text-[Npx]` type sizes | the `.t-*` scale |
| Inline hex inside dark bands | the `.band` scope |
| A fifth auth shell (`verify-email`) | `AuthShell` |
| importing `framer-motion` directly | `motion/react` (one copy of the engine, one policy) |
| Multi-effect heroes (grid + beam + glare + shimmer + sparkle) | one entrance, at most one product-led motion |
| `BlurFade` on app sections | the route transition, plus the study loop's own feedback |
| `BorderBeam` anywhere in the product | nothing: it was a 9s loop in a surface that bans loops |
| Inline `text-[Npx]` in app screens | the `.t-*` scale (200 call sites migrated 2026-11-14) |
| Tinted `bg-primary/10` icon discs | `bg-secondary` — colour is state |
| A page-local `Stat` or empty-state block | `components/ui/stat.tsx`, `components/ui/empty-state.tsx` |

---

## 12. Changing the system

1. Change the token, class or component — one owner, one change.
2. Update this document in the same commit; a rule that is not written here does
   not exist.
3. If a token name or motion token changes, regenerate the native clients:
   `npm run native:generate` (theme, icons, account rules, rank ladder) and
   `npm run vectors:copy` — the native apps read these from generated files and
   will otherwise drift silently.
4. Verify: `npm run typecheck`, `npm run build`, and the browser gates in
   `docs/FRONTEND-ARCHITECTURE.md` §8.
