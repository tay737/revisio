import Link from 'next/link';
import { Icon } from '@/components/ui/icons';

/**
 * The "read the lesson" deep link (F7) — one component for all three verdict
 * surfaces so the degrade rules can never drift apart:
 *
 *   lesson reachable  → `/learn/{subject}/{topic}#{lessonId}`, "Read the lesson: {title}"
 *   lesson absent     → `/learn/{subject}/{topic}`,            "Open the topic notes"
 *   no target at all  → renders nothing (honest absence, never a dead link)
 *
 * Queue builders only emit `lessonId` when the lesson actually reaches the
 * learner, so a non-null id here is always a live anchor — the learn page
 * carries a stable `id={lesson.id}` on each lesson section for it.
 */
export function ReferenceLink({
  subjectId,
  topicId,
  lessonId,
  lessonTitle,
  className = '',
}: {
  subjectId?: string | null;
  topicId?: string | null;
  lessonId?: string | null;
  lessonTitle?: string | null;
  className?: string;
}) {
  if (!subjectId || !topicId) return null;
  const href = `/learn/${subjectId}/${topicId}${lessonId ? `#${lessonId}` : ''}`;
  return (
    <Link
      href={href}
      className={`t-caption inline-flex items-center gap-1.5 font-semibold text-foreground underline underline-offset-4 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${className}`}
    >
      <Icon name="notes" size={14} className="shrink-0" />
      {lessonId && lessonTitle ? `Read the lesson: ${lessonTitle}` : 'Open the topic notes'}
    </Link>
  );
}
