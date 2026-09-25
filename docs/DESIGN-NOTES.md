# Revisio — design & interaction notes

Status: current (v1.2, 2026-09-25)
Companion to `docs/DESIGN.md` (the Apple design system, authoritative) and
`docs/ARCHITECTURE.md` (system structure).

This file exists so later passes build *with* the structure rather than against
it. It records where the design rules live in code, who owns each piece of
state, how the ranked system works, and the places where the spec had to be
interpreted.

---

## 1. Where the design rules live

| Concern | Owner | Notes |
|---|---|---|
| Colour + type tokens | `src/app/globals.css` (`:root`, `.dark`, `.on-tile`) | Every colour is a `--c-*` triple. Light/dark — and the on-dark remap — happen in exactly one place. |
| Token → utility mapping | `tailwind.config.ts` | `bg`/`shell`/`panel`/`pearl`/`raise`/`sink`/`edge`/`ink`/`muted`/`soft`/`accent`/`good`/`bad`/`nav`/`tile`/`tile-2`/`tile-3`. |
| Type ladder | `.t-*` helpers in `globals.css` | One helper per row of the spec's typography table, plus `.t-num`/`.t-num-sm` for numeric readouts. |
| Component grammar | `.btn-*`, `.input`, `.card`, `.card-solid`, `.chip`, `.option`, `.segment`, `.meter`, `.rail` | Pill = action, 11px rect = secondary, 8px rect = utility. |
| Surface rhythm | `src/components/ui/tile.tsx` (`TileBand`, `TilePanel`) | Full-bleed alternating tiles, and the in-column near-black panel. |
| Rank / ladder maths | `src/domain/ranked.ts` | Pure. Tiers, divisions, RP, zones, crest geometry, week bounds. |
| Rank presentation | `src/components/ui/rank-crest.tsx` | `RankCrest` + `RankChip`. Geometry-coded badge. |
| Motion tokens | `src/lib/motion.ts` | Durations, easings, springs, variants. |
| Icons | `src/components/ui/icons.tsx` | Semantic key → lucide glyph, colour inherited. |
| Theme policy | `src/lib/theme.ts` | Key, OS fallback, paint vs. persist, pre-paint script. |
| Copy / voice | `src/lib/profile.ts` | Greetings, openers, the companion, lobby lines, session summaries. |

**The ladder is closed.** Sizes come from the spec only
(10/12/14/17/18/21/24/28/34/40/56) and weights from 300/400/600/700. Weight 500
(`font-medium`) is absent by design — reaching for it is a bug. Radii are
written as explicit values (`rounded-[18px]`, `rounded-[11px]`) rather than
Tailwind's `rounded-md`/`lg`, which would silently import a different scale.

**One accent.** Action Blue `#0066cc` (Sky Link Blue `#2997ff` on dark) is every
interactive signal. `good` and `bad` exist only as *status semantics* — correct
versus incorrect feedback, pass versus fail — never as decoration or as a second
brand colour. Anything merely positive (rank, progress, the current item) uses
the accent.

## 2. Tile rhythm, elevation, glass, and the gradient ban

`docs/DESIGN.md` divides pages with **surface change, not chrome**: full tiles
alternating white / parchment / near-black, edge to edge, with no border and no
shadow between them, because "the colour change itself is the section divider".
That alternation is the most recognisable thing about the system, and it was
missing from v1.1 — which is why a correct palette still read flat and grey.

- `TileBand` — true viewport-width bands, for pages that own the window (the
  landing page and the auth screens).
- `TilePanel` — the same tiles inset into the app's 980px content column and
  rounded, for pages that live beside the sidebar. A near-black panel on a light
  page is the same rhythm at a smaller volume.
- The dashboard uses two of them: a dark hero, then light content, then a dark
  rank panel, then light content. The alternation *is* the layout.

**The `.on-tile` scope is the mechanism that makes this cheap.** Inside a dark
tile the surface roles are remapped — white ink, `#cccccc` muted body, Sky Link
Blue accent — so a component is written once with `text-ink` / `text-muted` /
`text-accent` and renders correctly on either ground, with no conditional
classes and no inline hex.

`docs/DESIGN.md` allows exactly one shadow (reserved for product media) and
forbids decorative gradients, while sanctioning
`backdrop-filter: saturate(180%) blur(20px)` on its frosted bars. Glass is
therefore in-spec, and the app uses it deliberately:

- `.card` — the spec's utility card (18px radius, hairline, 24px padding) as a
  glass pane. The fill is **near-opaque** (`85%` light, `72%` dark). A 60% pane
  over a flat canvas is just a grey box — glass only reads as glass when there
  is something behind it, and the tile bands now provide it.
