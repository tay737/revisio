import 'server-only';

import Link from 'next/link';

// ┌─────────────────────────────────────────────────────────────────────────┐
// │  PRIVACY POLICY                                                         │
// │                                                                         │
// │  Revisio — a spaced-repetition and learning service.                    │
// │                                                                         │
// │  Last reviewed: 1 October 2026.                                       │
// │  This policy is written for UK GDPR and the Data Protection Act 2018, │
// │  with the same standards applied where we process data of EEA or      │
// │  international users. The placeholders marked [COUNSEL] are for       │
// │  qualified legal counsel to review and complete; they are not a       │
// │  substitute for a solicitor's advice.                                 │
// └─────────────────────────────────────────────────────────────────────────┘

export const metadata = {
  title: 'Privacy Policy — Revisio',
  description:
    'How Revisio collects, uses, stores and deletes your data. Read our commitments on data minimisation, security, your rights and deletion.',
};

// The reading order here mirrors the ICO's transparency code: what you need to
// know first, then the detail. Sections that change rarely are stable; the
// sections that change most often ([COUNSEL] to-do lines) are clearly flagged.

const SECTIONS = [
  {
    id: 'intro',
    title: '1. Who we are',
    content: (
      <>
        <p>
          Revisio (&quot;we&quot;, &quot;us&quot; or &quot;our&quot;) operates the
          spaced-repetition service at{' '}
          <Link href="https://revisio-srs.vercel.app">
            https://revisio-srs.vercel.app
          </Link>
          (&quot;the Service&quot;). We process personal data only to
          provide the Service, keep it secure and comply with the law.
        </p>
        <p>
          This policy explains what data we collect, why we collect it, how we
          keep it safe, what rights you have and how to withdraw consent or ask
          us to delete your data. It also covers the cookies and similar
          technologies we use, how third-party software is used and audited, and
          how we stay accurate and up to date.
        </p>
        <p className="t-fine">
          Read the{' '}
          <Link href="/cookie-policy">Cookie Policy</Link> and the{' '}
          <Link href="/terms">Terms of Service</Link> together with this
          policy. If you are a parent or guardian of a learner under 13, read section 11 before an account is created for them.
        </p>
      </>
    ),
  },
  {
    id: 'data-we-collect',
    title: '2. What data we collect',
    content: (
      <>
        <p>
          We collect only the minimum personal data required to run the Service
          — that is the &quot;data minimisation&quot; principle under UK GDPR.
          We do not build marketing profiles, sell personal data, or share it
          with advertisers.
        </p>
        <section className="mt-3 border-l-2 border-border pl-3">
          <h3 className="t-caption-s mb-1">Identity and account          </h3>
          <ul className="list-disc pl-5 space-y-1 text-[14px] leading-relaxed">
            <li>Email address (used as your login identifier).</li>
            <li>Name or display name, chosen by you.</li>
            <li>Username, chosen by you (optional).</li>
            <li>Password, stored only as a salted hash.</li>
            <li>Profiles and profile visibility settings you choose for your public profile.</li>
          </ul>
        </section>
        <section className="mt-3 border-l-2 border-border pl-3">
          <h3 className="t-caption-s mb-1">Learning activity (necessary for the Service)          </h3>
          <ul className="list-disc pl-5 space-y-1 text-[14px] leading-relaxed">
            <li>Review history, streak, XP and rank — used to run spaced repetition and to show you your own progress.</li>
            <li>Card responses and timing data, used to schedule your reviews.</li>
            <li>Subjects and topics you study and your performance in them.</li>
            <li>Leaderboard participation is opt-in; you may switch it off in Settings.</li>
          </ul>
        </section>
        <section className="mt-3 border-l-2 border-border pl-3">
          <h3 className="t-caption-s mb-1">Cookies and local storage          </h3>
          <ul className="list-disc pl-5 space-y-1 text-[14px] leading-relaxed">
            <li>Essential cookies that keep you signed in and the Service secure.</li>
            <li>Non-essential cookies for analytics and marketing — only after your consent (see the Cookie Policy).</li>
            <li>Device and usage data collected by analytics software, kept anonymous and aggregated.</li>
          </ul>
        </section>
        <section className="mt-3 border-l-2 border-border pl-3">
          <h3 className="t-caption-s mb-1">If you are a child under 13</h3>
          <ul className="list-disc pl-5 space-y-1 text-[14px] leading-relaxed">
            <li>We do not knowingly collect personal data from children under 13 without a parent or guardian’s consent. A parent or guardian can revoke that consent at any time (see section 11).</li>
            <li>If you believe we hold a child&apos;s data without the required consent, contact support so we can review the account and any erasure request.</li>
          </ul>
        </section>
      </>
    ),
  },
  {
    id: 'why-we-use-it',
    title: '3. Why we use your data',
    content: (
      <>
        <p>We use personal data to provide, secure and improve the Service. Each use is linked to a specific lawful basis, and we will not use your data for an unrelated purpose.</p>
        <section className="mt-3 grid gap-2 text-sm">
          <p>
            <span className="font-semibold">Contract:</span> to provide your
            spaced-repetition training, schedule your reviews, store your
            progress and let you access your own account.
          </p>
          <p>
            <span className="font-semibold">Legal obligation:</span> to comply
            with applicable laws, including accounting, tax and security
            requirements, and to detect or prevent fraud or abuse.
          </p>
          <p>
            <span className="font-semibold">Vital interests:</span> only if
            necessary to protect someone's life.
          </p>
          <p>
            <span className="font-semibold">Legitimate interest:</span> for
            security, abuse prevention, product improvement and
            anonymised research. Where we rely on this, you may object by
            contacting us (section 8).
          </p>
          <p>
            <span className="font-semibold">Consent (optional):</span> for
            analytics, marketing, certain research and non-essential
            notifications. You may withdraw consent at any time with the same
            ease as giving it (section 8).
          </p>
        </section>
      </>
    ),
  },
  {
    id: 'data-we-dont-collect',
    title: '4. What we do not collect (data minimisation)',
    content: (
      <>
        <p>
          We deliberately do not collect: your precise location, your racial or
          ethnic origin, political opinions, religious or philosophical beliefs,
          trade-union membership, genetic or biometric data, health data, sex
          life or sexual orientation, and financial data beyond the email
          address needed to send you notifications and receipts.
        </p>
        <p>
          We do not use your data to make unsupported claims about your
          performance, and we do not include testimonial or review copy in our
          marketing that implies a result we cannot substantiate. Any claim we
          make about the Service — its effectiveness, its delivery, its
          certifications — is accurate and verifiable, or we will not make it.
        </p>
        <p className="t-fine">
          See section 11 for our commitment not to use dark patterns in our
          sign-up and consent flows.
        </p>
      </>
    ),
  },
  {
    id: 'sharing',
    title: '5. Who we share your data',
    content: (
      <>
        <p>
          We share personal data only in the limited, specific circumstances
          below. We do not sell or rent your personal data to third parties.
        </p>
        <section className="mt-3 border-l-2 border-border pl-3">
          <h3 className="t-caption-s mb-1">Processors and service providers          </h3>
          <p className="t-fine">
            We may share data with providers that help us operate the Service,
            subject to contracts that restrict their use and require
            appropriate security. These may include hosting, email delivery,
            video calls, analytics, payments and customer support software.
            Before we use a new provider, we confirm in writing that it meets our
            security and data-protection standards.
          </p>
        </section>
        <section className="mt-3 border-l-2 border-border pl-3">
          <h3 className="t-caption-s mb-1">Legal requests          </h3>
          <p className="t-fine">
            Where required by law, regulation or valid legal process, we may be
            compelled to disclose data. We will do so only where required and in
            the least intrusive way possible.
          </p>
        </section>
        <section className="mt-3 border-l-2 border-border pl-3">
          <h3 className="t-caption-s mb-1">Group companies          </h3>
          <p className="t-fine">
            Where we operate as part of a group, we may share data within
            group companies that need it to administer the Service, subject to
            appropriate safeguards.
          </p>
        </section>
        <section className="mt-3 border-l-2 border-border pl-3">
          <h3 className="t-caption-s mb-1">School / account data          </h3>
          <p className="t-fine">
            Where a learner's data is held for schooling, a parent or guardian
            may permit us to share it with that learner's school or educational
            provider. Any such sharing is explicit, time-limited and reversible.
          </p>
        </section>
      </>
    ),
  },
  {
    id: 'storage',
    title: '6. How long we keep it and where it lives',
    content: (
      <>
        <p>
          We keep personal data only as long as necessary for the purposes
          described above, and in any case no longer than we need to fulfil our
          legal obligations. When the purpose for a category of data ends, we
          delete or anonymise it.
        </p>
        <p>
          Our production database is hosted in the European Economic Area
          (Ireland). Our read replica is hosted in the EU (Germany).
          Backups are encrypted and access is restricted to authorised staff.
          Data is not stored in third countries except where a transfer is
          permitted by the UK or EU adequacy decision or on a documented
          transfer mechanism.
        </p>
        <p>
          If a learner under 13 or their parent or guardian requests erasure, contact support. We will assess the request and explain any records that are retained and why.
        </p>
      </>
    ),
  },
  {
    id: 'security',
    title: '7. How we keep it safe',
    content: (
      <>
        <p>
          We use administrative, technical and physical measures appropriate to
          the sensitivity of the data: encryption in transit and at rest,
          least-privilege access controls, regular access reviews, logging of
          administrative access, and staff training. We test our
          authentication, rate-limiting and privacy controls in every release.
        </p>
        <p>
          Security is not a product feature we can &quot;add later&quot; — it is
          a requirement we audit before every deployment.
        </p>
      </>
    ),
  },
  {
    id: 'your-rights',
    title: '8. Your rights (data-subject rights)',
    content: (
      <>
        <p>
          You have the following rights under UK GDPR. To exercise any of them,
          contact us at the address below. We will respond without undue delay,
          and in any case within one month (we may extend this by a further two
          months where the request is complex).
        </p>
        <section className="mt-3 grid gap-2 text-sm">
          <p>
            <span className="font-semibold">Access:</span> you can ask what
            personal data we hold, why, and where it is processed.
          </p>
          <p>
            <span className="font-semibold">Rectification:</span> you can ask us
            to correct inaccurate or incomplete data.
          </p>
          <p>
            <span className="font-semibold">Erasure (&quot;right to be
            forgotten&quot;):</span> you can ask us to delete your personal data.
            See section 9 for the deletion process and the exceptions.
          </p>
          <p>
            <span className="font-semibold">Restriction:</span> you can ask us to
            suspend processing while you contest the lawfulness of processing.
          </p>
          <p>
            <span className="font-semibold">Portability:</span> you can ask for
            your data in a machine-readable format and transfer it to another
            provider.
          </p>
          <p>
            <span className="font-semibold">Object:</span> you can object to
            processing based on our legitimate interest, including
            analytics, profiling and direct marketing.
          </p>
          <p>
            <span className="font-semibold">Automated decision-making:</span> we
            do not make solely automated decisions that produce legal or
            similarly significant effects.
          </p>
          <p>
            <span className="font-semibold">Withdraw consent:</span> where we
            rely on consent, you may withdraw it at any time with the same ease
            as giving it. Withdrawal does not erase the lawfulness of
            processing already carried out.
          </p>
        </section>
        <p className="t-fine">
          You also have the right to lodge a complaint with the Information
          Commissioner's Office (ICO) at{' '}
          <Link href="https://ico.org.uk">https://ico.org.uk</Link> if you are
          unsatisfied with our response.
        </p>
      </>
    ),
  },
  {
    id: 'deletion',
    title: '9. How to ask us to delete your data',
    content: (
      <>
        <p>
          You can request account anonymisation through the &quot;Delete my data&quot;
          control in Settings. The current control anonymises your account and
          removes selected account records; it does not currently erase all
          historical learning or class records. Contact{' '}
          <Link href="mailto:support@revisio.pro">support@revisio.pro</Link> to
          ask about access, correction, restriction or erasure of other records.
        </p>
        <p>
          When you ask us to delete your data:
        </p>
        <ul className="list-disc pl-5 space-y-1 text-sm leading-relaxed">
          <li>The Settings control requires a signed-in session, a short-lived confirmation and the account email typed back into the form.</li>
          <li>It anonymises the account and removes selected profile, session, subject, achievement and review-state records.</li>
          <li>It does not currently erase every historical learning, class or activity record; contact support to make a broader data-rights request.</li>
          <li>The current control does not verify guardian authority. A parent or guardian requesting action for a learner should contact support.</li>
        </ul>
        <p>
          Some account, class, activity or security records may remain after
          account anonymisation. We review broader erasure requests individually
          and explain any records that must be retained and why.
        </p>
      </>
    ),
  },
  {
    id: 'cookies',
    title: '10. Cookies and similar technologies',
    content: (
      <>
        <p>
          We use cookies and similar technologies to operate the Service,
          analyse how it is used, and — only with your consent — to personalise
          content and serve marketing. You can control or block cookies in your
          browser, but blocking all cookies may break parts of the Service.
        </p>
        <p>
          The categories of cookie we use, how to refuse them, and instructions
          for opting out of analytics and marketing are in the{' '}
          <Link href="/cookie-policy">Cookie Policy</Link>.
        </p>
      </>
    ),
  },
  {
    id: 'age-consent',
    title: '11. Children&apos;s data (age consent)',
    content: (
      <>
        <p>
          UK GDPR and the Age Appropriate Design Code place special protection
          on children&apos;s data. We design the Service for learners aged 13
          and over. Learners under 13 may register only when the person
          completing registration self-attests as a parent or legal guardian
          and consents to the processing needed to provide the Service.
        </p>
        <section className="mt-3 border-l-2 border-border pl-3">
          <h3 className="t-caption-s mb-1">How we confirm a parent&apos;s consent          </h3>
          <ul className="list-disc pl-5 space-y-1 text-[14px] leading-relaxed">
            <li>Registration asks the person completing it to attest that they are the parent or legal guardian when the learner is under 13.</li>
            <li>This is self-attestation only: we do not independently verify the guardian&apos;s identity, relationship or control of an email address. Contact support to withdraw consent.</li>
            <li>If we learn we hold a child&apos;s data without the required consent, we will review the account and take appropriate action, including considering an erasure request.</li>
          </ul>
        </section>
        <section className="mt-3 border-l-2 border-border pl-3">
          <h3 className="t-caption-s mb-1">How to withdraw a guardian&apos;s consent</h3>
          <p className="mb-2">
            The guardian can withdraw consent at any time from the learner&apos;s
            account, or by contacting us. Where consent is withdrawn, we will
            delete the learner&apos;s personal data as soon as possible unless a
            we have another lawful basis to retain it and explain that basis.
          </p>
          <p>
            If the learner is aged 13 or over, they may withdraw their
            own consent — for example, they can change their notice and consent
            settings in Settings, and we ask them to confirm that any change is
            made by them.
          </p>
        </section>
      </>
    ),
  },
  {
    id: 'dark-patterns',
    title: '12. No dark patterns',
    content: (
      <>
        <p>
          We do not use dark patterns — interfaces designed to trick you into
          doing things you did not intend. That means:
        </p>
        <ul className="list-disc pl-5 space-y-1 text-sm leading-relaxed">
          <li>Consent to non-essential cookies or communications is always explicit, separate from essential consent, and easy to withdraw.</li>
          <li>We never pre-tick a box for you to change, hide your choices, or make it hard to find the &quot;no thanks&quot; option.</li>
          <li>We never use urgency or scarcity to make you click past a decision.</li>
          <li>We never use contrast, position or wording to push you into sharing more than you intend.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'third-party',
    title: '13. Third-party software audit',
    content: (
      <>
        <p>
          We use third-party software only to operate the Service. Before we
          integrate a new provider, we confirm that it:
        </p>
        <ul className="list-disc pl-5 space-y-1 text-sm leading-relaxed">
          <li>Has a documented privacy policy and data-processing terms.</li>
          <li>Processes data only for our instructions and on the same security standards we require.</li>
          <li>Is hosted in the EEA or a country with an adequacy decision.</li>
          <li>cannot read personal data about our users unless we have consented and we configure it to do so.</li>
        </ul>
        <p>
          We review this list in every release and when we add new software. The
          audit log is held in our records-management system and is available
          for inspection on request.
        </p>
      </>
    ),
  },
  {
    id: 'accuracy',
    title: '14. Accuracy and changes to this policy',
    content: (
      <>
        <p>
          We make errors visible rather than unverifiable: if we tell you the
          Service does something, we confirm it does before we say it, and we
          correct any claim we cannot substantiate. We will not claim a result —
          for example, a rank, a review count or a guarantee of progress — and
          then fail to meet it.
        </p>
        <p>
          We review this policy at least once a year and whenever our practices
          change. Where we make a significant change, we will post a notice on
          the Service and, where required, contact you. The &quot;last
          reviewed&quot; date above is when this version was last checked.
        </p>
      </>
    ),
  },
  {
    id: 'accessibility',
    title: '15. Accessibility',
    content: (
      <>
        <p>
          We want the Service to be usable by as many people as possible, and we
          work to meet the Web Content Accessibility Guidelines (WCAG) 2.2 AA
          standard. This includes alternatives for images, clear contrast,
          keyboard access and readable text.
        </p>
        <p>
          If you find a barrier to accessing any part of the Service, please
          contact us and we will do our best to help.
        </p>
      </>
    ),
  },
  {
    id: 'contact',
    title: '16. Questions, complaints and contact details',
    content: (
      <>
        <p>
          If you have a question about this policy, want to exercise your
          rights, or want to withdraw consent or request deletion:
        </p>
        <p className="mt-2">
          Revisio<br />
          <span className="t-fine">Privacy team</span><br />
          <Link href="mailto:support@revisio.pro">support@revisio.pro</Link>
        </p>
        <p className="t-fine">
          If you are in the EEA, you may instead contact your local data
          protection authority. The Information Commissioner&apos;s Office is the
          UK authority:{' '}
          <Link href="https://ico.org.uk">https://ico.org.uk</Link>.
        </p>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <main>
      <article className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <header className="pt-6 sm:pt-8">
        <p className="t-fine uppercase tracking-wide text-muted-foreground">Legal</p>
        <h1 className="t-strong mt-1 text-3xl">Privacy Policy</h1>
        <p className="t-caption mt-2">
          Revisio — Learn it once · v2 · 1 October 2026
        </p>
      </header>

      <nav className="toc flex flex-wrap gap-2" aria-label="Table of contents">
        {SECTIONS.map((s) => (
          <Link
            key={s.id}
            href={`#${s.id}`}
            className="chip"
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
          This policy was prepared for Revisio and reviewed in line with our
          data-protection obligations. Placeholder sections marked{' '}
          <span className="font-semibold">[COUNSEL]</span> are for qualified
          legal counsel to review and complete. It does not constitute legal
          advice.
        </p>
        <p className="mt-2">
          <Link href="/terms" className="underline underline-offset-4">
            Terms of Service
          </Link>{' '}
          ·{' '}
          <Link href="/cookie-policy" className="underline underline-offset-4">
            Cookie Policy
          </Link>
          ·{' '}
          <Link href="/accessibility" className="underline underline-offset-4">
            Accessibility Statement
          </Link>
        </p>
      </footer>
      </article>
    </main>
  );
}
