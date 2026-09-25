# UI system

The reference for how Revisio looks, moves and behaves. It records **structure
and rules**, not values — every colour, radius, shadow and duration lives in one
place in the code, and restating values here is how docs drift from reality.

| Concern | Owner |
|---|---|
| Colour, type, surface, control and band tokens | `src/app/globals.css` (`:root` / `.dark` / `.band` / `@theme`) |
| Motion: durations, easings, springs, variants | `src/lib/motion.ts` |
| Icons: one set, one stroke, semantic keys | `src/components/ui/icons.tsx` |
| Destinations and their copy | `src/components/nav/routes.ts` |
| Voice: greeting, companion, empty states | `src/lib/profile.ts` |
| Rank maths: tiers, RP, lobbies, promotions | `src/domain/ranked.ts` |
| Session state | `src/lib/useMe.ts` (SWR cache is the only source) |
| Theme policy | `src/lib/theme.ts` |

Two documents own the design language, and they own different halves:

- **`docs/DESIGN-UBER.md` — the UI.** A two-colour duet (ink `#000000` / canvas
  `#ffffff`) over a grayscale ramp, a 4px spacing base, a 16px card radius, the
  999px pill as the only interactive shape, Inter 700 display type in sentence
  case, and mid-page polarity-flipped black bands as the depth cue instead of
  shadow tiers. Level 0 (flat) is the default state.
- **`docs/DESIGN-DUOLINGO.md` — the UX and the feel.** A gamified loop, tactile
  controls (a flat bottom lip that compresses on press), uppercase tracked
  labels, a companion with a body, and colour used only where the game needs it.

## The reconciliation (the one judgement call)

**Uber owns the chrome; Duolingo owns the state.**

Chrome — nav, cards, bands, page geometry, the navigating CTA — is the
monochrome duet, because that is what makes the app read as premium rather than
as a children's app. Colour appears only in *state*:

| Token | Means | Never means |
|---|---|---|
| `--foreground` / `--primary` | navigation, the primary action, "you are here" | reward |
| `--good` | correct, progress, and the in-session CTA | chrome |
| `--streak` | the day streak | decoration |
| `--gold` | trophies, achievements, promotions | accent |
| `--destructive` | a wrong answer or a demotion band | decoration |
| `--info` | notes and reference material | action |

Green additionally owns the one control that is not navigation: the button you
press *inside* a study session. Ink means "you are moving around the app"; green
means "you are earning something". The two never share a viewport.

## The band scope

A mid-page polarity flip is a **scope**, not a class on every child. `.band` and
`.tile-dark` remap the semantic variables for their subtree, so a component
written once with `text-foreground`, `text-muted-foreground` and `bg-primary`
renders correctly on either ground — including the inversion where a `bg-primary`
pill inside a band becomes a white pill with black ink, exactly as Uber inverts
its CTA on a dark band. Any component that hardcodes `text-white/70` inside a band
has simply not been given the scope yet.

## Controls

- **Pill is the only interactive shape** (999px). Cards are 16px.
- **Every button carries the lip.** A 3–4px flat shadow beneath the pill that
  collapses as the button translates into it on `:active`. This is the single
  detail that makes a tap feel physical, and it is implemented in CSS so it works
  for any element that carries `.btn`, including the shadcn `Button`.
- **Minimum 44px**, 48px from the `sm` breakpoint up.
- Labels on the in-session CTA are uppercase with 0.08em tracking (Duolingo);
  everything else is sentence case (Uber).

## Navigation

- **One model.** `nav/routes.ts` is the only list of destinations; the sidebar,
  the bottom bar, the account sheet and the page titles all read it.
- **Mobile is a full-bleed bottom bar** — glass, hairline top edge, safe-area
  inset, five 64px slots (four destinations + More). The active slot is marked by
  a 3px ink bar that travels on a spring. Every destination is reachable, which
  the previous five-item truncation was not.
- **Desktop is a canvas sidebar** with a left-edge active indicator, the same
  signal along a different edge.
- **The app bar says one word and three numbers** on a phone (page title, streak,
  due). The greeting and the companion's line appear on desktop, and the
  companion is one tap away on mobile inside the account sheet.

## Motion

- **Transform and opacity only.** Never animate `filter: blur()` on text at size.
- **Exits are faster than entrances**, and nothing waits: routes animate *in* and
  the outgoing view unmounts. `AnimatePresence mode="wait"` on navigation is what
  made the app feel like a slideshow.
- **Springs for anything you touch**; tweens for chrome.
- Library primitives: Magic UI's `BlurFade`, `NumberTicker`, `WordRotate`,
  `Confetti`, `ScrollProgress`, `Dock` (`src/components/ui/`), and shadcn's
  `Button`, `Badge`, `Sheet`, `Tabs`, `Tooltip`, `Progress`, `Skeleton`,
  `Separator`, `DropdownMenu`, `Avatar`, `Switch`, `Sonner`.

## Deleted in this pass, and why

| Removed | Reason |
|---|---|
| `ui/motion/{number-ticker,blur-fade,word-rotate,text-reveal,stagger,confetti,celebrate,glass-card}` | hand-written duplicates of Magic UI primitives the project now installs |
| `ui/splash.tsx` | a full-screen overlay on every route change cost a beat per navigation and hid the page arriving |
| `ui/smooth-cursor.tsx` | hijacks the pointer; nothing on a phone, gimmick on a desktop |
| `ui/globe.tsx` (+ `cobe`) | unreferenced scaffolding |
| `ui/card.tsx` | a second way to make a card next to `.card`; one owner kept |
| AuthForm's local `Notice` | a second copy of the inline-message component, which also ignored its own `show` prop |
| `tailwind.config.ts` | Tailwind v4 configures in CSS; the token layer is now `@theme` in `globals.css` |
| `framer-motion` imports | one animation runtime (`motion/react`), matching what the component libraries expect |

## Known gaps

- The **week rollover** that applies promotions and demotions is still a live
  computation rather than a scheduled settlement (§11 of `DESIGN-NOTES.md`).
- Tooltip and dropdown surfaces were migrated to the new tokens but have not been
  driven by hand in this pass.
- The `base-maia` registry components arrive with a `data-horizontal:` /
  `data-vertical:` variant convention that Base UI does not emit; `tabs.tsx` and
  `separator.tsx` were rewritten to use `data-[orientation=…]`. **Check any newly
  added component for the same mismatch** — it fails silently as a layout bug
  rather than as a visible error.
- **Native controls need styling.** An `input[type=range]` renders in the
  browser's own blue until it is given an appearance, and a checkbox inherits the
  platform accent. Both were live on the cram and exam pages. Any browser-default
  control is a second accent arriving by accident.
- A class whose *only* effect is a colour (`segment-active`) is not safe on its
  own: it needs its own fill, or it renders white-on-white anywhere the animated
  pill behind it is absent.
