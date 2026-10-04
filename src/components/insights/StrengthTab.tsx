'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Icon } from '@/components/ui/icons';
import { Notice } from '@/components/Notice';
import { InsightsBody, type StudentProgress } from '@/components/insights/InsightsBody';

/**
 * The learner's own insights, as a tab on the Rank page: the same sections the
 * staff sheet shows a teacher, pointed at yourself. Fetched when the tab is
 * open — the rank ladder next to it costs nothing extra on a casual visit.
 */
export function StrengthTab() {
  const [data, setData] = useState<StudentProgress | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api
      .get<StudentProgress>('/api/v1/insights')
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'We could not load your insights.'));
    return () => {
      alive = false;
    };
  }, []);

  if (error) return <Notice tone="bad">{error}</Notice>;
  if (!data) {
    return (
      <div className="card flex items-center justify-center gap-2 py-12 text-muted-foreground">
        <Icon name="rotate" size={16} className="animate-spin" />
        <span className="t-caption">Loading your insights…</span>
      </div>
    );
  }
  return <InsightsBody data={data} self />;
}
