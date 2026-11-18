import { parseMarkdown, type Block, type Inline } from '@/domain/markdown';

/**
 * The "Hint:" peel for the progressive Why disclosure (F9).
 *
 * The hint is the first *block* of the explanation's markdown — the first
 * paragraph, heading or list item — reduced to plain text, then cut at the
 * first sentence boundary. Rules, per spec:
 *
 *   • never measure or split on raw markdown (a `. ` split can land inside
 *     `**bold**` or a list marker);
 *   • sentence boundary = `. `, `! `, `? ` or a newline, searched only inside
 *     the first ~140 chars;
 *   • no boundary before the cap → hard-cut at 140 chars, no invented
 *     punctuation beyond an ellipsis;
 *   • the whole explanation at ≤140 chars → null, because the hint and the
 *     disclosure body would say the same thing twice.
 */

const HINT_CAP = 140;

function inlineText(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      switch (n.t) {
        case 'text':
        case 'code':
        case 'math':
          return n.v;
        case 'bold':
        case 'italic':
        case 'link':
          return inlineText(n.c);
        case 'img':
          return n.alt;
      }
    })
    .join('');
}

/** Plain text of the first content block: first paragraph/heading, or the
 *  first item of the first list. Code blocks, tables, rules and quotes are
 *  skipped — they are not the "first sentence" a learner needs. */
function firstBlockText(blocks: Block[]): string {
  for (const b of blocks) {
    if (b.t === 'p' || b.t === 'h') {
      const t = inlineText(b.c).replace(/\s+/g, ' ').trim();
      if (t) return t;
    } else if (b.t === 'ul' || b.t === 'ol') {
      const first = b.items[0];
      if (first) {
        const t = inlineText(first.c).replace(/\s+/g, ' ').trim();
        if (t) return t;
      }
    }
  }
  return '';
}

export function whyHint(explanationMd: string): string | null {
  const whole = explanationMd.replace(/\s+/g, ' ').trim();
  if (!whole || whole.length <= HINT_CAP) return null;

  const first = firstBlockText(parseMarkdown(explanationMd));
  if (!first) return null;

  // First sentence boundary inside the cap. The lookahead keeps the boundary
  // punctuation with the sentence it ends.
  const boundary = /[.!?](?=\s|$)/.exec(first.slice(0, HINT_CAP + 1));
  if (boundary && boundary.index > 0) {
    return first.slice(0, boundary.index + 1).trim();
  }
  // No boundary: the first block itself is the peel. Only mark truncation
  // when the block actually ran past the cap.
  return first.length > HINT_CAP ? `${first.slice(0, HINT_CAP).trimEnd()}…` : first;
}
