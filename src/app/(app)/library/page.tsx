'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Icon } from '@/components/ui/icons';
import { PageHeader } from '@/components/PageHeader';
import { Notice } from '@/components/Notice';
import { Button } from '@/components/ui/button';
import { BlurFade } from '@/components/ui/blur-fade';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MergeTopics, type TopicOption } from '@/components/content/MergeTopics';
import { ComposeTopic } from './ComposeTopic';
import { ImportDeck } from './ImportDeck';
import PageSkeleton from '@/components/PageSkeleton';

type Topic = TopicOption & {
  visibility: string;
  subjectId: string;
  description: string;
  subjectName: string | null;
};
type Subject = { id: string; name: string };

const VISIBILITY_GLYPH: Record<string, 'publish' | 'schedule' | 'private'> = {
  public: 'publish',
  pending_review: 'schedule',
  private: 'private',
};

/**
 * My content — four jobs, one at a time.
 *
 * They used to be four stacked sections on a single page, which meant a phone
 * user scrolled past the authoring form to reach their own topic list, and past
 * the import form to reach the class code. Tabs put each job one tap away and
 * keep the page short.
 *
 * The topic list states the two numbers that decide whether a topic is worth
 * opening — how many questions it has and how many note sets — because that is
 * exactly the fact this screen used to hide, and hiding it is how a topic with
 * twelve imported questions and no notes sat next to a topic with notes and no
 * questions without anyone noticing.
 */