- `.card-solid` — opaque variant for dense tables and forms, where the blur is
  wasted paint.
- `.glass-bar` — the spec's own recipe. Sidebar, 52px header.
- `.glass-float` — detached chrome: the floating mobile tab bar and the sheet.
  A 1px rim plus a whisper of ambient shade, which is what separates a pane from
  the page it floats over.
- `.glass-sheen::after` — a 1px specular sheen on the top edge. A hairline of
  light, not a background gradient: it is what makes a pane read as glass.
- `.glass-spotlight` — a pointer-tracked radial accent at ~9% alpha (Magic UI's
  MagicCard idea). Pure light, opt-in per surface.

The two places a neutral wash *is* used are the page background (a value shift
from panel to canvas over 420px, so a long light page does not read as flat
paper) and the light source inside the dark rank panel. Both are surface values,
not decorative marks.

**No decorative gradients** appear anywhere. `GradientText` and the blurred
`Aurora` blobs were deleted in v1.1; the landing page's atmosphere comes from
tile alternation.

## 3. Motion

`lib/motion.ts` owns every timing. Four rules:

1. **Spring over tween for anything you touch.** A linear CSS transition on a
   press has no velocity memory and reads mechanical. `SPRING.press`,
   `SPRING.layout` (shared-layout pills), `SPRING.settle` (panels), `SPRING.pop`
   (crests) and `SPRING.meter` (bars) cover the whole vocabulary.
2. **Never block the next thing.** `AnimatePresence mode="wait"` made every
   navigation wait for the outgoing page's exit — the single biggest source of
   "stiff" in v1.1. Routes now animate **in only** (`routeVariants`), and a 2px
   hairline in the header re-runs per navigation to carry continuity.
3. **Transform and opacity only.** Never animate `filter: blur()` on text at
   size — it resamples glyphs and reads soft. `BlurFade` keeps Magic UI's blur
   signature but caps it at 5px and promotes the layer; large blocks pass
   `blur={0}`.
4. **Exits are faster than entrances** (180ms vs 300ms). Leaving is not a
   performance.

`MotionConfig reducedMotion="user"` in `ui/motion/motion-provider.tsx` is the
primary reduced-motion defence; the CSS blanket in `globals.css` is a fallback,
and `NumberTicker` skips its count-up entirely.

Hover is still not animated on buttons — `docs/DESIGN.md` documents default and
pressed states only — but cards and rows now move a hair (`lift`) and nav
destinations carry a travelling highlight, because those are *positions*, not
affordances.

### Component provenance (Magic UI)

Components are hand-written against the canonical recipes — no Magic UI MCP or
package is available on this deployment.

| Component | Adapted from | Local deviation |
|---|---|---|
| `blur-fade.tsx` | BlurFade | Blur capped at 5px; `inView` optional |
| `number-ticker.tsx` | NumberTicker | Renders formatted `0` so SSR and client agree; skips under reduced motion |
| `word-rotate.tsx` | WordRotate | Measures with a hidden ruler so swaps never reflow; the ruler keeps the longest phrase so the box has a line box (an empty ruler collapsed it to zero height) |
| `text-reveal.tsx` | TextReveal | Opacity + 6px rise only — no per-letter motion |
| `confetti.tsx` | Confetti | Accent + surface neutrals only; `fire()` is a no-op under reduced motion |
| `glass-card.tsx` | MagicCard / GlassCard | Blur + saturate + sheen; spotlight is a radial highlight, not a gradient wash |
| `smooth-cursor.tsx` | SmoothCursor | Native cursor stays visible; ring collapses to a caret over text fields; off for touch and reduced motion |
| `stagger.tsx` | — | Built on the shared variants; `cappedDelay` keeps long lists snappy |

## 4. Icons

`ui/icons.tsx` is the only place that imports `lucide-react`. Surfaces ask for a
semantic key (`review`, `streak`, `zoneUp`), so swapping a glyph is one line.

- Colour is never baked in: icons use `currentColor`, so an inactive nav item is
  muted and an active one is Action Blue. This is why **emoji were removed** — a
  glyph with its own palette is a second accent, which the spec forbids.
- Stroke weight carries state (1.75 at rest, 2.25 active) instead of a second
  colour or a background box.
- Achievements store an emoji in the database (`scripts/seed.ts`). They are
  resolved to registry glyphs by id, then by legacy emoji, then to
  `achievements` — so no emoji reaches the UI and no migration was needed.

