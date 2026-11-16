'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icons';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

type Challenge = {
  def: { id: string; period: 'daily' | 'weekly'; title: string; description: string; rewardXp: number };
  progress: number;
  target: number;
  completed: boolean;
  rewardXp: number;
};

/**
 * Today's challenges (#13) — the daily/weekly goals Backend's retention
 * service computes live. Read-only surface: progress, target and the XP
 * reward; completion itself (XP + notification) already happened server-side
 * the moment the metric crossed the line.
 *
 * Renders nothing until data arrives and nothing at all if the fetch fails —
 * a missing strip must never look like a broken dashboard.
 */
export function ChallengesCard() {
  const [challenges, setChallenges] = useState<Challenge[] | null>(null);

  useEffect(() => {
    let live = true;
    api.get<{ challenges: Challenge[] }>('/api/v1/challenges')
      .then((d) => { if (live) setChallenges(d.challenges); })
      .catch(() => { if (live) setChallenges([]); });
    return () => { live = false; };
  }, []);

  if (!challenges || challenges.length === 0) return null;

  const daily = challenges.filter((c) => c.def.period === 'daily');
  const weekly = challenges.filter((c) => c.def.period === 'weekly');
  const done = challenges.filter((c) => c.completed).length;

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="t-strong">Challenges</h2>
        <span className="t-fine text-muted-foreground">
          {done} of {challenges.length} done
        </span>
      </div>

      <div className="mt-4 space-y-4">
        {(['daily', 'weekly'] as const).map((period) => {
          const rows = period === 'daily' ? daily : weekly;
          if (rows.length === 0) return null;
          return (
            <div key={period}>
              <p className="t-fine mb-2 text-muted-foreground">{period === 'daily' ? 'Today' : 'This week'}</p>
              <ul className="space-y-2.5">
                {rows.map((c) => (
                  <li key={c.def.id} className="flex items-center gap-3">
                    <span
                      className={
                        c.completed
                          ? 'grid h-7 w-7 shrink-0 place-items-center rounded-full bg-good-soft text-good-strong'
                          : 'grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground'
                      }
                      aria-hidden="true"
                    >
                      <Icon name={c.completed ? 'correct' : 'target'} size={14} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={`t-caption-s truncate ${c.completed ? 'text-muted-foreground line-through' : ''}`}>
                          {c.def.title}
                        </span>
                        <span className="num t-fine shrink-0 text-muted-foreground">
                          {Math.min(c.progress, c.target)}/{c.target}
                        </span>
                      </div>
                      <Progress value={(c.progress / c.target) * 100} className="mt-1" />
                    </div>
                    {!c.completed && (
                      <Badge variant="chip" className="shrink-0">
                        +{c.rewardXp} XP
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <p className="t-fine mt-4 border-t border-border pt-3 text-muted-foreground">
        Finished challenges pay out XP and a note in your notifications.{' '}
        <Link href="/progress" className="text-foreground underline underline-offset-4">
          See progress
        </Link>
      </p>
    </Card>
  );
}
