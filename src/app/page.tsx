import Link from 'next/link';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { TileBand } from '@/components/ui/tile';
import { RankCrest } from '@/components/ui/rank-crest';
import { Icon, type IconName } from '@/components/ui/icons';
import { ReviewDemo } from '@/components/landing/review-demo';
import { HeroH1 } from '@/components/landing/hero-h1';
import { ForgettingCurve } from '@/components/landing/forgetting-curve';
import { HeroEnter, HeroItem } from '@/components/landing/hero-enter';
import { LandingCtaTracker } from '@/components/landing/cta-tracker';
import { rankFor } from '@/domain/ranked';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/lib/button-variants';
import { cn } from '@/lib/utils';

/**
 * Landing — docs/UI-SYSTEM.md, read as rules rather than inspiration.
 *
 * What changed from the previous version, and why:
 *
 *   • The hero is one full screen and says what is sold, to whom, with a fact.
 *     It used to be a ~510px band whose next section showed on the first screen.
 *   • The effect stack is gone. No drifting grid, border beam, glare-follow,
 *     word reveal, shiny text or scroll progress: the demo *is* the motion, and
 *     a page that animates because it scrolled is not allowed by the spec.
 *   • One entrance (HeroEnter: transform + opacity). Nothing else on the page
 *     moves until the visitor touches it.
 *   • One button language. The shimmer CTA is replaced by the system primary,
 *     which keeps the press lip and the focus ring.
 *   • The bento's 21-square grid was decoration pretending to be data; it is
 *     now the demo's actual three-card queue.
 *   • The rank numbers are static. They were rendered by NumberTicker, which
 *     starts at zero and only runs in view — so a full-page capture (and any
 *     reader who arrived mid-page) saw two empty stat slots.
 *   • The companion band merged into the rank band. On its own it was a
 *     half-empty screen with one small card.
 */

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'notes', title: 'Notes behind every card', body: 'Every card links back to the note it came from.' },
  { icon: 'exam', title: 'Papers that mark like real ones', body: 'Per-question feedback against the scheme.' },
];

/** Capabilities a student meets in week one (#26) — the audit's gap list:
 *  cram, maths drills, offline. Native apps stay unmentioned by name: they
 *  are sideload-alpha, and "offline review" is true on every client anyway. */
const ALSO_IN_THE_BOX: { icon: IconName; title: string; body: string }[] = [
  { icon: 'cram', title: 'Cram mode', body: 'A focused burst when the deadline is close.' },
  { icon: 'practice', title: 'Maths drills', body: 'Generated practice, on demand, per subject.' },
  { icon: 'offline', title: 'Offline review', body: 'Your queue is cached. Revise without signal, sync later.' },
  { icon: 'clock', title: 'Exam countdown', body: 'Set a date. Revisio paces your topics to it.' },
];

/** The demo's own three cards, so the queue shown here is the queue beside it. */
const QUEUE = [
  { topic: 'Biology · Enzymes', kind: 'Cloze' },
  { topic: 'Physics · Forces', kind: 'Cloze' },
  { topic: 'Chemistry · Bonding', kind: 'Cloze' },
];

const FACTS: { value: string; short: string; label: string }[] = [
  { value: '10 min', short: 'a day', label: 'a day' },
  { value: '30', short: 'rungs', label: 'rungs, ten tiers' },
  { value: 'Free', short: 'to start', label: 'no card needed' },
];

const COMPANION_LINE = 'Nothing is due. You are ahead.';

/** Landing FAQ (#28) — objections a student actually has, per the marketing
 *  audit §6. Copy: docs/COPY-DRAFTS-2026-11-16.md §#28. Rendered with native
 *  <details> so the section needs no client JS. */
