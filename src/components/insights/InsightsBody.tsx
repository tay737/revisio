'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { Icon } from '@/components/ui/icons';
import { SRS_LADDER, type SrsTier } from '@/domain/srs';
import { SPRING } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * One learner's progress, rendered — the single body both the staff sheet
 * (teacher roster, admin users) and the learner's own Strength tab use, so the
 * two can never disagree about what the data says. `self` only swaps the voice
 * ("you" vs "the learner"); the numbers are identical by construction, because
 * both containers read the same `buildInsights` service.
 */

export type StudentProgress = {
  student: { id: string; name: string; email: string; createdAt: string } | null;
  overview: {
    totalReviews: number;
    totalCards: number;
    correctPct: number | null;
    monthCorrectPct: number | null;
    monthReviews: number;
    xp: number;
    streak: number;
    bestStreak: number;
    dueCount: number;
  };
  srsLevels: { level: number; count: number }[];
  distribution: {
    cardId: string;
    kind: string;
    prompt: string | null;
    topicId: string;
    topicName: string;
    subjectName: string;
    stage: string;
    srsLevel: number;
    srsLabel: string;
    dueAt: string | null;
    lapses: number;
    reps: number;
    lastReviewedAt: string | null;
  }[];
  struggling: { topicId: string; topicName: string; subjectName: string; misses: number; lastMissedAt: string | null }[];
  topicHealth: { topicId: string; topicName: string; subjectName: string; states: number; mastered: number; lapses: number; masteryPct: number; missCount: number }[];
  recent: {
    id: string;
    cardId: string;
    mode: string;
    rating: string;
    correct: boolean | null;
    userAnswer: string | null;
    prompt: string | null;
    cardKind: string;
    topicName: string;
    subjectName: string;
    xpAwarded: number;
    durationMs: number;
    reviewedAt: string;
  }[];
  upcoming: { cardId: string; prompt: string | null; cardKind: string; topicName: string; srsLevel: number; srsLabel: string; dueAt: string }[];
  subjects: { id: string; name: string }[];
};

const TIER_BAND: Record<SrsTier, string> = {
  // Ink variants on the soft washes: the 12px numerals need 4.5:1 against the
  // tint they sit on, which the base state colours missed (axe, light mode).
  beginner: 'bg-destructive/15 text-destructive-ink',
  adept: 'bg-gold/25 text-foreground',
  seasoned: 'bg-primary/15 text-primary',
  mastered: 'bg-good-soft text-good-strong',
};

function tierOf(level: number): SrsTier {
  if (level <= 3) return 'beginner';
  if (level <= 6) return 'adept';
  if (level <= 9) return 'seasoned';
  return 'mastered';
}

export function when(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const mins = Math.round(Math.abs(diff) / 60_000);
  const label =
    mins < 1 ? 'now' :
    mins < 60 ? `${mins}m` :
    mins < 60 * 24 ? `${Math.round(mins / 60)}h` :
    mins < 60 * 24 * 30 ? `${Math.round(mins / (60 * 24))}d` :
    `${Math.round(mins / (60 * 24 * 30))}mo`;
  return diff < 0 ? `in ${label}` : `${label} ago`;
}

