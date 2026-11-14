# Frontend UX/UI audit, 2026-11-14

Scope: the public site and the signed-in app, measured against `docs/UI-SYSTEM.md`
(the rules), `docs/ONBOARDING-REVIEW.md` (the review that preceded it) and
`docs/FRONTEND-ARCHITECTURE.md` §7 (the phased plan). Audience: 13 to 22, with
adults on the teacher and staff paths.

Evidence runs:

| Run | Target | Result |
|---|---|---|
| `npm run e2e:public-ux` | local build on `:3115`, seeded Postgres 16 | 102 checks passed, 0 axe violation instances, 4 stubbed API calls, 0 non-GET |
| `npm run e2e:public-ux` | `https://revisio-srs.vercel.app` | FAIL at the service-worker update assertion (F11) |
| `npm run audit:app` | local build on `:3115`, probe account | `/dashboard`: 2 FAIL (F3, F4). Run then timed out compiling `/review` |
| `npm run audit:app` | `https://revisio-srs.vercel.app`, probe account | 24 screens, 72 FAIL: `session-lost`, `inline-type` and `tap-size` on every screen (F3, F4, F14). 0 axe, 0 page findings |
| `npm run e2e:smoke` | `https://revisio-srs.vercel.app`, run twice | 10 passed, 1 failed: `/review` rendered the login page (F14) |
| `information_schema` | Supabase primary and Neon mirror, 14 Nov 00:34 | `education_level` present on both; F2 was real when first measured and is now closed |
| source grep | `src/app`, `src/components` | 241 inline `text-[Npx]` occurrences (F3) |

Verification update, 14 Nov (QA, `agent-1794615490496-xyodob`, production `revisio-srs.vercel.app` on `63bd22d`): `e2e:smoke` 26 passed, 0 failed, 0 skipped, 0 findings; no settings bounce and no 401 refresh storm observed, so F14 is closed on the live build. `audit:app` reported 24 screens, 0 FAIL, 0 WARN, 0 axe, 0 page findings on production; `e2e:public-ux` 105 checks with 0 axe (these measure type scale, tap targets, overflow and a11y, not copy voice). QA confirmed the registration flow now collects `level` and sends it, the API validates/stores it, `/api/v1/me` returns `educationLevel`, and the study step renders (`RegisterWizard.tsx:501`), so the DPO condition on F1 is met end to end; F6–F10 remain open copy defects. QA noted their sign-off rests on the project's own browser suites and direct code/database checks (QA tester delegation timed out/offline), recorded rather than hidden.

Not assessed, and why: dark mode (no fresh render); screen-reader output (no AT
available, so accessibility claims rest on the accessibility tree and axe). The
earlier local `audit:app` run died on a cold Next compile rather than on a
product error; deployed signed-in coverage and the production smoke re-run above
supersede that limitation for the checks they cover.

---

## 1. Summary

The public surface now holds the line the spec drew. The landing names its
category and audience in the `h1`, carries three checkable facts above the fold,
and runs one entrance instead of the effect stack that used to be there. The
public gate passes 102 checks with no axe violations, and the sign-in and
registration routes share one shell and one button.

The signed-in shell does not yet hold that line. The dashboard mixes
`text-[12px]`, `text-[13px]` and `text-[14px]` in one viewport, and ten controls
sit under the 44px touch minimum. Both are exactly what `UI-SYSTEM.md` §5 and §10
forbid, and the audit reports them as machine-checked failures.

The onboarding rework is half-landed. The wizard still collects role, account,
date of birth, then subjects, which is not the order the spec chose, and it never
asks for the education level even though the API accepts it, `src/lib/education-levels.ts`
validates it and `users.education_level` exists in the working tree.

One defect is worse than anything visual: the deployed build signs a learner out
on every reload. `audit:app` against production reports `session-lost` on all 24
signed-in screens, and the server's refresh endpoint answers 200 with the cookie
the login has just set. The client at HEAD only refreshes when it already holds
an access token, which a reload cannot have. That fix is written in the working
tree and is simply not deployed. The schema blocker I first reported
(`education_level` missing from production) closed during the audit: both
databases now have the column, checked directly.

Copy is mostly plain and specific, with a few tells that read as template text:
a real person's name as a form placeholder, a bureaucratic date-of-birth label,
and step headings written as questions where the spec asks for nouns.