const FAQS: { q: string; a: string }[] = [
  {
    q: 'What is Revisio?',
    a: 'A revision app for students with real exams: GCSE, A-level and university. It turns your notes and topics into review cards and schedules each one to come back right before you would forget it.',
  },
  {
    q: 'Is Revisio free?',
    a: 'Yes. Free while it is in alpha, and there is no card needed to sign up. Pricing has not been decided yet; when it is, we will say so plainly rather than surprise anyone.',
  },
  {
    q: 'How does spaced repetition work?',
    a: 'Every card you get right comes back later; every card you get wrong comes back sooner. After a few weeks the gaps widen until keeping a fact costs you seconds, not hours. You never plan it. The queue is already built when you open the app.',
  },
  {
    q: 'Do I have to make my own cards?',
    a: 'No. Cards are built from the notes and topics you study, and every card links back to the note it came from. A wrong answer is a chance to re-read, not a dead end.',
  },
  {
    q: 'Which subjects and exams are covered?',
    a: 'GCSE, A-level and university subjects, with past papers marked against the real scheme. If your teacher publishes topics for your class, they show up in your subjects too.',
  },
  {
    q: 'Does it work offline?',
    a: 'Yes. Your review queue is cached on your device, so you can revise on a train or a dead zone and sync when you are back online.',
  },
  {
    q: 'Is there an app for iPhone or Android?',
    a: 'There are iOS and Android apps, but they are in alpha and not in the app stores yet. The web app works in any mobile browser in the meantime, including offline review.',
  },
  {
    q: 'How does marking work?',
    a: 'Cloze and multiple-choice cards are marked the moment you submit. Past papers are marked against the real mark scheme, question by question, and exam sessions pace you through a timed paper.',
  },
  {
    q: 'Is Revisio safe for under-18s?',
    a: 'It is built for learners aged 13 and over. Under-13 accounts need a parent or guardian to confirm consent at sign-up, analytics and marketing are off unless you opt in, and there is no advertising network. The privacy policy has the full picture.',
  },
  {
    q: 'Can my teacher see my revision?',
    a: 'Only if you join their class. A teacher sees your name and progress as a member of their class; the rest of your account stays yours. Leaderboards are optional and under your control.',
  },
];