export function InsightsBody({ data, self = false }: { data: StudentProgress; self?: boolean }) {
  const [showAllCards, setShowAllCards] = useState(false);
  const maxCount = Math.max(1, ...data.srsLevels.map((s) => s.count));
  const cards = showAllCards ? data.distribution : data.distribution.slice(0, 8);
  const who = self ? 'you' : 'the learner';

  return (
    <div className="space-y-6">
      {/* ── Overview strip ───────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <OverviewStat label="Reviews" value={data.overview.totalReviews} note={`${data.overview.monthReviews} in 30d`} />
        <OverviewStat
          label="Accuracy"
          value={data.overview.correctPct === null ? '—' : `${data.overview.correctPct}%`}
          note={data.overview.monthCorrectPct === null ? 'no answers yet' : `${data.overview.monthCorrectPct}% in 30d`}
          alarm={data.overview.correctPct !== null && data.overview.correctPct < 60}
        />
        <OverviewStat label="Streak" value={`${data.overview.streak}d`} note={`best ${data.overview.bestStreak}d`} />
        <OverviewStat label="Due now" value={data.overview.dueCount} note={`${data.overview.totalCards} cards`} alarm={data.overview.dueCount > 0} />
      </section>

      {/* ── SRS strength ladder ──────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between gap-3">
          <h3 className="t-tagline">SRS strength</h3>
          <span className="t-fine text-muted-foreground">levels 1–12</span>
        </div>
        <p className="t-caption mt-1 text-muted-foreground">
          Every card {who === 'you' ? "you've" : 'the learner has'} touched, by strength. Higher rungs mean longer intervals.
        </p>
        <ol className="mt-3 space-y-1.5">
          {SRS_LADDER.map((rung) => {
            const count = data.srsLevels.find((s) => s.level === rung.level)?.count ?? 0;
            return (
              <li key={rung.level} className="flex items-center gap-2.5">
                <span className={cn('num w-6 text-right text-[12px] font-bold', count === 0 && 'text-muted-foreground/50')}>
                  {rung.level}
                </span>
                <span className="num w-24 shrink-0 text-[12px] text-muted-foreground">
                  {rung.label}
                  <span className="ml-1 hidden opacity-70 sm:inline">· {rung.interval ?? 'done'}</span>
                </span>
                <span className="meter h-2 flex-1" title={`${count} card${count === 1 ? '' : 's'}`}>
                  <motion.span
                    className={cn('meter-fill block', count === 0 && 'opacity-30')}
                    initial={{ width: 0 }}
                    animate={{ width: `${(count / maxCount) * 100}%` }}
                    transition={SPRING.meter}
                  />
                </span>
                <span className={cn('num w-8 text-right text-[12px]', count === 0 ? 'text-muted-foreground/50' : 'font-semibold')}>
                  {count}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ── Struggling ───────────────────────────────────────────────────── */}
      <section>
        <h3 className="t-tagline">Struggling with</h3>
        {data.struggling.length === 0 ? (
          <p className="t-caption mt-2 text-muted-foreground">
            No misses in the last 30 days — or nothing studied yet.
          </p>
        ) : (
          <>
            <ul className="mt-2 space-y-1.5">
              {data.struggling.map((s) => (
                <li key={s.topicId}>
                  <div className="inset flex items-center gap-3 px-3 py-2.5">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive-ink">
                      <Icon name="due" size={14} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-semibold">{s.topicName}</div>
                      <div className="t-fine truncate text-muted-foreground">
                        {s.subjectName} · last miss {when(s.lastMissedAt)}
                      </div>
                    </div>
                    <span className="chip border-destructive/40 text-destructive-ink num shrink-0">
                      {s.misses} miss{s.misses === 1 ? '' : 'es'}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <TopicHealthTable topics={data.topicHealth} />
          </>
        )}
      </section>

      {/* ── Recent answers ───────────────────────────────────────────────── */}
      <section>
        <h3 className="t-tagline">Recent answers</h3>
        <p className="t-caption mt-1 text-muted-foreground">
          The last twenty reviews exactly as they were graded.
        </p>
        {data.recent.length === 0 ? (
          <p className="t-caption mt-2 text-muted-foreground">Nothing answered yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border/60">
            {data.recent.map((r) => (
              <li key={r.id} className="py-2.5">
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      'grid h-6 w-6 shrink-0 place-items-center rounded-full',
                      r.correct === null ? 'bg-secondary text-muted-foreground' : r.correct ? 'bg-good-soft text-good-strong' : 'bg-destructive/10 text-destructive-ink',
                    )}
                  >
                    <Icon name={r.correct === null ? 'clock' : r.correct ? 'correct' : 'close'} size={13} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">
                      {r.prompt ?? '(no text)'}
                    </div>
                    <div className="t-fine truncate text-muted-foreground">
                      {r.topicName} · {when(r.reviewedAt)} · {r.mode}
                    </div>
                  </div>
                  {r.userAnswer !== null && r.userAnswer !== '' && (
                    <code className="max-w-[40%] shrink-0 truncate rounded bg-secondary px-1.5 py-0.5 text-[11px]" title={`${self ? 'Your' : 'Their'} answer: ${r.userAnswer}`}>
                      {r.userAnswer}
                    </code>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Card-level strength + upcoming ───────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between gap-3">
          <h3 className="t-tagline">Card strengths</h3>
          {data.distribution.length > 8 && (
            <button type="button" className="btn btn-ghost btn-sm gap-1.5" onClick={() => setShowAllCards((v) => !v)}>
              <Icon name={showAllCards ? 'collapse' : 'expand'} size={13} />
              {showAllCards ? 'Show less' : `Show all ${data.distribution.length}`}
            </button>
          )}
        </div>
        {cards.length === 0 ? (
          <p className="t-caption mt-2 text-muted-foreground">No cards in rotation yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border/60">
            {cards.map((c) => (
              <li key={c.cardId} className="flex items-center gap-3 py-2.5">
                <span className={cn('num grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-bold', TIER_BAND[tierOf(c.srsLevel)])}>
                  {c.srsLevel}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">{c.prompt ?? '(no text)'}</div>
                  <div className="t-fine truncate text-muted-foreground">
                    {c.topicName} · {c.srsLabel}
                    {c.lapses > 0 && <span className="text-destructive-ink"> · {c.lapses} lapse{c.lapses === 1 ? '' : 's'}</span>}
                  </div>
                </div>
                <span className="t-fine num shrink-0 text-muted-foreground">
                  {c.dueAt && new Date(c.dueAt).getTime() <= Date.now() ? 'due now' : when(c.dueAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {data.upcoming.length > 0 && (
          <div className="inset mt-3 px-3 py-2.5">
            <span className="t-eyebrow">Coming up next</span>
            <p className="t-caption mt-1 text-muted-foreground">
              {data.upcoming
                .slice(0, 3)
                .map((u) => `“${(u.prompt ?? 'card').slice(0, 40)}${(u.prompt ?? '').length > 40 ? '…' : ''}” (${when(u.dueAt)})`)
                .join(' · ')}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function OverviewStat({ label, value, note, alarm }: { label: string; value: string | number; note?: string; alarm?: boolean }) {
  return (
    <div className={cn('inset px-3 py-2.5', alarm && 'border-destructive/40')}>
      <div className="t-eyebrow">{label}</div>
      <div className={cn('num mt-0.5 text-[20px] font-bold leading-none', alarm && 'text-destructive-ink')}>{value}</div>
      {note && <div className="t-fine mt-1 text-muted-foreground">{note}</div>}
    </div>
  );
}

/** Per-topic roll-up under the struggling list — mastery bars, lapses, misses. */
function TopicHealthTable({ topics }: { topics: StudentProgress['topicHealth'] }) {
  if (topics.length === 0) return null;
  return (
    <div className="mt-3">
      <span className="t-eyebrow">Topic health</span>
      <ul className="mt-2 space-y-2">
        {topics.map((t) => (
          <li key={t.topicId} className="flex items-center gap-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[13px] font-medium">{t.topicName}</span>
                <span className="num shrink-0 text-[12px] text-muted-foreground">
                  {t.masteryPct}% mastered{t.missCount > 0 && <span className="text-destructive-ink"> · {t.missCount} miss{t.missCount === 1 ? '' : 'es'}</span>}
                </span>
              </div>
              <span className="meter mt-1 block h-1.5">
                <motion.span
                  className="meter-fill block"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(0, Math.min(100, t.masteryPct))}%` }}
                  transition={SPRING.meter}
                />
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
