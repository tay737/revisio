# Revisio — design & interaction notes

Status: current (2026-09-24)
Companion to `docs/DESIGN.md` (the Apple design system, authoritative) and
`docs/ARCHITECTURE.md` (system structure).

This file exists so later passes build *with* the structure rather than against
it. It records where the design rules live in code, who owns each piece of
state, and the places where the spec had to be interpreted.

---

## 1. Where the design rules live

| Concern | Owner | Notes |
|---|---|---|
| Colour + type tokens | `src/app/globals.css` (`:root`, `.dark`) | Every colour is a `--c-*` triple. Light/dark swap happens in exactly one place. |
| Token → utility mapping | `tailwind.config.ts` | `bg`/`panel`/`pearl`/`edge`/`ink`/`muted`/`soft`/`accent`/`good`/`bad`/`nav`. |
| Type ladder | `.t-*` helpers in `globals.css` | One helper per row of the spec's typography table. Pages compose helpers; they do not set `text-[15px]`. |
| Component grammar | `.btn-*`, `.input`, `.card`, `.chip`, `.option`, `.segment`, `.meter` | Pill = action, 11px rect = secondary, 8px rect = utility. |
| Motion tokens | `src/lib/motion.ts` | Durations, easings, springs, variants. |
| Icons | `src/components/ui/icons.tsx` | Semantic key → lucide glyph, colour inherited. |
| Theme policy | `src/lib/theme.ts` | Key, OS fallback, paint vs. persist, pre-paint script. |
| Copy / voice | `src/lib/profile.ts` | Greetings, nudges, level captions, session summaries. |

**The ladder is closed.** Sizes come from the spec only
(10/12/14/17/18/21/24/28/34/40/56) and weights from 300/400/600/700. Weight 500
(`font-medium`) is absent by design — reaching for it is a bug.

## 2. Elevation, glass, and the gradient ban

`docs/DESIGN.md` forbids decorative gradients and allows exactly one shadow,
reserved for product media. It also sanctions `backdrop-filter:
saturate(180%) blur(20px)` on its frosted sub-nav and sticky bar.

Glassmorphism is therefore **in-spec**, and the app uses it deliberately:

- `.card` — utility card (18px radius, hairline, 24px padding) rendered as a
  glass pane: `rgb(panel / 0.72)` + `saturate(160%) blur(12px)`.
- `.glass-bar` — the spec's own recipe, used for the sidebar, the 52px header
  and the mobile tab bar.
- `.glass-hairline::after` — a 1px specular sheen on the top edge. This is a
  hairline of light, not a background gradient; it is what makes a pane read as
  glass rather than as a light box.
- `.glass-spotlight` — a pointer-tracked radial accent at ~7% alpha (Magic UI's
  MagicCard idea). Pure light, opt-in per surface.
- `GlassCard` (`ui/motion/glass-card.tsx`) wraps the above with `pane` /
  `raised` / `bar` tones.

The auth screens give the glass something to blur: a near-black tile occupies
the top 46% of the viewport, so the card straddles the light/dark boundary and
the blur is visible and functional rather than decorative.

**No gradients** appear anywhere. `GradientText` and the blurred `Aurora` blobs
were deleted; the landing page's atmosphere comes from the spec's tile
alternation instead.

## 3. Motion

`lib/motion.ts` owns every timing. Two rules:

1. **Transform and opacity only.** Never animate `filter: blur()` on text at
   size — it resamples glyphs and reads soft. `BlurFade` keeps Magic UI's blur
   signature but caps it at 5px and promotes the layer; large blocks pass
   `blur={0}`.
2. **Short and eased out.** Entrances 260ms, exits 180ms. Exits are always
   faster than entrances.

`MotionConfig reducedMotion="user"` in `ui/motion/motion-provider.tsx` is the
primary reduced-motion defence; the CSS blanket in `globals.css` is a fallback.
`NumberTicker` additionally skips its count-up under reduced motion.

Only one hover animation exists in the system: `docs/DESIGN.md` documents
default and pressed states only, so `Button` scales on press (`0.95`) and never
on hover.

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
| `glass-card.tsx` | MagicCard / GlassCard | Blur + saturate + hairline; spotlight is a radial highlight, not a gradient wash |
| `smooth-cursor.tsx` | SmoothCursor | Native cursor stays visible; ring collapses to a caret over text fields; off for touch and reduced motion |
| `stagger.tsx` | — | Built on the shared variants |

## 4. Icons

`ui/icons.tsx` is the only place that imports `lucide-react`. Surfaces ask for a
semantic key (`review`, `streak`, `publish`), so swapping a glyph is one line.

