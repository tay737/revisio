# Privacy review: consent, age gate and the frontend rework

Status: Data Privacy Officer review, 14 November 2026. Scope: the onboarding
rework and app surfaces described in `docs/FRONTEND-ARCHITECTURE.md`, with the
code paths they touch: registration, the age gate, the consent record, the
cookie banner, Settings, and account deletion.

Legal frame: UK GDPR, the Data Protection Act 2018, and the Age Appropriate
Design Code for the under-18 flow. The service is aimed at learners from 13, and
it accepts under-13s only with a guardian's consent, so the child-safety parts
are in scope throughout.

---

## 1. Verdict

The privacy design holds up better than the interface around it. The policy is
specific about what the product does, including the places where it does less
than a reader might assume, and the controls I tested match what it says.

Three defects were live before this review. None of them was a data breach, and
all three are now closed: two in this pass, and the third in the deletion route
while this review was being written. One weakened the evidence a consent record
is supposed to provide, one showed a consent switch that does nothing, and one
left uploaded images in object storage after an account was deleted.

---

## 2. Claims checked, and what held

Each row is a claim the policy makes, and the evidence I found for it.

| Claim (policy section) | Evidence |
|---|---|
| No analytics provider, no third-party script (§5, §14) | Fetched `https://revisio-srs.vercel.app/` on 14 Nov 2026: 67,336 bytes, zero external `src`/`href` origins, zero matches for `fonts.googleapis.com`, `googletagmanager`, `google-analytics`, `va.vercel`, `sentry`, `posthog` or `hotjar`. Inter is served by `next/font` from the build, not from Google. |
| Date of birth is not kept for learners aged 13 or over (§2) | `src/app/api/v1/auth/register/route.ts` writes `dateOfBirth` only when `underAge`, and `ageConsent: underAge`. A learner of 13 or over has no DOB column written at all. |
| The server decides whether guardian consent is required (§12) | `isUnderAge()` runs on the parsed body before insert, and the request is refused with `age_consent_required` when the check fails. Skipping the form step in the browser does not skip the gate. |
| Rate-limit counters keep an IP and a count only (§2, §6) | `src/services/rate-limit.ts` upserts a fixed window keyed by IP (and email plus IP on login). No other data is derived from it. |
| Deletion is bound to the session, not to a client id (§10) | `DELETE /api/v1/data-deletion` calls `requireUser`, then requires a signed, short-lived challenge bound to that user id. |
| Nothing non-essential is loaded before a choice (§11) | No analytics or tag-manager package is imported anywhere in `src`. `@vercel/speed-insights` is in `package.json` but unreferenced (see P3-6). |
| Consent is granular, unticked by default, and stored per purpose (§3, §13) | `src/lib/consent.ts` starts every non-essential purpose at `false`; `PATCH /api/v1/consent` builds the record from explicit booleans only, so an omitted key stays off rather than being filled in. |

The under-13 gate is self-attestation, and the policy says so in §12 rather than
implying a verification step that does not exist. That is the right call.

---

## 3. Findings

Severity follows the convention in `docs/ONBOARDING-REVIEW.md`: P1 undermines a
guarantee or a standard, P2 is a defect that will compound, P3 is a judgement
call.

### P1-1 The consent record's timestamp came from the browser (fixed)

`PATCH /api/v1/consent` stored `updatedAt` and `decidedAt` exactly as the client
sent them, and derived the `consent_updated_at` column from the same string.

Why it matters: a consent record exists to demonstrate that consent was given,
and when (UK GDPR Art 7(1)). A timestamp the browser supplies can be backdated
by anyone with a session, or by a replayed local record, so the record proves
the choices but not the date. The cookie policy tells users that each refusal is
"stored with a time-stamp", which made the gap a statement about the product
rather than an internal detail.

Fixed in this pass: the server stamps `updatedAt`, `decidedAt` and
`consent_updated_at` when the request arrives, and keeps the browser's claimed
time as `clientReportedAt` for the offline case. The decision time is still
recoverable; it can no longer substitute for the receipt time.

### P1-2 Two consent purposes promised an effect nothing implements (copy fixed, behaviour routed)

The cookie banner and Settings both offer "Profile fields" and "School / account
data" as optional purposes, described as controlling whether your profile fields
are shown and what class data is held.

