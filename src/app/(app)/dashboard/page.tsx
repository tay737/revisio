'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useMe } from '@/lib/useMe';
import { Icon, achievementIcon, type IconName } from '@/components/ui/icons';
import { BlurFade } from '@/components/ui/motion/blur-fade';
import { GlassCard } from '@/components/ui/motion/glass-card';
import { NumberTicker } from '@/components/ui/motion/number-ticker';
import { WordRotate } from '@/components/ui/motion/word-rotate';
import { StaggerGroup, StaggerItem } from '@/components/ui/motion/stagger';
import { SPRING } from '@/lib/motion';
import { greetingFor, levelCaption, levelPercent, nudge, openers } from '@/lib/profile';
import PageSkeleton from '@/components/PageSkeleton';

/**
 * Today — the dashboard.
 *
 * The greeting is no longer a static "Hey {name} 👋". The page now reads the
 * learner's own numbers through `lib/profile` and speaks to them: a time-aware
 * greeting, a rotating line naming the next useful thing, and a nudge whose
 * wording changes with how much is left. Stats count up on arrival, and the
 * four action tiles are glass surfaces with a pointer-tracked highlight.
 *
 * Data comes from `useMe()` — the same SWR cache entry the shell uses, so this
 * page costs no extra request.
 */

type Tile = {
  href: string;
  icon: IconName;
  title: string;
  body: string;
};

const TILES: Tile[] = [
  {
    href: '/review',
    icon: 'review',
    title: 'Daily review',
    body: 'Work through today’s queue. The scheduler has already decided what is worth your time.',
  },
  {
    href: '/cram',
    icon: 'cram',
    title: 'Cram a topic',
    body: 'Notes and rapid questions before an exam. Your SRS schedule is left exactly as it was.',
  },
  {
    href: '/learn',
    icon: 'learn',
    title: 'Read the notes',
    body: 'Every topic, tied to the specification, in detailed or summary density.',
  },
  {
    href: '/exam',
    icon: 'exam',
    title: 'Sit a paper',
    body: 'Past-paper style questions marked against the mark scheme, with a per-question breakdown.',
  },
];

