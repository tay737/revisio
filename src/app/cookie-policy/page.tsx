import 'server-only';

import Link from 'next/link';
import { Markdown } from '@/components/Markdown';

// ┌─────────────────────────────────────────────────────────────────────────┐
// │  COOKIE POLICY                                                          │
// │                                                                         │
// │  Revisio — Learn it once                                              │
// │                                                                         │
// │  This policy explains what cookies and similar technologies we use,   │
// │  why, and how you can control or refuse them.                         │
// │                                                                         │
// │  Read this together with the Privacy Policy, which covers the wider   │
// │  purposes of our processing.                                          │
// └─────────────────────────────────────────────────────────────────────────┘

export const metadata = {
  title: 'Cookie Policy — Revisio',
  description:
    'What cookies and similar technologies Revisio uses, why, and how you can control them.',
};

// The writing follows the law's own frame: (1) what cookies are, (2) their
// categories, (3) how to refuse them, (4) what happens if you do, and
// (5) how we keep this up to date. The user is in control here: we do not
// assume their consent for anything that is not strictly necessary.

const CATEGORIES = [
  {
    id: 'essential',
    name: 'Essential',
    purpose: 'Operate the Service',
    note: 'Strictly necessary for the Service to work, e.g. keeping you signed in, securing your account, and remembering your preferences. These are always on and cannot be switched off.',
  },
  {
    id: 'preferences',
    name: 'Preferences',
    purpose: 'Your appearance and accessibility',
    note: 'How the Service looks and behaves for you: note density, reduced-motion setting, and whether you appear on leaderboards. We store these per account, not in a cookie.',
  },
  {
    id: 'analytics',
    name: 'Analytics',
    purpose: 'Usage metrics',
    note: 'Anonymous, aggregated data on how people use the Service, used to improve it. No personal content is measured. Your account-level consent can switch this off.',
  },
  {
    id: 'marketing',
    name: 'Marketing',
    purpose: 'Communications and promotions',
    note: 'Product updates and promotional messages about the Service. These are only sent if you have consented, and you can unsubscribe at any time.',
  },
  {
    id: 'notifications',
    name: 'Notifications',
    purpose: 'In-app and email',
    note: 'Non-essential notifications and email messages. Messages of this kind carry a one-click unsubscribe link; account and security email (verification, password resets) does not, because the account cannot work without it.',
  },
  {
    id: 'research',
    name: 'Research',
    purpose: 'Anonymised research',
    note: 'Anonymised product research. Data can be removed from research records on request.',
  },
];

// Prose only — the section already renders its own `<h2>`, so the copy here
// starts at the first paragraph. It is rendered through `<Markdown>`, the one
// renderer for authored text in this codebase, because a raw string left the
// `**bold**` markers on screen as literal asterisks.
const HOW_TO_REFUSE = `
  You can control cookies through your browser settings. The steps for the
  common browsers are listed on the browser vendor's help pages.

  - **Essential cookies** cannot be switched off: the Service will not work
  without them.
  - **Non-essential cookies** are set only after you choose to accept them. On
  your first visit, a cookie-consent banner asks for your choice before any
  non-essential cookie is loaded.
  - You can change your mind at any time in **Settings → How we use your data**.
  - You can unsubscribe from product updates and non-essential email with the
  link in the message, or in **Settings → How we use your data**.
  - Device-level analytics can be switched off in your browser's privacy
  settings. We record this choice on your account so it applies to the Service
  too.

  Each refusal you make is stored with a time-stamp and is applied on your next
  request, so you will not need to repeat it.
`;

const HOW_WE_KEEP_IT_CURRENT = `
  We review this policy at least once a year and whenever we introduce or
  change a cookie or similar technology. If we change our use of cookies in a
  way that affects your rights, we will update this policy and, where
  required, ask for your consent again.
`;

export default function CookiePolicyPage() {
  return (
    <main>
      <article className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <header className="pt-6 sm:pt-8">
        <p className="t-fine uppercase tracking-wide text-muted-foreground">Legal</p>
        <h1 className="t-strong mt-1 text-3xl">Cookie Policy</h1>
        <p className="t-caption mt-2">
          Revisio — Learn it once · 1 October 2026
        </p>
      </header>

      <nav className="toc flex flex-wrap gap-2" aria-label="Table of contents">
        <Link href="#what-are-cookies" className="chip">What</Link>
        <Link href="#categories" className="chip">Categories</Link>
        <Link href="#refuse" className="chip">Refuse</Link>
        <Link href="#no-consent" className="chip">No consent</Link>
        <Link href="#update" className="chip">Update</Link>
      </nav>

      <div className="space-y-10">
        <section id="what-are-cookies" className="scroll-mt-24">
          <h2 className="t-strong">1. What cookies are</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-foreground/90">
            A cookie is a small text file that a website saves on your device so
            the Service can remember your actions and preferences. We also use
            similar technologies: local storage for your session and preference
            settings, and device identifiers for analytics, all with the same
            limits described in this policy.
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-foreground/90">
            <em>First-party</em> cookies are set by us. <em>Third-party</em>{' '}
            cookies are set by the providers we use to operate or improve the
            Service — for example, for analytics or email delivery. Those
            providers are
            subject to our data-processing requirements and we audit them
            before we use them. See the Privacy Policy, section 13, for the
            third-party audit.
          </p>
        </section>

        <section id="categories" className="scroll-mt-24">
          <h2 className="t-strong">2. Categories of cookie we use</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-foreground/90">
            We only use cookies that are necessary for the Service, or that you
            have explicitly consented to. The table below lists each category,
            its purpose, and the information that applies to it.
          </p>

          <div className="mt-3 divide-y divide-border">
            {CATEGORIES.map((cat) => (
              <div key={cat.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="t-caption-s">{cat.name}</h3>
                  <p className="t-fine mt-0.5 text-muted-foreground">{cat.purpose}</p>
                  <p className="t-fine mt-1">{cat.note}</p>
                </div>
                <span className="t-fine shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">{cat.id}</span>
              </div>
            ))}
          </div>
        </section>

        <section id="refuse" className="scroll-mt-24">
          <h2 className="t-strong">3. How to refuse or manage cookies</h2>
          <Markdown
            text={HOW_TO_REFUSE}
            className="mt-2 rounded-lg border border-border bg-card p-4 text-[15px]"
          />
        </section>

        <section id="no-consent" className="scroll-mt-24">
          <h2 className="t-strong">4. What happens if you do not consent</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-foreground/90">
            If you decline non-essential cookies, the Service will still work.
            You will see the Service, your reviews will be scheduled, and you
            can still learn. What you will not get is personalisation that
            requires your consent — the analytics we run on usage, and any
            promotional messages from us.
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-foreground/90">
            We do not use &quot;soft opt-in&quot; or implied consent for
            anything other than essential cookies, and we do not make
            consent a condition of using the Service unless that use is
            necessary for the Service to work.
          </p>
        </section>

        <section id="update" className="scroll-mt-24">
          <h2 className="t-strong">5. How we keep this policy up to date</h2>
          <Markdown text={HOW_WE_KEEP_IT_CURRENT} className="mt-2 text-[15px]" />
        </section>
      </div>

      <footer className="border-t border-border pt-6 text-xs text-muted-foreground">
        <p>
          Questions about cookies or how we use your data?{' '}
          <Link href="mailto:support@revisio.pro" className="underline underline-offset-4">
            Contact us
          </Link>
          , or see the full{' '}
          <Link href="/privacy" className="underline underline-offset-4">
            Privacy Policy
          </Link>
          .
        </p>
      </footer>
      </article>
    </main>
  );
}