The Data Privacy Officer has ruled on the three privacy items this audit raised
(`docs/PRIVACY-REVIEW-2026-11-14.md` §7). The date-of-birth sentence is approved
as written, the guardian consent sentence is approved with "using" in place of
my "storing", and the education level needs a feature that reads it before it
ships. Those rulings are now folded into F1 and F10 below.

---

## 2. Top 10 actions, ranked

1. Deploy the `src/lib/api.ts` cold-load refresh fix; production signs every learner out on reload today (F14).
2. Add the level step and move subjects before the account step (F1).
3. Replace inline `text-[Npx]` with the `.t-*` scale, starting with the app shell and landing nav (F3).
4. Raise every control under 44px to the floor, then re-run `audit:app` (F4).
5. Give the wizard per-field errors and move focus to the first failure (F5).
6. Rewrite the three question headings as nouns (F6).
7. Put the success state back inside `AuthShell` (F7).
8. Fix the service-worker gate assertion so update behaviour is actually verified (F11).
9. Replace the filler name and the "Learner's date of birth" label (F8, F9).
10. Cut the guardian consent sentence to two plain clauses (F10).

---

## 3. Scorecard

| Dimension | Score | One line |
|---|---|---|
| Visual | 4/5 | One system, one accent, real product on the first screen; the app shell still mixes five type sizes. |
| Usability | 3/5 | Clear flows and honest states; errors land at the bottom of a step, and touch targets are undersized. |
| Accessibility | 3/5 | Public routes pass axe cleanly; per-field error association and 44px targets are unmet in the app. |
| Microcopy | 4/5 | Specific and calm, with three template tells left in the wizard. |

---

## 4. Findings

Severity: 4 catastrophe, 3 major, 2 minor, 1 cosmetic.

### F1. Registration collects the education level, but the step copy and label spec are not fully settled

