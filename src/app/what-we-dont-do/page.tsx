import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalHeader } from '@/components/LegalHeader';

export const metadata: Metadata = {
  title: 'What we don’t do · Revisio',
  description:
    'The honest list: the mechanics and monetisation choices Revisio rules out, and why.',
};

/**
 * The anti-dark-pattern page (F13). Short on purpose: each line is a product
 * commitment a learner can hold us to, not marketing. If a feature ever
 * contradicts one of these, the feature is wrong.
 */
const LINES: { title: string; body: string }[] = [
  {
    title: 'No energy that limits correct answers',
    body: 'Some revision apps meter how much you can do well per day to push you into paying. Revisio does not. A correct answer is always marked correct, and the queue is built from what you actually need to review, not from a budget.',
  },
  {
    title: 'No pay-to-unfreeze',
    body: 'Streak freezes are earned by revising, not bought. Missing a day starts a comeback, not a bill. Nothing in the app can be unlocked with money that protects your progress.',
  },
  {
    title: 'No streak-shaming',
    body: 'A streak is a signal, not a score. There are no countdowns, no "don’t break the chain" warnings, and no copy that makes a missed day feel like a failure. Coming back is named, not punished.',
  },
  {
    title: 'No ads',
    body: 'There is no advertising network, no sponsored content and no data sold to advertisers. The privacy policy says exactly what is collected and why.',
  },
  {
    title: 'No selling your revision',
    body: 'Your cards, answers and progress are yours. Teachers see class progress only for students who joined their class; leaderboards are opt-in and can be switched off at any time.',
  },
];

export default function WhatWeDontDoPage() {
  return (
    <>
      <LegalHeader current="/what-we-dont-do" />
      <main className="legal-doc mx-auto max-w-3xl space-y-7 px-4 py-10 sm:px-6">
        <header className="pt-6 sm:pt-8">
          <p className="t-fine uppercase tracking-wide text-muted-foreground">The honest list</p>
          <h1 className="t-strong mt-1 text-3xl">What we don’t do</h1>
          <p className="t-caption mt-2 text-muted-foreground">
            Products make money by finding new things to charge for or new ways to push you. These are the ones we ruled out.
          </p>
        </header>

        <ul className="space-y-5">
          {LINES.map((line) => (
            <li key={line.title} className="rounded-md border border-border bg-card px-4 py-3.5">
              <h2 className="t-caption font-semibold text-foreground">{line.title}</h2>
              <p className="mt-1.5 t-caption leading-relaxed text-muted-foreground">{line.body}</p>
            </li>
          ))}
        </ul>

        <p className="t-caption leading-relaxed text-muted-foreground">
          This list is a commitment, not a guarantee we will never change our minds. If it does, this page changes
          first. Questions about any of it: see the{' '}
          <Link className="underline underline-offset-4" href="/privacy">privacy policy</Link> or the{' '}
          <Link className="underline underline-offset-4" href="/for-teachers">teacher page</Link>.
        </p>

        <footer className="border-t border-border pt-5 t-caption text-muted-foreground">
          <Link href="/" className="underline underline-offset-4">Back to Revisio</Link>
        </footer>
      </main>
    </>
  );
}
