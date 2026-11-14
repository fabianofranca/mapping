import { Fragment, type ComponentChild, type VNode } from 'preact';
import { useId, useMemo, useRef } from 'preact/hooks';
import {
  inlinesToText,
  isLibraryLink,
  parseMarkdown,
  type MarkdownBlock,
  type MarkdownInline,
  type MarkdownListItem,
} from '../../model';

export interface MarkdownProps {
  readonly text: string;
  /** Called on clicking a `mapping://…` link; without it, the link becomes plain text. */
  readonly onLink?: (href: string) => void;
  /**
   * Draws the citation `[label](mapping://project/letter/code…)` (not the library links),
   * before `onLink`: the live chip of the threads. `null` lets the usual link apply.
   */
  readonly renderMapping?: (href: string, label: string) => ComponentChild | null;
  /** A simple line break becomes `<br/>` (thread messages); default: becomes a space. */
  readonly lineBreaks?: boolean;
}

interface Ctx {
  readonly prefix: string;
  readonly root: { readonly current: HTMLElement | null };
  readonly ids: ReadonlySet<string>;
  readonly onLink?: (href: string) => void;
  readonly renderMapping?: (href: string, label: string) => ComponentChild | null;
}

function collectIds(blocks: readonly MarkdownBlock[]): Set<string> {
  const ids = new Set<string>();
  for (const b of blocks) if (b.type === 'heading') ids.add(b.id);
  return ids;
}

function goToAnchor(root: HTMLElement | null, prefix: string, id: string): void {
  const wanted = prefix + id;
  const el = [...(root?.querySelectorAll<HTMLElement>('[id]') ?? [])].find(
    (e) => e.id === wanted,
  );
  if (!el) return;
  el.focus({ preventScroll: true });
  if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'start' });
}

function renderLink(
  n: Extract<MarkdownInline, { type: 'link' }>,
  i: number,
  ctx: Ctx,
): ComponentChild {
  const children = renderInlines(n.children, ctx);
  if (n.kind === 'external') {
    return (
      <a key={i} href={n.href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  if (n.kind === 'mapping') {
    const { onLink, renderMapping } = ctx;
    const custom =
      renderMapping && !isLibraryLink(n.href)
        ? renderMapping(n.href, inlinesToText(n.children))
        : null;
    if (custom !== null) return <Fragment key={i}>{custom}</Fragment>;
    if (!onLink) return children;
    return (
      <a
        key={i}
        href="#"
        onClick={(e) => {
          e.preventDefault();
          onLink(n.href);
        }}
      >
        {children}
      </a>
    );
  }
  const id = n.href.slice(1);
  if (!ctx.ids.has(id)) return children;
  return (
    <a
      key={i}
      href={`#${ctx.prefix}${id}`}
      onClick={(e) => {
        e.preventDefault();
        goToAnchor(ctx.root.current, ctx.prefix, id);
      }}
    >
      {children}
    </a>
  );
}

function renderInlines(nodes: readonly MarkdownInline[], ctx: Ctx): ComponentChild[] {
  return nodes.map((n, i): ComponentChild => {
    switch (n.type) {
      case 'text':
        return n.text;
      case 'code':
        return <code key={i}>{n.text}</code>;
      case 'strong':
        return <strong key={i}>{renderInlines(n.children, ctx)}</strong>;
      case 'em':
        return <em key={i}>{renderInlines(n.children, ctx)}</em>;
      case 'break':
        return <br key={i} />;
      case 'link':
        return renderLink(n, i, ctx);
    }
  });
}

function renderItem(item: MarkdownListItem, key: number, ctx: Ctx): VNode {
  return (
    <li key={key}>
      {renderInlines(item.inlines, ctx)}
      {item.children.map((c, i) => renderBlock(c, i, ctx))}
    </li>
  );
}

function renderBlock(b: MarkdownBlock, key: number, ctx: Ctx): VNode {
  switch (b.type) {
    case 'heading': {
      const Tag = `h${b.level}` as 'h1';
      return (
        <Tag key={key} id={ctx.prefix + b.id} tabIndex={-1}>
          {renderInlines(b.inlines, ctx)}
        </Tag>
      );
    }
    case 'paragraph':
      return <p key={key}>{renderInlines(b.inlines, ctx)}</p>;
    case 'code':
      return (
        <pre key={key}>
          <code data-lang={b.lang === '' ? undefined : b.lang}>{b.text}</code>
        </pre>
      );
    case 'quote':
      return (
        <blockquote key={key}>
          {b.children.map((c, i) => renderBlock(c, i, ctx))}
        </blockquote>
      );
    case 'list': {
      const items = b.items.map((it, i) => renderItem(it, i, ctx));
      return b.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>;
    }
    case 'table':
      return (
        <div key={key} class="markdown-table">
          <table>
            <thead>
              <tr>
                {b.header.map((h, c) => (
                  <th key={c} style={{ textAlign: b.align[c] ?? undefined }}>
                    {renderInlines(h, ctx)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} style={{ textAlign: b.align[c] ?? undefined }}>
                      {renderInlines(cell, ctx)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/** Markdown document (subset): never raw HTML or images; links only `mapping://`, anchors and absolute `http(s)://` (new tab). */
export function Markdown({
  text,
  onLink,
  renderMapping,
  lineBreaks,
}: MarkdownProps): VNode {
  const uid = useId();
  const blocks = useMemo(
    () => parseMarkdown(text, lineBreaks === true ? { lineBreaks: true } : undefined),
    [text, lineBreaks],
  );
  const ids = useMemo(() => collectIds(blocks), [blocks]);
  const root = useRef<HTMLDivElement>(null);
  const ctx: Ctx = { prefix: `md-${uid}-`, root, ids, onLink, renderMapping };
  return (
    <div class="markdown" ref={root}>
      {blocks.map((b, i) => renderBlock(b, i, ctx))}
    </div>
  );
}
