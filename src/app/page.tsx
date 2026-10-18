import Link from 'next/link';
import { MotionConfig } from 'motion/react';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { BlurFade } from '@/components/ui/blur-fade';
import { TileBand } from '@/components/ui/tile';
import { RankCrest } from '@/components/ui/rank-crest';
import { Icon, type IconName } from '@/components/ui/icons';
import { BorderBeam } from '@/components/ui/border-beam';
import { AnimatedGridPattern } from '@/components/ui/animated-grid-pattern';
import { AnimatedShinyText } from '@/components/ui/animated-shiny-text';
import { ScrollProgress } from '@/components/ui/scroll-progress';
import { NumberTicker } from '@/components/ui/number-ticker';
import { ShimmerButton } from '@/components/ui/shimmer-button';
import { MagicCard } from '@/components/ui/magic-card';
import { ReviewDemo } from '@/components/landing/review-demo';
import { ForgettingCurve } from '@/components/landing/forgetting-curve';
import { GlareHover } from '@/components/ui/glare-hover';
import { WordReveal } from '@/components/landing/word-reveal';
import { rankFor } from '@/domain/ranked';

/**
 * Landing — docs/DESIGN-UBER.md, read strictly.
 *
 * Edge-to-edge bands alternate canvas → ink → canvas → parchment → ink, so the
 * colour change is the divider. On top of that the page is deliberately
 * animated: a scroll progress rule, a word-by-word headline, a grid drifting
 * behind the hero, a tilt on the demo card, beams and shimmer on the CTAs, and
 * spotlight borders on the bento tiles.
 *
 * This page ignores the OS reduced-motion setting (`MotionConfig` below and the
 * `.landing-motion` opt-out in globals.css). The rest of the app still honours it.
 *
 * The two demos are real, not screenshots: a cloze review you can answer, and
 * a forgetting curve you can reschedule.
 */

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'notes', title: 'Notes behind every card', body: 'Read the topic, not just the answer.' },
  { icon: 'exam', title: 'Papers that mark like real ones', body: 'Per-question feedback against the scheme.' },
];

const COMPANION_LINE = 'Nothing is due — you are ahead.';

const SPOTLIGHT = 'rgb(169 124 248 / 0.14)';

