import 'server-only';
import { ApiError } from '@/services/api';

/**
 * The card shape every write path accepts — content POST, cloze insert,
 * generate_from_notes and AI draft accept all normalise to this and run the
 * same gate. Kept out of the route file because route modules may only export
 * HTTP verbs; the validator is shared, not route-private.
 */
export type CardInput = {
  kind: 'cloze' | 'flashcard' | 'mcq';
  textWithBlank?: string;
  prompt?: string;
  question?: string;
  answers?: string[];
  keywords?: { required: boolean; phrase: string; synonyms?: string[] }[];
  minPoints?: number;
  options?: string[];
  correctIdx?: number;
  explanationMd?: string;
  lessonId?: string;
};

/**
 * Reject a malformed deck before anything is written.
 *
 * The topic used to be inserted first, so a bad question halfway down the list
 * answered with an error *and* left an empty topic behind — which is one of the
 * ways an import ends up looking like it landed separately from the notes it
 * came with. Checking up front means a rejected import changes nothing at all.
 *
 * The flashcard case is the one that used to pass silently: a card created with
 * no answer is unanswerable, and it presented as a verdict reading "Answer:"
 * with nothing after it, which teaches the reader nothing and looks like the
 * app lost their content.
 */
export function validateCards(input: CardInput[] | undefined) {
  for (const [i, c] of (input ?? []).entries()) {
    const at = `Question ${i + 1}`;
    if (c.kind === 'cloze') {
      if (!c.textWithBlank?.includes('____')) throw new ApiError(400, 'bad_request', `${at}: a fill-the-blank needs ____ where the blank goes.`);
      if (!c.answers?.some((a) => a.trim())) throw new ApiError(400, 'bad_request', `${at}: a fill-the-blank needs at least one accepted answer.`);
    } else if (c.kind === 'flashcard') {
      if (!c.prompt?.trim()) throw new ApiError(400, 'bad_request', `${at}: a flashcard needs a prompt.`);
      if (!c.answers?.some((a) => a.trim())) throw new ApiError(400, 'bad_request', `${at}: a flashcard needs its answer. Send it as answers: ["…"].`);
    } else if (c.kind === 'mcq') {
      const options = c.options ?? [];
      if (options.length < 2) throw new ApiError(400, 'bad_request', `${at}: a multiple-choice question needs at least two options.`);
      if ((c.correctIdx ?? 0) < 0 || (c.correctIdx ?? 0) >= options.length) throw new ApiError(400, 'bad_request', `${at}: the correct option is outside the list of options.`);
    } else {
      throw new ApiError(400, 'bad_request', `${at}: kind must be cloze, flashcard or mcq.`);
    }
  }
}
