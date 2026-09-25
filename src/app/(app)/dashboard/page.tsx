'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { learnerSnapshot, useMe } from '@/lib/useMe';
import { useRanked } from '@/lib/useRanked';
import { Icon, achievementIcon, type IconName } from '@/components/ui/icons';
import { BlurFade } from '@/components/ui/motion/blur-fade';
import { GlassCard } from '@/components/ui/motion/glass-card';
import { NumberTicker } from '@/components/ui/motion/number-ticker';
import { WordRotate } from '@/components/ui/motion/word-rotate';
import { StaggerGroup, StaggerItem } from '@/components/ui/motion/stagger';
import { TilePanel } from '@/components/ui/tile';
import { Companion } from '@/components/companion';
import { RankStrip } from '@/components/rank/RankStrip';
import { companionFor, greetingFor, openers } from '@/lib/profile';
import PageSkeleton from '@/components/PageSkeleton';

/**
 * Today — the dashboard.
 *
 * The page is laid out as the spec's **tile rhythm**: a near-black hero tile,
 * light content, a second near-black panel carrying your rank, then light
 * content again. The alternation is the page's structure, not decoration, and
 * it is what makes the two things that matter (what to do now, and where you
 * stand) read as the two halves of the screen.
 *
 * The companion appears a second time here, and only when it has something
 * genuinely first-run to say — a brand new account or one coming back after a
 * real gap. The rest of the time its line lives in the header, because a
 * presence that repeats itself in three places is not a companion, it is noise.
 *
 * Data comes from `useMe()` and `useRanked()` — the same two cache entries the
 * shell and the Rank page use, so this page costs no extra requests.
 */

type Tile = { href: string; icon: IconName; title: string; body: string };

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
  const { ranked } = useRanked('weekly');

  const started = useMemo(() => {
    if (!me) return null;
    return {
      due: me.today.due,
      streak: me.gamification.streak,
      level: me.gamification.level,
      subjects: me.subjects.map((s) => s.name),
    };
  }, [me]);

  const read = useMemo(() => (me ? companionFor(learnerSnapshot(me)) : null), [me]);
  const showCompanion = read?.tone === 'welcome' || read?.tone === 'returning';

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
    <div className="space-y-5">
      {/* ── Hero: a near-black tile. The spec's section divider, used to make
             the top of the screen unmistakably the headline. ─────────────── */}
      <TilePanel tone="dark" className="p-6 md:p-9">
        <BlurFade delay={0}>
          <p className="t-eyebrow !text-white/55">{greetingFor(me.name)}</p>
        </BlurFade>

        <BlurFade delay={0.06} className="mt-3">
          <h2 className="display-tight t-display">
            <WordRotate words={openers(started)} interval={4200} />
          </h2>
        </BlurFade>

        {/* The companion gets a body here only when it has something first-run
            to say. Otherwise its line is in the header and this stays clean. */}
        {showCompanion && read && (
          <div className="mt-5 rounded-[18px] border border-white/12 bg-white/5 p-4">
            <Companion snap={learnerSnapshot(me)} onTile compact />
          </div>
        )}

        <BlurFade delay={0.12}>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {today.due > 0 ? (
              <Link href="/review" className="btn-primary gap-2">
                <Icon name="review" size={18} />
                Start today’s review
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[12px] tabular-nums">{today.due}</span>
              </Link>
            ) : (
              <Link href="/learn" className="btn-primary gap-2">
                <Icon name="learn" size={18} />
                Read ahead
              </Link>
            )}
            <Link
              href="/cram"
              className="btn inline-flex gap-2 border border-white/25 text-white transition-colors duration-200 hover:bg-white/10"
            >
              <Icon name="cram" size={18} />
              Cram instead
            </Link>
          </div>
        </BlurFade>
      </TilePanel>

      {/* ── Numbers ──────────────────────────────────────────────────────── */}
      <StaggerGroup className="grid grid-cols-2 gap-3 sm:grid-cols-4" stagger={0.05}>
        <StatTile icon="due" label="Due now" value={today.due} accent={today.due > 0} />
        <StatTile icon="reviewed" label="Reviewed today" value={today.reviewed} />
        <StatTile icon="streak" label="Streak" value={gam.streak} suffix="d" />
        <StatTile icon="xp" label="Total XP" value={gam.totalXp} />
      </StaggerGroup>

      {/* ── Rank: the second dark tile. Light → dark → light is the rhythm. ── */}
      {ranked && (
        <BlurFade>
          <RankStrip
            rank={ranked.ranked.rank}
            lobby={ranked.ranked.lobby}
            week={ranked.ranked.week}
            placement={ranked.ranked.placement}
            xpThisWeek={ranked.ranked.xpThisWeek}
          />
        </BlurFade>
      )}

      {/* ── Subjects and the long view ───────────────────────────────────── */}
      <StaggerGroup className="grid gap-3 sm:grid-cols-2" delayChildren={0.06} inView>
        <StaggerItem step="scale">
          <GlassCard className="h-full p-5">
            <div className="flex items-baseline justify-between gap-2">
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
                No subjects yet.{' '}
                <Link href="/library" className="text-accent hover:underline">
                  Pick a few
                </Link>{' '}
                and your queue will fill itself.
              </p>
            )}
          </GlassCard>
        </StaggerItem>

        <StaggerItem step="scale">
          <GlassCard className="h-full p-5">
            <h2 className="t-strong">Since you started</h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
              <div>
                <dt className="t-fine text-muted">Best streak</dt>
                <dd className="t-num-sm mt-0.5">
                  <NumberTicker value={gam.bestStreak} />
                  <span className="t-caption text-muted">{gam.bestStreak === 1 ? '\u00A0day' : '\u00A0days'}</span>
                </dd>
              </div>
              <div>
                <dt className="t-fine text-muted">Rank points</dt>
                <dd className="t-num-sm mt-0.5">
                  <NumberTicker value={ranked?.ranked.rank.points ?? gam.totalXp} />
                </dd>
              </div>
              <div>
                <dt className="t-fine text-muted">Level</dt>
                <dd className="t-num-sm mt-0.5">{gam.level}</dd>
              </div>
              <div>
                <dt className="t-fine text-muted">Accuracy today</dt>
                <dd className="t-num-sm mt-0.5">
                  {today.reviewed > 0 ? `${Math.round((today.correct / today.reviewed) * 100)}%` : '—'}
                </dd>
              </div>
            </dl>
          </GlassCard>
        </StaggerItem>
      </StaggerGroup>

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      <StaggerGroup className="grid gap-3 sm:grid-cols-2" delayChildren={0.02} inView>
        {TILES.map((tile) => (
          <StaggerItem key={tile.href} step="scale">
            <Link href={tile.href} className="group block h-full">
              <GlassCard
                tone="pane"
                spotlight
                className="h-full p-5 transition-colors duration-200 group-hover:border-accent/40"
              >
                <div className="flex items-start gap-3.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent/10 text-accent transition-transform duration-200 group-hover:scale-105">
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
          <GlassCard className="p-5">
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
          </GlassCard>
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
      <GlassCard className="p-4">
        <div className="flex items-center gap-1.5 text-muted">
          <Icon name={icon} size={14} className={accent ? 'text-accent' : undefined} />
          <span className="t-caption">{label}</span>
        </div>
        <div className={accent ? 't-num-sm mt-1 text-accent' : 't-num-sm mt-1'}>
          <NumberTicker value={value} suffix={suffix} />
        </div>
      </GlassCard>
    </StaggerItem>
  );
}
