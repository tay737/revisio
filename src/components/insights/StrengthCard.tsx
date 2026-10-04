'use client';

import Link from 'next/link';
import { SRS_LADDER, type SrsTier } from '@/domain/srs';
import { cn } from '@/lib/utils';

/**
 * The strength ladder, BunPro-style: twelve rungs grouped into four tiers, one
 * column per rung sized by how many cards sit there. The dashboard renders it
 * straight off the `/me` payload, so the same numbers the review loop's verdict
 * uses are what the learner sees at a glance — no second source to disagree.
 *
 * Colour stays out of it: the four tiers are told apart by tints of the single
 * accent (docs/DESIGN.md allows one), denser as strength grows.
 */

const TIER_NAMES: Record<SrsTier, string> = {
  beginner: 'Beginner',
  adept: 'Adept',
  seasoned: 'Seasoned',
  mastered: 'Mastered',
};

/** Denser tint as the rungs climb — same hue, four steps. */
const TIER_FILL: Record<SrsTier, string> = {
  beginner: 'bg-primary/25',
  adept: 'bg-primary/45',
  seasoned: 'bg-primary/70',
  mastered: 'bg-primary',
};

function tierOf(level: number): SrsTier {
  if (level <= 3) return 'beginner';
  if (level <= 6) return 'adept';
  if (level <= 9) return 'seasoned';
  return 'mastered';
}

export function StrengthCard({
  levels,
  avgLevel,
  totalCards,
}: {
  levels: number[];
  avgLevel: number | null;
  totalCards: number;
}) {
  const max = Math.max(1, ...levels);
  const tiers = (['beginner', 'adept', 'seasoned', 'mastered'] as const).map((tier) => ({
    tier,
    rungs: SRS_LADDER.filter((r) => r.tier === tier),
    count: SRS_LADDER.filter((r) => r.tier === tier).reduce((a, r) => a + (levels[r.level - 1] ?? 0), 0),
  }));

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3">
        <h2 className="t-strong">Your strength</h2>
        <span className="num text-[13px] font-semibold text-muted-foreground">
          {totalCards === 0
            ? 'no cards yet'
            : `avg level ${avgLevel ?? '—'} of 12`}
        </span>
      </div>

      {totalCards === 0 ? (
        <p className="t-caption mt-2 text-muted-foreground">
          Answer a few questions and your cards will line up here by strength.
        </p>
      ) : (
        <>
          {/* Twelve columns in four tier groups; height carries the count. */}
          <div className="mt-4 flex items-end gap-1.5" aria-hidden>
            {tiers.map(({ tier, rungs }) => (
              <div key={tier} className="flex h-16 flex-1 items-end gap-1">
                {rungs.map((rung) => {
                  const count = levels[rung.level - 1] ?? 0;
                  return (
                    <span
                      key={rung.level}
                      className={cn('flex-1 rounded-t-sm transition-[height] duration-500', count === 0 ? 'bg-secondary' : TIER_FILL[tier])}
                      style={{ height: `${Math.max(4, (count / max) * 100)}%` }}
                      title={`${rung.label} · every ${rung.interval ?? 'review'} · ${count} card${count === 1 ? '' : 's'}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-1.5" aria-hidden>
            {tiers.map(({ tier }) => (
              <span key={tier} className="t-fine flex-1 text-center text-muted-foreground">
                {TIER_NAMES[tier]}
              </span>
            ))}
          </div>
          {/* The same counts as text, for screens the bars can't serve. */}
          <ul className="sr-only">
            {SRS_LADDER.map((rung) => (
              <li key={rung.level}>
                Level {rung.level}, {rung.label}: {levels[rung.level - 1] ?? 0} cards
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
        <p className="t-caption text-muted-foreground">
          What you keep missing, and every answer as it was graded.
        </p>
        <Link href="/progress" className="btn btn-ghost btn-sm shrink-0 gap-1.5">
          Insights
        </Link>
      </div>
    </div>
  );
}