- Colour is never baked in: icons use `currentColor`, so an inactive nav item is
  muted and an active one is Action Blue. This is why **emoji were removed** —
  a glyph with its own palette is a second accent, which the spec forbids.
- Achievements store an emoji in the database (`scripts/seed.ts`). They are
  resolved to registry glyphs by id, then by legacy emoji, then to `achievements`
  — so no emoji reaches the UI and no migration was needed.
- Leagues likewise map to a glyph. `LEAGUE_META[].color` is deliberately unused:
  it was being applied inline, introducing five accents into a one-accent system.

## 5. One owner per piece of state

| State | Owner | Consumers |
|---|---|---|
| Signed-in learner (`/me`) | `lib/useMe.ts` (SWR cache key `/api/v1/me`) | AppShell, dashboard, review, progress, teacher, admin |
| Theme | `lib/theme.ts` | `ui/theme-toggle`, the pre-paint script in `app/layout.tsx` |
| Motion policy | `ui/motion/motion-provider.tsx` + `lib/motion.ts` | everything |
| Signed-out redirect | `AppShell` | all `(app)` routes (one check, not one per page) |
| Route loading | each route's `loading.tsx` → `components/PageSkeleton.tsx` | — |

`lib/useSession.ts` was **deleted**. It fetched `/me` through a bespoke effect
while the dashboard fetched the same endpoint through SWR — two requests, two
loading flags, two chances to disagree about who is signed in. `useMe` replaced
both.

`components/AuthShell.tsx` collapsed four near-identical auth pages;
`components/PageHeader.tsx` and `components/Notice.tsx` collapsed the page-title
and result-message treatments that had drifted across eight pages.

## 6. Loading

There is **one** loading story. A timed full-screen splash used to cover every
route change for 450ms, which made navigation feel slower than it was; it was
deleted along with `route-splash.tsx`. What remains:

- `Splash` — session bootstrap only (resolving whether someone is signed in).
- `PageSkeleton` — each route's `loading.tsx`, shaped like the page arriving.
- The shell's in-place page transition (`pageVariants`), transform + opacity.

## 7. Personalisation

`lib/profile.ts` is pure and testable — no React, no fetching. It owns:

- `greetingFor` — time-aware ("Still up" after midnight rather than a scold).
- `openers` — the rotating dashboard headline.
- `nudge` — one line, ordered by what matters now (queue, then today, then
  streak). It deliberately never restates the headline above it.
- `levelCaption` / `levelPercent` — progress in reviews, not just XP.
- `sessionSummary` / `emptyQueueLine` — post-session and empty-state copy.

The shell header greets the learner by name on **every** page with a line derived
from their own numbers, so the app is addressed to a person throughout rather
than only on the dashboard.

## 8. Bugs fixed while auditing for this pass

These were found by checking that the design's claims were *true*, not just
well-drawn:

1. **`dueCount + newCount` produced `"00"`.** `count(*)` returns a string from
   node-postgres (int8 is unparsed), so the header rendered `00 due` and every
   `due > 0` check silently evaluated false. All counts in `services/stats.ts`
   are now cast `::int`.
2. **`/me` reported `correct === reviewed`.** The dashboard's accuracy copy was
   therefore always "100%". `todayStats` now counts the stored verdict
   (`graded ->> 'correct'`).
3. **The level curve started level 1 at 50 XP.** A new account showed `-50 / 91
   XP` and a meter pinned full-width (a negative `width` is invalid CSS, so the
   browser dropped the rule). `xpForLevel` is now `50 * (n - 1)^1.5`, so level 1
   starts at 0 and the documented 50/141/260 thresholds hold.
4. **`WordRotate` rendered nothing.** Its measuring ruler was cleared after
   measuring; an empty inline span produces no line box, so the container
   collapsed to zero height and `overflow-hidden` clipped the word away.
5. **Mobile navigation dead-end.** The tab bar truncated at five items, leaving
   Progress and My content unreachable on a phone. The bar now shows four tabs
   plus a "More" sheet.
6. **Invalid nested interactive elements** in the Learn subject row (a
   `role="button"` span inside a `<button>`), which broke keyboard use.
7. **`window.prompt`** for the verification re-send, replaced with an inline
   field.

## 9. Known gaps

- The spec's store/configurator components (`search-input`, option chips,
  `floating-sticky-bar`) have no direct product equivalent; their *grammar* is
  applied instead (pill inputs, pill option rows, frosted sticky bars).
- Form validation and error states are not documented in `docs/DESIGN.md`; the
  app uses `bad` at 10% alpha for errors and `good` for success, which are
  additions to the token set rather than spec values.
- Dark-mode utility cards are not documented either; the dark palette reuses the
  near-black tile family.
- The single media shadow (`shadow-media`) is defined but currently unused —
  there is no product photography in the app yet.
