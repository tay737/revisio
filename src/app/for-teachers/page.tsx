import Link from 'next/link';
import type { Metadata } from 'next';
import { TileBand } from '@/components/ui/tile';
import { Icon, type IconName } from '@/components/ui/icons';
import { buttonVariants } from '@/lib/button-variants';
import { cn } from '@/lib/utils';

/**
 * /for-teachers — the teacher-facing marketing page (#27).
 *
 * Teacher classes are the sharpest differentiator vs Anki/Quizlet (see
 * docs/MARKETING-AUDIT-2026-11-16.md §5): real classrooms, rosters and
 * per-student progress — none of which the flashcard incumbents offer.
 * Copy: docs/COPY-DRAFTS-2026-11-16.md §#27.
 */
export const metadata: Metadata = {
  title: 'For teachers · Revisio',
  description:
    'Run revision for your whole class on Revisio: classes, rosters and per-student progress built in.',
};

const HERO = {
  eyebrow: 'For teachers',
  heading: 'Set the class. Revisio does the chasing.',
  lead: 'Create a class, share a join code, and every student’s review queue builds itself. You see who is keeping up and who is coasting, without collecting anyone’s planner.',
};

const HOW_IT_WORKS = {
  heading: 'How a class uses it',
  steps: [
    'You create the class and share the join code.',
    'Students join and revise ten minutes a day. The queue schedules itself.',
    'You check the dashboard: who is due, who is slipping, which topic needs a re-teach.',
  ],
};

const SECTIONS: {
  icon: IconName;
  title: string;
  body: string;
  points: string[];
}[] = [
  {
    icon: 'class',
    title: 'A class in a minute',
    body: 'Create a class and share its join code. Students register or sign in and join with the code: no invites, no email lists, no IT ticket.',
    points: ['Join codes you can rotate', 'Add or remove students yourself', 'Rename or delete a class anytime'],
  },
  {
    icon: 'notes',
    title: 'Content they will actually revise',
    body: 'Publish topics to your class subject. Every card stays linked to its note, so when a student slips the fix is one tap away, not a re-teach in front of the room.',
    points: ['Topics published to your class', 'Notes behind every card', 'Queues that build themselves'],
  },
  {
    icon: 'progress',
    title: 'Progress you can act on',
    body: 'Each student’s reviews, accuracy and weak topics land on your dashboard (the same mastery data they see, rolled up for the class).',
    points: ['Per-student progress', 'Weak-topic visibility', 'Evidence of revision, not attendance'],
  },
];

const FAQS: { q: string; a: string }[] = [
  {
    q: 'Do students need their own accounts?',
    a: 'Yes, each student registers with the class join code. That is what makes their progress visible to you.',
  },
  {
    q: 'Is there a cost for classrooms?',
    a: 'Revisio is free while it is in alpha, and class features are part of the same product, with no separate licence.',
  },
  {
    q: 'Do I have to write the cards?',
    a: 'No. Publish topics and notes; cards are built from them and stay linked back to the source, so a student who slips can re-read the note that failed them.',
  },
  {
    q: 'What can I see about my students?',
    a: 'Names and progress for students in your class: reviews, accuracy and weak topics. Nothing outside the class is visible to you.',
  },
  {
    q: 'Which subjects are covered?',
    a: 'GCSE, A-level and university subjects, plus anything you publish yourself for your class.',
  },
];

export default function ForTeachersPage() {
  return (
    <div className="min-h-viewport bg-background">
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-background pt-safe">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-3 px-5 sm:px-8">
          <Link href="/" className="flex min-h-11 items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-foreground t-caption font-bold text-background">
              R
            </span>
            <span className="t-tagline">Revisio</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/login" className={cn(buttonVariants({ variant: 'ghost' }), 'hidden sm:inline-flex')}>
              Log in
            </Link>
            <Link href="/register" className={buttonVariants({ variant: 'primary' })}>
              Start free
            </Link>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        {/* Hero */}
        <TileBand tone="light" id="hero" className="!py-10 sm:!py-14">
          <div className="mx-auto max-w-3xl py-10 text-center sm:py-14">
            <p className="t-eyebrow">{HERO.eyebrow}</p>
            <h1 className="t-display mt-3">{HERO.heading}</h1>
            <p className="mx-auto mt-4 max-w-xl t-body leading-relaxed text-muted-foreground">
              {HERO.lead}
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
              <Link href="/register" className={buttonVariants({ variant: 'primary', size: 'lg' })}>
                Create a class
                <Icon name="next" size={17} />
              </Link>
              <Link href="/" className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
                What is Revisio?
              </Link>
            </div>
          </div>
        </TileBand>

        {/* How a class uses it — three steps */}
        <TileBand tone="parchment" id="how" >
          <div className="mx-auto max-w-3xl">
            <h2 className="t-display-sm">{HOW_IT_WORKS.heading}</h2>
            <ol className="mt-6 grid gap-4 sm:grid-cols-3">
              {HOW_IT_WORKS.steps.map((step, i) => (
                <li key={step} className="flex items-start gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-card t-caption-s font-bold">
                    {i + 1}
                  </span>
                  <span className="t-caption leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </TileBand>

        {/* Feature sections — one band per capability, anchors for deep links */}
        {SECTIONS.map((section, i) => (
          <TileBand key={section.title} tone={i % 2 === 0 ? 'light' : 'parchment'} id={`feature-${i + 1}`}>
            <div className="mx-auto max-w-3xl">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-card">
                <Icon name={section.icon} size={20} />
              </span>
              <h2 className="t-display-sm mt-5">{section.title}</h2>
              <p className="mt-3 max-w-xl t-body leading-relaxed text-muted-foreground">
                {section.body}
              </p>
              <ul className="mt-6 grid gap-3 sm:grid-cols-3">
                {section.points.map((point) => (
                  <li
                    key={point}
                    className="flex items-start gap-2.5 rounded-md border border-border bg-card px-4 py-3"
                  >
                    <Icon name="correct" size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
                    <span className="t-caption-s">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          </TileBand>
        ))}

        {/* Teacher FAQ — mirrors the landing FAQ pattern */}
        <TileBand tone="parchment" id="faq">
          <div className="mx-auto max-w-2xl">
            <h2 className="t-display">Questions teachers ask</h2>
            <div className="mt-6 divide-y divide-border rounded-lg border border-border bg-card">
              {FAQS.map((item) => (
                <details key={item.q} className="group px-5 py-4">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 t-body font-medium [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <Icon name="expand" size={16} className="shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                  </summary>
                  <p className="mt-3 t-caption leading-relaxed text-muted-foreground">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </TileBand>

        {/* Close */}
        <TileBand tone="dark" id="close">
          <div className="mx-auto my-auto max-w-2xl py-10 text-center">
            <h2 className="t-display">Your class is one join code away.</h2>
            <p className="mx-auto mt-4 max-w-md t-body text-muted-foreground">
              Free while in alpha. Your first class takes a minute.
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
              <Link href="/register" className={buttonVariants({ variant: 'primary', size: 'lg' })}>
                Create a class
                <Icon name="next" size={17} />
              </Link>
              <Link href="/" className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
                Back to Revisio
              </Link>
            </div>
          </div>
        </TileBand>
      </main>
    </div>
  );
}
