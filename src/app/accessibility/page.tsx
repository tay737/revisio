import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Accessibility — Revisio',
  description: 'Revisio’s accessibility aims, testing approach and how to report a barrier.',
};

export default function AccessibilityPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-7 px-4 py-10 sm:px-6">
      <header className="pt-6 sm:pt-8">
        <p className="t-fine uppercase tracking-wide text-muted-foreground">Access for everyone</p>
        <h1 className="t-strong mt-1 text-3xl">Accessibility statement</h1>
        <p className="t-caption mt-2 text-muted-foreground">Last reviewed: 9 October 2026</p>
      </header>

      <section aria-labelledby="commitment">
        <h2 id="commitment" className="t-display-sm">Our aim</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-foreground/90">
          We aim to make Revisio usable by as many learners as possible and use WCAG 2.2 AA as our design target.
          This is a target, not a claim of full conformance or independent certification.
        </p>
      </section>

      <section aria-labelledby="what-we-test">
        <h2 id="what-we-test" className="t-display-sm">What we test</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-foreground/90">
          Automated checks use axe-core on selected public and application screens. Browser checks cover route rendering,
          headings, keyboard skip links, narrow viewports and selected consent and service-worker behavior.
          Automated tools do not establish conformance: they cannot assess every content, device, assistive-technology,
          zoom, or real-world interaction issue. Manual and device testing is ongoing.
        </p>
      </section>

      <section aria-labelledby="known-limitations">
        <h2 id="known-limitations" className="t-display-sm">Known limitations</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-foreground/90">
          Some complex study and data visualisations may not yet offer an equivalent non-visual presentation.
          This statement does not mean every page or feature has been individually verified against every WCAG criterion.
          We are continuing to identify and address barriers.
        </p>
      </section>

      <section aria-labelledby="contact">
        <h2 id="contact" className="t-display-sm">Tell us about a barrier</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-foreground/90">
          If something makes Revisio difficult to use, email{' '}
          <Link className="underline underline-offset-4" href="mailto:support@revisio.pro">support@revisio.pro</Link>.
          Tell us which page you were using, what you were trying to do, and what device or assistive technology you use
          if you are comfortable sharing. We will review the report and work with you on an accessible way forward.
        </p>
      </section>

      <footer className="border-t border-border pt-5 text-[14px] text-muted-foreground">
        <Link href="/privacy" className="underline underline-offset-4">Read our privacy policy</Link>
      </footer>
    </main>
  );
}