## 5. The ranked system

The brief was "gamification that feels like ranked in a competitive FPS,
and Duolingo's leagues". The two halves are separate on purpose:

**The FPS half — a persistent rank.** Five tiers (Bronze, Silver, Gold,
Diamond, Legend) × three divisions = **fifteen rungs**, Bronze III → Legend I.
Rank points come from lifetime XP (`RP_PER_XP = 1`, so RP is XP read through the
ranked lens — not a second number to explain). Division bands widen as you climb
(120/200/320/500/750 RP), so a new learner moves fast and Legend is a genuine
project: **5,670 RP to the apex, about 500 correct reviews.** Rank never resets.

**The Duolingo half — a weekly lobby.** Thirty seats, ordered by the week's XP,
with a **promotion band** (top five) and a **demotion band** (bottom five). The
league promotes proportionally but never promotes more than five or fewer than
one. A bad week costs *position*, not progress.

Two decisions worth keeping:

- **New accounts are unranked, not Bronze III.** `PLACEMENT_REVIEWS = 10`.
  Handing a first-time learner a bronze medal is worse than telling them they
  are still being placed.
- **Rank is coded by geometry, not hue.** A metallic gold/silver/bronze crest
  would import four accents into a one-accent system. So the crest carries the
  tier in its *shape*: chevrons stacked in the shield (1 at Bronze → 5 at
  Legend), division pips beneath them (III = one, I = three), and dial ticks
  around the ring (6 → 18). Colour does one job: this crest is yours (accent) or
  it is a rung you have not reached (muted). Both read side by side on the
  ladder, which a hue-coded badge could never do.

`domain/ranked.ts` is the single owner of every number and every threshold, and
it is pure — the API, the crest, the ladder, the lobby table and the
post-session report all call the same functions, so they cannot disagree.
`weekBounds()` mirrors `services/study.mondayOf` so the client's countdown and
the database's `week_start` are the same week.

Surface: `/progress` is the hub (Ladder / This week / XP board, one view at a
time), and the dashboard carries a near-black `RankStrip` with the crest, the
next rung named, and the lobby standing. A session ends on a `SessionReport`
that says "Promoted to Silver II" out loud, and refreshes the `/me` and
`/gamification` SWR keys so the shell and the dashboard move in the same moment
the number does.

## 6. One owner per piece of state

| State | Owner | Consumers |
|---|---|---|
| Signed-in learner (`/me`) | `lib/useMe.ts` (SWR key `/api/v1/me`) | AppShell, dashboard, review, rank, teacher, admin |
| Learner snapshot (voice input) | `learnerSnapshot()` in `lib/useMe.ts` | shell header, dashboard companion |
| Ranked payload | `lib/useRanked.ts` (SWR key `/api/v1/gamification?scope=`) | dashboard `RankStrip`, `/progress` |
| Navigation destinations | `components/nav/routes.ts` | sidebar, mobile tab bar, sheet |
| Overflow sheet open/closed | `AppShell` (one boolean) | sheet owns its scrim, exit, Escape, scroll lock, drag |
| Theme | `lib/theme.ts` | `ui/theme-toggle`, the pre-paint script in `app/layout.tsx` |
| Motion policy | `ui/motion/motion-provider.tsx` + `lib/motion.ts` | everything |
| Signed-out redirect | `AppShell` | all `(app)` routes (one check, not one per page) |
| Route loading | each route's `loading.tsx` → `components/PageSkeleton.tsx` | — |

`AppShell` is now **composition only**. It was 380 lines owning the nav model,
the sidebar, the tab bar, the sheet and the learner card; each of those lives
under `components/nav/` with one owner, and the shell keeps the session, one
boolean and the route transition.

`lib/useSession.ts` was deleted in v1.1 (two fetchers for `/me`).
`components/AuthShell.tsx`, `PageHeader.tsx` and `Notice.tsx` each collapsed a
treatment that had drifted across pages.

## 7. Loading

There is **one** loading story.

- `Splash` — session bootstrap only (resolving whether someone is signed in).
- `PageSkeleton` — each route's `loading.tsx`, shaped like the page arriving.
- The shell's in-place page transition (`routeVariants`), transform + opacity.
- A 2px header hairline that re-runs on navigation, so a route change is
  acknowledged without a curtain over the page.

## 8. Personalisation and the companion

`lib/profile.ts` is pure and testable — no React, no fetching. It owns:

