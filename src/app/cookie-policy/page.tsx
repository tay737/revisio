import 'server-only';

import Link from 'next/link';
import { Markdown } from '@/components/Markdown';
import { LegalHeader } from '@/components/LegalHeader';
import { badgeVariants } from '@/components/ui/badge';

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
    note: 'Anonymous, aggregated data on how people use the Service, used to improve it. No personal content is measured. We do not load an optional analytics service today; if we introduce one it runs only after this consent is given, and this page names it first.',
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
  {
    id: 'profile',
    name: 'Profile fields',
    purpose: 'Your public profile',
    note: 'Which profile fields a visitor can see. The switches live under Privacy in Settings; this consent records the choice for the audit trail. Your email address is never shown.',
  },
  {
    id: 'school',
    name: 'School and class data',
    purpose: 'Classroom use',
    note: 'Class and account data held for a learner’s schooling, including what the teacher who owns a class can see. Applies only if a class is joined.',
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
  your first visit, a banner asks for your choice before anything non-essential
  is loaded. Today the Service sets no non-essential cookie at all. The
  categories above record what we would load, and your choice governs it.
  - You can change your mind at any time in **Settings → How we use your data**.
  - You can unsubscribe from product updates and non-essential email with the
  link in the message, or in **Settings → How we use your data**.
  - Your browser's own privacy settings remain a second, independent control.

  Each refusal you make is stored with a time-stamp (on this device and, when
  you are signed in, on your account), so you will not need to repeat it.
`;

const HOW_WE_KEEP_IT_CURRENT = `
  We review this policy at least once a year and whenever we introduce or
  change a cookie or similar technology. If we change our use of cookies in a
  way that affects your rights, we will update this policy and, where
  required, ask for your consent again.
`;

export default function CookiePolicyPage() {
  return (
    <>
    <LegalHeader current="/cookie-policy" />
    <main>
      <article className="legal-doc mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <header className="pt-6 sm:pt-8">
        <p className="t-fine uppercase tracking-wide text-muted-foreground">Legal</p>
        <h1 className="t-strong mt-1 text-3xl">Cookie Policy</h1>
        <p className="t-caption mt-2">
          Revisio · last reviewed 13 November 2026
        </p>
      </header>

      <nav className="toc hidden flex-wrap gap-2 sm:flex" aria-label="Table of contents">
        <Link href="#what-are-cookies" className={badgeVariants({ variant: 'chip' })}>What</Link>
        <Link href="#categories" className={badgeVariants({ variant: 'chip' })}>Categories</Link>
        <Link href="#refuse" className={badgeVariants({ variant: 'chip' })}>Refuse</Link>
        <Link href="#no-consent" className={badgeVariants({ variant: 'chip' })}>No consent</Link>
        <Link href="#update" className={badgeVariants({ variant: 'chip' })}>Update</Link>
      </nav>

      <div className="space-y-10">
        <section id="what-are-cookies" className="scroll-mt-24">
          <h2 className="t-strong">1. What cookies are</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-foreground/90">
            A cookie is a small text file that a website saves on your device so
            the Service can remember your actions and preferences. We also use
            similar technologies: local storage for your consent choice, your
            preference settings and the offline cache. These are covered by the
            same limits described in this policy.
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-foreground/90">
            <em>First-party</em> cookies are set by us. <em>Third-party</em>{' '}
            cookies are set by a provider we use to run the Service. No
            third-party cookie is set today: email delivery is the only provider
            that touches a page you visit, and it runs server-side, so it never
            places anything in your browser. If that changes, this section and
            the consent banner change first. See the Privacy Policy, section 14,
            for what we check and who the providers are.
          </p>
        </section>

        <section id="categories" className="scroll-mt-24">
          <h2 className="t-strong">2. Categories of cookie we use</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-foreground/90">
            We only use cookies that are necessary for the Service, or that you
            have explicitly consented to. Each category below gives its purpose
            and what applies to it. Several of these are account settings rather
            than cookies: they are stored in our database because they have to
            follow you between devices.
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
            If you decline, the Service still works. Your reviews are scheduled,
            your progress is kept and you can learn as normal. What you do not get
            is anything that depends on permission you have not given: product
            updates and promotional email, non-essential notifications, and
            anonymised research use of your data.
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-foreground/90">
            We do not use a soft opt-in or implied consent for anything beyond
            essential cookies, and we never make a non-essential cookie a
            condition of using the Service. The switches under Privacy in
            Settings are separate from this banner and still apply.
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
          <Link href="mailto:tayyab@outlook.jp" className="underline underline-offset-4">
            tayyab@outlook.jp
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
    </>
  );
}