export default function LandingPage() {
  return (
    <LandingCtaTracker>
    <div className="min-h-viewport bg-background">
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      {/* ── Nav bar ───────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border bg-background pt-safe">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-3 px-5 sm:px-8">
          <Link href="/" className="flex min-h-11 items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-foreground t-caption font-bold text-background">
              R
            </span>
            <span className="t-tagline">Revisio</span>
          </Link>

          <nav className="ml-6 hidden items-center gap-1 md:flex">
            <a href="#try" className="inline-flex min-h-11 items-center rounded-pill px-3 t-caption-s text-muted-foreground hover:text-foreground">
              Try it
            </a>
            <a href="#how" className="inline-flex min-h-11 items-center rounded-pill px-3 t-caption-s text-muted-foreground hover:text-foreground">
              How it works
            </a>
            <a href="#rank" className="inline-flex min-h-11 items-center rounded-pill px-3 t-caption-s text-muted-foreground hover:text-foreground">
              Rank
            </a>
            <a href="#faq" className="inline-flex min-h-11 items-center rounded-pill px-3 t-caption-s text-muted-foreground hover:text-foreground">
              FAQ
            </a>
            <Link href="/subjects" className="inline-flex min-h-11 items-center rounded-pill px-3 t-caption-s text-muted-foreground hover:text-foreground">
              Subjects
            </Link>
            <Link href="/for-teachers" className="inline-flex min-h-11 items-center rounded-pill px-3 t-caption-s text-muted-foreground hover:text-foreground">
              Teachers
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle className="h-10 w-10" />
            {/* Hidden below lg: at 768–1023 the full nav plus both CTAs needs
                ~839px and pushed the header 71px past the viewport (design:shots
                landing-768 overflow). "Start free" still leads; /login stays one
                tap away through it. */}
            <Link href="/login" className={cn(buttonVariants({ variant: 'ghost' }), 'hidden lg:inline-flex')}>
              Log in
            </Link>
            <Link href="/register" className={buttonVariants({ variant: 'primary' })}>
              Start free
            </Link>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        {/* ── Hero: what it is, who it is for, one fact, the real thing ────── */}
        <TileBand tone="light" id="hero" className="landing-hero">
          <div className="grid items-center gap-6 sm:gap-8 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
            <HeroEnter>
              <HeroItem>
                <HeroH1 />
              </HeroItem>

              <HeroItem>
                <p className="t-lead-airy mt-4 max-w-[46ch] sm:mt-5">
                  Learn a card once and it comes back the day before you would forget it.
                  Ten minutes a day beats five hours the night before.
                </p>
              </HeroItem>

              <HeroItem>
                <div className="mt-6 flex flex-col gap-2.5 sm:mt-7 sm:flex-row">
                  <Link href="/register" className={buttonVariants({ variant: 'primary', size: 'lg' })}>
                    Start free
                    <Icon name="next" size={17} />
                  </Link>
                  <a href="#try" className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
                    Try a card
                  </a>
                </div>
              </HeroItem>

              <HeroItem>
                <div className="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-1 sm:mt-9 sm:items-end sm:gap-x-9 sm:gap-y-4">
                  {FACTS.map((fact) => (
                    <div key={fact.value} className="flex items-baseline gap-1 sm:block">
                      <p className="t-num-sm">{fact.value}</p>
                      {/* "30" alone is not a fact. The short label rides beside
                          the number on a phone and drops below it on desktop. */}
                      <p className="t-fine text-muted-foreground sm:hidden">{fact.short}</p>
                      <p className="t-fine mt-0.5 hidden text-muted-foreground sm:block">{fact.label}</p>
                    </div>
                  ))}
                </div>
              </HeroItem>
            </HeroEnter>

            <div className="relative">
              <ReviewDemo />
            </div>
          </div>
        </TileBand>

        {/* ── Try it: the forgetting curve ─────────────────────────────────── */}
        <TileBand tone="parchment" id="try" className="landing-section">
          <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
            <div>
              <p className="t-eyebrow">Memory, on a schedule</p>
              <h2 className="t-display mt-3 max-w-md">You forget on a curve. Reviews flatten it.</h2>
              <p className="mt-4 max-w-md t-body leading-relaxed text-muted-foreground">
                Recall falls away fast, then slower. Each good review widens the next gap, so a fact
                you revisited three times costs you less than one you crammed. Drag the slider and
                see when Revisio brings a card back.
              </p>
            </div>
            <ForgettingCurve />
          </div>
        </TileBand>

        {/* ── How it works ─────────────────────────────────────────────────── */}
        <TileBand tone="light" id="how" className="landing-section">
          <div>
            <h2 className="t-display max-w-sm">Three ways in.</h2>
            <p className="mt-4 max-w-xl t-body leading-relaxed text-muted-foreground">
              A queue you do not have to plan, the note behind every card, and past papers marked
              the way the scheme marks them.
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-2 md:grid-rows-2">
              <Card className="flex h-full flex-col bg-secondary md:row-span-2">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-card">
                  <Icon name="review" size={19} />
                </span>
                <h3 className="t-display-sm mt-5">A queue that builds itself</h3>
                <p className="mt-2 max-w-sm t-caption text-muted-foreground">
                  Due the day before you would forget. Open it and the next card is already waiting.
                </p>

                {/* The demo's actual cards, not a decorative heatmap. */}
                <div className="mt-auto pt-6">
                  <div className="overflow-hidden rounded-md border border-border bg-card">
                    <p className="t-label px-4 pt-3 text-muted-foreground">Today’s queue</p>
                    <ul className="mt-1 divide-y divide-border">
                      {QUEUE.map((item) => (
                        <li key={item.topic} className="flex items-center justify-between gap-3 px-4 py-2.5">
                          <span className="t-caption-s">{item.topic}</span>
                          <span className="t-fine text-muted-foreground">{item.kind}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Card>

              {FEATURES.map((feature) => (
                <Card key={feature.title} className="h-full bg-secondary">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-card">
                    <Icon name={feature.icon} size={19} />
                  </span>
                  <h3 className="t-display-sm mt-4">{feature.title}</h3>
                  <p className="mt-1.5 t-caption text-muted-foreground">{feature.body}</p>
                </Card>
              ))}
            </div>

            {/* The rest of the box, one line each — enough to show the
                product is bigger than three cards without a second bento. */}
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {ALSO_IN_THE_BOX.map((item) => (
                <li key={item.title} className="flex items-start gap-3 rounded-md border border-border bg-card px-4 py-3.5">
                  <Icon name={item.icon} size={17} className="mt-0.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="t-caption-s block">{item.title}</span>
                    <span className="t-fine mt-0.5 block text-muted-foreground">{item.body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </TileBand>

        {/* ── The ladder, and the companion in the same band ───────────────── */}
        <TileBand tone="dark" id="rank" className="landing-section">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-16">
            <div>
              <p className="t-eyebrow">The ladder</p>
              <h2 className="t-display mt-3 max-w-md">A record of what stuck.</h2>
              <p className="mt-4 max-w-lg t-body leading-relaxed text-muted-foreground">
                Thirty rungs across ten tiers, climbed on the reviews you make inside a season. A
                new season runs the ladder again, and the rank you finish on is kept in your record.
                Each week you are seated in a lobby, and the top of the table moves up.
              </p>

              <div className="mt-7 grid grid-cols-3 gap-4 border-t border-border pt-5">
                <div>
                  <p className="t-num-sm">30</p>
                  <p className="t-fine mt-0.5 text-muted-foreground">Rungs</p>
                </div>
                <div>
                  <p className="t-num-sm">10</p>
                  <p className="t-fine mt-0.5 text-muted-foreground">Tiers</p>
                </div>
                <div>
                  <p className="t-num-sm">Kept</p>
                  <p className="t-fine mt-0.5 text-muted-foreground">Season rank</p>
                </div>
              </div>

              <div className="mt-7 flex items-start gap-4 border-t border-border pt-5">
                <RankCrest rank={rankFor(1500)} size={40} showProgress={false} animate={false} />
                <div className="min-w-0">
                  <p className="t-body font-medium leading-snug">{COMPANION_LINE}</p>
                  <p className="t-fine mt-1 text-muted-foreground">One sentence, built from your own numbers</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-5 items-end gap-1.5 sm:gap-4">
              {[0, 400, 1500, 4000, 9000].map((base, i) => {
                const rung = rankFor(base);
                return (
                  <div
                    key={base}
                    className="flex min-w-0 flex-col items-center gap-2 rounded-lg border border-border px-1 py-4 sm:px-2"
                  >
                    <RankCrest rank={rung} size={i === 4 ? 40 : 34} showProgress={false} animate={false} />
                    <span className="w-full truncate text-center t-micro font-bold uppercase tracking-[0.06em]">
                      {rung.tier}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </TileBand>

        {/* ── FAQ: objections, answered (#28) ─────────────────────────────── */}
        <TileBand tone="parchment" id="faq" className="landing-section">
          <div className="mx-auto max-w-2xl">
            <h2 className="t-display">Questions, answered.</h2>
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

        {/* ── Close and footer, one screen ─────────────────────────────────── */}
        <TileBand tone="dark" id="close" className="landing-close">
          <div className="flex flex-1 flex-col">
            <div className="mx-auto my-auto max-w-2xl py-6 text-center">
              <h2 className="t-display">Start with one card today.</h2>
              <p className="mx-auto mt-4 max-w-md t-body text-muted-foreground">
                Free to start. Five minutes is enough to begin the habit.
              </p>
              <div className="mt-7 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
                <Link href="/register" className={buttonVariants({ variant: 'primary', size: 'lg' })}>
                  Start free
                  <Icon name="next" size={17} />
                </Link>
                <Link href="/login" className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
                  I have an account
                </Link>
              </div>
            </div>

            <div className="mt-10 flex flex-wrap items-center justify-between gap-6 border-t border-border pt-6">
              <div>
                <span className="t-tagline">Revisio</span>
                <p className="mt-1.5 max-w-sm t-caption text-muted-foreground">
                  Built for students who actually have exams.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link href="/privacy" className={cn(buttonVariants({ variant: 'ghost' }), '!text-muted-foreground hover:!text-foreground')}>
                  Privacy
                </Link>
                <Link href="/terms" className={cn(buttonVariants({ variant: 'ghost' }), '!text-muted-foreground hover:!text-foreground')}>
                  Terms
                </Link>
                <Link href="/cookie-policy" className={cn(buttonVariants({ variant: 'ghost' }), '!text-muted-foreground hover:!text-foreground')}>
                  Cookies
                </Link>
                <Link href="/accessibility" className={cn(buttonVariants({ variant: 'ghost' }), '!text-muted-foreground hover:!text-foreground')}>
                  Accessibility
                </Link>
                <Link href="/for-teachers" className={cn(buttonVariants({ variant: 'ghost' }), '!text-muted-foreground hover:!text-foreground')}>
                  For teachers
                </Link>
                <Link href="/login" className={cn(buttonVariants({ variant: 'ghost' }), '!text-muted-foreground hover:!text-foreground')}>
                  Log in
                </Link>
              </div>
            </div>
          </div>
        </TileBand>
      </main>
    </div>
    </LandingCtaTracker>
  );
}
