import { NextRequest } from 'next/server';
import { ApiError, ok, requireUser, route } from '@/services/api';
import { followDeck, listPublicDecks, unfollowDeck } from '@/services/decks';

/**
 * /api/v1/decks — the public deck library (#6).
 *
 *   GET  → every verified public deck with counts, follower count and the
 *          caller's own follow state (copy topic + "updated" flag).
 *   POST → { action: 'follow', deckTopicId } copies the deck into the caller's
 *          "Shared decks" subject and subscribes them;
 *          { action: 'unfollow', subscriptionId } removes the subscription
 *          (the private copy is kept — it belongs to the follower now).
 */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const decks = await listPublicDecks(user.id);
  return ok({ decks });
});

export const POST = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const body = (await req.json()) as {
    action?: 'follow' | 'unfollow';
    deckTopicId?: string;
    subscriptionId?: string;
  };

  if (body.action === 'follow') {
    if (!body.deckTopicId) throw new ApiError(400, 'bad_request', 'deckTopicId required.');
    const result = await followDeck(user, body.deckTopicId);
    return ok(result, { status: result.alreadyFollowing ? 200 : 201 });
  }
  if (body.action === 'unfollow') {
    if (!body.subscriptionId) throw new ApiError(400, 'bad_request', 'subscriptionId required.');
    return ok(await unfollowDeck(user, body.subscriptionId));
  }
  throw new ApiError(400, 'bad_request', 'Unknown action.');
});
