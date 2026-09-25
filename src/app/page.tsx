import Link from 'next/link';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { BlurFade } from '@/components/ui/blur-fade';
import { WordRotate } from '@/components/ui/word-rotate';
import { TileBand } from '@/components/ui/tile';
import { RankCrest } from '@/components/ui/rank-crest';
import { Icon, type IconName } from '@/components/ui/icons';
import { rankFor } from '@/domain/ranked';

/**
 * Landing — docs/DESIGN-UBER.md, read strictly.
 *
 * The page is the spec's own shape: a canvas nav bar, then edge-to-edge bands
 * alternating canvas → ink → canvas → canvas-soft → ink, stacked with no gap and
 * no rule, because the colour change is the divider. Exactly one shadow appears,
 * and it belongs to the product render in the hero — the same slot where Uber
 * puts its ride-request card.
 *
 * Three decisions worth naming:
 *
 *   • **A product render, not a screenshot description.** The hero carries the
 *     thing the product actually is: a real review card, laid out with the real
 *     component classes, at real proportions. Detail is the only honest proof
 *     that the app is finished, and it is the Uber convention for a hero.
 *   • **Short copy.** Every feature is a title and one line. The previous pass
 *     wrote two sentences per feature and explained the algorithm to a visitor
 *     who had not yet decided to care.
 *   • **The companion is on the page**, because "it feels like a study
 *     companion" is the differentiator and it cannot be claimed in a bullet
 *     point — it has to be shown speaking.
 */

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'review', title: 'A queue that builds itself', body: 'Due the day before you would forget.' },
  { icon: 'learn', title: 'Notes behind every card', body: 'Read the topic, not just the answer.' },
  { icon: 'exam', title: 'Papers that mark like real ones', body: 'Per-question feedback against the scheme.' },
];