- Screen: `/register`
- Source: code, verified against `src/components/RegisterWizard.tsx` at `63bd22d` and QA's production checks
- Evidence (current): `stepsFor('student')` returns `['role','study','account','profile','review']`, so study (level and subjects) comes before the account step. The submit sends `level: student && level ? level : undefined` (`RegisterWizard.tsx:177`), `src/app/api/v1/auth/register/route.ts` validates with `isEducationLevel` and stores it, `/api/v1/me` returns `educationLevel` (`route.ts:94`), and the level control renders at `RegisterWizard.tsx:501`. QA verified this end to end on production (14 Nov).
- What changed: the original defect — level never asked for, never sent, and subjects after the account step — is resolved. The DPO condition is met: the level is collected, stored and returned by a real consumer path rather than held for no purpose, and it remains out of `getPublicProfile` (no visibility key, so adding it there would publish every learner's level).
- What remains: the study/account/profile/review headings are still questions or phrased copies (`"How will you use Revisio?"`, `"What are you studying?"`, `"A little about you"`, `"Check and create"`) rather than the noun labels named in the spec (tracked in F6), and Q3 is still open on which exact label set is canonical.
- Why: `ONBOARDING-REVIEW.md` §4.2; `UI-SYSTEM.md` §8.6 and §9.
- Severity 1 now for the remaining copy/label alignment (was 3), Effort S, Confidence Certain for the current state; High for the canonical-label choice (Q3).

### F2. `education_level` was missing from production (closed 14 Nov)

- Screen: none. API and every signed-in query.
- Source: database.
- Evidence: when first measured at 00:23 on 14 Nov, `select … education_level … from users` against the production `DATABASE_URL` returned `error: column "education_level" does not exist` (SQLSTATE 42703), and both `e2e:smoke` and `audit:app` died on it. Re-checked at 00:34 with `information_schema.columns`: the Supabase primary and the Neon mirror both list `age_consent, education_level`, and the probe account now signs in.
- What: it was a real blocker for about ten minutes, not a standing defect. The migration was created and applied while the audit was running, so the first measurement caught the window before it landed. The remediation I asked for had already happened.
- Why it stays in the document: a deploy still needs the migration file itself, which is untracked in git, and the rule it illustrates (apply `users` columns to both databases before deploy) has not changed.
- Status: closed. Full-Stack applied `drizzle/0013_users_education_level.sql` to both databases and re-verified. That file and `0014_media_assets_delete_failed.sql` stay untracked by design: they are release-checklist item 1, held with the release commit, which is gated on QA sign-off, which is in turn gated on F1. Nothing can reach production between now and then without that commit. `0014` is the media-deletion ledger marker, so it belongs to the DPO's P1-3 rather than to F1: it adds nullable `media_assets.delete_failed_at`, is applied to both databases, and is written only on an erasure failure. A fresh environment missing `0013` fails on every signed-in read; one missing `0014` fails inside a delete when storage is down.
- Severity 0 now (was 4), Effort done, Confidence Certain.

### F3. Inline type sizes are still in circulation across the app

- Screen: `/dashboard` and `/` measured; 241 occurrences in source
- Source: both
- Evidence: `audit:app` reports `inline-type` on `/dashboard @1440` for `text-[14px]`, `text-[13px]` and `text-[12px]` in eleven places, including "Ten reviews and you are placed for this season." and the "Being placed" label. `src/app/page.tsx` alone has 15: `text-[15px]` on the three nav links, `text-[13px]` on the logo tile, `text-[16px]` on the forgetting-curve paragraph. Repo-wide counts: 82 at 14px, 60 at 13px, 36 at 15px, 31 at 12px.
- What: five near-identical small sizes replace the scale, so vertical rhythm differs between screens that should be identical.
- Why: `UI-SYSTEM.md` §5, "Use the class, not a value. `text-[15px]` outside a diagram or a visual is a defect."
- Fix: map each to `.t-caption` (14), `.t-fine` (12), `.t-body` (16), `.t-lead-airy` (17) and `.t-label`; leave none behind in `page.tsx`, `(app)/**` or the auth components.
- Severity 3, Effort M, Confidence Certain.

### F4. Ten controls on the dashboard are under the 44px touch floor

- Screen: `/dashboard` at 1440
- Source: browser, `audit:app` `tap-size`
- Evidence: skip link 138x41, wordmark 223x28, avatar 36x36, theme toggle 36x36 (twice), sign out 36x36, "0due" chip 80x30, "Pick a topic" 98x21, "Insights" 83x36, "Manage" 54x21, "Find one" 57x17.
- What: five of these are under 24px in one dimension, which fails WCAG 2.2 SC 2.5.8 (AA). All of them miss the house floor.
- Why: `UI-SYSTEM.md` §10, "Every control >= 44px tall on touch; >= 8px separation"; WCAG 2.2 SC 2.5.8.
- Fix: give the icon buttons `size="icon"` (44px), make the due chip and the inline text links carry `min-h-11` and vertical padding, and give the wordmark link a 44px hit area without growing the glyph.
- Severity 3, Effort S, Confidence Certain.

### F5. Wizard errors are still one notice at the bottom of the step

- Screen: `/register`, every step
- Source: code, `src/components/RegisterWizard.tsx` 447 to 449 and 128 to 136
- Evidence: `validate()` returns a string, `setError(problem)` stores it, and `<Notice tone="bad" show={!!error}>` renders it after the fields. No field receives `aria-invalid`, no field has an error slot, and focus stays where it was. The API already returns a `field` on every rejection (`register/route.ts:28` onwards), so the client has the association and discards it.
- What: a wrong password marks nothing, and a screen-reader user hears a sentence detached from the control it describes.
- Why: `UI-SYSTEM.md` §8.3 ("Error renders under its own control, with `aria-invalid` and `aria-describedby` pointing at that error only. On submit, the first invalid field takes focus"); WCAG 3.3.1.
- Fix: give `Field` an `error` prop rendered under the control, key wizard errors by field, set `aria-invalid` and `aria-describedby`, and focus the first failing control.
- Severity 3, Effort M, Confidence Certain.

### F6. Step headings are questions, not nouns

- Screen: `/register`
- Source: code, `RegisterWizard.tsx:29-35`
- Evidence: "How will you use Revisio?", "A little about you", "Check and create". `UI-SYSTEM.md` §8.6 names the stepper copy "Step 2 of 5: What you study", and `register/page.tsx` sits under an `h1` that says "Create your account", so the wizard restates its own container.
- What: the heading asks the learner to parse a sentence where a label would do, and "A little about you" gives no reason why the data is wanted.
- Why: `UI-SYSTEM.md` §9, "Headings name a noun. 'What you study', not 'Let's get started'." Also stop-slop: no staged/openers.
- Fix: "Your role", "Your account", "What you study", "About you", "Confirm".
- Severity 2, Effort S, Confidence Certain.

### F7. The success state leaves the shell

- Screen: `/register` after submit
- Source: code, `RegisterWizard.tsx:177-199`
- Evidence: returns a bare `<Card>` with `h1` "You are in", a `Notice`, and a link to sign in. No `AuthShell`, so the ink header band and wordmark disappear at the exact moment the journey should feel continuous.
- What: the landing to register to verify to login path restarts its chrome on the last screen of registration.
- Why: `ONBOARDING-REVIEW.md` P0-3; `UI-SYSTEM.md` §8.5, "AuthShell is the only auth chrome".
- Fix: render the outcome inside `AuthShell` (or in the wizard's own card with the shell retained) and retitle the `h1` to "Check your inbox" for the email case.
- Severity 2, Effort S, Confidence Certain.

### F8. A real person's name is the placeholder in the name field

- Screen: `/register`, account step
- Source: code, `RegisterWizard.tsx:306`
- Evidence: `placeholder="Ada Lovelace"`. The email field next to it uses "you@school.edu", which is at least a pattern.
- What: filler that looks like data, in the first field a new learner types into.
- Why: antislop-ui, "Filler data in fields": use "Your Name" or an honest example. Also `UI-SYSTEM.md` §9 (plain words).
- Fix: `placeholder="Your name"`, and drop the placeholder if the visible label already says it.
- Severity 1, Effort S, Confidence Certain.

### F9. "Learner's date of birth" addresses the wrong person

- Screen: `/register`, about-you step
- Source: code, `RegisterWizard.tsx:347`
- Evidence: label text is "Learner's date of birth" while the surrounding copy addresses the person filling the form ("You can change these at any time").
- What: the learner is asked for "the learner's" date of birth, which reads like a form for someone else. The review list then says "Date of birth" (`:462`), so the same field has two names.
- Why: `UI-SYSTEM.md` §9, "One fact, one wording, everywhere"; Nielsen H2 (match to the real world).
- Fix: "Your date of birth" for self sign-up; keep the third-person wording only in the guardian variant.
- Severity 1, Effort S, Confidence Certain.

### F10. The guardian consent sentence is long and shifts person mid-sentence

- Screen: `/register`, consent checkbox for under-13
- Source: code, `RegisterWizard.tsx:378-381`
- Evidence: "I am the parent or legal guardian creating this learner's account, and I consent to Revisio processing their information to provide the service. I can withdraw this consent by contacting support." That is 38 words at `t-caption`, and it moves from "I" to "this learner" to "their".
- What: the one consent statement with legal weight is the hardest sentence on the screen to read.
- Why: GOV.UK plain-language guidance; WCAG 3.3.2 (labels and instructions); `UI-SYSTEM.md` §9 (short sentences, active voice).
- Fix: DPO-approved wording (`docs/PRIVACY-REVIEW-2026-11-14.md` §7.3), which keeps "using" because consent must describe the processing it authorises, not just storage: "I am this learner's parent or guardian, and I agree to Revisio using their details to run their account. Contact support to withdraw this." Put the withdrawal route on its own line as a link.
- Severity 2, Effort S, Confidence Certain.

### F11. The service-worker update assertion contradicts its own comment and fails on production

- Screen: none. `npm run e2e:public-ux`.
- Source: code, `scripts/e2e/public-ux.ts:552-556`
- Evidence: the comment says "what matters is that some worker controls the page", and the assertion requires `controlledBy.endsWith('/sw.js')`. The test itself registers a probe worker at `/sw-probe.js` whose `activate` calls `clients.claim()`, so after "Update now" the controller is legitimately the probe. Production run: `AssertionError … (controller: https://revisio-srs.vercel.app/sw-probe.js)`. The local run passed, which makes this timing-dependent, not product-dependent.
- What: the gate that is supposed to prove real update behaviour can fail on correct behaviour, so a red gate here says nothing about the app.
- Why: the project's own rule that a check must fail only on a real regression (README, Verification).
- Fix: either assert that any worker controls the page (matching the comment), or register the probe at a different scope and assert `/sw.js` specifically. Do not weaken the reload-count check next to it.
- Severity 3, Effort S, Confidence Certain.

### F12. Two theme toggles render on the dashboard

- Screen: `/dashboard` at 1440
- Source: browser, `audit:app` `tap-size`
- Evidence: the list contains `button 36x36 "Toggle theme"` twice, at different points in the same scan.
- What: likely the shell header plus a second toggle inside page content. Two controls with one job is the "second recipe" the spec forbids, and a duplicate accessible name is ambiguous to a screen-reader user.
- Why: `UI-SYSTEM.md` §2.2 ("A second recipe is a bug"), §10.
- Fix: keep the shell toggle; remove the page-level one, or give it a distinct name if it really does something else.
- Severity 2, Effort S, Confidence Likely (needs one DOM check to confirm both are visible).

### F13. The wizard's own chrome uses non-system values

- Screen: `/register`
- Source: code, `RegisterWizard.tsx:262, 447, 483`
- Evidence: role cards use `rounded-2xl` (24px) while §6 says cards are 16; review rows use `text-[15px]` for values and `text-[13px]` for the Edit control; the buttons add `active:scale-[0.98] transition-transform` on top of the shared lip.
- What: the step invents a radius, two type sizes and a press animation beside the system that already owns all three.
- Why: `UI-SYSTEM.md` §6 (radius ladder), §8.1 (the lip is the press), §5.
- Fix: `rounded-lg`, `.t-body` and `.t-caption`, and drop the inline scale transitions.
- Severity 2, Effort S, Confidence Certain.

### F14. The deployed build signed a learner out on every reload (closed on production 14 Nov)

- Screen: all signed-in screens, production (as measured 14 Nov 00:xx)
- Source: browser, protocol check, source, and QA production verification
- Original evidence: `audit:app` against `https://revisio-srs.vercel.app` reported `session-lost` on 24 of 24 screens, each reading "a reload of /dashboard landed on /login". `e2e:smoke` failed twice with `/review` rendering the sign-in form. Protocol check showed `POST /api/v1/auth/login` returned 200 with `Set-Cookie: srs_refresh=…` and `POST /api/v1/auth/refresh` with that cookie returned 200, so the server and cookie were healthy.
- Cause: the client never asked for a refresh on a cold load. The access token lives in memory only, so after a reload there was no token, no refresh attempt, a 401 from `/api/v1/me`, and a bounce to `/login` while the valid cookie sat unused. The fix refreshes for every non-auth 401 (`src/lib/api.ts:90`, `accessToken || !isAuthEndpoint`, leaving auth endpoints' own 401s alone).
- Verification (QA, 14 Nov, `63bd22d` on production): `e2e:smoke` 26 passed, 0 failed, 0 skipped, 0 findings; no settings bounce and no 401 refresh storm observed.
- Status: closed on the live build.
- Severity 0 now (was 4 on the deployed build at first measure), Effort done, Confidence Certain.

---

## 5. Risks

- R1. (Cleared on production 14 Nov.) F14's cold-load sign-out is closed on the live build (`63bd22d`, smoke 26/0). Keep production smoke in the release routine because this class of regression is silent to local runs.
- R2. The undersized targets and missing per-field errors leave WCAG 2.2 AA unmet in the app, which matters for the EAA audience (public sector and education buyers increasingly ask).
- R3. (Reduced.) Registration now collects, stores and returns the education level, so the earlier "collects less than the schema supports" gap is closed; step labels and copy (F1 remainder, F6–F10) still understate the intended clarity of the flow.
- R4. A gate that fails on correct behaviour (F11) trains the team to ignore red runs, which is how the next real regression ships.
- R5. (Satisfied for this revision, per QA.) The DPO condition is met end to end: the level is collected and consumed/returned rather than held for no purpose, and it remains out of `getPublicProfile`. Any future change that stops using it, or exposes it publicly, reopens this risk.
- R6. Consent-surface and account-deletion findings (the DPO's P1-3, P2-4 and P3-5) live in `docs/PRIVACY-REVIEW-2026-11-14.md` and are deliberately not restated here. This audit did not test consent surfaces, so a copy would claim coverage it does not have and give one finding two sources of truth.

## 6. Actions

- A1. (Done in source and on production for F14; migrations applied.) `0013_users_education_level.sql` and `0014_media_assets_delete_failed.sql` are committed/tracked and applied to both databases, and `src/lib/api.ts`'s cold-load refresh fix is live on `63bd22d` with production smoke 26/0 confirming F14 closed. Keep smoke as the acceptance check for future auth/session changes.
- A2. (Substantially done.) Level collection, storage, `/api/v1/me` exposure and the study-before-account step are in place; align remaining wizard labels/copy to the canonical spec (Q3) and close the F1 copy remainder together with F6.
- A3. Wizard: per-field error slots and focus to first failure (owner: frontend, F5).
- A4. App shell: 44px targets for icon buttons, chips and inline links; remove the duplicate theme toggle (owner: frontend, F4, F12).
- A5. Type sweep: replace `text-[Npx]` with `.t-*`, landing and app (owner: frontend, F3, F13).
- A6. Copy pass: headings as nouns, placeholder, DOB label, consent sentence, success state (owner: frontend, F6 to F10). **Still open per QA** (copy voice, not covered by type/tap/a11y gates).
- A7. Fix the PWA gate assertion (owner: frontend, F11).
- A8. Re-run `e2e:public-ux`, `audit:app`, `e2e:smoke`, `typecheck`, `build` after the changes, then QA.

## 7. Open questions

- Q1. Does the release intend to collect level at sign-up now, or is the column staged for a later release? The column exists on both databases, so this is a product decision now, not a deploy blocker (F2 closed).
- Q2. Is the duplicate "Toggle theme" intentional (shell plus a settings preview), or a leftover? Needs one DOM confirmation before removal (F12).
- Q3. Which step labels are canonical: the review's "What you study" or the wizard's "What are you studying?" The spec names the first; confirm before renaming.

## 8. Text inventory, onboarding only

| Location | Current | Purpose | Needed | Length | Placement | Tone | Rewrite |
|---|---|---|---|---|---|---|---|
| `/register` h1 | Create your account | Names the screen | Yes | 3 words | Card top | Plain | Keep |
| Step 1 h2 | How will you use Revisio? | Asks role | Yes | 5 words | Step head | Question | Your role |
| Step 1 options | Student / Teacher with hints | Explains the two paths | Yes | 8 words each | Under label | Plain | Keep |
| Step 2 h2 | Create your sign-in | Names the step | Yes | 3 words | Step head | Verb | Your account |
| Name placeholder | Ada Lovelace | Shows format | No | 2 words | Inside field | Filler | Your name, or remove |
| Email placeholder | you@school.edu | Shows format | Yes | 1 token | Inside field | Assumes school | you@example.com |
| Password strength | Needs at least 8 characters / Fair / Good / Strong | Live feedback | Yes | 4 words | Under field | Plain | Keep |
| Step 3 h2 | A little about you | Names the step | Yes (renamed) | 4 words | Step head | Vague | About you |
| DOB label | Learner's date of birth | Labels the field | Yes | 3 words | Above field | Third person | Your date of birth |
| DOB hint | We use this only to check whether guardian consent is required; it is not stored for learners aged 13 or older. | Justifies the data | Yes | 20 words | Under field | Honest, long | Keep as written; DPO approved it (`PRIVACY-REVIEW` §7.1), the split is optional |
| Consent | I am the parent or legal guardian creating this learner's account, and I consent to Revisio processing their information to provide the service. I can withdraw this consent by contacting support. | Legal consent | Yes | 38 words | Under checkbox | Formal | I am this learner's parent or guardian, and I agree to Revisio using their details to run their account. Contact support to withdraw this. |
| Step 4 h2 | What are you studying? | Names the step | Yes | 4 words | Step head | Question | What you study |
| Subjects hint | You can change these at any time. | Reassures | Yes | 8 words | Under chips | Keep | Keep |
| Class code label | Class code (optional) | Labels the field | Yes | 3 words | Above field | Keep | Keep |
| Step 5 h2 | Check and create | Names the step | Yes (renamed) | 3 words | Step head | Two verbs | Confirm |
| Submit | Create account | Names the action | Yes | 2 words | Footer | Keep | Keep |
| Busy label | Just a moment… | Reports pending | Yes | 3 words | On button | Vague | Creating your account… |
| Success h1 | You are in | Reports outcome | Yes (rewritten) | 3 words | Card top | Celebratory | Check your inbox |
| Wizard error | per-step string in one Notice | Reports failure | Yes | varies | Bottom of step | Plain | Move under the field |

Full-app string inventory not produced: the audit measured one signed-in screen. Reconciling every string is the next pass, after F2 unblocks the signed-in run.

## 9. What is good

- The landing `h1` names category and audience, with three facts, and the demo is the product rather than a mock.
- One auth shell, one button component and one press lip across the public routes, confirmed by 102 passing checks and zero axe violations.
- The registration progress bar carries `aria-valuetext`, focuses the new step heading, and validates before it lets a learner advance.
- The register API rejects with a named field on every error, so the client already has what F5 needs.
- The date-of-birth copy is true: `register/route.ts` stores `dateOfBirth` only for under-13 learners, which matches what the form promises.
- The error state says what happened, that work is safe, and offers one action, which is better than most.
