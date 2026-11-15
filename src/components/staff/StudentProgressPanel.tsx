'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Icon } from '@/components/ui/icons';
import { Notice } from '@/components/Notice';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { InsightsBody, type StudentProgress } from '@/components/insights/InsightsBody';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * One learner, read as a whole — the sheet the teacher roster and the admin
 * users table open on a name click. All the chrome, none of the sections: the
 * body is the shared `InsightsBody`, the same renderer the learner's own
 * Strength tab uses, so a teacher and their student are always told the same
 * story about the same cards.
 *
 * On `sm+` it docks right — a 720px bottom sheet in a 900px viewport is a
 * modal pretending to be a sheet. Phones keep the bottom sheet, where swipe
 * dismissal is the native gesture. `siblings` + `onNavigate` turn it into a
 * reviewer: step through a roster or the user table without closing.
 */

const WIDE_QUERY = '(min-width: 640px)';

function useWideViewport() {
  const [wide, setWide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(WIDE_QUERY).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(WIDE_QUERY);
    const onChange = () => setWide(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return wide;
}

export function StudentProgressPanel({
  userId,
  name,
  onClose,
  siblings,
  onNavigate,
}: {
  userId: string;
  name: string;
  onClose: () => void;
  /** Ordered list the current user belongs to — enables prev/next. */
  siblings?: { id: string; name: string }[];
  onNavigate?: (user: { id: string; name: string }) => void;
}) {
  const [data, setData] = useState<StudentProgress | null>(null);
  const [error, setError] = useState('');
  const wide = useWideViewport();

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

  const list = siblings ?? [];
  const index = list.findIndex((s) => s.id === userId);
  const prev = index > 0 ? list[index - 1] : null;
  const next = index >= 0 && index < list.length - 1 ? list[index + 1] : null;

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side={wide ? 'right' : 'bottom'}
        showCloseButton={false}
        className={cn('overflow-y-auto', !wide && 'mx-auto w-full max-w-[720px]')}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-4">
          <div className="min-w-0">
            {/* SheetTitle *is* the h2 — one name, one heading, no duplicate. */}
            <SheetTitle className="t-strong truncate">{name}</SheetTitle>
            {data && (
              <p className="t-caption mt-0.5 truncate text-muted-foreground">
                {data.subjects.length > 0
                  ? `${data.subjects.map((s) => s.name).join(' · ')}`
                  : 'No subjects studied yet'}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {siblings && onNavigate && index >= 0 && list.length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="icon-lg"
                  type="button"
                  disabled={!prev}
                  aria-label={prev ? `Previous student: ${prev.name}` : 'No previous student'}
                  onClick={() => prev && onNavigate(prev)}
                >
                  <Icon name="back" size={16} />
                </Button>
                <span className="num t-fine px-1 text-muted-foreground" aria-hidden>
                  {index + 1}/{list.length}
                </span>
                <Button
                  variant="ghost"
                  size="icon-lg"
                  type="button"
                  disabled={!next}
                  aria-label={next ? `Next student: ${next.name}` : 'No next student'}
                  onClick={() => next && onNavigate(next)}
                >
                  <Icon name="next" size={16} />
                </Button>
              </>
            )}
            {/* The sheet's own close control is switched off above: this labelled
                button *is* the affordance, and shipping both put two of them side
                by side in the top-right corner. */}
            <Button variant="ghost" type="button" className="shrink-0 gap-1.5" onClick={onClose}>
              <Icon name="close" size={14} />
              Close
            </Button>
          </div>
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
