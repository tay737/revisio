# Profiles, Settings, Achievements & Admin Controls — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Public profiles with user-controlled privacy, avatars, bios, a settings page (name/password/email), more achievements, more admin controls — then commit and deploy to Vercel.

**Architecture:** One migration adds identity + privacy columns to `users`. A new `src/services/profile.ts` is the single owner of "what a profile shows to whom" (server-side visibility filtering, used by both the public page and the API). Settings writes go through the existing `/me` PATCH plus two new `me/*` endpoints (password, email-change via the existing email-token flow). The public profile lives at `/u/[handle]` outside the auth shell so signed-out visitors can see it.

**Tech Stack:** Next.js 14 App Router, Drizzle/Postgres, SWR, existing Revisio design system (one accent, token classes, `RankCrest`).

**Spec:** This session's request — public profile (name/username/nickname/details with visibility toggles, XP, achievements, rank, subjects), profile picture support/customisation, bio/about-me, settings page (change name/password/email), more achievements, more admin-panel controls, concise copy, commit + deploy.

## Global Constraints

- One `pg.Pool` per concern via `createAppPool`; reads that tolerate staleness go through `readReplica` (docs/ARCHITECTURE.md §21–22).
- One accent colour; rank/tier colour is geometry (`crestFor`), never hex; icons come from the registry (`src/components/ui/icons.tsx`), no emoji in chrome.
- Copy: concise, second person, no exclamation marks, sentence case (docs/DESIGN-DUOLINGO.md).
- Sync: triggers capture `to_jsonb(NEW)`, so new `users` columns replicate automatically once the migration is applied to BOTH databases.
- Verify with `npx tsc --noEmit` and `npm run build` after every task.

## Review Focus

- A viewer who is **not signed in** must see the public profile, with only fields the owner left public — tested via unauthenticated fetch in Task 6.
- A **username collision or reserved word** (`admin`, `api`, `u`, …) must be rejected with a human message — tested in Task 3.
- A **wrong current password** must change nothing and say so; a right one must revoke other sessions — Task 4.
- **Both databases** must accept the migration before deploy; the app must still boot if the mirror is behind (fail-open) — Task 10.

---

### Task 1: Schema migration — identity, avatar, privacy

**Files:** Modify `src/db/schema.ts`; generate `drizzle/0001_*.sql` via drizzle-kit.

- `users` += `username` (unique nullable index), `nickname`, `bio`, `avatarEmoji`, `avatarColor` (default `ink`), `pendingEmail`, `profileVisibility` jsonb (all-true default).
- `emailTokens.kind` type widens to include `'email_change'` (text column, no DB constraint — type-level only).

### Task 2: Profile service (single owner of visibility)

**Files:** Create `src/services/profile.ts`; create `src/app/api/v1/profile/[handle]/route.ts`.

- `getPublicProfile(handle, viewer)` — resolves by `username` else `users.id`; gathers XP/rank/achievements/subjects via `readReplica`; returns `isOwner` plus only the fields `profileVisibility` allows (owner always sees everything).
- `PROFILE_FIELDS` type shared with the client; `validateUsername` with reserved-word list.

### Task 3: `/me` PATCH extension + username handling

**Files:** Modify `src/app/api/v1/me/route.ts`, `src/lib/useMe.ts` (`Me` type + snapshot).

- PATCH accepts `nickname, username, bio, avatarEmoji, avatarColor, profileVisibility` with validation; GET returns them.

### Task 4: Settings endpoints — password + email change

**Files:** Create `src/app/api/v1/me/password/route.ts`, `src/app/api/v1/me/email/route.ts`; modify `src/app/api/v1/auth/verify-email/route.ts` (handle `email_change`: swap `pendingEmail` → `email`).

- Password: verify current, rehash, `revokeAllRefreshTokens` (other devices sign out).
- Email: verify password, check uniqueness, set `pendingEmail`, email a `email_change` token to the new address. Email swaps only on link click.

### Task 5: Avatar component + identity surfaces

**Files:** Create `src/components/ui/avatar.tsx`; modify `Sidebar`, `AccountSheet` to use it.

- `Avatar { name, emoji?, color?, size }` — token-pair colours (ink/moss/bee/dawn/sky), emoji or initials. No image upload (no object store wired); emoji+colour customisation now, uploads later.

### Task 6: Public profile page `/u/[handle]`

**Files:** Create `src/app/u/[handle]/page.tsx` (server component) + small client "Share" affordance.

- Player-card header (avatar, names, rank crest), bio, stats strip (XP/level/streak), achievements grid, subjects. Empty states invite the owner to fill things in (link to `/settings`). Copy stays in `lib/profile.ts` where it is voice.

### Task 7: Settings page `/settings`

**Files:** Create `src/app/(app)/settings/page.tsx`; add nav entry in `src/components/nav/routes.ts` (all roles).

- Sections: Profile (name/nickname/username/bio/avatar), Privacy (visibility toggles), Account (email change), Security (password change, 2FA link), Preferences (density, reduced motion, leaderboard opt-out). Every action acknowledges itself via `Notice`.

### Task 8: More achievements

**Files:** Modify `scripts/seed.ts` (+7 rows), `src/components/ui/icons.tsx` (id → glyph map).

- reviews-500/1000, xp-5000/25000, streak-100, perfect-session-20, level-25 (via `xp_total` threshold). Run seed against both DBs.

### Task 9: More admin controls

**Files:** Modify `src/app/api/v1/admin/route.ts` (+`verify_user_email`, `revoke_sessions`, `delete_subject`), `src/app/(app)/admin/page.tsx` (email-verified column, per-subject delete, session-revoke + verify buttons).

- All three write audit rows. Delete subject asks for confirmation client-side.

### Task 10: Verify, docs, commit, deploy

- `tsc --noEmit`, `npm run build`, dev-server E2E (register → settings → profile → admin actions).
- Apply migration to Supabase **and** Neon; re-seed achievements on both.
- ARCHITECTURE.md §23; root `AGENTS.md` learnings; commit; restore Supabase `DATABASE_URL` in `.env`; set Vercel env (`NEON_DATABASE_URL`, `CRON_SECRET`); deploy via git push → Vercel.
