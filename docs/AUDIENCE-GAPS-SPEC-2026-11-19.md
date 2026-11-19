# Audience gaps — spec & triage (ticket #90)

Source: external student-POV audit (ages 16–18, ADHD/autistic lens), epic #76.
This is a triage spec, not a build plan. Each item gets a v1/v2 call with the
reasoning a reviewer can challenge.

## Already shipped since the audit

- **Onboarding offers (partial)** — #84 put quiet mode and cards-per-session
  on the first-run checklist. Focus mode and break reminders are still
  Settings-only; see item 6.

## Triage

### 1. "What today looks like" overview — v1, small

Dashboard is ~3.6 screens on mobile with 8 headings; it asks for more
decisions than it makes. The fix is subtraction, not a new card: collapse the
below-the-fold sections behind one "Today" summary line (due count, one
recommended action, streak). Effort: medium (layout work on
dashboard/page.tsx). Risk: low — purely presentational.

### 2. Time estimates — v1, tiny

No clock anywhere; card counts only. A rough "about N minutes" on session
setup (review page, before the first card) and on the session report covers
time-blindness without instrumenting anything. Basis: ~20–30s per cloze,
~45s per flashcard/MCQ — label it "roughly". Effort: small. Data: card kind
mix is already on the client.

### 3. Pause/resume — v2

"End session" already preserves unanswered cards (they stay due), but the
report reads like a finish. True pause/resume needs a persisted in-flight
session (queue position, answers-so-far) — the offline pack machinery gets
part of the way there. Effort: large, touches scheduler assumptions.
Recommend: v2, after the queue-cap fix (#78) settles what "due" even means.

### 4. Board visibility front-and-centre — v1, small

The leaderboard opt-out exists (Settings → Preferences, and the Rank page)
but is invisible until found. For socially anxious students this is a trust
control, not a preference. Move/duplicate a single quiet row onto the
profile or dashboard: "Show me on boards" with the same switch. Effort:
small — the PATCH /api/v1/me { leaderboardOptOut } path already exists.

### 5. Text size / high contrast / dyslexia options — v2

"Relaxed" reading preset covers line-height/spacing only. Real text-size
needs a type-scale token (the design system has duration tokens but no size
tokens — this is a theme-level change) plus contrast and font choices that
are genuinely different, not a slider. Effort: large; overlaps the
accessibility audit lane. Recommend: spec the type-scale token first, ship
text-size alone in v1.5, defer font/contrast.

### 6. Onboarding offers (remainder) — v1, tiny

#84 shipped quiet mode + session length. Remaining gap: focus mode and break
reminders are not offered at first run. Add both to the same "Make it
yours" block on FirstRunCard — same PATCH path, ~30 lines. Effort: tiny.

## Suggested build order

1. #6 remainder + #4 (both tiny, same surfaces as shipped work)
2. #2 time estimates (tiny, high time-blindness value)
3. #1 dashboard "Today" consolidation (medium, needs design pass)
4. #5 type-scale token spec → text-size v1.5
5. #3 pause/resume — blocked on #78 queue semantics anyway
