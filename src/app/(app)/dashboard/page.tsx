'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { learnerSnapshot, useMe } from '@/lib/useMe';
import { useRanked } from '@/lib/useRanked';
import { Icon, type IconName } from '@/components/ui/icons';
import { BlurFade } from '@/components/ui/blur-fade';
import { NumberTicker } from '@/components/ui/number-ticker';
import { WordRotate } from '@/components/ui/word-rotate';
import { TilePanel } from '@/components/ui/tile';
import { Companion } from '@/components/companion';
import { RankStrip } from '@/components/rank/RankStrip';
import { companionFor, greetingFor, openers } from '@/lib/profile';
import PageSkeleton from '@/components/PageSkeleton';

/**
 * Today — the dashboard.
 *
 * **What changed, and why.** The page used to open with a near-black hero, then
 * eight paragraphs of explanation across four cards ("Work through today's queue.
 * The scheduler has already decided what is worth your time"), a second stats
 * card repeating numbers the strip above it already showed, and a sixth card of
 * achievements that the Rank page also lists. On a phone that was roughly four
 * screens of scrolling to reach two decisions.
 *
 * It is now one screen of decisions in the Duolingo order of operations:
 *
 *   1. **The hero** — the greeting, one rotating line of conversation, and the
 *      single green button that starts a session. On a phone it is the only
 *      thing above the fold, which is the point: there is one thing to do.
 *   2. **Four numbers** — due, done, streak, XP. Two columns on a phone so each
 *      is a comfortable tap-and-read block rather than a 60px sliver.
 *   3. **Rank** — the same near-black band the Rank page uses, because where you
 *      stand is the second half of the answer to "what now".
 *   4. **Four ways in** — one line each. The long copy is gone; a hint is four
 *      words, and the page that follows can explain itself.
 *
 * The tile rhythm still carries the structure (dark hero → light grid → dark
 * rank band → light grid), which is Uber's polarity flip doing the work that
 * borders and shadows are not allowed to do here.
 *
 * Data comes from `useMe()` and `useRanked()` — the same two cache entries the
 * shell and the Rank page read, so this page costs no extra requests.
 */

type Action = { href: string; icon: IconName; title: string; hint: string };

const ACTIONS: Action[] = [
  { href: '/cram', icon: 'cram', title: 'Cram', hint: 'Before an exam' },
  { href: '/learn', icon: 'learn', title: 'Notes', hint: 'The full topic' },
  { href: '/exam', icon: 'exam', title: 'Exam', hint: 'A marked paper' },
  { href: '/progress', icon: 'rank', title: 'Rank', hint: 'Ladder and lobby' },
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

  if (loading) return <PageSkeleton />;
  if (error || !me || !started) {
    return (
      <div className="card text-center">
        <Icon name="due" size={20} className="mx-auto text-destructive" />
        <p className="t-strong mt-2">We couldn’t load your dashboard.</p>
        <p className="t-caption mt-1 text-muted-foreground">Check your connection and try again.</p>
      </div>
    );
  }

  const { gamification: gam, today } = me;
  const accuracy = today.reviewed > 0 ? Math.round((today.correct / today.reviewed) * 100) : null;

  return (
    <div className="space-y-4">
      {/* ── 1. The hero: greeting, one line, one green button ─────────────── */}
      <TilePanel tone="dark" className="p-5 sm:p-7">
        <p className="t-eyebrow">{greetingFor(me.name)}</p>

        <div className="-my-1 mt-1">
          <WordRotate words={openers(started)} duration={4600} className="t-display" />
        </div>

        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
          {today.due > 0 ? (
            <Link href="/review" className="btn btn-good btn-lg gap-2.5">
              <Icon name="review" size={18} />
              Start review
              <span className="num rounded-full bg-black/20 px-2 py-0.5 text-[13px] font-bold">
                {today.due}
              </span>
            </Link>
          ) : (
            <Link href="/learn" className="btn btn-good btn-lg gap-2.5">
              <Icon name="learn" size={18} />
              Get ahead
            </Link>
          )}
          <Link href="/cram" className="btn btn-secondary btn-lg gap-2.5">
            <Icon name="cram" size={18} />
            Cram instead
          </Link>
        </div>

        {read && (
          <div className="mt-5 border-t border-border pt-4">
            <Companion snap={learnerSnapshot(me)} onTile compact />
          </div>
        )}
      </TilePanel>

      {/* ── 2. Four numbers ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon="review" label="Due" value={today.due} tone={today.due > 0 ? 'good' : undefined} />
        <Stat icon="reviewed" label="Done today" value={today.reviewed} />
        <Stat
          icon="streak"
          label="Streak"
          value={gam.streak}
          suffix={gam.streak === 1 ? ' day' : ' days'}
          tone={gam.streak > 0 ? 'streak' : undefined}
        />
        <Stat icon="xp" label="Total XP" value={gam.totalXp} />
      </div>

      {/* ── 3. Rank: the second dark band ────────────────────────────────── */}
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

      {/* ── 4. Four ways in ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ACTIONS.map((action, i) => (
          <BlurFade key={action.href} delay={i * 0.04}>
            <Link
              href={action.href}
              className="card flex h-full flex-col gap-2.5 p-4 transition-colors duration-150 active:bg-secondary hover:border-border-strong"
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-secondary">
                <Icon name={action.icon} size={18} />
              </span>
              <span>
                <span className="t-strong block">{action.title}</span>
                <span className="block text-[13px] text-muted-foreground">{action.hint}</span>
              </span>
            </Link>
          </BlurFade>
        ))}
      </div>

      {/* ── Subjects, and the two facts worth keeping from the old card ──── */}
      <BlurFade>
        <div className="card">
          <div className="flex items-center justify-between gap-3">
            <h2 className="t-strong">Your subjects</h2>
            <Link href="/library" className="text-[14px] font-medium underline underline-offset-4">
              Manage
            </Link>
          </div>

          {me.subjects.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {me.subjects.map((s) => (
                <span key={s.id} className="chip chip-soft">
                  {s.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[14px] text-muted-foreground">
              Pick a subject and your queue fills itself.{' '}
              <Link href="/library" className="text-foreground underline underline-offset-4">
                Add one
              </Link>
            </p>
          )}

          <dl className="mt-4 flex gap-6 border-t border-border pt-3">
            <div>
              <dt className="t-fine text-muted-foreground">Best streak</dt>
              <dd className="t-strong num mt-0.5">
                <NumberTicker value={gam.bestStreak} />
                <span className="text-muted-foreground">{gam.bestStreak === 1 ? ' day' : ' days'}</span>
              </dd>
            </div>
            <div>
              <dt className="t-fine text-muted-foreground">Accuracy today</dt>
              <dd className="t-strong num mt-0.5">
                {accuracy === null ? '—' : `${accuracy}%`}
              </dd>
            </div>
          </dl>
        </div>
      </BlurFade>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  suffix,
  tone,
}: {
  icon: IconName;
  label: string;
  value: number;
  suffix?: string;
  tone?: 'good' | 'streak';
}) {
  const tint =
    tone === 'good' ? 'text-good' : tone === 'streak' ? 'text-streak' : 'text-muted-foreground';

  return (
    <div className="card p-4">
      <div className={`flex items-center gap-1.5 ${tone ? tint : 'text-muted-foreground'}`}>
        <Icon name={icon} size={15} />
        <span className="t-fine">{label}</span>
      </div>
      <div className="t-num-sm mt-1.5">
        <NumberTicker value={value} className="num" />
        {suffix && <span className="text-[12px] font-normal text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}
