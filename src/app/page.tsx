import Link from 'next/link';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { BlurFade } from '@/components/ui/motion/blur-fade';
import { TextReveal } from '@/components/ui/motion/text-reveal';
import { TileBand } from '@/components/ui/tile';
import { RankCrest } from '@/components/ui/rank-crest';
import { Icon, type IconName } from '@/components/ui/icons';
import { rankFor, TIER_ORDER } from '@/domain/ranked';

/**
 * Landing page — docs/DESIGN.md read strictly.
 *
 * The page is the spec's own shape: a 44px black global nav, then edge-to-edge
 * tiles that alternate white → near-black → parchment → near-black → parchment
 * footer, stacked with no gap and no rule, because "the colour change itself is
 * the section divider".
 *
 * Two things changed in this pass:
 *   • The tiles are rendered through `ui/tile`, which also applies the
 *     `.on-tile` scope. That is why a dark band can be written with `text-ink`,
 *     `text-muted` and `text-accent` and still come out white, #cccccc and Sky
 *     Link Blue — no inline hex, and one owner of the treatment.
 *   • The hero now has a **product render**, which the spec's tiles all have.
 *     Ours is the rank crest: three rungs of the ladder, drawn with the same
 *     component the app uses, at the same geometry. It is the crispest way to
 *     say "this product has a ladder" without a screenshot.
 */

const features: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'review',
    title: 'Reviews that arrive on time',
    body: 'Cloze, flashcards and one-attempt MCQs, scheduled the day before you would have forgotten them.',
  },
  {
    icon: 'cram',
    title: 'Cram mode',
    body: 'Exam tomorrow? Read the notes, drill as many questions as you want, and leave your schedule untouched.',
  },
  {
    icon: 'exam',
    title: 'Exams that feel real',
    body: 'Past-paper questions marked against the mark scheme, with a per-question breakdown afterwards.',
  },
  {
    icon: 'rank',
    title: 'A rank that means something',
    body: 'Fifteen rungs of permanent rank points, and a weekly lobby where the top of the table moves up.',
  },
  {
    icon: 'class',
    title: 'Built for classes',
    body: 'A teacher shares a join code. Your progress stays yours; only what you agree to is visible.',
  },
  {
    icon: 'upload',
    title: 'Bring your own deck',
    body: 'Import Anki, CSV or TSV, write your own topics, and publish for review when you want to share.',
  },
];

const evidence = [
  { value: 'Two engines', label: 'SM-2 and FSRS, switchable by a developer mid-term.' },
  { value: 'Server-marked', label: 'Answers are graded on the server — never trusted to the client.' },
  { value: 'One attempt', label: 'Multiple choice that respects how the real thing works.' },
];

