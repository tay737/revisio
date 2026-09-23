import Link from 'next/link';

const features = [
  { icon: '🔁', title: 'Daily SRS reviews', body: 'Cloze, flashcards and one-attempt MCQs scheduled by a science-backed algorithm so you review right before you forget.' },
  { icon: '⏱️', title: 'Cram mode', body: 'Exam tomorrow? Pick topics, skim the notes, drill as many questions as you want — without disturbing your schedule.' },
  { icon: '📄', title: 'Exam simulator', body: 'Past-paper style questions with mark-scheme marking, instant feedback and score tracking.' },
  { icon: '🏆', title: 'Leagues & streaks', body: 'XP, daily streaks and weekly leagues — opt out any time. Progress should feel good, not compulsory.' },
  { icon: '👥', title: 'Classes', body: 'Teachers share a join code; your progress (only your progress) shows on their dashboard.' },
  { icon: '📦', title: 'Bring your own', body: 'Import Anki/CSV/TSV decks, write your own notes and topics, publish for others after review.' },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-ink">R</span>
          Revisio
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="btn-ghost">Sign in</Link>
          <Link href="/register" className="btn-primary">Get started</Link>
        </div>
      </nav>

      <section className="mx-auto max-w-6xl px-6 pb-20 pt-16 text-center">
        <h1 className="mx-auto max-w-3xl text-5xl font-extrabold leading-tight tracking-tight sm:text-6xl">
          Learn it <span className="text-accent">once</span>.
          <br />Remember it for good.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted">
          A spaced-repetition platform for real curricula — notes tied to the spec, reviews scheduled
          at the perfect moment, and exams that feel like the real thing.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href="/register" className="btn-primary px-6 py-3 text-base">Create free account</Link>
          <Link href="/login" className="btn-ghost px-6 py-3 text-base">I have an account</Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 pb-24 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="card">
            <div className="text-2xl">{f.icon}</div>
            <h3 className="mt-3 font-semibold">{f.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.body}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-edge py-8 text-center text-sm text-muted">
        © {new Date().getFullYear()} Revisio — Learn it once.
      </footer>
    </main>
  );
}