export default function DashboardPage() {
  const { me, error, loading } = useMe();

  const started = useMemo(() => {
    if (!me) return null;
    return { name: me.name, due: me.today.due, streak: me.gamification.streak, level: me.gamification.level, subjects: me.subjects.map((s) => s.name) };
  }, [me]);

  if (loading) return <PageSkeleton />;
  if (error || !me || !started) {
    return (
      <div className="card text-center">
        <Icon name="due" size={20} className="mx-auto text-bad" />
        <p className="t-strong mt-2">We couldn’t load your dashboard.</p>
        <p className="t-caption mt-1 text-muted">Check your connection and try again.</p>
      </div>
    );
  }

  const { gamification: gam, today } = me;

  return (
    <div className="space-y-6">
      {/* ── Hero: addressed to this learner, in their own numbers ────────── */}
      <GlassCard className="p-6 md:p-8">
        <BlurFade delay={0}>
          <p className="t-eyebrow">{greetingFor(me.name)}</p>
        </BlurFade>

        {/* The rotating line is the headline; the nudge below is the support.
            They are worded so they never say the same thing twice. */}
        <BlurFade delay={0.06} className="mt-3">
          <h2 className="display-tight t-display-md">
            <WordRotate words={openers(started)} interval={3800} />
          </h2>
        </BlurFade>

        <BlurFade delay={0.12}>
          <p className="t-body mt-3 max-w-2xl text-muted">{nudge({ ...today, streak: gam.streak })}</p>
        </BlurFade>

        <BlurFade delay={0.18}>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {today.due > 0 ? (
              <Link href="/review" className="btn-primary gap-2">
                <Icon name="review" size={18} />
                Start today’s review
              </Link>
            ) : (
              <Link href="/learn" className="btn-primary gap-2">
                <Icon name="learn" size={18} />
                Read ahead
              </Link>
            )}
            <Link href="/cram" className="btn-secondary gap-2">
              <Icon name="cram" size={18} />
              Cram instead
            </Link>
          </div>
        </BlurFade>
      </GlassCard>

      {/* ── Stats: each number counts up to where it actually is ─────────── */}
      <StaggerGroup className="grid grid-cols-2 gap-3 sm:grid-cols-4" stagger={0.06}>
        <StatTile icon="due" label="Due now" value={today.due} accent={today.due > 0} />
        <StatTile icon="reviewed" label="Reviewed today" value={today.reviewed} />
        <StatTile icon="streak" label="Streak" value={gam.streak} suffix="d" />
        <StatTile icon="level" label="Level" value={gam.level} />
      </StaggerGroup>

      {/* ── Level progress ─────────────────────────────────────────────── */}
      <StaggerGroup className="grid gap-3 sm:grid-cols-2" delayChildren={0.12}>
        <StaggerItem step="scale">
          <div className="card">
            <div className="flex items-baseline justify-between">
              <h2 className="t-strong">Level {gam.level}</h2>
              <span className="t-caption tabular-nums text-muted">
                {gam.intoLevel} / {gam.forNext} XP
              </span>
            </div>
            <div className="meter mt-2.5">
              <motion.div
                className="h-full rounded-full bg-accent"
                initial={{ width: 0 }}
                animate={{ width: `${levelPercent(gam)}%` }}
                transition={SPRING.meter}
              />
            </div>
            <p className="t-caption mt-2 text-muted">{levelCaption(gam)}</p>
          </div>
        </StaggerItem>

        <StaggerItem step="scale">
          <div className="card">
            <div className="flex items-baseline justify-between">
              <h2 className="t-strong">Your subjects</h2>
              <Link href="/library" className="t-caption text-accent hover:underline">
                Manage
              </Link>
            </div>
            {me.subjects.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {me.subjects.map((s) => (
                  <span key={s.id} className="chip">
                    <Icon name="topic" size={13} />
                    {s.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="t-caption mt-2 text-muted">
                No subjects yet. <Link href="/library" className="text-accent hover:underline">Pick a few</Link> and your queue will fill itself.
              </p>
            )}
          </div>
        </StaggerItem>
      </StaggerGroup>

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      <StaggerGroup className="grid gap-3 sm:grid-cols-2" delayChildren={0.02} inView>
        {TILES.map((tile) => (
          <StaggerItem key={tile.href} step="scale">
            <Link href={tile.href} className="group block h-full">
              <GlassCard tone="pane" spotlight className="h-full p-6 transition-colors duration-200 group-hover:border-accent/40">
                <div className="flex items-start gap-3.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
                    <Icon name={tile.icon} size={20} />
                  </span>
                  <div className="min-w-0">
                    <h3 className="t-strong flex items-center gap-1.5">
                      {tile.title}
                      <Icon
                        name="next"
                        size={15}
                        className="translate-x-[-2px] text-accent opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100"
                      />
                    </h3>
                    <p className="t-caption mt-1.5 text-muted">{tile.body}</p>
                  </div>
                </div>
              </GlassCard>
            </Link>
          </StaggerItem>
        ))}
      </StaggerGroup>

      {/* ── Achievements ─────────────────────────────────────────────────── */}
      {me.achievements.length > 0 && (
        <BlurFade inView>
          <section className="card">
            <div className="flex items-baseline justify-between">
              <h2 className="t-strong">Earned so far</h2>
              <Link href="/progress" className="t-caption text-accent hover:underline">
                All progress
              </Link>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {me.achievements.slice(0, 6).map((a) => (
                <span key={a.id} className="chip" title={a.description}>
                  <Icon name={achievementIcon(a.id, a.icon)} size={14} className="text-accent" />
                  {a.name}
                </span>
              ))}
            </div>
          </section>
        </BlurFade>
      )}
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  suffix,
  accent,
}: {
  icon: IconName;
  label: string;
  value: number;
  suffix?: string;
  accent?: boolean;
}) {
  return (
    <StaggerItem step="scale">
      <div className="card p-4">
        <div className="flex items-center gap-1.5 text-muted">
          <Icon name={icon} size={14} className={accent ? 'text-accent' : undefined} />
          <span className="t-caption">{label}</span>
        </div>
        <div className={`mt-1 text-[28px] font-normal leading-[1.14] ${accent ? 'text-accent' : ''}`}>
          <NumberTicker value={value} suffix={suffix} />
        </div>
      </div>
    </StaggerItem>
  );
}