export default function LibraryPage() {
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busyTopic, setBusyTopic] = useState('');
  const [classCode, setClassCode] = useState('');
  const [joining, setJoining] = useState(false);

  const load = useCallback(
    () =>
      api
        .get<{ topics: Topic[] }>('/api/v1/content?mine=1')
        .then((d) => setTopics(d.topics))
        .catch(() => setTopics([])),
    [],
  );

  useEffect(() => {
    load();
    api
      .get<{ subjects: Subject[] }>('/api/v1/auth/subjects-public')
      .then((d) => setSubjects(d.subjects))
      .catch(() => undefined);
  }, [load]);

  const say = (text: string) => {
    setError('');
    setMessage(text);
  };

  const setVisibility = async (topic: Topic, visibility: 'public' | 'private') => {
    setBusyTopic(topic.id);
    setError('');
    try {
      const res = await api.patch<{ cards: number; lessons: number }>('/api/v1/content', { topicId: topic.id, visibility });
      say(
        visibility === 'public'
          ? `“${topic.name}” is public — ${res.cards} ${res.cards === 1 ? 'question' : 'questions'} went with it.`
          : `“${topic.name}” is private again.`,
      );
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That change did not go through.');
    } finally {
      setBusyTopic('');
    }
  };

  const joinClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoining(true);
    setError('');
    try {
      const d = await api.post<{ class: { name: string } }>('/api/v1/classes/join', { code: classCode });
      say(`Joined ${d.class.name}.`);
      setClassCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code did not match a class.');
    } finally {
      setJoining(false);
    }
  };

  if (topics === null) return <PageSkeleton />;

  const questionCount = topics.reduce((n, t) => n + (t.cardCount ?? 0), 0);
  const noteCount = topics.reduce((n, t) => n + (t.lessonCount ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        icon="library"
        title="My content"
        subtitle={
          topics.length === 0
            ? 'Nothing here yet.'
            : `${topics.length} ${topics.length === 1 ? 'topic' : 'topics'} · ${questionCount} questions · ${noteCount} note ${noteCount === 1 ? 'set' : 'sets'}`
        }
      />

      <Notice tone="good" show={Boolean(message)}>
        {message}
      </Notice>
      <Notice tone="bad" show={Boolean(error)}>
        {error}
      </Notice>

      <Tabs defaultValue="topics">
        {/* Four equal slots rather than a scroll rail: all four labels are short,
            and the previous version clipped “Class” off the right edge with
            nothing on screen to say it was there. */}
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="topics" className="min-w-0 px-2">
            <Icon name="topic" size={15} />
            Topics
          </TabsTrigger>
          <TabsTrigger value="write" className="min-w-0 px-2">
            <Icon name="edit" size={15} />
            Write
          </TabsTrigger>
          <TabsTrigger value="import" className="min-w-0 px-2">
            <Icon name="upload" size={15} />
            Import
          </TabsTrigger>
          <TabsTrigger value="class" className="min-w-0 px-2">
            <Icon name="join" size={15} />
            Class
          </TabsTrigger>
        </TabsList>

        {/* ── Topics ──────────────────────────────────────────────────────── */}
        <TabsContent value="topics" className="space-y-4">
          {topics.length === 0 ? (
            <div className="card p-8 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-secondary">
                <Icon name="library2" size={22} />
              </span>
              <h2 className="t-tagline mt-4">Start with a topic</h2>
              <p className="t-caption mx-auto mt-2 max-w-sm text-muted-foreground">
                Questions and notes live together in one — write it under <strong>Write</strong>, or bring a deck you
                already have under <strong>Import</strong>.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {topics.map((t, i) => (
                <BlurFade key={t.id} delay={Math.min(i * 0.03, 0.2)}>
                  <div className="inset flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                    <div className="w-full min-w-0 sm:w-auto sm:flex-1">
                      <span className="t-strong flex items-center gap-2">
                        <span className="line-clamp-2">{t.name}</span>
                        <span className={`chip shrink-0 ${t.visibility === 'public' ? 'chip-active' : ''}`}>
                          <Icon name={VISIBILITY_GLYPH[t.visibility] ?? 'private'} size={12} />
                          {t.visibility.replace('_', ' ')}
                        </span>
                      </span>
                      <span className="t-caption mt-0.5 flex flex-wrap items-center gap-x-2 text-muted-foreground">
                        <span>{t.subjectName ?? 'No subject'}</span>
                        <span>·</span>
                        <span className={t.cardCount === 0 ? 'text-destructive' : undefined}>
                          {t.cardCount} {t.cardCount === 1 ? 'question' : 'questions'}
                        </span>
                        <span>·</span>
                        <span className={t.lessonCount === 0 ? 'text-destructive' : undefined}>
                          {t.lessonCount} note {t.lessonCount === 1 ? 'set' : 'sets'}
                        </span>
                      </span>
                    </div>
                    <Button
                      variant={t.visibility === 'public' ? 'ghost' : 'secondary'}
                      size="sm"
                      disabled={busyTopic === t.id}
                      onClick={() => setVisibility(t, t.visibility === 'public' ? 'private' : 'public')}
                    >
                      <Icon name={t.visibility === 'public' ? 'unpublish' : 'publish'} size={14} />
                      {t.visibility === 'public' ? 'Withdraw' : 'Publish'}
                    </Button>
                  </div>
                </BlurFade>
              ))}
            </div>
          )}

          {topics.length > 1 && (
            <details className="card">
              <summary className="flex cursor-pointer items-center gap-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary">
                  <Icon name="merge" size={17} />
                </span>
                <span className="min-w-0">
                  <span className="t-strong block">Merge two topics</span>
                  <span className="t-caption block text-muted-foreground">
                    Questions in one and notes in the other? Put them together.
                  </span>
                </span>
                <Icon name="collapse" size={15} className="ml-auto shrink-0 text-muted-foreground" />
              </summary>
              <div className="mt-5">
                <MergeTopics topics={topics} onMerged={say} />
              </div>
            </details>
          )}
        </TabsContent>

        {/* ── Write ───────────────────────────────────────────────────────── */}
        <TabsContent value="write">
          <div className="card">
            <h2 className="t-strong">Write a topic</h2>
            <p className="t-caption mt-1 text-muted-foreground">Notes and questions together, so they arrive as one.</p>
            <div className="mt-5">
              <ComposeTopic subjects={subjects} onCreated={(m) => { say(m); load(); }} />
            </div>
          </div>
        </TabsContent>

        {/* ── Import ──────────────────────────────────────────────────────── */}
        <TabsContent value="import">
          <div className="card">
            <h2 className="t-strong">Bring a deck</h2>
            <p className="t-caption mt-1 text-muted-foreground">
              Add it to a topic you already have, so its questions sit with its notes.
            </p>
            <div className="mt-5">
              <ImportDeck subjects={subjects} topics={topics} onImported={say} onChanged={load} />
            </div>
          </div>
        </TabsContent>

        {/* ── Class ───────────────────────────────────────────────────────── */}
        <TabsContent value="class">
          <div className="card">
            <h2 className="t-strong">Join a class</h2>
            <p className="t-caption mt-1 text-muted-foreground">
              The six-character code from your teacher. It shares your review activity, nothing else.
            </p>
            <form onSubmit={joinClass} className="mt-4 flex flex-wrap gap-2">
              <input
                className="input uppercase tracking-[0.3em] sm:max-w-[200px]"
                value={classCode}
                onChange={(e) => setClassCode(e.target.value.toUpperCase())}
                maxLength={6}
                placeholder="ABC123"
                required
                aria-label="Class code"
              />
              <Button type="submit" disabled={joining || classCode.length < 6}>
                {joining ? 'Joining…' : 'Join'}
              </Button>
            </form>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
