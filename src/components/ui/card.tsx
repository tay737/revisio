import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Card — the surface primitive.
 *
 * The visual language (16px radius, hairline, flat Level 0) still lives in
 * `globals.css` (`.card`, `.card-solid`, `.card-soft`, `.card-flat`) because that
 * file is the single owner of the design tokens; this component owns the API,
 * the variant names and the element it renders.
 *
 * `as` exists because a card is often a landmark in this app — an `<aside>`, a
 * `<section>`, a `<form>` — and replacing the element with a `div` for the sake
 * of a class would delete regions that the accessibility tree (and the axe pass)
 * depends on. It is a plain tag switch rather than a render prop so a Card can
 * stay a server component: pages render cards, and a client boundary per card
 * would be a real cost for a decorative container.
 */
const SURFACE = {
  default: 'card',
  solid: 'card-solid',
  soft: 'card-soft',
  flat: 'card-flat',
} as const;

const TAGS = {
  div: 'div',
  section: 'section',
  article: 'article',
  aside: 'aside',
  form: 'form',
  li: 'li',
} as const;

function Card({
  className,
  variant = 'default',
  as = 'div',
  ...props
}: React.ComponentProps<'div'> & {
  variant?: keyof typeof SURFACE;
  as?: keyof typeof TAGS;
}) {
  // `ElementType` because the prop set legitimately differs per tag (a `form`
  // has `onSubmit`, a `section` does not); the caller typed it as a div's props,
  // which every one of these containers accepts.
  const Tag = TAGS[as] as React.ElementType;
  return <Tag data-slot="card" className={cn(SURFACE[variant], className)} {...props} />;
}

export { Card };
