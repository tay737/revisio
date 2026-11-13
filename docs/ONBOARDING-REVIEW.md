# Onboarding review — landing, sign-in, registration

Status: review (2026-11-13). Scope: `/`, `/login`, `/register`, `/forgot-password`,
`/reset-password`, `/verify-email`, `/staff/login`, `/staff/register`, and the
first screen after sign-up (`/dashboard` empty state).
Audience under review: students of all ages, core 16–22 (sixth form, college,
university), safe down to 13 with guardian consent.

This document records **what is wrong and why it matters**. The rules that
replace it are in `docs/UI-SYSTEM.md`; the structure that carries them is in
`docs/FRONTEND-ARCHITECTURE.md`.

---

## 1. Verdict

The design language is not the problem. Ink-on-canvas with one pill shape and a
tactile press lip is distinctive, cheap to render and reads as a product rather
than a template. The band scope (`.band` / `.tile-dark` remapping semantic
variables) is genuinely good engineering: one component, correct on both grounds.

What is wrong is that **three design languages now share the site**:

| Surface | Language actually shipped |
|---|---|
| Landing | Magic UI effect stack — drifting grid, border beam, glare hover, shimmer CTA, sparkle eyebrow, scroll progress |
| Auth | Ink header band + drifting grid + spotlight card + shimmer CTA, inside a form |
| App | Flat cards, hairlines, tactile pills, tokens from `globals.css` |

A visitor crosses all three in under a minute. The landing promises a premium
instrument, the sign-in page looks like a component demo, and the app itself is
quieter than both. That is the unification problem, and it is bigger than any
single screen.

Second: **the onboarding never says what the learner gets.** The first screen
says "Learn it once." — no category noun, no audience, no fact. Registration is
five steps of form fields with no promise attached. A 17-year-old deciding
whether to spend ten minutes has been told a slogan, not a product.

---

## 2. Findings

Severity: **P0** breaks a promise or a standard; **P1** undermines the experience
on every visit; **P2** is a defect that will compound; **P3** is a judgement call.

### P0-1 — The landing opts out of reduced motion

`src/app/page.tsx` wrapped the page in `MotionConfig reducedMotion="never"` and
`src/app/globals.css` excluded it from the global branch with
`html:not(:has(.landing-motion))`. The page therefore animates for visitors who
have asked their operating system not to animate anything.

Why it matters: vestibular disorders, migraine and ADHD are exactly the
conditions a study product should accommodate, and the same visitor gets a still
page on `/review` and a moving one on `/`. It also contradicted the project's own
`docs/UI-SYSTEM.md`, which claimed motion was honoured globally. This is a
WCAG 2.3.3 (Animation from Interactions) failure, not a taste question.

**Fixed in this pass** (see §5). The rule is now: no surface may opt out.

### P0-2 — Two button languages, including on the same form

`Button` (`components/ui/button.tsx` → `lib/button-variants.ts` → `.btn*` in
`globals.css`) is the system: pill, 44/48px, token colours, 3px press lip that
collapses on `:active`, ripple on the primary only.

`ShimmerButton` is a second language: a conic-gradient spark on a 3s infinite
loop, `active:translate-y-px` instead of the lip, hardcoded `background` /
`shimmerColor` props passed at each call site, `text-white` regardless of theme,
no disabled styling of its own. It is used for the platform's primary conversion
action on the landing hero, the closing CTA, the login submit and the wizard's
final submit — the most important buttons in the product.

Two buttons with different geometry, different press physics and different
contrast behaviour, one above the other on `/login` (`ShimmerButton` submit plus
a `Button` "Re-send the verification email"), is the clearest single symptom of
the drift.

**Rule going forward:** one button component. A marketing treatment may change
the *surface* of the primary button, never its geometry, lip, focus ring or
disabled state.

### P0-3 — Four auth shells across six pages

`AuthShell` covers login, register, staff login, staff register,
forgot-password and reset-password. Then:

- `/verify-email` hand-rolled its own shell: `min-h-viewport`, an absolutely
  positioned `#272729` band (a hex that exists nowhere in the token layer), its
  own wordmark, its own card — and no skip link.
- The wizard's success state leaves the wizard for a bare `Card` with a new
  heading ("You are in") and no shell context.
- `footer` accepts a `ReactNode` on some pages and a `string` on the staff
  pages, so the same slot renders three different weights of text.

Result: the one journey that must feel continuous — landing → register →
verify → login → dashboard — restarts its chrome twice.

### P1-4 — The first screen has no fact and no audience

`h1` is "Learn it once." It names no category (spaced repetition / revision),
no buyer (students, GCSE to university) and makes no claim a visitor can check.
The supporting line mentions "the right card at the right moment", which is a
mechanism, not a fact.

What a first screen needs, per the product's own strengths: what it is, who it is
for, and one hard fact ("30 rungs, ten tiers, never reset" is already on the page
but three screens down; "free to start" appears only at the close).

The eyebrow "Spaced repetition, properly" does more work than the headline, which
is the tell that the headline is decoration.