- `greetingFor` — time-aware ("Still up" after midnight rather than a scold).
- `openers` — the rotating dashboard headline.
- `companionFor` — **the companion's state machine.** One ordered policy: never
  reviewed → welcome; back after a real gap → acknowledge it without scolding;
  queue clear and work done → name it; mid-session → keep the momentum; queue
  full → the nudge; nothing to do → an invitation. Ordered, because "what to say
  first" is the whole design.
- `lobbyLine` — the weekly stake in one sentence.
- `sessionSummary` / `emptyQueueLine` — post-session and empty-state copy.

The companion has a **body**: `components/companion.tsx` renders a small round
presence whose face *is your rank crest*, so the thing speaking to you is
visibly the thing you are building. Its one-line voice sits in the shell header
on every page (truncated); its full line plus an action appears on the dashboard
only when it has something first-run to say (welcome, or coming back). A
presence that repeats itself in three places is not a companion, it is noise.

`nudge`, `levelPercent` and `levelCaption` were deleted: the companion and the
rank crest replaced them, and leaving them in place would have been three
competing explanations of the same numbers.

## 9. Mobile navigation

The v1.1 tab bar was a flush, full-width strip of five cramped 52px cells with a
2px top line as the active state — and it truncated everything past the fifth
destination, which put Progress and My content out of reach on a phone.

Four changes:

1. **It floats.** A detached pill inset 12px from the edges, 70px tall, with a
   gradient fade above it so content dissolves into the bar instead of colliding
   with it. 56px touch targets, labels always visible.
2. **The active state travels.** One `layoutId` pill slides between slots.
3. **Nothing is unreachable.** Four primary destinations plus **More**, which
   opens a draggable glass sheet above the bar: two columns, each destination
   with a one-line description, plus the learner's crest, rank, RP and streak,
   and the account row. The sheet owns its scrim, Escape, scroll lock and
   drag-to-dismiss.
4. **It carries information.** The due count sits on Review as a badge, so the
   bar tells you what to do rather than only where to go.

The overflow destination lights the More slot, so the bar never lies about where
you are.

## 10. Bugs and dead ends fixed in this pass

Found by checking that the design's claims were *true*, not just well-drawn:

1. **The whole palette sat on one flat field.** Correct tokens, no tile
   alternation — which is why the app read as a wireframe. Fixed with
   `TileBand`/`TilePanel` and the `.on-tile` scope.
2. **Glass that could not be seen.** `.card` was `rgb(panel / 0.62)` over flat
   parchment: a grey box with nothing behind it to blur.
3. **Six stale tokens and one silent breakage.** `GlassCard` referenced
   `.glass-hairline` after the class was renamed, so GlassCards lost their sheen
   with no error anywhere.
4. **`good` and `nav` had no definition** after the token rewrite — `bg-good`,
   `text-good` and `bg-nav` became no-op classes across five files (exam pass
   marks, cram verdicts, notices, the landing nav). Restored and documented as
   status semantics.
5. **Every navigation waited for the previous page to exit**
   (`AnimatePresence mode="wait"`), inserting a dead beat per route change.
6. **The service worker cached stale shells.** Cache version bumped
   (`revisio-v3`) so a redeploy cannot serve the previous UI from cache.
7. **Rank was a hex colour per tier** (`LEAGUE_META[].color`, applied inline)
   plus medal emoji: five extra accents and a second illustration language.
   Replaced by the geometry-coded crest.
8. **`RankStrip`/lobby rows drew a hardcoded `rankFor(0)` crest** during this
   pass — every lobby member showed Bronze III. Fixed by returning each
   member's own rank from the API rather than re-deriving it in the row.

## 11. Known gaps

- The spec's store/configurator components (`search-input`, option chips,
  `floating-sticky-bar`) have no direct product equivalent; their *grammar* is
  applied instead (pill inputs, pill option rows, glass chrome).
- Form validation and error states are not documented in `docs/DESIGN.md`; `bad`
  is used for errors and `good` for success. These are additions to the token
  set, kept to one job each and never used as brand colour.
- Dark-mode utility cards are not documented either; the dark palette reuses the
  near-black tile family with two derived micro-steps (`#1c1c1e`, `#303032`).
- The single media shadow (`shadow-media`) is defined but unused — there is no
  product photography in the app yet.
- League promotion/demotion is applied **live** (your zone is computed from the
  current table), not at a scheduled week rollover. A rollover job that writes
  the new tier into `league_memberships.league` is still to be written; until
  then the column is informational.
- The ranked surfaces are exercised against a single account, so the lobby shows
  one claimed seat and twenty-nine unclaimed. That state is honest and designed
  for, but a populated lobby has not been seen with real users.
