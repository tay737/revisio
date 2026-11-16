'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Icon } from '@/components/ui/icons';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/ui/empty-state';
import { Notice } from '@/components/Notice';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import PageSkeleton from '@/components/PageSkeleton';

type Deck = {
  topicId: string;
  name: string;
  description: string;
  subjectName: string;
  authorName: string;
  cardCount: number;
  lessonCount: number;
  followerCount: number;
  subscription: {
    id: string;
    copyTopicId: string;
    copySubjectId: string;
    updated: boolean;
  } | null;
};

/**
 * Public deck library (#6) — verified decks published through the staff path.
 *
 * Follow is copy-on-follow: the deck lands as a private copy under the
 * learner's "Shared decks" subject, so it is theirs to edit and study
 * immediately. Re-following after an unfollow reuses that copy rather than
 * duplicating it; the API still reports source-vs-snapshot counts, but no
 * badge renders until a refresh path exists.
 */
export default function PublicDecksPage() {
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    api
      .get<{ decks: Deck[] }>('/api/v1/decks')
      .then((d) => setDecks(d.decks))
      .catch(() => setDecks([]));
  }, []);

  useEffect(load, [load]);

  const act = async (deck: Deck) => {
    setBusy(deck.topicId);
    setError('');
    setMessage('');
    try {
      if (deck.subscription) {
        await api.post('/api/v1/decks', { action: 'unfollow', subscriptionId: deck.subscription.id });
        setMessage(`Unfollowed “${deck.name}”. Your copy stays in Shared decks.`);
      } else {
        const res = await api.post<{ copyTopicId: string; copySubjectId: string; alreadyFollowing: boolean }>(
          '/api/v1/decks',
          { action: 'follow', deckTopicId: deck.topicId },
        );
        setMessage(
          res.alreadyFollowing
            ? `Already following “${deck.name}”.`
            : `“${deck.name}” is in your Shared decks — yours to edit and study.`,
        );
      }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not go through.');
    } finally {
      setBusy('');
    }
  };

  if (decks === null) return <PageSkeleton />;

  const q = query.trim().toLowerCase();
  const visible = q
    ? decks.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.subjectName.toLowerCase().includes(q) ||
          d.authorName.toLowerCase().includes(q),
      )
    : decks;

  return (
    <div className="space-y-6">
      <PageHeader
        icon="library"
        title="Deck library"
        subtitle="Verified decks published by teachers and the Revisio team. Follow one and a private copy lands in your Shared decks."
      />

      <Notice tone="good" show={Boolean(message)}>
        {message}
      </Notice>
      <Notice tone="bad" show={Boolean(error)}>
        {error}
      </Notice>

      {decks.length > 0 && (
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search decks, subjects or authors"
          aria-label="Search decks"
        />
      )}

      {decks.length === 0 ? (
        <EmptyState
          icon="library2"
          title="No public decks yet"
          body="When teachers publish topics they appear here for anyone to follow."
        />
      ) : visible.length === 0 ? (
        <EmptyState icon="search" title="Nothing matches" body="Try a different search." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {visible.map((d) => (
            <li key={d.topicId}>
              <Card className="flex h-full flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="t-strong line-clamp-2">{d.name}</h2>
                    <p className="t-fine mt-1 text-muted-foreground">
                      {d.subjectName} · by {d.authorName}
                    </p>
                  </div>
                </div>
                {d.description && (
                  <p className="t-caption mt-2 line-clamp-3 text-muted-foreground">{d.description}</p>
                )}
                <p className="t-fine mt-3 text-muted-foreground">
                  {d.cardCount} {d.cardCount === 1 ? 'question' : 'questions'}
                  {d.lessonCount > 0 && ` · ${d.lessonCount} note ${d.lessonCount === 1 ? 'set' : 'sets'}`}
                  {d.followerCount > 0 && ` · ${d.followerCount} following`}
                </p>
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                  {d.subscription ? (
                    <>
                      <Link
                        href={`/learn/${d.subscription.copySubjectId}/${d.subscription.copyTopicId}`}
                        className="inline-flex min-h-11 items-center gap-1.5 t-caption-s font-medium text-foreground"
                      >
                        <Icon name="learn" size={14} />
                        Open my copy
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy === d.topicId}
                        onClick={() => void act(d)}
                      >
                        {busy === d.topicId ? 'Removing…' : 'Unfollow'}
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy === d.topicId}
                      onClick={() => void act(d)}
                    >
                      <Icon name="add" size={14} />
                      {busy === d.topicId ? 'Adding…' : 'Follow'}
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
