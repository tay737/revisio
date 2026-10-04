'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Icon } from '@/components/ui/icons';
import { Notice } from '@/components/Notice';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { InsightsBody, type StudentProgress } from '@/components/insights/InsightsBody';

/**
 * One learner, read as a whole — the sheet the teacher roster and the admin
 * users table open on a name click. All the chrome, none of the sections: the
 * body is the shared `InsightsBody`, the same renderer the learner's own
 * Strength tab uses, so a teacher and their student are always told the same
 * story about the same cards.
 */

export function StudentProgressPanel({
  userId,
  name,
  onClose,
}: {
  userId: string;
  name: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<StudentProgress | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setError('');
    setData(null);
    api
      .get<StudentProgress>(`/api/v1/teacher/student?userId=${encodeURIComponent(userId)}`)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Could not load progress.'));
    return () => {
      alive = false;
    };
  }, [userId]);

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto w-full max-w-[720px] overflow-y-auto"
      >
        <SheetTitle className="sr-only">Progress for {name}</SheetTitle>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-4">
          <div className="min-w-0">
            <h2 className="t-strong truncate">{name}</h2>
            {data && (
              <p className="t-caption mt-0.5 truncate text-muted-foreground">
                {data.subjects.length > 0
                  ? `${data.subjects.map((s) => s.name).join(' · ')}`
                  : 'No subjects studied yet'}
              </p>
            )}
          </div>
          {/* The sheet's own close control is switched off above: this labelled
              button *is* the affordance, and shipping both put two of them side
              by side in the top-right corner. */}
          <button type="button" className="btn btn-ghost shrink-0 gap-1.5" onClick={onClose}>
            <Icon name="close" size={14} />
            Close
          </button>
        </div>

        <Notice tone="bad" show={Boolean(error)}>{error}</Notice>

        {!data && !error && (
          <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Icon name="rotate" size={16} className="animate-spin" />
            <span className="t-caption">Loading progress…</span>
          </div>
        )}

        {data && <div className="pt-4"><InsightsBody data={data} /></div>}
      </SheetContent>
    </Sheet>
  );
}