### P1-5 — Effect salad in the hero

Within the first 900px: `AnimatedGridPattern`, `BorderBeam`, `GlareHover`,
`WordReveal`, `AnimatedShinyText`, `ScrollProgress`, and a `BlurFade` around
every hero element including the buttons. The review demo also tilts under the
pointer via `GlareHover`.

Each is defensible alone. Together they are the visual signature of a generated
page: several ambient loops competing, none carrying information. The product's
own motion language (`lib/motion.ts`) is disciplined — "exits are faster than
entrances", "transform and opacity only", springs for things you touch — and none
of that discipline is visible on the landing.

There is also a scroll-linked element (`ScrollProgress`) outside any dealt
scroll moment, which the system otherwise forbids.

### P1-6 — Two card recipes, nested

`MagicCard` (mouse-tracked radial spotlight, `rounded-2xl` = 24px) wraps `Card`
(`.card` = 16px + hairline) on both auth forms, the wizard's role step and two
landing tiles. The rendered result is a 24px rounded spotlight box containing a
16px rounded hairline box — two radii, two surfaces, one card.

Nesting also means the hover spotlight animates the outer box while the inner box
holds the content, so the pointer feedback and the content are on different
planes. One card, one radius, one hover.

### P1-7 — The type scale has several owners

`.t-*` classes in `globals.css` are the scale. In the same files: `text-[15px]`,
`text-[17px]`, `text-[13px]`, `text-[14px]`, `font-semibold` on a `.t-title`
(already 700), `text-[12px] uppercase tracking-[0.08em]` re-implementing
`.t-eyebrow` inline. Five near-identical small sizes and three near-identical
labels are now in circulation, so vertical rhythm differs between auth screens
that should be identical.

### P1-8 — Two copies of the animation runtime

`motion@^13` is imported everywhere (`motion/react`). It already carries
`framer-motion@^13` as its engine, but `package.json` also declared
`framer-motion@^11` directly. The v11 copy had zero imports and was dead weight
in the tree — a second, older copy of the same runtime, with its own
reduced-motion semantics, waiting for the first component that imports the bare
`framer-motion` specifier. Removed in this pass; one copy remains, and every
import goes through `motion/react`.

### P1-9 — Tone is pitched at the youngest user, not the core one

The strongest product idea is the ladder (thirty rungs, ten tiers, seasonal RP,
weekly lobbies). On the landing it is presented with crests, "A rank you can
defend", and a leaderboard metaphor — which reads 13–15. A 20-year-old choosing a
revision tool is not looking for a trophy; they are looking for evidence they are
keeping up.