/** XP that lands squarely inside each tier, for the hero's product render. */
const XP_PER_TIER = [0, 620, 1_500, 3_600, 5_600];

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      {/* ── global-nav: 44px, true black, quiet 12px links ─────────────────── */}
      <nav className="sticky top-0 z-40 bg-nav text-white">
        <div className="mx-auto flex h-11 max-w-measure items-center justify-between px-6">
          <span className="flex items-center gap-2 text-[14px] font-semibold tracking-[-0.224px]">
            <span className="grid h-6 w-6 place-items-center rounded-[6px] bg-accent text-[11px] font-semibold text-white">
              R
            </span>
            Revisio
          </span>
          <div className="flex items-center gap-5">
            <Link href="#features" className="t-fine text-white/80 transition-colors hover:text-white">
              Features
            </Link>
            <Link href="#how" className="t-fine hidden text-white/80 transition-colors hover:text-white sm:block">
              How it works
            </Link>
            <ThemeToggle className="!h-8 !w-8 !border-white/20 !bg-white/10 !text-white/80 hover:!text-white" />
            <Link href="/login" className="t-fine text-white/80 transition-colors hover:text-white">
              Sign in
            </Link>
            <Link href="/register" className="btn-primary btn-sm gap-1.5">
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* ── tile 1: white canvas, centred stack, two pill CTAs ─────────────── */}
      <TileBand tone="light">
        <div className="text-center">
          <BlurFade>
            <p className="t-eyebrow">Spaced repetition, taken seriously</p>
          </BlurFade>

          <BlurFade delay={0.08} className="mt-4">
            <h1 className="display-tight t-display mx-auto max-w-3xl">
              Learn it once.
              <br />
              Keep it for the exam.
            </h1>
          </BlurFade>

          <BlurFade delay={0.16} className="mx-auto mt-6 max-w-xl">
            <p className="t-lead text-muted">
              A spaced-repetition platform built around a real specification — not a folder of flashcards.
            </p>
          </BlurFade>

          <BlurFade delay={0.24} className="mt-8">
            <div className="flex items-center justify-center gap-3">
              <Link href="/register" className="btn-primary gap-2">
                Create a free account
                <Icon name="next" size={17} />
              </Link>
              <Link href="/login" className="btn-secondary">
                Sign in
              </Link>
            </div>
          </BlurFade>
        </div>

        {/* The product render: the ladder, at three heights, in the same crest
            the app draws. No screenshot, no mockup chrome. */}
        <BlurFade delay={0.32} className="mt-16">
          <div className="mx-auto flex max-w-2xl items-end justify-center gap-6 sm:gap-14">
            {TIER_ORDER.map((tier, i) => {
              const rank = rankFor(XP_PER_TIER[i]);
              const muted = i < TIER_ORDER.length - 1;
              return (
                <div key={tier} className="flex flex-col items-center gap-3">
                  <RankCrest
                    rank={rank}
                    size={i === TIER_ORDER.length - 1 ? 104 : 68 + i * 6}
                    showProgress={false}
                    muted={muted}
                    animate={false}
                  />
                  <span className={muted ? 't-fine text-muted' : 't-fine text-accent'}>
                    {tier.charAt(0).toUpperCase() + tier.slice(1)}
                  </span>
                </div>
              );
            })}
          </div>
        </BlurFade>
      </TileBand>

      {/* ── tile 2: near-black, the schedule explains itself ───────────────── */}
      <TileBand tone="dark" id="how">
        <BlurFade>
          <h2 className="display-tight t-display text-center">The schedule knows.</h2>
        </BlurFade>
        <BlurFade delay={0.1}>
          <p className="t-body mx-auto mt-5 max-w-xl text-center text-muted">
            Every answer moves the next review closer to — or further from — the moment you would have forgotten it.
          </p>
        </BlurFade>

        <TextReveal
          text="No lists to maintain. No folders to file. No guessing about what to study tonight. You open the app, and the work that matters most is already waiting for you."
          className="t-body mx-auto mt-10 max-w-2xl"
        />

        <div className="mt-14 grid gap-6 sm:grid-cols-3">
          {evidence.map((item, i) => (
            <BlurFade key={item.value} delay={0.06 * i} inView>
              <div className="border-t border-white/15 pt-5">
                <div className="t-tagline text-accent">{item.value}</div>
                <p className="t-caption mt-2 text-muted">{item.label}</p>
              </div>
            </BlurFade>
          ))}
        </div>
      </TileBand>

      {/* ── tile 3: parchment, the feature grid ───────────────────────────── */}
      <TileBand tone="parchment" id="features">
        <BlurFade inView>
          <h2 className="display-tight t-display mx-auto max-w-2xl text-center">
            Everything you need. Nothing you don’t.
          </h2>
        </BlurFade>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <BlurFade key={f.title} delay={0.05 * i} inView>
              <div className="flex h-full flex-col rounded-[18px] border border-edge/80 bg-panel p-6">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-accent/10 text-accent">
                  <Icon name={f.icon} size={20} />
                </span>
                <h3 className="t-strong mt-4">{f.title}</h3>
                <p className="t-caption mt-2 text-muted">{f.body}</p>
              </div>
            </BlurFade>
          ))}
        </div>
      </TileBand>

      {/* ── tile 4: near-black closing CTA ────────────────────────────────── */}
      <TileBand tone="dark" className="text-center">
        <BlurFade inView>
          <h2 className="display-tight t-display">Start remembering.</h2>
        </BlurFade>
        <BlurFade delay={0.1} inView>
          <p className="t-body mx-auto mt-5 max-w-md text-muted">
            Free for students. Teachers join with a code from their school.
          </p>
        </BlurFade>
        <BlurFade delay={0.18} inView>
          <Link href="/register" className="btn-primary mt-9 px-8 py-3 text-[18px] font-light">
            Create your account
          </Link>
        </BlurFade>
      </TileBand>

      {/* ── footer: parchment, fine print ─────────────────────────────────── */}
      <footer className="bg-bg px-6 py-14">
        <div className="mx-auto flex max-w-measure flex-col items-center gap-2 text-center">
          <span className="flex items-center gap-2 text-[14px] font-semibold tracking-[-0.224px]">
            <span className="grid h-5 w-5 place-items-center rounded-[5px] bg-accent text-[10px] font-semibold text-white">
              R
            </span>
            Revisio
          </span>
          <p className="t-fine text-muted">
            © {new Date().getFullYear()} Revisio. Built for specifications, not for streaks.
          </p>
        </div>
      </footer>
    </main>
  );
}
