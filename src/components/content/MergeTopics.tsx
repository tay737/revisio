'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icons';
import { Notice } from '@/components/Notice';
import { SPRING } from '@/lib/motion';

export type TopicOption = {
  id: string;
  name: string;
  cardCount?: number;
  lessonCount?: number;
  visibility?: string;
  subjectName?: string | null;
};

type MergeResponse = { message: string; movedCards: number; movedLessons: number; published: boolean };

function tally(cards: number, lessons: number): string {
  const parts = [
    cards ? `${cards} ${cards === 1 ? 'question' : 'questions'}` : null,
    lessons ? `${lessons} ${lessons === 1 ? 'note set' : 'note sets'}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' and ') : 'nothing';
}

/**
 * Merge two topics back into one.
 *
 * This exists because splitting is the easy mistake: importing a deck used to
 * always mint a fresh topic, so the questions for a subject and the notes for it
 * could end up in two topics with no way to combine them — questions in one,
 * notes in the other, and neither one complete enough to study.
 *
 * The panel states the consequence before it acts, because a merge deletes a
 * topic and that is not something to discover afterwards. Two clicks, no native
 * dialog: the first arms, the second commits.
 */
export function MergeTopics({
  topics,
  onMerged,
  defaultSource,
}: {
  topics: TopicOption[];
  onMerged: (message: string) => void;
  defaultSource?: string;
}) {
  const [source, setSource] = useState(defaultSource ?? '');
  const [target, setTarget] = useState('');
  const [publish, setPublish] = useState(false);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const from = topics.find((t) => t.id === source);
  const into = topics.find((t) => t.id === target);
  const ready = Boolean(from && into && from.id !== into.id);

  const run = async () => {
    if (!ready) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.post<MergeResponse>('/api/v1/content/merge', { sourceId: source, targetId: target, publish });
      onMerged(`${res.message} “${into?.name}” now holds ${(into?.cardCount ?? 0) + res.movedCards} questions.`);
      setSource('');
      setTarget('');
      setArmed(false);
      setPublish(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That merge did not go through.');
      setArmed(false);
    } finally {
      setBusy(false);
    }
  };

  if (topics.length < 2) {
    return (
      <p className="t-caption text-muted-foreground">
        You need two topics before there is anything to merge.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <label className="label" htmlFor="merge-source">
            Move everything from
          </label>
          <select
            id="merge-source"
            className="input"
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setArmed(false);
            }}
          >
            <option value="">Pick a topic…</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id} disabled={t.id === target}>
                {t.name}
                {t.cardCount !== undefined ? ` — ${t.cardCount} questions` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="merge-target">
            into
          </label>
          <select
            id="merge-target"
            className="input"
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              setArmed(false);
            }}
          >
            <option value="">Pick a topic…</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id} disabled={t.id === source}>
                {t.name}
                {t.lessonCount !== undefined ? ` — ${t.lessonCount} note ${t.lessonCount === 1 ? 'set' : 'sets'}` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {ready && (
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 accent-[rgb(var(--foreground))]"
            checked={publish}
            onChange={(e) => {
              setPublish(e.target.checked);
              setArmed(false);
            }}
          />
          <span className="t-caption">
            Make the result public
            <span className="mt-0.5 block text-muted-foreground">
              The questions and notes become visible to everyone studying this subject.
            </span>
          </span>
        </label>
      )}

      {/* The consequence, before it happens. */}
      <AnimatePresence initial={false} mode="wait">
        {ready && (
          <motion.p
            key={armed ? 'armed' : 'resting'}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={SPRING.soft}
            className={`flex items-start gap-2 rounded-md px-3 py-2.5 text-[14px] leading-snug ${
              armed ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-muted-foreground'
            }`}
          >
            <span className="mt-0.5 shrink-0">
              <Icon name="merge" size={15} />
            </span>
            <span className="min-w-0">
              {tally(from?.cardCount ?? 0, from?.lessonCount ?? 0)} move into “{into?.name}”, and “{from?.name}” is
              deleted. Review progress is kept.
            </span>
          </motion.p>
        )}
      </AnimatePresence>

      <Notice tone="bad" show={Boolean(error)}>
        {error}
      </Notice>

      <div className="flex flex-wrap items-center gap-2">
        {armed ? (
          <>
            <Button variant="danger" onClick={run} disabled={busy}>
              {busy ? 'Merging…' : 'Yes, merge them'}
            </Button>
            <Button variant="ghost" onClick={() => setArmed(false)} disabled={busy}>
              Cancel
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => setArmed(true)} disabled={!ready}>
            <Icon name="merge" size={16} />
            Merge topics
          </Button>
        )}
      </div>
    </div>
  );
}