Nothing reads those two keys. `getPublicProfile` filters on `profileVisibility`
alone. No class or school read consults `consent`. So ticking either box changed
nothing visible, and clearing it withdrew nothing, which is the failure mode
Art 7(3) is about: withdrawal has to be effective once it is offered.

The cookie policy was already accurate about this ("the switches live under
Privacy in Settings; this consent records the choice for the audit trail"). The
banner and the Settings row were not, so the same product said two different
things about one control.

Fixed in this pass: the two descriptions now say they are a record of the
choice, and name the control that actually does the work. The behaviour is in
§5, with the full stack agent, because making those keys effective is a
product decision rather than a copy fix.

### P1-3 Deletion leaves uploaded images in object storage (closed; success path verified at runtime)

`DELETE /api/v1/data-deletion` nulls `avatarUrl` and `bannerUrl` on the row. The
objects themselves stay in the Neon object store, and the policy admits it in
§10 ("Uploaded avatar and banner images are not removed by that control today").

An erasure request that removes the pointer and keeps the file is not erasure of
that file. The honest wording lowers the risk of a misleading claim but does not
close the gap, because a user clicking "Delete my data" has no way to know which
records survive and would not expect a stored photograph to be one of them.

Closed by the full stack agent during this review. `data-deletion/route.ts` now
reads `media_assets` for the caller and calls `deleteMediaObject` on every key
before the transaction anonymises the row, and the §10 caveat is gone, so the
policy no longer promises less than the code does. Ordering is right: the ledger
is read while the rows still name the objects.

One residual risk remains and is logged in §6: `deleteMediaObject` is
deliberately best-effort and only logs a failure, so a bucket error leaves the
bytes in place while the user is told their data is deleted. §6 records the fix
I asked for: retry once per object, keep the ledger row for any key that still
failed, and stop claiming removal the route cannot show.

Exercised against real storage by QA on 14 November 2026, on a throwaway
account: register with a level, presign, upload to the bucket, confirm, read the
asset back through the proxy, then run the deletion. Afterwards the account held
no `media_assets` rows, the `users` row was anonymised (`status` deleted, level
and avatar null, `age_consent` false), sign-in returned 401, and `readMediaObject`on the key returned null, so the bytes are gone rather than merely unlinked. A
second run closed the HTTP half as well: the asset served 200 before the deletion
and 404 after it, with `mediaQueued: 0` and the plain success text, so the store's
answer and the route's answer now both exist for the clean path.

The failure branch was exercised the same day, and that branch is the one my
ruling in §7.4 is about. QA forced a store rejection on a ledger key and ran the
endpoint on a fresh throwaway account: the response was 200 with `mediaQueued: 1`
and the singular queued wording, the plain success text was not returned, the
ledger row survived with `delete_failed_at` stamped, and the account was still
anonymised (`status` deleted, level and avatar null, `age_consent` false) with
sign-in returning 401. So erasure completes while storage is unavailable and the
learner is told an image is queued, which is what §7.4 asks for and what §10
describes.

### P2-4 "Reject all" also writes `profile: false` and `school: false` (routed)

The banner's reject action sets every non-essential key to false, including the
two purposes above. Today that is inert. If a later change makes consent gate
visibility, one click on "Reject all" would hide every profile on the platform,
which is not what a visitor answering a cookie question agreed to.

The banner should only carry purposes that are storage or communication choices.
Profile visibility belongs to its own switches, and its consent record can be
written from those switches instead of from a cookie bar.

Resolved by full stack, and the answer is the conservative one. The two keys stay
in the record as the history of the Privacy switches, and nothing makes consent
gate `getPublicProfile`, because the failure I described is exactly what that
change would build. What must not happen is the banner writing them, so the
banner's purpose list stops carrying `profile` and `school`; that file is the
frontend's, and it lands with their pass. Until it does, the keys remain inert,
which is the state this review found rather than a new risk.

### P3-5 Accept all is the only primary button (observation, routed)

The policy claims in §13 that "refusing is as easy as accepting". Both are one
click and sit side by side, so the claim holds in effort. It does not hold in
visual weight: Accept all is the filled primary button and Reject all is the
secondary one. I cannot show a legal failure from that alone, and ICO guidance
does not require identical styling. Since the product makes the stronger claim
in writing, the safe fix is to give both the same variant when the banner is
next touched.

### P3-6 An unused telemetry dependency sits in `package.json` (observation)

`@vercel/speed-insights` is installed and never imported. Nothing ships today,
so the policy's "no analytics provider" claim is true. The risk is a one-line
import later switching telemetry on without a policy change, which is exactly
the kind of silent drift §14 promises not to do. Either remove it or treat
adding it as a policy change with a consent gate.

Closed: removed from `package.json` and `package-lock.json`, rather than gated.
Gating would have needed a consent key, a policy sentence and a loader, for a
product that has no use for the data. §5's "no analytics provider" claim is now
backed by the dependency tree as well as by the source.

### P3-7 The service worker cache is not named in the policy (observation)

§11 covers cookies and local storage. The PWA also caches the app shell on the
device. That is local storage in the broad sense and it holds no personal
content, so I am not asking for a rewrite. One clause in §11 would make the
disclosure complete.

---

## 4. Changed in this pass

| File | Change | Why |
|---|---|---|
| `src/app/api/v1/consent/route.ts` | Server stamps `updatedAt`, `decidedAt` and `consentUpdatedAt`; the browser's time is stored as `clientReportedAt` | P1-1: a backdatable record is not evidence |
| `src/lib/consent.ts` | `purposeDescription('profile')` and `purposeDescription('school')` now describe the record, and name the real control | P1-2: the banner claimed an effect it does not have |
| `src/app/(app)/settings/ConsentSection.tsx` | The same two descriptions, so Settings and the banner agree | P1-2: two surfaces, one control, one wording |

The copy follows the project's voice rules: plain sentences, no exclamation
marks, a button names its action. Written with the humanizer and antislop rule
sets applied.

---

## 5. Routed, and to whom

| Finding | Owner | What is needed |
|---|---|---|
| P1-3 media objects survive deletion | Full-Stack Developer | **Closed.** The route deletes the ledger's objects before anonymising, and the §10 caveat is removed. Follow-up: make a failed delete visible (see §6) |
| P2-4 reject-all writes visibility consent | Frontend Developer | Keys stay as the record of the Privacy switches; consent must not gate `getPublicProfile`. The banner's purpose list drops `profile` and `school` |
| P3-5 primary weight on Accept all | Frontend Developer | Same button variant for accept and reject when the banner is next edited |
| P3-6 unused `@vercel/speed-insights` | Full-Stack Developer | **Closed.** Removed from `package.json` and `package-lock.json` rather than gated |

P1-1, P1-2 and P1-3 are closed. QA has verified P1-1 against the API and the
database rather than the code alone: a PATCH claiming `2020-01-01` for both
stamps returns 200, stores the server time in `decidedAt`, `updatedAt` and
`consent_updated_at`, keeps the backdated claim as `clientReportedAt`, and still
records the choice. P1-2 was confirmed on both surfaces, and the public suite ran
102 checks with no axe violations and no non-GET request.

P1-3 is verified at runtime on both branches. QA ran the clean path against the
real store on a throwaway account and confirmed the ledger rows are gone, the row
is anonymised, sign-in fails, and the object no longer reads back from the store,
with the asset route returning 404 for its key. They then
forced a store rejection on a ledger key: the response was 200 with
`mediaQueued: 1` and the queued wording, the plain success text was not returned,
the row survived and was stamped `delete_failed_at`, and the account was
anonymised anyway. An earlier attempt using an unknown bucket name proved nothing,
because this store is project-scoped and the delete reported success; that was
the test failing, and it is recorded in §6 as a risk in its own right.

Two policy edits landed with this review, both from the UX audit's questions:
§2 names the education level, and §10's removal list names it too. Without those,
§2's "if a field is not here, we do not hold it" had become false the moment the
API began accepting a level. §2 does not claim a sign-up question exists: QA
showed on 14 November that `RegisterWizard.tsx` never sends one, so the wording
was cut back to what is true today (see §7.5).

---

## 6. Not verified, and residual risk

- No under-13 registration was driven end to end in a browser. The gate was read
  in the route handler, not exercised against a live account. A browser run needs
  a throwaway account and mail capture, and it should be added to the smoke suite
  rather than done by hand once.
- Object-store deletion was exercised against a live bucket by QA on 14 November
  2026, on a throwaway account (never the shared probe). The ledger rows for the
  user were gone afterwards, `readMediaObject` on the key returned null, the
  `users` row was anonymised and sign-in returned 401. A second run covered the
  HTTP half: the asset answered 200 before the deletion and 404 after it, with
  `mediaQueued: 0` and the plain success text. Both the store's answer and the
  route's answer therefore exist for the clean path, which closes the open part of
  this check.
- The failure path is exercised. QA forced a store rejection on a ledger key and
  asserted the ruling's observable parts: 200 with `mediaQueued: 1`, the singular
  queued wording rather than the plain success text, the ledger row kept with
  `delete_failed_at` stamped, and the account anonymised anyway with sign-in
  returning 401. The stamp only lands after the second attempt fails, so the run
  proves the retry-once shape as well, not a single try. The sweeper over stamped
  rows remains a follow-up, and the policy wording deliberately does not rely on
  it: a row is stamped, but until the sweeper exists the only reader of it is the
  log.
- The plural variant of the queued message has never been produced by a test. It
  is copy, reviewed and unrun, and this review does not call it verified.
- That earlier failed attempt surfaced a second-order risk worth keeping. If the
  bucket name is wrong or the store is otherwise misconfigured, a delete can report
  success while removing nothing, and the route would then tell the learner the
  image is gone. The code cannot tell that apart from a real removal, because the
  store answers the same way. Misconfiguration is not user-reachable, so this is a
  deployment-control question rather than a code defect: the bucket name belongs
  in the release check, and a delete that removes nothing is caught by comparing
  object counts for a test account, not by reading a status code.
- Verification after deploy, not only on the local tree. The deployed build
  signs learners out on reload (the frontend audit's F14) and its fix is in the
  working tree and unshipped, so the next deploy carries that behaviour change
  alongside this review's. The banner, the Settings switches and the policy
  pages therefore need one pass against the deployed result. A privacy surface
  checked only on localhost is not checked for the people it describes.
- The consent copy change alters strings shared by the banner and Settings. QA
  should confirm both surfaces still render and save.
- This review is an engineering and compliance reading of the code and the
  published pages. It is not legal advice, and the policy still wants a
  solicitor's sign-off before a public launch.
- Retention periods in §6 were taken as written. I did not find a scheduled job
  that enforces them beyond token expiry and session expiry, so "we keep it for
  30 days" is currently a statement about expiry stamps rather than a deletion
  process. Worth a follow-up before the first real cohort.

---

## 7. Addendum: rulings on the UX audit's three questions

The UX auditor raised three items against `docs/FRONTEND-UX-UI-AUDIT-2026-11-14.md`.
These are the rulings, recorded here so the copy and the audit cannot drift apart.

### 7.1 Date of birth: the sentence is approved as written

"We use this only to check whether guardian consent is required; it is not
stored for learners aged 13 or older" matches `register/route.ts`, which writes
`dateOfBirth` only when `underAge` and sets `ageConsent` only when a guardian's
consent was actually required. It states the purpose and the retention in the
same breath, which is what Art 13(1)(c) and (2)(a) ask for. Keep it. The
suggested split into two sentences is a readability change with no legal effect,
so it is the frontend's call.

### 7.2 Education level: policy amended here, two conditions attached

`users.education_level` is a new personal data field. Three things follow.

1. **The policy had to name it, and now does.** §2 opens by promising "the list
   below is the complete set; if a field is not here, we do not hold it", and
   the level was not in the list. That promise is only worth making if it stays
   true. Added to §2 under Account and profile, and added to the §10 removal
   list, since `data-deletion/route.ts` already nulls it. The §2 wording describes
   the field being provided at account creation, not a question on a sign-up
   screen, because no such question exists in the wizard today (see 7.5).
2. **It stays off the public profile.** `getPublicProfile` does not return it,
   and it should not start. The visibility map has no key for it, and an absent
   key means public under `DEFAULT_VISIBILITY`, so adding it to the payload
   without also adding a switch would publish it for everyone at once. If a later
   release decides to show it, that release needs the visibility key in both
   copies of the type, a Settings switch, and an entry in §5.
3. **It needs a purpose before it ships.** No feature consumes it.
   `/api/v1/me` carries the value in the owner's own payload, which is transport
   rather than use: not the dashboard, not Settings, not any recommendation or
   queue reads it to make a decision. So the lawful basis
   named for it in §3 has to be real. If the level shapes nothing, the question
   is data collected for no purpose, which Art 5(1)(c) does not allow and which
   no consent switch can cure. Either a feature consumes it in this release (the
   obvious one is defaulting subject suggestions), or the question waits. This is
   the only item here I would hold the release on.

An access request needs no new route: there is no self-serve export, so an Art 15
request is answered by hand from the `users` row. Whoever answers one must
include the level, or the response is incomplete.

### 7.3 Guardian consent sentence: approved with one word changed

The proposed rewrite is better than the 38-word original and keeps the two
things that carry weight: who is speaking ("this learner's parent or guardian")
and how to withdraw. One change is needed. "Storing their details to run their
account" narrows the processing to storage, while the service actually uses
those details to schedule reviews, mark answers and send account mail. A consent
statement has to describe the processing it authorises.

Approved wording:

> I am this learner's parent or guardian, and I agree to Revisio using their
> details to run their account. Contact support to withdraw this.

"Using" covers the processing. The withdrawal route stays, and making it a link
on its own line is fine. Frontend owns the edit, since the wizard is being
reworked in the same pass.

### 7.4 Deletion must never report a removal it cannot show

Full stack asked whether a failed object delete should fail the whole request. It
should not, and it should not be swallowed either.

The two extremes are both wrong. Failing the erasure because storage blipped
leaves the account, the email, the name and every other field intact, which is
worse for the learner than a delayed image. Logging the error and returning
success tells someone their photograph is gone when it is not, which is the one
outcome a privacy policy cannot survive.

Ruling: try each object, retry once, and for any key that still fails, keep its
`media_assets` row and mark it failed instead of cascading it away. Delete the
rows that succeeded. The response then reports the account as anonymised and the
images as queued for removal, which is what actually happened. That keeps the
ledger as the reconciliation queue, so a retry job needs no new table and no
inference about what is missing.

This also keeps §10 honest. It now carries the deferral sentence: an image that
cannot be removed at the time is queued, and the note that one is still waiting
is kept, so a failure leaves a trail instead of a gap.

Implemented as ruled on the same day. `deleteMediaObject` returns a boolean, the
route deletes a ledger row only once its object is gone, `media_assets` came out
of `CASCADE_AFTER_USERS` so the surviving row is not erased by the cascade, and
stranded keys are logged with the user id and a count. The ledger is the
reconciliation queue, which is what the ruling asked for.

The last gap is closed too. The route now retries once per object, stamps
`delete_failed_at` on a row that survives the retry
(`drizzle/0014_media_assets_delete_failed.sql`), and returns `mediaQueued` with a
message that says the images are queued rather than removed. So the erasure no
longer depends on the bucket behaving, and the person affected is told what
actually happened instead of the same line either way.

The sweeper that retries stamped rows is still a follow-up, and the §10 sentence
is written so it does not depend on that job existing: the image is queued for
removal, its record stays until it is removed, and a learner can email to confirm
it is gone. That is true today and stays true if the sweeper lands, which a
promise about an unattended job would not be.

### 7.5 The education level sentence and the wizard step are one change

§2 now lists the level because the API accepts it and the schema stores it. My
first wording said "if you pick one at sign-up" and called the question optional,
and QA showed on 14 November that this was false: `src/components/RegisterWizard.tsx`
has no `level` state and its submit body omits the field, while
`register/route.ts:45` will store a level when one is sent. The steps are role,
account, profile, subjects, review, and none of them asks.

The bullet is therefore written to what is true today: the level is described as
provided at account creation, and the sentence claiming a sign-up question came
out. That makes the policy honest in both outcomes instead of waiting on the
wizard. If frontend lands the question, the optional-question wording returns in
that same commit, because under-describing a collection is the same failure in
the other direction.

The condition in 7.2 stands unchanged: the question ships only with something
that consumes the answer, which a payload that merely carries it does not.
The release is currently held on the reverse of that
(wizard not sending, column waiting), which is the harmless direction. I will
check the pair at the end, since nobody else owns both halves. QA has raised the
same coupling with frontend as a release blocker and will not sign off while the
policy describes a question the product never asks, which is the right call.