/** Sample companion lines — the real voice, from `lib/profile`. */
const COMPANION_LINES = [
  'Nothing is due — you are ahead.',
  'Twelve cards waiting, and nothing in there you have not seen before.',
  'You had nine days going. Nothing is lost.',
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* ── Nav bar: canvas, hairline, pill CTAs ───────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 pt-safe backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-3 px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-foreground text-[13px] font-bold text-background">
              R
            </span>
            <span className="t-tagline">Revisio</span>
          </Link>

          <nav className="ml-6 hidden items-center gap-1 md:flex">
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

      <main>
        {/* ── Hero: canvas, headline left, product render right ───────────── */}
        <TileBand tone="light" className="!py-10 md:!py-20">
          <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
            <div>
              <BlurFade>
                <p className="t-eyebrow">Spaced repetition, properly</p>
              </BlurFade>

              <BlurFade delay={0.05}>
                <h1 className="t-hero mt-3 max-w-xl">Learn it once.</h1>
              </BlurFade>

              <BlurFade delay={0.1}>
                <p className="mt-4 max-w-lg text-[17px] leading-relaxed text-muted-foreground">
                  Revisio shows you the right card at the right moment, then gets out of the way.
                  Five minutes today beats five hours the night before.
                </p>
              </BlurFade>

              <BlurFade delay={0.15}>
                <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
                  <Link href="/register" className="btn btn-primary btn-lg gap-2">
                    Start free
                    <Icon name="next" size={17} />
                  </Link>
                  <Link href="/login" className="btn btn-secondary btn-lg">
                    I have an account
                  </Link>
                </div>
              </BlurFade>
            </div>

            {/* The product render. One shadow on the page, and it is this. */}
            <BlurFade delay={0.12}>
              <ReviewCardPreview />
            </BlurFade>
          </div>
        </TileBand>

        {/* ── Rank band: the polarity flip ─────────────────────────────────── */}
        <TileBand tone="dark" id="rank" className="!py-12 md:!py-20">
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
            <div>
              <p className="t-eyebrow">The ladder</p>
              <h2 className="t-display mt-3 max-w-md">A rank you can defend.</h2>
              <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-muted-foreground">
                Fifteen rungs, earned from everything you have ever reviewed — they never reset. Every
                week you are seated in a league of thirty, and the top of the table moves up.
              </p>

              <dl className="mt-7 grid grid-cols-3 gap-4 border-t border-border pt-5">
                <div>
                  <dt className="text-[12px] uppercase tracking-[0.08em] text-muted-foreground">Rungs</dt>
                  <dd className="t-num-sm mt-1">15</dd>
                </div>
                <div>
                  <dt className="text-[12px] uppercase tracking-[0.08em] text-muted-foreground">Lobby</dt>
                  <dd className="t-num-sm mt-1">30</dd>
                </div>
                <div>
                  <dt className="text-[12px] uppercase tracking-[0.08em] text-muted-foreground">Resets</dt>
                  <dd className="t-num-sm mt-1">Never</dd>
                </div>
              </dl>
            </div>

            {/* The ladder itself, drawn with the same component the app uses. */}
            <div className="flex items-end justify-between gap-2 sm:gap-4">
              {[0, 1600, 3600, 6400].map((base, i) => {
                const rung = rankFor(base);
                return (
                  <BlurFade key={base} delay={i * 0.07} className="flex-1">
                    <div
                      className={`flex flex-col items-center gap-2 rounded-lg border border-border px-2 py-4 ${
                        i === 1 ? 'bg-secondary' : ''
                      }`}
                    >
                      <RankCrest rank={rung} size={i === 3 ? 46 : 38} showProgress={false} muted={i > 1} animate={false} />
                      <span className={`text-[11px] font-bold uppercase tracking-[0.06em] ${i > 1 ? 'text-muted-foreground' : ''}`}>
                        {rung.tier}
                      </span>
                    </div>
                  </BlurFade>
                );
              })}
            </div>
          </div>
        </TileBand>

        {/* ── How it works ─────────────────────────────────────────────────── */}
        <TileBand tone="light" id="how" className="!py-12 md:!py-20">
          <BlurFade>
            <h2 className="t-display max-w-xl">Three ways in.</h2>
          </BlurFade>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {FEATURES.map((f, i) => (
              <BlurFade key={f.title} delay={i * 0.05}>
                <div className="h-full rounded-lg bg-secondary p-5">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-card">
                    <Icon name={f.icon} size={19} />
                  </span>
                  <h3 className="t-display-sm mt-4">{f.title}</h3>
                  <p className="mt-1.5 text-[15px] text-muted-foreground">{f.body}</p>
                </div>
              </BlurFade>
            ))}
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

            <div className="card flex items-start gap-4 p-5">
              <RankCrest rank={rankFor(1600)} size={44} showProgress={false} animate={false} />
              <div className="min-w-0">
                <WordRotate words={COMPANION_LINES} duration={5000} className="text-[17px] font-medium leading-snug" />
                <p className="mt-2 text-[13px] text-muted-foreground">— on a Tuesday, mid-streak</p>
              </div>
            </div>
          </div>
        </TileBand>

        {/* ── Footer: the ink band ─────────────────────────────────────────── */}
        <TileBand tone="dark" className="!py-10 md:!py-14">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <span className="t-tagline">Revisio</span>
              <p className="mt-1.5 max-w-sm text-[14px] text-muted-foreground">
                Built for students who actually have exams.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/register" className="btn btn-primary">
                Start free
              </Link>
              <Link href="/login" className="btn btn-ghost !text-muted-foreground hover:!text-foreground">
                Log in
              </Link>
            </div>
          </div>
        </TileBand>
      </main>
    </div>
  );
}

/**
 * The hero's product render.
 *
 * It is the review screen in miniature — the kind chip, the cloze sentence with a
 * real blank, the answer field and the green check — using the same classes the
 * real card uses. Nothing here is a screenshot, so nothing here can go out of
 * date, and it is honest about what the product looks like on a phone.
 */
function ReviewCardPreview() {
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="card !p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between gap-3">
          <span className="badge badge-quiet">
            <Icon name="notes" size={13} />
            Fill the blank
          </span>
          <span className="text-[12px] text-muted-foreground">Biology · Enzymes</span>
        </div>

        <p className="mt-4 text-[19px] font-bold leading-snug">
          An enzyme lowers the activation energy by binding to its{' '}
          <span className="mx-1 inline-block min-w-[5.5rem] border-b-2 border-border-strong" />
          .
        </p>

        <div className="mt-4 flex min-h-[46px] items-center rounded-sm border-2 border-border px-3.5 text-[15px] text-muted-foreground">
          substrate
        </div>

        <button type="button" className="btn btn-good mt-3 w-full" aria-hidden tabIndex={-1}>
          Check
        </button>

        <div className="mt-3 flex items-center justify-between text-[12px] text-muted-foreground">
          <span className="num">3 / 20</span>
          <span className="badge badge-gold">+12 XP</span>
        </div>
      </div>

      <p className="mt-3 text-center text-[12px] text-muted-foreground">
        The daily queue, on a phone.
      </p>
    </div>
  );
}
