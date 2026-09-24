import Link from 'next/link';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { BlurFade } from '@/components/ui/motion/blur-fade';
import { TextReveal } from '@/components/ui/motion/text-reveal';
import { Icon, type IconName } from '@/components/ui/icons';

/**
 * Landing page — docs/DESIGN.md read strictly.
 *
 * What changed, and why:
 *   • The blurred accent "aurora" and the gradient-sweep headline are gone. The
 *     spec bans decorative gradients outright; atmosphere is supposed to come
 *     from surface alternation, not from colour washes.
 *   • Sections are now the spec's full-bleed tiles: white → near-black → white
 *     → near-black → parchment footer, stacked edge-to-edge with **no gap and
 *     no border**. The colour change *is* the divider.
 *   • The global nav is 44px of true black with 12px nav-link type, as documented.
 *   • The tile headline is 40px/600 display type with negative tracking; body
 *     copy is 17px/400, not 16px. Weight 500 appears nowhere.
 *   • Feature glyphs come from the icon registry, so they inherit the single
 *     Action Blue rather than dragging in emoji colour.
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
    icon: 'league',
    title: 'Progress you can feel',
    body: 'Levels, streaks and weekly leagues. All of it optional — opt out any time and nothing is lost.',
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

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      {/* ── global-nav: 44px, true black, quiet 12px links ─────────────────── */}
      <nav className="sticky top-0 z-40 bg-nav text-white">
        <div className="mx-auto flex h-11 max-w-[980px] items-center justify-between px-6">
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
      <section className="bg-panel px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-[980px] text-center">
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

          <BlurFade delay={0.16} className="mx-auto mt-6 max-w-2xl">
            <p className="t-lead mx-auto max-w-xl text-muted">
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
      </section>

      {/* ── tile 2: near-black, the schedule explains itself ───────────────── */}
      <section id="how" className="bg-[#272729] px-6 py-20 text-white sm:py-28">
        <div className="mx-auto max-w-[980px]">
          <BlurFade>
            <h2 className="display-tight t-display text-center">The schedule knows.</h2>
          </BlurFade>
          <BlurFade delay={0.1}>
            <p className="t-body mx-auto mt-5 max-w-xl text-center text-[#cccccc]">
              Every answer moves the next review closer to — or further from — the moment you would have forgotten it.
            </p>
          </BlurFade>

          <TextReveal
            text="No lists to maintain. No folders to file. No guessing about what to study tonight. You open the app, and the work that matters most is already waiting for you."
            className="t-body mx-auto mt-10 max-w-2xl text-white"
          />

          <div className="mt-14 grid gap-6 sm:grid-cols-3">
            {evidence.map((item, i) => (
              <BlurFade key={item.value} delay={0.06 * i} inView>
                <div className="border-t border-white/15 pt-5">
                  <div className="t-tagline text-[#2997ff]">{item.value}</div>
                  <p className="t-caption mt-2 text-[#cccccc]">{item.label}</p>
                </div>
              </BlurFade>
            ))}
          </div>
        </div>
      </section>

      {/* ── tile 3: parchment, the feature grid ───────────────────────────── */}
      <section id="features" className="bg-bg px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-[980px]">
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
        </div>
      </section>

      {/* ── tile 4: near-black closing CTA ────────────────────────────────── */}
      <section className="bg-[#272729] px-6 py-24 text-center text-white">
        <BlurFade inView>
          <h2 className="display-tight t-display">Start remembering.</h2>
        </BlurFade>
        <BlurFade delay={0.1} inView>
          <p className="t-body mx-auto mt-5 max-w-md text-[#cccccc]">
            Free for students. Teachers join with a code from their school.
          </p>
        </BlurFade>
        <BlurFade delay={0.18} inView>
          <Link href="/register" className="btn-primary mt-9 px-8 py-3 text-[18px] font-light">
            Create your account
          </Link>
        </BlurFade>
      </section>

      {/* ── footer: parchment, fine print ─────────────────────────────────── */}
      <footer className="bg-bg px-6 py-14">
        <div className="mx-auto flex max-w-[980px] flex-col items-center gap-2 text-center">
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