The fix is not to remove the ladder. It is to frame it as a record ("what you
have actually retained") and to keep crests and metals inside the rank surfaces,
never as chrome on onboarding.

### P2-10 — Form errors are not attached to fields

`AuthForm` keeps one `error` string and sets `aria-invalid` on email *and*
password *and* the 2FA field from it, with all three pointing at one
`aria-describedby` target. A wrong six-digit code therefore marks the email
address invalid. The wizard validates per step but renders a single `Notice` at
the bottom of the step rather than under the failing control, and does not move
focus to it.

WCAG 3.3.1 wants the error identified and described; a screen-reader user
currently hears "invalid" on fields that are fine.

### P2-11 — A dead declaration that looks like a fix

`.chip` in `globals.css` sets `color: var(--ink-muted)` and then, two lines
later, `color: var(--foreground)`. `--ink-muted` is not defined anywhere. The
first declaration is inert and the second wins — but the comment above it claims
a contrast correction. Anyone auditing contrast by reading the file will believe
a fix that is not applied. This is what a token layer with two owners produces.

### P2-12 — A failed resend claims success

`/verify-email`'s resend handler set `resent` in a `finally` block. A 500, a
rate-limit or an offline browser still produced "a fresh link is on its way."
Nothing is more corrosive on the recovery path than a confirmation that is not
true. **Fixed in this pass:** the sent state is only set on `res.ok`, and a
failure renders under the field.

### P3-13 — Missing first-week guidance

After verification the learner lands on a dashboard with a queue and no
instruction. The audit of 2026-10-10 already flagged this as the highest-value
feature opportunity ("First-week guided setup"), and it is still true: one screen
that says "this is your queue, here is one card, it takes 90 seconds" would do
more for retention than any visual change in this document.

---

## 3. What to keep, unchanged

| Thing | Why it stays |
|---|---|
| Ink/canvas duet + one accent for state | Distinctive, accessible, cheap; the opposite of a pastel ed-tech template |
| Pill geometry + press lip | The one detail that makes a tap feel physical; already CSS-owned so every control inherits it |
| `.band` / `.tile-dark` scope remapping | One component, two grounds, no duplicated colour values |
| `lib/motion.ts` as the single motion vocabulary | Intent-named springs (`press`, `settle`, `meter`) are better than any library default |
| `MotionProvider` | The correct owner for reduced motion; the landing just refused to use it |
| Wizard per-step validation + focus-to-heading | Genuinely good: `aria-valuetext` on the progressbar, live password strength, consent only when DOB requires it |
| Hidden staff portal, neutral recovery copy | Correct security posture, correctly worded |

---

## 4. Direction for the rework

One sentence: **a quiet study instrument with a ladder** — the work is the
picture, motion is feedback, colour is state, and the interface never
congratulates itself.

Concretely, for onboarding:

1. **Value first.** The first screen names the category, the audience and one
   fact; the second screen shows a real review card at real size (already built —
   `ReviewDemo`), and only then the ladder.
2. **One promise per step.** Role → what you study (level + subjects) → account →
   about you (age, only because consent depends on it) → confirm. Level is new
   and is the single most useful signal the product can collect at sign-up; it
   needs the four-place treatment in `docs/FRONTEND-ARCHITECTURE.md` §6.2.
3. **One shell, one button, one card.** AuthShell v2 for all seven auth routes;
   `Field` as a primitive with its own error slot; no spotlight wrapper, no
   shimmer.
4. **Motion: one entrance, one presence.** The hero enters once; the wizard
   slides directionally (already correct); notices spring in; nothing loops, and
   nothing moves because the page scrolled.
5. **Tell the truth on every path.** Unverified, rate-limited, taken email,
   consent required, staff pending — each has one sentence that says who acts
   next.

---

## 5. Changed in this pass

| File | Change |
|---|---|
| `src/app/page.tsx` | Removed `MotionConfig reducedMotion="never"` and the `landing-motion` class; the landing now inherits the app's motion policy |
| `src/app/globals.css` | Removed the `.landing-motion` exception from the `prefers-reduced-motion` branch; one policy for every route |
| `src/app/verify-email/page.tsx` | Now renders inside `AuthShell` (no fifth shell, no `#272729`); resend only confirms on a real success; resend error is attached to its field |
| `package.json` | Removed `framer-motion` (zero imports) — `motion/react` is the only runtime |

### Second pass — seen in a browser, then built

`npm run design:shots` (new: `scripts/design/shots.mjs`) renders the onboarding
routes in Chromium at 1440/1280/768/390, light and dark, with a reduced-motion
pass, and writes screenshots plus measured geometry to `artifacts/design/`. The
findings below came from those renders, not from reading source.

| Finding | Fix |
|---|---|
| The hero was 510px tall on a 900px viewport; the next section showed on the first screen | `.landing-hero` / `.landing-section` are one screen tall (`100svh` minus the nav and consent bar). At 1440 the hero now ends at 901px |
| The `h1` was “Learn it once.” with no category or audience | `h1` is “Spaced repetition for GCSE, A-level and university.”, with three facts (10 min a day, 30 rungs never reset, free to start) on the first screen |
| 11 loop animations at rest, including 26 under reduced motion (BorderBeam's `offset-distance` kept running) | Effect stack removed from the landing and the auth masthead: no grid, beam, glare, shimmer, sparkle or scroll progress. **0 animations at rest, 0 under reduced motion** |
| The login page's only sign-up link read “Request staff access” and went to `/staff/register` | “New to Revisio? Start free” → `/register`; the staff door stays in the shell footer |
| The auth card's top was painted over by the ink band, so the `h1` sat on the band edge | `main` is `relative z-10`; the 32px overlap is now visible as designed |
| Auth `h1` was 19px while the wizard step `h2` was 26px | Card `h1` is `.t-title` (22/26), step `h2` is `.t-display-sm` (20), all seven auth routes agree |
| The demo's disabled Check was the green fill at 40% opacity — it read as broken | Disabled is the quiet secondary; the green fill appears once there is an answer |
| A caption sat under the demo (“Try it. This is the real review loop.”) | Removed: no captions under visuals |
| The bento's 21-square grid was decoration pretending to be data | It is the demo's real three-card queue |
| The rank stats rendered blank below the fold (`NumberTicker` only runs in view) | Static figures |
| The companion band was a half-empty screen | Merged into the rank band |
| The “Three ways in” heading sat in a column beside a mostly empty card grid | Heading above, two-column bento with the queue card spanning both rows |

Measured after the rebuild: 0 horizontal overflow at every size, 0 console or
page errors, one card radius (16px), one primary button (`116×48` ink), h1
52px → 32.8px, and the mobile hero ends within 1px of the fold (it was 51px
past it), with the demo card fully visible.

These are still foundation only. The wizard reorder, per-field errors, the CSS
split and the remaining app-surface work are specified in `docs/UI-SYSTEM.md`
and phased in `docs/FRONTEND-ARCHITECTURE.md` §7.

---

## 6. Not verified in this pass

- No browser run: the site needs `.env` + database for `next dev`, and the
  design gates in this repository (`npm run e2e:public-ux`, `e2e:smoke`) were not
  executed. Findings above are from source reading, not rendered output.
- Contrast ratios were not re-measured. The 2026-10-10 audit's P0 remains the
  current measured record until a fresh axe pass runs.
- `/staff/*` was read, not driven.