export default function LandingPage() {
  return (
    <MotionConfig reducedMotion="never">
      <div className="landing-motion min-h-screen bg-background">
        <ScrollProgress />
        <a href="#main" className="skip-link">
          Skip to content
        </a>

        {/* ── Nav bar ───────────────────────────────────────────────────────── */}
        <header className="sticky top-0 z-40 border-b border-border bg-background/85 pt-safe backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-3 px-5 sm:px-8">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-foreground text-[13px] font-bold text-background">
                R
              </span>
              <span className="t-tagline">Revisio</span>
            </Link>

            <nav className="ml-6 hidden items-center gap-1 md:flex">
              <a href="#try" className="rounded-pill px-3 py-2 text-[15px] font-medium text-muted-foreground hover:text-foreground">
                Try it
              </a>
              <a href="#how" className="rounded-pill px-3 py-2 text-[15px] font-medium text-muted-foreground hover:text-foreground">
                How it works
              </a>
              <a href="#rank" className="rounded-pill px-3 py-2 text-[15px] font-medium text-muted-foreground hover:text-foreground">
                Rank
              </a>
            </nav>

            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle className="h-10 w-10" />
              <Link href="/login" className="btn btn-ghost hidden sm:inline-flex">
                Log in
              </Link>
              <Link href="/register" className="btn btn-primary">
                Start free
              </Link>
            </div>
          </div>
        </header>

        <main id="main" tabIndex={-1}>
          {/* ── Hero: headline left, the working review card right ──────────── */}
          <TileBand tone="light" className="relative overflow-hidden !py-10 md:!py-20">
            <AnimatedGridPattern
              numSquares={28}
              maxOpacity={0.07}
              duration={5}
              className="fill-foreground stroke-foreground/[0.06] mask-[radial-gradient(900px_circle_at_top_right,white,transparent)]"
            />
            <div className="relative grid items-center gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
              <div>
                <BlurFade>
                  <AnimatedShinyText className="t-eyebrow !mx-0 !max-w-none">Spaced repetition, properly</AnimatedShinyText>
                </BlurFade>

                <h1 className="t-hero mt-3 max-w-xl">
                  <WordReveal text="Learn it once." delay={0.1} />
                </h1>

                <BlurFade delay={0.1}>
                  <p className="mt-4 max-w-lg text-[17px] leading-relaxed text-muted-foreground">
                    Revisio shows you the right card at the right moment, then gets out of the way.
                    Five minutes today beats five hours the night before.
                  </p>
                </BlurFade>

                <BlurFade delay={0.15}>
                  <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
                    <ShimmerButton
                      href="/register"
                      background="var(--foreground)"
                      shimmerColor="var(--background)"
                      className="h-12 gap-2 px-7 text-[16px] font-semibold text-background"
                    >
                      Start free
                      <Icon name="next" size={17} />
                    </ShimmerButton>
                    <a href="#try" className="btn btn-secondary btn-lg">
                      Try a card
                    </a>
                  </div>
                </BlurFade>
              </div>

              <BlurFade delay={0.12}>
                <GlareHover width="100%" height="auto" background="transparent" color="#ffffff" opacity={0.22} className="relative cursor-default rounded-xl">
                  <BorderBeam size={120} duration={7} colorFrom="var(--foreground)" colorTo="var(--muted-foreground)" borderWidth={2} />
                  <ReviewDemo />
                </GlareHover>
              </BlurFade>
            </div>
          </TileBand>

          {/* ── Try it: the forgetting curve ─────────────────────────────────── */}
          <TileBand tone="parchment" id="try" className="!py-12 md:!py-20">
            <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
              <div>
                <BlurFade>
                  <p className="t-eyebrow">Memory, on a schedule</p>
                </BlurFade>
                <BlurFade delay={0.05}>
                  <h2 className="t-display mt-3 max-w-md">You forget on a curve. Reviews flatten it.</h2>
                </BlurFade>
                <BlurFade delay={0.1}>
                  <p className="mt-4 max-w-md text-[16px] leading-relaxed text-muted-foreground">
                    Recall falls away fast, then slower. Each good review widens the next gap, so a fact
                    you revisited three times costs you less than one you crammed. Drag the slider and
                    see when Revisio brings a card back.
                  </p>
                </BlurFade>
              </div>
              <BlurFade delay={0.08}>
                <ForgettingCurve />
              </BlurFade>
            </div>
          </TileBand>

          {/* ── How it works: bento ───────────────────────────────────────────── */}
          <TileBand tone="light" id="how" className="!py-12 md:!py-20">
            <BlurFade>
              <h2 className="t-display max-w-xl">Three ways in.</h2>
            </BlurFade>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <BlurFade className="md:row-span-2">
                <MagicCard className="h-full rounded-lg" gradientColor={SPOTLIGHT} gradientSize={320}>
                  <div className="relative h-full overflow-hidden rounded-lg bg-secondary p-6 md:p-8">
                    <BorderBeam size={160} duration={9} colorFrom="var(--foreground)" colorTo="var(--muted-foreground)" />
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-card">
                      <Icon name="review" size={19} />
                    </span>
                    <h3 className="t-display-sm mt-5">A queue that builds itself</h3>
                    <p className="mt-2 max-w-sm text-[15px] text-muted-foreground">
                      Due the day before you would forget. Nothing to plan, nothing to sort. Open it and the next
                      right card is already waiting.
                    </p>
                    <div className="mt-8 grid grid-cols-7 gap-1.5" aria-hidden>
                      {Array.from({ length: 21 }).map((_, i) => (
                        <span
                          key={i}
                          className={`h-7 rounded-sm ${
                            i % 5 === 3 ? 'bg-foreground' : i % 3 === 0 ? 'bg-border-strong' : 'bg-card'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </MagicCard>
              </BlurFade>

              {FEATURES.map((f, i) => (
                <BlurFade key={f.title} delay={0.05 + i * 0.05}>
                  <MagicCard className="h-full rounded-lg" gradientColor={SPOTLIGHT} gradientSize={260}>
                    <div className="h-full bg-secondary p-6">
                      <span className="grid h-10 w-10 place-items-center rounded-full bg-card">
                        <Icon name={f.icon} size={19} />
                      </span>
                      <h3 className="t-display-sm mt-4">{f.title}</h3>
                      <p className="mt-1.5 text-[15px] text-muted-foreground">{f.body}</p>
                    </div>
                  </MagicCard>
                </BlurFade>
              ))}
            </div>
          </TileBand>

          {/* ── Rank band: the polarity flip ─────────────────────────────────── */}
          <TileBand tone="dark" id="rank" className="!py-12 md:!py-20">
            <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
              <div>
                <p className="t-eyebrow">The ladder</p>
                <h2 className="t-display mt-3 max-w-md">A rank you can defend.</h2>
                <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-muted-foreground">
                  Thirty rungs across ten tiers, earned from everything you have ever reviewed. They never
                  reset. Each week you are seated in a lobby, and the top of the table moves up.
                </p>

                <dl className="mt-7 grid grid-cols-3 gap-4 border-t border-border pt-5">
                  <div>
                    <dt className="text-[12px] uppercase tracking-[0.08em] text-muted-foreground">Rungs</dt>
                    <dd className="t-num-sm mt-1">
                      <NumberTicker value={30} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[12px] uppercase tracking-[0.08em] text-muted-foreground">Tiers</dt>
                    <dd className="t-num-sm mt-1">
                      <NumberTicker value={10} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[12px] uppercase tracking-[0.08em] text-muted-foreground">Resets</dt>
                    <dd className="t-num-sm mt-1">Never</dd>
                  </div>
                </dl>
              </div>

              <div className="grid grid-cols-5 items-end gap-1.5 sm:gap-4">
                {[0, 400, 1500, 4000, 9000].map((base, i) => {
                  const rung = rankFor(base);
                  return (
                    <BlurFade key={base} delay={i * 0.07} className="min-w-0">
                      <div
                        className={`flex min-w-0 flex-col items-center gap-2 rounded-lg border border-border px-1 py-4 sm:px-2 ${
                          i === 1 ? 'bg-secondary' : ''
                        }`}
                      >
                        <RankCrest rank={rung} size={i === 4 ? 40 : 34} showProgress={false} muted={i > 1} animate={false} />
                        <span
                          className={`w-full truncate text-center text-[10px] font-bold uppercase tracking-[0.06em] sm:text-[11px] ${
                            i > 1 ? 'text-muted-foreground' : ''
                          }`}
                        >
                          {rung.tier}
                        </span>
                      </div>
                    </BlurFade>
                  );
                })}
              </div>
            </div>
          </TileBand>

          {/* ── The companion ────────────────────────────────────────────────── */}
          <TileBand tone="parchment" className="!py-12 md:!py-20">
            <div className="grid items-center gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
              <div>
                <p className="t-eyebrow">Not a dashboard</p>
                <h2 className="t-display mt-3 max-w-md">It talks to you like a person.</h2>
                <p className="mt-4 max-w-md text-[16px] leading-relaxed text-muted-foreground">
                  One sentence, from your own numbers, on every screen. It notices a gap, it notices a
                  clean sheet, and it never nags.
                </p>
              </div>

              <BlurFade>
                <div className="card flex items-start gap-4 p-5">
                  <RankCrest rank={rankFor(1500)} size={44} showProgress={false} animate={false} />
                  <div className="min-w-0">
                    <p className="text-[17px] font-medium leading-snug">{COMPANION_LINE}</p>
                    <p className="mt-2 text-[13px] text-muted-foreground">— on a Tuesday, mid-streak</p>
                  </div>
                </div>
              </BlurFade>
            </div>
          </TileBand>

          {/* ── Closing CTA on the ink band ──────────────────────────────────── */}
          <TileBand tone="dark" className="relative overflow-hidden !py-14 md:!py-20">
            <AnimatedGridPattern
              numSquares={22}
              maxOpacity={0.12}
              duration={6}
              className="fill-foreground stroke-foreground/[0.08] mask-[radial-gradient(600px_circle_at_center,white,transparent)]"
            />
            <BlurFade className="relative mx-auto max-w-2xl text-center">
              <h2 className="t-display">Start with one card today.</h2>
              <p className="mx-auto mt-4 max-w-md text-[16px] text-muted-foreground">
                Free to start. Five minutes is enough to begin the habit.
              </p>
              <div className="mt-7 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
                <ShimmerButton
                  href="/register"
                  background="var(--foreground)"
                  shimmerColor="var(--background)"
                  className="h-12 gap-2 px-7 text-[16px] font-semibold text-background"
                >
                  Start free
                  <Icon name="next" size={17} />
                </ShimmerButton>
                <Link href="/login" className="btn btn-secondary btn-lg">
                  I have an account
                </Link>
              </div>
            </BlurFade>
          </TileBand>

          {/* ── Footer ───────────────────────────────────────────────────────── */}
          <TileBand tone="dark" className="!py-10 md:!py-14">
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div>
                <span className="t-tagline">Revisio</span>
                <p className="mt-1.5 max-w-sm text-[14px] text-muted-foreground">
                  Built for students who actually have exams.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link href="/privacy" className="btn btn-ghost !text-muted-foreground hover:!text-foreground">Privacy</Link>
                <Link href="/terms" className="btn btn-ghost !text-muted-foreground hover:!text-foreground">Terms</Link>
                <Link href="/cookie-policy" className="btn btn-ghost !text-muted-foreground hover:!text-foreground">Cookies</Link>
                <Link href="/accessibility" className="btn btn-ghost !text-muted-foreground hover:!text-foreground">Accessibility</Link>
                <Link href="/login" className="btn btn-ghost !text-muted-foreground hover:!text-foreground">
                  Log in
                </Link>
              </div>
            </div>
          </TileBand>
        </main>
      </div>
    </MotionConfig>
  );
}
