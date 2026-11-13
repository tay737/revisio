import 'server-only';

import Link from 'next/link';
import { LegalHeader } from '@/components/LegalHeader';
import { badgeVariants } from '@/components/ui/badge';

// ┌─────────────────────────────────────────────────────────────────────────┐
// │  TERMS OF SERVICE                                                       │
// │                                                                         │
// │  Revisio — Learn it once                                                │
// │                                                                         │
// │  These terms govern your use of the Service.                            │
// │  Please check the Privacy Policy and Cookie Policy too.                 │
// └─────────────────────────────────────────────────────────────────────────┘

export const metadata = {
  title: 'Terms of Service — Revisio',
  description:
    'Terms of use for Revisio: eligibility, your account, content and licensing, acceptable use, availability, liability and governing law.',
};

// Privacy carries the weight of a learning service, so these terms stay lean and
// cover what privacy cannot: who may hold an account, what you may do with the
// Service, what we promise about availability and outcomes, and where a dispute
// is settled. Every limit here is one we can point to in the product.

const SECTIONS = [
  {
    id: 'acceptance',
    title: '1. These terms',
    content: (
      <>
        <p>
          Revisio (&quot;we&quot;, &quot;us&quot;) runs the spaced-repetition
          learning service at{' '}
          <Link href="https://revisio-srs.vercel.app">
            https://revisio-srs.vercel.app
          </Link>{' '}
          (&quot;the Service&quot;). These terms are the agreement between you
          and us for using it. They sit beside the{' '}
          <Link href="/privacy" className="underline underline-offset-4">
            Privacy Policy
          </Link>
          , which explains what we do with your data, and the{' '}
          <Link href="/cookie-policy" className="underline underline-offset-4">
            Cookie Policy
          </Link>
          .
        </p>
        <p>
          By creating an account or using the Service you accept these terms. If
          you do not accept them, do not use the Service.
        </p>
      </>
    ),
  },
  {
    id: 'eligibility',
    title: '2. Who can use Revisio',
    content: (
      <>
        <p>
          You need to be 13 or older to hold an account yourself. A learner
          under 13 can have an account only when a parent or legal guardian
          completes the registration, confirms they are the guardian and agrees
          to the processing described in the Privacy Policy, section 12.
        </p>
        <p>
          That confirmation is self-attested. We do not verify who completes the
          form, so the adult who registers a child&apos;s account is responsible
          for that account and for anything done with it.
        </p>
        <p>
          Teacher and developer accounts are created by request and approved by
          us. Using a staff surface without approval is a breach of these terms.
        </p>
      </>
    ),
  },
  {
    id: 'accounts',
    title: '3. Your account',
    content: (
      <>
        <p>
          An account needs a working email address, which is also how we reach
          you about the account. Keep it current: verification, password reset
          and email-change links all go there.
        </p>
        <p>You are responsible for:</p>
        <ul className="list-disc pl-5 space-y-1 text-[14px] leading-relaxed">
          <li>keeping your password and any two-factor codes to yourself;</li>
          <li>everything done under your account; and</li>
          <li>using one account per person rather than sharing a login.</li>
        </ul>
        <p>
          Tell us straight away if you think someone else has access to your
          account. Changing your password signs out every other device.
        </p>
      </>
    ),
  },
  {
    id: 'content',
    title: '4. Content you create',
    content: (
      <>
        <p>
          Notes, cards, imports, profile text and images you upload stay yours.
          You give us a non-exclusive, worldwide licence to store, copy, display
          and process that content for one purpose: running the Service for you,
          and showing it to the people you have chosen to show it to. That means
          your own screens, the classmates or teacher of a class you join, and
          visitors to your public profile if you have published something there.
          The licence ends when you delete the content or the account, apart from
          copies already in a backup.
        </p>
        <p>You confirm that:</p>
        <ul className="list-disc pl-5 space-y-1 text-[14px] leading-relaxed">
          <li>the content is yours to upload, or you have permission to use it;</li>
          <li>it does not infringe anyone&apos;s copyright, trademark or other rights; and</li>
          <li>it does not break these terms or the law.</li>
        </ul>
        <p>
          We may remove content that breaks these terms or that we reasonably
          believe is unlawful or puts someone at risk. Where we can, we tell you
          what was removed and why. Serious or repeated breaches can end with the
          account being suspended.
        </p>
      </>
    ),
  },
  {
    id: 'our-content',
    title: '5. Our content and the licence we give you',
    content: (
      <>
        <p>
          The Service itself, including its software, design, question banks and
          written notes, belongs to us and is protected by copyright. You may use
          it for your own study while these terms apply. You may not copy,
          resell, redistribute, publish or deploy it, or use it to train a machine
          learning model, without our written permission.
        </p>
        <p>
          Past papers, mark schemes and formulae sheets are reproduced for study
          from documents published by the awarding bodies. Copyright in those
          documents stays with the awarding body. We claim no rights in them and
          we remove any on request from the rights holder.
        </p>
        <p>
          Your progress data is yours to export. The export controls in the
          Service give you a machine-readable copy of what you have earned.
        </p>
      </>
    ),
  },
  {
    id: 'prohibited',
    title: '6. Acceptable use',
    content: (
      <>
        <p className="mt-2">You must not:</p>
        <ul className="list-disc pl-5 space-y-1 text-[14px] leading-relaxed">
          <li>use the Service for anything unlawful, or to help someone else do something unlawful;</li>
          <li>try to reach data, systems or accounts you have not been given access to;</li>
          <li>submit content that is false, abusive, harassing or designed to harm another learner;</li>
          <li>
            scrape, automate or script the Service, including bulk review
            submission, without our written agreement;
          </li>
          <li>
            collect personal data about other learners, or use the Service to
            build a profile of anyone for marketing; or
          </li>
          <li>
            get around a rate limit, a suspension or a privacy setting, including
            by opening a second account.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'no-fake-reviews',
    title: '7. Reviews and claims',
    content: (
      <>
        <p>
          We do not publish invented reviews, invented endorsements or
          testimonials we cannot support. Where we describe the Service we say
          what we can show, and we will not promise a rank, a pace of learning or
          an exam result we cannot deliver.
        </p>
        <p>
          The same applies to what you post. If you believe something on the
          Service, including user content, is false or misleading, email us and
          we will review it against these terms and the law.
        </p>
      </>
    ),
  },
  {
    id: 'availability',
    title: '8. Availability and changes',
    content: (
      <>
        <p>
          We work to keep the Service available and correct, but it runs on
          infrastructure we rent and it changes as we build it. Features can be
          added, changed or withdrawn. We aim to give notice of anything that
          removes a feature you rely on, and we do not remove a feature mid-session
          without telling you.
        </p>
        <p>
          Planned maintenance and failures outside our control can interrupt
          access. A review you submit while offline is held and sent when the
          connection returns; the server re-grades it and awards the XP.
        </p>
        <p>
          The Service is currently free. If we introduce a paid tier, these terms
          are updated first and nothing is charged without your agreement.
        </p>
      </>
    ),
  },
  {
    id: 'ending',
    title: '9. Ending your access',
    content: (
      <>
        <p>
          You can stop using the Service at any time, and you can delete your
          account from Settings. Section 10 of the Privacy Policy explains
          exactly what that removes and what remains.
        </p>
        <p>
          We may suspend or close an account that breaches these terms, that we
          are required by law to close, or that puts other learners at risk. Except
          where the risk or the law makes it impractical, we tell you the reason
          and give you a chance to respond. If we close an account for a reason
          other than a breach, we tell you how to retrieve your data first.
        </p>
      </>
    ),
  },
  {
    id: 'outcomes',
    title: '10. What we do not promise',
    content: (
      <>
        <p>
          Revisio schedules reviews to help you remember what you have studied.
          It is a study aid. It does not guarantee a grade, a mark, an exam
          result or admission to anything, and it is not a substitute for
          teaching, a syllabus or the guidance of your school.
        </p>
        <p>
          Question content, mark schemes and grading notes are prepared with care
          but can contain errors, and an automated verdict on a free-response
          answer is a best effort rather than an examiner&apos;s judgement.
        </p>
        <p>
          The Service is provided as it is. We do not promise that it will be
          uninterrupted, error free, or fit for a purpose we have not agreed with
          you in writing.
        </p>
      </>
    ),
  },
  {
    id: 'liability',
    title: '11. Our liability to you',
    content: (
      <>
        <p>
          Nothing in these terms limits our liability for death or personal
          injury caused by our negligence, for fraud or fraudulent
          misrepresentation, or for anything else the law does not allow us to
          limit. If you are a consumer, your statutory rights are unaffected,
          including your right to a service supplied with reasonable care and
          skill under the Consumer Rights Act 2015.
        </p>
        <p>
          Subject to that, we are not liable for loss of profit, loss of
          opportunity, loss of expected grades or earnings, or any indirect or
          consequential loss. Our total liability for all claims connected with
          the Service in any twelve-month period is limited to the greater of
          £100 and the amount you paid us in that period.
        </p>
        <p>
          These limits apply to the extent the law allows. They do not apply
          where the loss comes from something we did deliberately or recklessly.
        </p>
      </>
    ),
  },
  {
    id: 'indemnity',
    title: '12. Claims about content you upload',
    content: (
      <>
        <p>
          If a third party brings a claim against us because of content you
          uploaded or shared in breach of section 4 or section 6, you are
          responsible for the reasonable costs of defending it. We will tell you
          promptly, let you take part in the defence, and not settle the claim in
          a way that admits fault on your part without asking you.
        </p>
      </>
    ),
  },
  {
    id: 'changes',
    title: '13. Changes to these terms',
    content: (
      <>
        <p>
          We update these terms when the Service changes. If a change affects your
          rights or obligations materially, we post a notice on the Service and
          email you before it takes effect, and the date at the top of this page
          changes. Continuing to use the Service after that point means you accept
          the new version. If you do not accept it, you can stop using the Service
          and delete your account.
        </p>
      </>
    ),
  },
  {
    id: 'law',
    title: '14. Governing law',
    content: (
      <>
        <p>
          These terms are governed by the law of England and Wales, and the courts
          of England and Wales have jurisdiction over any dispute. If you live
          elsewhere in the UK or in the EEA, you keep the protection of the
          mandatory consumer law of the country you live in, and you may bring a
          claim in your local courts.
        </p>
        <p>
          Before either of us starts proceedings, please email us. Most problems
          are settled in one exchange.
        </p>
      </>
    ),
  },
  {
    id: 'contact',
    title: '15. Questions',
    content: (
      <>
        <p>
          If a term is unclear, or you want to report a breach of these terms,
          email{' '}
          <Link href="mailto:tayyab@outlook.jp" className="underline underline-offset-4">
            tayyab@outlook.jp
          </Link>
          .
        </p>
        <p className="t-fine">
          Privacy requests go to the same address and are handled under the
          Privacy Policy.
        </p>
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <>
    <LegalHeader current="/terms" />
    <main>
      <article className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <header className="pt-6 sm:pt-8">
        <p className="t-fine uppercase tracking-wide text-muted-foreground">Legal</p>
        <h1 className="t-strong mt-1 text-3xl">Terms of Service</h1>
        <p className="t-caption mt-2">
          Revisio · version 2 · last reviewed 13 November 2026
        </p>
      </header>

      <nav className="toc flex flex-wrap gap-2" aria-label="Table of contents">
        {SECTIONS.map((s) => (
          <Link
            key={s.id}
            href={`#${s.id}`}
            className={badgeVariants({ variant: 'chip' })}
          >
            {/* The whole heading, minus its number. Splitting on the space left
                every chip reading “1.”, which is not a link name. */}
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
          These terms cover your use of the Service and do not replace the{' '}
          <Link href="/privacy" className="underline underline-offset-4">
            Privacy Policy
          </Link>
          , which explains what we do with your data.
        </p>
      </footer>
      </article>
    </main>
    </>
  );
}
