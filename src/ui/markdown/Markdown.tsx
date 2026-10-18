import type { ComponentChild, VNode } from 'preact';
import { useId, useMemo, useRef } from 'preact/hooks';
import {
  parseMarkdown,
  type MarkdownBlock,
  type MarkdownInline,
  type MarkdownListItem,
} from '../../model';

export interface MarkdownProps {
  readonly text: string;
  /** Chamado ao clicar num link `mapping://…`; sem ele, o link vira só texto. */
  readonly onLink?: (href: string) => void;
}

interface Ctx {
  readonly prefix: string;
  readonly root: { readonly current: HTMLElement | null };
  readonly ids: ReadonlySet<string>;
  readonly onLink?: (href: string) => void;
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
      case 'link': {
        const children = renderInlines(n.children, ctx);
        if (n.kind === 'mapping') {
          const { onLink } = ctx;
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

/** Documento em markdown (subconjunto): nunca HTML cru nem imagens; links só `mapping://` e âncoras. */
export function Markdown({ text, onLink }: MarkdownProps): VNode {
  const uid = useId();
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  const ids = useMemo(() => collectIds(blocks), [blocks]);
  const root = useRef<HTMLDivElement>(null);
  const ctx: Ctx = { prefix: `md-${uid}-`, root, ids, onLink };
  return (
    <div class="markdown" ref={root}>
      {blocks.map((b, i) => renderBlock(b, i, ctx))}
    </div>
  );
}
