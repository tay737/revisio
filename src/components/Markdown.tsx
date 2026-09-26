'use client';

import { parseMarkdown, type Block, type Inline } from '@/domain/markdown';

/**
 * The one renderer for authored note text.
 *
 * Notes were previously displayed as raw text (`<pre>` in review and cram) or
 * through a heading/bold-only renderer (`Markdownish` in Learn) — so headings,
 * lists, tables, code and math written by the author appeared as literal
 * `##`/`|`/`$` characters. Every surface that shows a note now renders through
 * this single component, and it parses through `domain/markdown` into React
 * elements — never dangerouslySetInnerHTML, so authored content cannot inject
 * markup.
 */
export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`md-root space-y-2.5 text-foreground ${className}`}>
      {parseMarkdown(text).map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
    </div>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.t) {
    case 'h': {
      const cls = {
        1: 't-display-md',
        2: 't-tagline',
        3: 't-strong',
        4: 't-strong text-[15px]',
      }[block.level];
      const Tag = `h${Math.min(block.level + 2, 6)}` as 'h3' | 'h4' | 'h5' | 'h6';
      return <Tag className={cls}>{block.c.map((c, i) => <InlineView key={i} node={c} />)}</Tag>;
    }
    case 'p':
      return <p className="t-body leading-relaxed">{block.c.map((c, i) => <InlineView key={i} node={c} />)}</p>;
    case 'quote':
      return (
        <blockquote className="border-l-2 border-primary/40 pl-3 text-muted-foreground">
          {block.c.map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </blockquote>
      );
    case 'code':
      return (
        <pre className="inset overflow-x-auto px-3 py-2.5 font-mono text-[13px] leading-relaxed">
          <code>{block.v}</code>
        </pre>
      );
    case 'ul':
      return (
        <ul className="ml-5 list-disc space-y-1">
          {block.items.map((it, i) => (
            <li key={i}>
              {it.c.map((c, j) => <InlineView key={j} node={c} />)}
              {it.sub.length > 0 && (
                <div className="ml-4 mt-1 space-y-1 text-[14px] text-muted-foreground">
                  {it.sub.map((s, j) => (
                    <div key={j}>{s.map((c, k) => <InlineView key={k} node={c} />)}</div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol className="ml-5 list-decimal space-y-1">
          {block.items.map((it, i) => (
            <li key={i}>
              {it.c.map((c, j) => <InlineView key={j} node={c} />)}
              {it.sub.length > 0 && (
                <div className="ml-4 mt-1 space-y-1 text-[14px] text-muted-foreground">
                  {it.sub.map((s, j) => (
                    <div key={j}>{s.map((c, k) => <InlineView key={k} node={c} />)}</div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ol>
      );
    case 'table':
      return (
        <div className="inset overflow-x-auto">
          <table className="w-full text-left text-[14px]">
            <thead>
              <tr className="border-b border-border">
                {block.head.map((cell, i) => (
                  <th key={i} scope="col" className="px-2.5 py-2 font-semibold">
                    {cell.map((c, j) => <InlineView key={j} node={c} />)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className="border-b border-border/50">
                  {row.map((cell, j) => (
                    <td key={j} className="px-2.5 py-2 align-top">
                      {cell.map((c, k) => <InlineView key={k} node={c} />)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'hr':
      return <hr className="border-border/70" />;
  }
}

function InlineView({ node }: { node: Inline }) {
  switch (node.t) {
    case 'text':
      return <>{node.v}</>;
    case 'bold':
      return <strong className="font-semibold">{node.c.map((c, i) => <InlineView key={i} node={c} />)}</strong>;
    case 'italic':
      return <em>{node.c.map((c, i) => <InlineView key={i} node={c} />)}</em>;
    case 'code':
      return <code className="rounded bg-border/60 px-1 py-0.5 font-mono text-[0.85em]">{node.v}</code>;
    case 'math':
      return (
        <span
          className={
            node.display
              ? 'my-1 block rounded bg-border/40 px-3 py-2 text-center font-serif text-[17px] italic'
              : 'mx-0.5 font-serif italic'
          }
        >
          {node.v}
        </span>
      );
    case 'link':
      return (
        <a href={node.href} className="text-primary underline underline-offset-2" rel="noreferrer noopener">
          {node.c.map((c, i) => <InlineView key={i} node={c} />)}
        </a>
      );
    case 'img':
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={node.src} alt={node.alt} className="max-h-80 rounded-md" loading="lazy" />;
  }
}
