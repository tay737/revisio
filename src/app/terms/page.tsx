import 'server-only';

import Link from 'next/link';

// ┌─────────────────────────────────────────────────────────────────────────┐
// │  TERMS OF SERVICE                                                     │
// │                                                                         │
// │  Revisio — Learn it once                                              │
// │                                                                         │
// │  These terms govern your use of the Service.                          │
// │                                                                         │
// │  [COUNSEL]: The sections marked [COUNSEL] are for qualified legal     │
// │  counsel to review and complete.  They are not legal advice.          │
// │  Please check the Privacy Policy and Cookie Policy too.               │
// └─────────────────────────────────────────────────────────────────────────┘

export const metadata = {
  title: 'Terms of Service — Revisio',
  description:
    'Terms of use for Revisio, including account terms, content licensing and prohibited conduct.',
};

// This page is deliberately lean: the legal backbone of running a service is
// privacy, and that is (and must be) the Privacy Policy. These terms cover
// account, content and conduct, so they should not compete with the privacy
// policy for attention. The placeholders are the part counsel needs to check.

const SECTIONS = [
  {
    id: 'acceptance',
    title: '1. Acceptance',
    content: (
      <>
        <p>
          By accessing or using Revisio (&quot;the Service&quot;), you agree to
          be bound by these terms and our Privacy Policy and Cookie Policy. If
          you do not agree, do not use the Service.
        </p>
        <p>
          [COUNSEL] — confirm the governing law and jurisdiction, and how
          disputes are to be resolved, for your jurisdiction.
        </p>
      </>
    ),
  },
  {
    id: 'accounts',
    title: '2. Accounts',
    content: (
      <>
        <p>
          To use the Service you must create an account, which requires an
          email address. You are responsible for:
        </p>
        <ul className="list-disc pl-5 space-y-1 text-[14px] leading-relaxed">
          <li>keeping your password confidential;</li>
          <li>all activity under your account; and</li>
          <li>not sharing your account with anyone else.</li>
        </ul>
        <p>
          Learners under 13 may create an account only when the person
          completing registration attests that they are the learner&apos;s parent
          or legal guardian and consents to the processing needed to provide the
          Service. This is self-attestation; we do not independently verify the
          person&apos;s identity or relationship. See the Privacy Policy, section
          11, for details and how consent may be withdrawn.
        </p>
      </>
    ),
  },
  {
    id: 'content',
    title: '3. Content you provide to us',
    content: (
      <>
        <p>
          When you create content for the Service — notes, reviews, flashcards
          or achievements — you retain ownership, but you grant us a licence to
          host, run and, where necessary, display it solely to provide the
          Service to you and to other learners in accordance with these terms.
        </p>
        <p>
          You represent and warrant that:
        </p>
        <ul className="list-disc pl-5 space-y-1 text-[14px] leading-relaxed">
          <li>the content is yours to provide (or that you have permission to share it);</li>
          <li>the content does not infringe anyone&apos;s intellectual-property rights; and</li>
          <li>the content does not violate these terms.</li>
        </ul>
        <p>
          We may remove any content that violates these terms or that we consider
          harmful, and we do so without notice if we reasonably believe it
          breaches the law or endangers someone.
        </p>
      </>
    ),
  },
  {
    id: 'prohibited',
    title: '4. Prohibited conduct',
    content: (
      <>
        <p className="mt-2">You must not:</p>
        <ul className="list-disc pl-5 space-y-1 text-[14px] leading-relaxed">
          <li>use the Service for any illegal or unauthorised purpose;</li>
          <li>try to gain unauthorised access to the Service, its systems or the accounts of others;</li>
          <li>submit false, misleading or abusive content, or attempt to harass other users;</li>
          <li>automate access (for example, bots, scrapers or scripted submissions) unless we have agreed it in writing;</li>
          <li>collect personal data about other users, or use the Service to build profiles for marketing without consent.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'no-fake-reviews',
    title: '5. No fake reviews, endorsements or unsupported claims',
    content: (
      <>
        <p>
          We do not publish fake reviews, fake endorsements or testimonials we
          cannot substantiate. Where we describe the Service, we state what we
          can reasonably demonstrate, and we will not claim a result — for
          example, a pace of learning, a rank, or a guarantee of improvement —
          that we cannot support.
        </p>
        <p>
          If you believe a review, user-generated content or a statement on the
          Service is false or misleading, please contact us and we will review
          it in line with these terms and applicable law.
        </p>
      </>
    ),
  },
  {
    id: 'changes',
    title: '6. Changes to these terms',
    content: (
      <>
        <p>
          We may update these terms from time to time. Where a change is
          significant, we will post a notice on the Service and, where required,
          contact you. Your continued use of the Service after the changes come
          into force constitutes acceptance of those changes.
        </p>
      </>
    ),
  },
  {
    id: 'contact',
    title: '7. Questions',
    content: (
      <>
        <p>
          If you have a question about these terms, contact us at{' '}
          <Link href="mailto:support@revisio.pro" className="underline underline-offset-4">
            support@revisio.pro
          </Link>
          .
        </p>
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <main>
      <article className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <header className="pt-6 sm:pt-8">
        <p className="t-fine uppercase tracking-wide text-muted-foreground">Legal</p>
        <h1 className="t-strong mt-1 text-3xl">Terms of Service</h1>
        <p className="t-caption mt-2">
          Revisio — Learn it once · 1 October 2026
        </p>
      </header>

      <nav className="toc flex flex-wrap gap-2" aria-label="Table of contents">
        {SECTIONS.map((s) => (
          <Link key={s.id} href={`#${s.id}`} className="chip">
            {s.title.split(' ')[0]}
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
          This page is for general information only and does not constitute
          legal advice. Please read the{' '}
          <Link href="/privacy" className="underline underline-offset-4">
            Privacy Policy
          </Link>{' '}
          together with these terms.
        </p>
      </footer>
      </article>
    </main>
  );
}
