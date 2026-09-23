import Link from 'next/link';
import { Aurora } from '@/components/ui/aurora';
import { BlurIn } from '@/components/ui/blur-in';
import { GradientText } from '@/components/ui/gradient-text';
import { ThemeToggle } from '@/components/ui/theme-toggle';
// Landing — docs/DESIGN.md: full-bleed tile rhythm (white → near-black),
// Action Blue pill CTAs, Apple-tight display type, no decorative chrome.

const features = [
  {
    title: 'Daily SRS reviews',
    body: 'Cloze, flashcards and one-attempt MCQs scheduled by a science-backed algorithm so you review right before you forget.',
  },
  {
    title: 'Cram mode',
    body: 'Exam tomorrow? Pick topics, skim the notes, drill as many questions as you want — without disturbing your schedule.',
  },
  {
    title: 'Exam simulator',
    body: 'Past-paper style questions with mark-scheme marking, instant feedback and score tracking.',
  },
  {
    title: 'Leagues & streaks',
    body: 'XP, daily streaks and weekly leagues — opt out any time. Progress should feel good, not compulsory.',
  },
  {
    title: 'Classes',
    body: 'Teachers share a join code; your progress (only your progress) shows on their dashboard.',
  },
  {
    title: 'Bring your own',
    body: 'Import Anki/CSV/TSV decks, write your own notes and topics, publish for others after review.',
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      {/* global-nav equivalent: slim, black, quiet */}
      <nav className="sticky top-0 z-40 bg-nav/95 text-white backdrop-blur">
        <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-accent text-[11px] font-bold text-white">R</span>
            Revisio
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle className="!border-white/20 !bg-white/10 !text-white/80 hover:!text-white" />
            <Link href="/login" className="text-[13px] text-white/80 transition-colors hover:text-white">Sign in</Link>
            <Link href="/register" className="rounded-full bg-accent px-4 py-1.5 text-[13px] font-medium text-white transition-transform active:scale-95">
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* hero tile — light canvas with a whisper of aurora */}
      <section className="relative overflow-hidden bg-panel">
        <Aurora />
        <div className="relative mx-auto max-w-4xl px-6 pb-28 pt-32 text-center sm:pt-40">
          <BlurIn delay={0}>
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-accent">Spaced repetition, done properly</p>
          </BlurIn>
          <h1 className="display-tight mx-auto mt-5 max-w-3xl text-5xl leading-[1.07] sm:text-6xl">
            <BlurIn delay={0.08}>Learn it&nbsp;</BlurIn>
            <GradientText>once</GradientText>
            <BlurIn delay={0.16}>.</BlurIn>
            <br />
            <BlurIn delay={0.24}>Remember it for good.</BlurIn>
          </h1>
          <BlurIn delay={0.36} className="mx-auto mt-7 block max-w-2xl text-lg text-muted">
            A spaced-repetition platform for real curricula — notes tied to the spec, reviews scheduled
            at the perfect moment, and exams that feel like the real thing.
          </BlurIn>
          <div className="mt-10 flex items-center justify-center gap-4">

          </div>
        </div>
      </section>

      {/* dark product tile */}
      <section className="bg-[#272729] px-6 py-24 text-white">
        <div className="mx-auto max-w-3xl text-center">
          <BlurIn>
            <h2 className="display-tight text-4xl">The schedule knows.</h2>
          </BlurIn>
          <BlurIn delay={0.12}>
            <p className="mx-auto mt-4 max-w-xl text-[17px] leading-relaxed text-[#cccccc]">
              Every answer moves the next review closer to — or further from — the moment you'd forget.
              No lists. No folders. Just what you need, today.
            </p>
          </BlurIn>
          <div className="mx-auto mt-12 grid max-w-2xl grid-cols-3 gap-6 text-center">
            {[
              { k: 'SM-2 + FSRS', v: 'Two scheduling engines, dev-tunable' },
              { k: 'Server-graded', v: 'Answers never ship to the client' },
              { k: 'One attempt', v: 'MCQs that respect the mark scheme' },
            ].map((s, i) => (
              <BlurIn key={s.k} delay={0.1 + i * 0.08}>
                <div className="rounded-[18px] border border-white/10 p-5">
                  <div className="text-[13px] font-semibold text-[#2997ff]">{s.k}</div>
                  <p className="mt-1 text-[13px] text-[#cccccc]">{s.v}</p>
                </div>
              </BlurIn>
            ))}
          </div>
        </div>
      </section>

      {/* light utility tile: feature grid */}
      <section className="bg-panel px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <BlurIn>
            <h2 className="display-tight text-center text-4xl">Everything you need.<br className="sm:hidden" /> Nothing you don't.</h2>
          </BlurIn>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <BlurIn key={f.title} delay={0.06 * i}>
                <div className="h-full rounded-[18px] border border-edge bg-panel p-6 transition-transform active:scale-[0.98]">
                  <h3 className="text-[17px] font-semibold tracking-tight">{f.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted">{f.body}</p>
                  <span className="mt-4 inline-block text-[15px] text-accent">Learn more →</span>
                </div>
              </BlurIn>
            ))}
          </div>
        </div>
      </section>

      {/* closing dark tile */}
      <section className="bg-[#272729] px-6 py-28 text-center text-white">
        <BlurIn>
          <h2 className="display-tight text-4xl">Start remembering.</h2>
        </BlurIn>
        <BlurIn delay={0.12}>
          <p className="mt-4 text-[17px] text-[#cccccc]">Free for students. Teachers join with an invite.</p>
        </BlurIn>
        <BlurIn delay={0.2}>
          <Link href="/register" className="btn-primary mt-8 px-8 py-3 text-base">Create free account</Link>
        </BlurIn>
      </section>

      <footer className="bg-bg py-10 text-center text-[13px] text-muted">
        © {new Date().getFullYear()} Revisio — Learn it once.
      </footer>
    </main>
  );
}
