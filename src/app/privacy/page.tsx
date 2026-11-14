import 'server-only';

import Link from 'next/link';
import { LegalHeader } from '@/components/LegalHeader';
import { badgeVariants } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ┌─────────────────────────────────────────────────────────────────────────┐
// │  PRIVACY POLICY                                                         │
// │                                                                         │
// │  Revisio — a spaced-repetition and learning service.                    │
// │                                                                         │
// │  Last reviewed: 13 November 2026.                                       │
// │  Written for UK GDPR and the Data Protection Act 2018, with the same    │
// │  standards applied to EEA and international users.                      │
// └─────────────────────────────────────────────────────────────────────────┘

export const metadata = {
  title: 'Privacy Policy — Revisio',
  description:
    'What Revisio collects, the lawful basis for each use, who processes it, how long it is kept and how to get it back or deleted.',
};

// The reading order mirrors the ICO's transparency code: what you need to
// know first, then the detail. The sections that change most often sit last.
//
// Every claim here is checked against the code before a release. The provider
// list in section 5 and 14 is the real one (hosting, database, mirror and
// object store, email); the deletion scope in section 10 is what
// `/api/v1/data-deletion` actually does. Do not add a processor, a retention
// period or a right that the app cannot honour.

const SECTIONS = [
  {
    id: 'intro',
    title: '1. Who we are',
    content: (
      <>
        <p>
          Revisio runs the spaced-repetition service at{' '}
          <Link href="https://revisio-srs.vercel.app">
            https://revisio-srs.vercel.app
          </Link>{' '}
          (&quot;the Service&quot;). For the personal data described here,
          Revisio is the data controller: we decide what is collected and why.
        </p>
        <p>
          This policy sets out what we collect, the lawful basis for each use,
          who else processes it, how long we keep it, and how to get a copy or
          have it deleted. Cookies and similar storage are covered by the{' '}
          <Link href="/cookie-policy">Cookie Policy</Link>. Your account and
          what you may do with the Service are covered by the{' '}
          <Link href="/terms">Terms of Service</Link>.
        </p>
        <p className="t-fine">
          If you are registering a learner under 13, read section 12 first. It
          explains what we check and what we do not, before an account exists.
        </p>
      </>
    ),
  },
  {
    id: 'data-we-collect',
    title: '2. What we collect',
    content: (
      <>
        <p>
          We collect what the Service needs to run and nothing beyond that. The
          list below is the complete set; if a field is not here, we do not hold
          it.
        </p>
        <section className="mt-3 border-l-2 border-border pl-3">
          <h3 className="t-caption-s mb-1">Account and profile</h3>
          <ul className="list-disc pl-5 space-y-1 text-[14px] leading-relaxed">
            <li>Your email address, which is your login and where account mail goes.</li>
            <li>Your name, and optionally a display name, username, bio and pronouns.</li>
            <li>
              Your education level (GCSE, A-level, IB, university or other),
              where it is provided when the account is created. It is never
              shown on your public profile.
            </li>
            <li>
              Your date of birth, used once at registration to decide whether a
              guardian must consent. We keep it only for accounts registered
              under 13, where it is the basis of that consent. For anyone 13 or
              over it is not written to the database at all.
            </li>
            <li>A password, stored as a bcrypt hash. We never see the password itself.</li>
            <li>
              Your avatar (initials, an emoji, a colour, or an uploaded image up
              to 5 MB) and your banner (a colour wash or an uploaded image).
            </li>
            <li>
              If you turn on two-factor sign-in, the shared secret and your
              recovery codes in hashed form.
            </li>
            <li>
              Your profile visibility switches, so we know which fields a
              visitor may see.
            </li>
          </ul>
        </section>
        <section className="mt-3 border-l-2 border-border pl-3">
          <h3 className="t-caption-s mb-1">Learning activity</h3>
          <ul className="list-disc pl-5 space-y-1 text-[14px] leading-relaxed">
            <li>
              Each review: the card, the answer you typed, the verdict, how long
              you took and the rating you gave yourself.
            </li>
            <li>Scheduling state per card and topic, so the queue knows what is due.</li>
            <li>
              Streaks, XP events, league membership, season results and
              achievements.
            </li>
            <li>Exam attempts, with per-question detail of what you answered.</li>
            <li>
              The subjects you study, the classes you join, and any content you
              author or import (the file name and a report of what was created).
            </li>
          </ul>
        </section>
        <section className="mt-3 border-l-2 border-border pl-3">
          <h3 className="t-caption-s mb-1">Security and records</h3>
          <ul className="list-disc pl-5 space-y-1 text-[14px] leading-relaxed">
            <li>
              Session records: refresh-token hashes with an expiry, and
              single-use token hashes for email verification and password reset.
            </li>
            <li>
              Short-lived counters keyed by IP address, used to slow down
              password guessing, registration spam and verification-email
              abuse. Each one counts inside a fixed window of 15 minutes
              (sign-in, two-factor) or an hour (registration, verification
              resends) and resets when that window ends.
            </li>
            <li>
              Your consent choices and the time you made them, kept as the
              record that permission was given or refused.
            </li>
          </ul>
        </section>
      </>
    ),
  },
  {
    id: 'why-we-use-it',
    title: '3. Why we use it',
    content: (
      <>
        <p>
          Every purpose below has one lawful basis attached to it. We do not
          reuse data for an unrelated purpose afterwards.
        </p>
        <section className="mt-3 grid gap-3 text-sm">
          <p>
            <span className="font-semibold">Contract (Article 6(1)(b)).</span>{' '}
            Running your account, scheduling your reviews, grading your answers,
            keeping your progress, showing your classes and their rosters, and
            sending the service email an account cannot work without:
            verification, password reset and email-change links.
          </p>
          <p>
            <span className="font-semibold">Consent (Article 6(1)(a)).</span>{' '}
            Product-update email, non-essential notifications, anonymised
            research, and publishing the profile fields you switch on. Each one
            is a separate choice, none of them is pre-selected, and you can turn
            any of them off in Settings under &quot;How we use your data&quot;.
            Withdrawing consent stops the processing from that point; it does
            not undo what was lawful before.
          </p>
          <p>
            <span className="font-semibold">Legitimate interests (Article 6(1)(f)).</span>{' '}
            Keeping the Service secure and available: rate limiting to resist
            password guessing and sign-up spam, logging of administrative
            access so misuse can be investigated, and keeping the read copy of
            the database consistent with the primary. These are the least
            intrusive means we found for each; a service that hands out accounts
            without a limit, or cannot trace who changed what, is worse for
            everyone using it. You may object, and we will stop unless we have
            compelling grounds that override your interests.
          </p>
          <p>
            <span className="font-semibold">Legal obligation (Article 6(1)(c)).</span>{' '}
            Answering a valid legal request, and keeping the record of consent
            as evidence that processing was permitted.
          </p>
          <p className="t-fine">
            We do not rely on vital interests or on a public task anywhere in the
            Service.
          </p>
        </section>
      </>
    ),
  },
  {
    id: 'data-we-dont-collect',
    title: '4. What we do not collect',
    content: (
      <>
        <p>
          Being clear about the gaps is part of data minimisation, so here is
          what is deliberately absent:
        </p>
        <ul className="list-disc pl-5 space-y-1 text-sm leading-relaxed">
          <li>No phone number, postal address, precise location or contact-list access.</li>
          <li>
            No special category data: no health, biometric or genetic data, no
            racial or ethnic origin, religion, political opinion, trade-union
            membership, sex life or sexual orientation.
          </li>
          <li>
            No payment details. The Service is free and takes no payments, so
            there is no card processor and no billing record.
          </li>
          <li>
            No advertising identifiers, no behavioural advertising profile, and
            no data sold or rented to anyone.
          </li>
        </ul>
        <p className="t-fine">
          We also do not make solely automated decisions that produce legal or
          similarly significant effects. Your rank and your queue are computed
          from your own reviews; neither is used to decide anything about you
          beyond what the Service shows you.
        </p>
      </>
    ),
  },
  {
    id: 'sharing',
    title: '5. Who sees your data',
    content: (
      <>
        <p>
          Four companies process personal data for us, each for a single job.
          They act on our instructions and may not use the data for their own
          purposes.
        </p>
        <ul className="list-disc pl-5 space-y-1 text-sm leading-relaxed">
          <li>
            <span className="font-semibold">Vercel</span> hosts the application
            and runs the serverless functions that serve it. Processing happens
            in its Dublin region; the company is based in the United States.
          </li>
          <li>
            <span className="font-semibold">Supabase</span> hosts the primary
            Postgres database, in Ireland (eu-west-1).
          </li>
          <li>
            <span className="font-semibold">Neon</span> hosts a read copy of the
            database and the object store that holds uploaded avatars and
            banners, in Frankfurt (eu-central-1).
          </li>
          <li>
            <span className="font-semibold">Resend</span> delivers service
            email: verification, password reset and email-change links. The
            company is based in the United States.
          </li>
        </ul>
        <p className="mt-3">
          That is the whole list. There is no analytics provider, no advertising
          network, no payment processor and no support-desk platform holding
          your data.
        </p>
        <section className="mt-3 border-l-2 border-border pl-3">
          <h3 className="t-caption-s mb-1">Other people using the Service</h3>
          <p className="t-fine">
            Three features show your data to someone else, and each one is under
            your control:
          </p>
          <ul className="mt-1 list-disc pl-5 space-y-1 text-[14px] leading-relaxed">
            <li>
              Your public profile at <span className="font-mono">/u/</span> your
              username shows only the fields you switch on. Anyone with the
              link can see them, including someone who is not signed in. Your
              email address is never shown.
            </li>
            <li>
              Leaderboards show your display name and your weekly XP to other
              learners while leaderboard visibility is on. Turning it off hides
              you without affecting your rank.
            </li>
            <li>
              If you join a class, the teacher who owns it can see your name and
              your progress in that class&apos;s subject.
            </li>
          </ul>
        </section>
        <section className="mt-3 border-l-2 border-border pl-3">
          <h3 className="t-caption-s mb-1">Legal requests</h3>
          <p className="t-fine">
            Where the law, a court or a valid legal process requires it, we may
            have to disclose data. When that happens we disclose only what the
            request covers, and we tell you unless the request forbids it.
          </p>
        </section>
      </>
    ),
  },
  {
    id: 'storage',
    title: '6. How long we keep it, and where',
    content: (
      <>
        <p>
          Retention follows the job the data does. These are the periods we
          actually apply:
        </p>
        <ul className="list-disc pl-5 space-y-1 text-sm leading-relaxed">
          <li>Account, profile and preferences: while the account exists.</li>
          <li>Email verification links: 24 hours. Password-reset links: 30 minutes and single use.</li>
          <li>Sign-in sessions: 30 days, or until you sign out, change your password or delete the account.</li>
          <li>
            Rate-limit counters: 15 minutes for sign-in and two-factor, one hour
            for registration and verification resends. The row keeps an IP
            address and a count, and nothing is derived from it afterwards.
          </li>
          <li>
            Consent records: as long as we need the evidence, including after
            consent is withdrawn.
          </li>
          <li>
            Reviews, XP, streaks, achievements, exam attempts and season
            results: while the account exists, and afterwards in the anonymised
            form described in section 10.
          </li>
        </ul>
        <p className="mt-3">
          The primary database is in Ireland and the read copy is in Germany.
          Backups are encrypted and reachable only by the person who runs the
          Service. A record you delete may persist in a backup until that backup
          ages out.
        </p>
      </>
    ),
  },
  {
    id: 'transfers',
    title: '7. Transfers outside the UK',
    content: (
      <>
        <p>
          Ireland and Germany are covered by the UK&apos;s adequacy regulations,
          so data held there needs no further safeguard.
        </p>
        <p>
          Two providers are United States companies and may process data there:
          Vercel for application hosting and Resend for email delivery. Those
          transfers rely on the UK International Data Transfer Addendum to the
          EU Standard Contractual Clauses, which each provider incorporates into
          its data-processing terms. We do not send personal data to any other
          country.
        </p>
      </>
    ),
  },
  {
    id: 'security',
    title: '8. How we protect it',
    content: (
      <>
        <p>
          Access is limited to what each part of the system needs. Passwords are
          bcrypt hashes. Sign-in sessions use a short-lived token kept in memory
          and a rotating refresh cookie marked HttpOnly, so a script on the page
          cannot read it. Traffic is encrypted in transit and the database and
          object store are encrypted at rest. The media bucket is private and is
          served through the application, and every administrative action lands
          in an audit log.
        </p>
        <p>
          Rate limits protect the routes that are worth attacking: sign-in,
          registration, verification-email resend and two-factor checks. Two-factor
          sign-in is available on every account. The privacy filters, the
          consent record and the deletion path are covered by automated checks
          that run against the live API before a release.
        </p>
        <p>
          No system is perfect. If a breach occurs that is likely to put your
          rights at risk, we report it to the Information Commissioner&apos;s
          Office within 72 hours of becoming aware of it, and we tell you
          directly if the risk to you is high.
        </p>
      </>
    ),
  },
  {
    id: 'your-rights',
    title: '9. Your rights',
    content: (
      <>
        <p>
          You have the rights below under UK GDPR. To use any of them, email the
          address in section 17. We answer within one month; if a request is
          genuinely complex we may extend that by two further months and will
          tell you why before the first month runs out. There is no charge.
        </p>
        <section className="mt-3 grid gap-2 text-sm">
          <p>
            <span className="font-semibold">Access.</span> Ask what we hold about
            you, why we hold it, and who else processes it. You get a copy in a
            common format.
          </p>
          <p>
            <span className="font-semibold">Correction.</span> Ask us to fix
            anything inaccurate or incomplete. Most profile fields you can edit
            yourself in Settings.
          </p>
          <p>
            <span className="font-semibold">Erasure.</span> Ask us to delete
            your data. Section 10 explains what the Settings control removes and
            what survives it.
          </p>
          <p>
            <span className="font-semibold">Restriction.</span> Ask us to stop
            processing while a dispute about accuracy or lawfulness is settled.
          </p>
          <p>
            <span className="font-semibold">Portability.</span> Ask for the data
            you gave us in a machine-readable format, or ask us to send it to
            another provider where that is technically possible.
          </p>
          <p>
            <span className="font-semibold">Objection.</span> Object to
            processing we base on legitimate interests. We stop unless we can
            show compelling grounds.
          </p>
          <p>
            <span className="font-semibold">Withdrawing consent.</span> Turn off
            any non-essential purpose in Settings, or email us. It is as easy to
            withdraw as it was to give.
          </p>
        </section>
        <p className="t-fine">
          We may ask you to confirm you control the account before we act, and
          we may have to keep a record of the request itself. If you are not
          satisfied with our answer, you can complain to the Information
          Commissioner&apos;s Office at{' '}
          <Link href="https://ico.org.uk">https://ico.org.uk</Link>.
        </p>
      </>
    ),
  },
  {
    id: 'deletion',
    title: '10. Deleting your account',
    content: (
      <>
        <p>
          The &quot;Delete my data&quot; control is in Settings. It is
          deliberately awkward to trigger by accident: you need to be signed in,
          you get a confirmation that expires after 60 seconds, and you type
          your account email back before the button will work. The action cannot
          be undone.
        </p>
        <p>What it removes:</p>
        <ul className="list-disc pl-5 space-y-1 text-sm leading-relaxed">
          <li>Every session and refresh token, and every unused email token.</li>
          <li>Your subject enrolments, card-level scheduling, streak, achievements and any pending role request.</li>
          <li>
            Your name, display name, username, bio, pronouns, education level,
            two-factor secret and recovery codes, and your saved consent record.
          </li>
          <li>
            The avatar and banner images you uploaded, including the stored
            copies of them.
          </li>
        </ul>
        <p className="t-fine mt-2">
          If storage is unavailable at the moment you delete, an image is queued
          for removal and its record stays until it is removed. If you want to
          confirm that an image is gone, email us and we will tell you.
        </p>
        <p className="mt-3">What it changes rather than removes:</p>
        <ul className="list-disc pl-5 space-y-1 text-sm leading-relaxed">
          <li>
            Your email address is replaced with a placeholder, your password with
            a value that cannot be used, and the account is marked deleted, so
            nobody can sign in to it again.
          </li>
        </ul>
        <p className="mt-3">
          What remains, and why: your review log, XP events, exam attempts, class
          memberships, imports and season results stay, keyed to an internal
          account id that no longer connects to a name or an email address. We
          keep them because the XP ledger and the season table are records of
          what happened, and removing half of a season would change other
          learners&apos; standings.
        </p>
        <p className="t-fine">
          The control does not verify guardian authority. A parent or guardian
          acting for a learner should email us instead, and we will handle it as
          a data-subject request. If you want records beyond the control&apos;s
          scope removed, ask; we will do it unless a specific record has to stay
          and we will tell you which and why.
        </p>
      </>
    ),
  },
  {
    id: 'cookies',
    title: '11. Cookies and local storage',
    content: (
      <>
        <p>
          Essential cookies keep you signed in and keep the Service secure. They
          cannot be switched off, because the Service does not work without
          them. On your first visit a banner asks what you want to allow;
          nothing non-essential is loaded before you answer, and no non-essential
          cookie is set today.
        </p>
        <p>
          Your choice is stored in this browser&apos;s local storage, and on
          your account when you are signed in, so it follows you between
          devices. The categories, what each one would cover, and how to refuse
          them are in the <Link href="/cookie-policy">Cookie Policy</Link>. You
          can change your mind at any time in Settings.
        </p>
      </>
    ),
  },
  {
    id: 'age-consent',
    title: "12. Children's data",
    content: (
      <>
        <p>
          UK GDPR and the Age Appropriate Design Code give children&apos;s data
          extra protection. The Service is designed for learners aged 13 and
          over. A learner under 13 can hold an account only when the person
          completing registration confirms that they are the parent or legal
          guardian and agrees to the processing needed to provide the Service.
        </p>
        <section className="mt-3 border-l-2 border-border pl-3">
          <h3 className="t-caption-s mb-1">What that check is, and is not</h3>
          <ul className="list-disc pl-5 space-y-1 text-[14px] leading-relaxed">
            <li>
              Registration asks for a date of birth and, where it puts the
              learner under 13, a ticked statement that the person completing
              the form is their parent or legal guardian.
            </li>
            <li>
              That is self-attestation. We do not independently verify who the
              person is, their relationship to the learner, or that they control
              the email address used. We would rather say so plainly than imply
              a check that does not happen.
            </li>
            <li>
              If we find that we hold a child&apos;s data without the consent
              that was required, we review the account and act on it, which can
              include deleting it.
            </li>
          </ul>
        </section>
        <section className="mt-3 border-l-2 border-border pl-3">
          <h3 className="t-caption-s mb-1">Withdrawing a guardian&apos;s consent</h3>
          <p className="mb-2">
            A guardian can withdraw consent at any time by emailing us. We then
            delete the learner&apos;s personal data as soon as we can, unless
            another lawful basis requires us to keep a specific record, in which
            case we tell you which record and why.
          </p>
          <p>
            A learner aged 13 or over can withdraw their own consent in Settings,
            and can turn any non-essential purpose off without asking anyone.
          </p>
        </section>
      </>
    ),
  },
  {
    id: 'dark-patterns',
    title: '13. No dark patterns',
    content: (
      <>
        <p>
          A dark pattern is an interface built to get a decision you did not mean
          to make. We do not use them. In practice that means:
        </p>
        <ul className="list-disc pl-5 space-y-1 text-sm leading-relaxed">
          <li>
            Consent to non-essential purposes is a separate, unticked control
            for each purpose, never a single box covering everything.
          </li>
          <li>
            Refusing is as easy as accepting. The banner offers &quot;Reject
            all&quot; beside &quot;Accept all&quot;, and Settings holds the same
            switches.
          </li>
          <li>
            We do not use countdowns, scarcity or guilt to move you past a
            decision, and we do not hide the &quot;no thanks&quot; route.
          </li>
          <li>
            We do not use colour, position or wording to nudge you into sharing
            more than you intended.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'third-party',
    title: '14. Third-party software',
    content: (
      <>
        <p>
          Before we add a provider we check four things: that it publishes a
          privacy policy and data-processing terms, that it processes data only
          on our instructions, that it is hosted in the EEA or a country with an
          adequacy decision (or that a transfer mechanism is in place, as with
          Vercel and Resend), and that it cannot read personal data about our
          users unless we have configured it to.
        </p>
        <p>
          Today that check has passed for the four providers named in section 5,
          and for no others. There is no tag manager, no session recorder and no
          third-party script on the pages you use. If you want to know what a
          particular provider is used for, ask and we will tell you.
        </p>
      </>
    ),
  },
  {
    id: 'accuracy',
    title: '15. Accuracy and changes to this policy',
    content: (
      <>
        <p>
          We would rather describe the Service as it is than as we would like it
          to be. Where a control does less than you might assume, this policy
          says so, as section 10 does about deletion.
        </p>
        <p>
          We review this policy at least once a year and whenever our practices
          change. If a change affects your rights, we post a notice on the
          Service and email you where the law requires it. The date at the top is
          when this version was last checked.
        </p>
      </>
    ),
  },
  {
    id: 'accessibility',
    title: '16. Accessibility',
    content: (
      <>
        <p>
          This policy should be readable by everyone who needs it. If any part of
          it is hard to use, email us and we will send the content in another
          form. Our fuller statement, including the WCAG 2.2 AA target we work
          to and the limitations we know about, is the{' '}
          <Link href="/accessibility">Accessibility Statement</Link>.
        </p>
      </>
    ),
  },
  {
    id: 'contact',
    title: '17. Contact and complaints',
    content: (
      <>
        <p>
          For a question about this policy, a data-subject request, a withdrawal
          of consent or a deletion request:
        </p>
        <p className="mt-2">
          Revisio<br />
          <span className="t-fine">Privacy</span><br />
          <Link href="mailto:tayyab@outlook.jp">tayyab@outlook.jp</Link>
        </p>
        <p className="t-fine">
          We answer complaints ourselves first, and most are settled that way. If
          you are not satisfied, the Information Commissioner&apos;s Office is
          the UK supervisory authority:{' '}
          <Link href="https://ico.org.uk">https://ico.org.uk</Link>. If you live
          in the EEA, you can complain to your own national authority instead.
        </p>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <>
    <LegalHeader current="/privacy" />
    <main>
      <article className="legal-doc mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <header className="pt-6 sm:pt-8">
        <p className="t-fine uppercase tracking-wide text-muted-foreground">Legal</p>
        <h1 className="t-strong mt-1 text-3xl">Privacy Policy</h1>
        <p className="t-caption mt-2">
          Revisio · version 3 · last reviewed 13 November 2026
        </p>
      </header>

      {/* 13 chips wrap to ten rows on a phone and push the first section off
          the screen; below `sm` the numbered headings carry the structure. */}
      <nav className="toc hidden flex-wrap gap-2 sm:flex" aria-label="Table of contents">
        {SECTIONS.map((s) => (
          <Link
            key={s.id}
            href={`#${s.id}`}
            className={cn(badgeVariants({ variant: 'chip' }), 'chip-wrap')}
          >
            {/* The whole heading, minus its number: stripping the first word
                left links like “1. Who we are” with no accessible name at all. */}
            {s.title.replace(/^\d+\.\s*/, '')}
          </Link>
        ))}
      </nav>

      <div className="space-y-10">
        {SECTIONS.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-24">
            <h2 className="t-strong">{section.title}</h2>
            <div className="mt-2 text-[15px] leading-relaxed text-foreground/90">
              {section.content}
            </div>
          </section>
        ))}
      </div>

      <footer className="border-t border-border pt-6 text-xs text-muted-foreground">
        <p>
          This policy describes how Revisio handles personal data and the
          choices you have over it. It is not legal advice to anyone else.
        </p>
        <p className="mt-2">
          <Link href="/terms" className="underline underline-offset-4">
            Terms of Service
          </Link>{' '}
          ·{' '}
          <Link href="/cookie-policy" className="underline underline-offset-4">
            Cookie Policy
          </Link>
          {' '}·{' '}
          <Link href="/accessibility" className="underline underline-offset-4">
            Accessibility Statement
          </Link>
        </p>
      </footer>
      </article>
    </main>
    </>
  );
}
