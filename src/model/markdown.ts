// Subconjunto de markdown para os documentos da biblioteca (Catálogo). Puro: só dados,
// nenhum HTML. HTML cru é texto; só links `mapping://` e âncoras `#…` viram link.
// Nunca lança: entrada hostil devolve algo, com limites de profundidade e de tamanho.

export type MarkdownAlign = 'left' | 'center' | 'right' | null;

export type MarkdownInline =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'strong'; readonly children: readonly MarkdownInline[] }
  | { readonly type: 'em'; readonly children: readonly MarkdownInline[] }
  | { readonly type: 'code'; readonly text: string }
  | {
      readonly type: 'link';
      readonly href: string;
      readonly kind: 'mapping' | 'anchor';
      readonly children: readonly MarkdownInline[];
    };

export interface MarkdownListItem {
  readonly inlines: readonly MarkdownInline[];
  /** Listas aninhadas (por indentação) deste item. */
  readonly children: readonly MarkdownBlock[];
}

export type MarkdownBlock =
  | {
      readonly type: 'heading';
      readonly level: 1 | 2 | 3 | 4 | 5 | 6;
      readonly inlines: readonly MarkdownInline[];
      readonly id: string;
    }
  | { readonly type: 'paragraph'; readonly inlines: readonly MarkdownInline[] }
  | { readonly type: 'code'; readonly lang: string; readonly text: string }
  | {
      readonly type: 'list';
      readonly ordered: boolean;
      readonly items: readonly MarkdownListItem[];
    }
  | {
      readonly type: 'table';
      readonly header: readonly (readonly MarkdownInline[])[];
      readonly align: readonly MarkdownAlign[];
      readonly rows: readonly (readonly (readonly MarkdownInline[])[])[];
    };

/** Profundidade máxima de inlines aninhados e de listas aninhadas. */
const MAX_INLINE_DEPTH = 6;
const MAX_LIST_DEPTH = 6;
/** Trecho de texto inline analisado de uma vez (o resto vira outro trecho). */
const MAX_INLINE_CHUNK = 20000;
/** Janela de busca do fechamento de colchetes, parênteses e ênfase. */
const SEARCH_WINDOW = 2000;

function hasControl(text: string): boolean {
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) < 32) return true;
  return false;
}

/** Classifica o destino de um link: só `mapping://…` e `#âncora` são vivos. */
export function linkKind(href: string): 'mapping' | 'anchor' | null {
  if (hasControl(href)) return null;
  if (/^mapping:\/\/[^\s<>"'`\\]+$/.test(href)) return 'mapping';
  if (/^#[^\s<>"'`\\]+$/.test(href)) return 'anchor';
  return null;
}

export function isSafeLinkTarget(href: string): boolean {
  return linkKind(href) !== null;
}

/** Slug estável para âncora de título. */
export function slugifyHeading(text: string): string {
  const slug = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'secao' : slug;
}

/** Texto simples de uma sequência de inlines (sem marcação). */
export function inlinesToText(inlines: readonly MarkdownInline[]): string {
  let out = '';
  for (const n of inlines) {
    out += n.type === 'text' || n.type === 'code' ? n.text : inlinesToText(n.children);
  }
  return out;
}

// ---------------------------------------------------------------- inlines

const PUNCT = /[\\`*_[\]()!#<>|~{}+\-.]/;

function isWs(ch: string | undefined): boolean {
  return ch === undefined || /\s/.test(ch);
}

function isAlnum(ch: string | undefined): boolean {
  return ch !== undefined && /[\p{L}\p{N}]/u.test(ch);
}

function pushText(out: MarkdownInline[], text: string): void {
  if (text === '') return;
  const last = out[out.length - 1];
  if (last?.type === 'text')
    out[out.length - 1] = { type: 'text', text: last.text + text };
  else out.push({ type: 'text', text });
}

function pushAll(out: MarkdownInline[], nodes: readonly MarkdownInline[]): void {
  for (const n of nodes) {
    if (n.type === 'text') pushText(out, n.text);
    else out.push(n);
  }
}

/** Pareamento de colchetes do trecho, calculado uma vez (linear): abre -> fecha. */
function matchBrackets(s: string): Map<number, number> {
  const pairs = new Map<number, number>();
  const stack: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') i++;
    else if (c === '[') stack.push(i);
    else if (c === ']') {
      const open = stack.pop();
      if (open !== undefined) pairs.set(open, i);
    }
  }
  return pairs;
}

/** Lê `(destino "título")` em `open` (um `(`); devolve o destino e o índice depois do `)`. */
function readDestination(s: string, open: number): { href: string; end: number } | null {
  let level = 0;
  const end = Math.min(s.length, open + SEARCH_WINDOW);
  for (let i = open; i < end; i++) {
    const c = s[i];
    if (c === '\\') i++;
    else if (c === '(') level++;
    else if (c === ')') {
      level--;
      if (level === 0) {
        let raw = s.slice(open + 1, i).trim();
        if (raw.startsWith('<')) {
          const close = raw.indexOf('>');
          raw = close > 0 ? raw.slice(1, close) : raw;
        } else {
          raw = raw.split(/\s/, 1)[0] ?? '';
        }
        return { href: raw, end: i + 1 };
      }
    }
  }
  return null;
}

/** Fecha ênfase: índice do delimitador de fechamento ou -1. */
function findEmphasisClose(
  s: string,
  from: number,
  delim: string,
  failedFrom: Map<string, number>,
): number {
  // Se uma busca a partir de `p` não achou fechamento até o fim do trecho, nenhuma
  // busca posterior acha (o fechamento só depende do próprio ponto).
  const failed = failedFrom.get(delim);
  if (failed !== undefined && from >= failed) return -1;
  let j = from;
  while (j < s.length) {
    j = s.indexOf(delim, j);
    if (j < 0) break;
    if (s[j - 1] === '\\') {
      j++;
      continue;
    }
    if (delim.length === 1 && s[j + 1] === delim) {
      j += 2; // um `**` dentro de `*…*`
      continue;
    }
    const prev = s[j - 1];
    const next = s[j + delim.length];
    const okClose = j > from && !isWs(prev) && (delim[0] === '*' || !isAlnum(next));
    if (okClose) return j;
    j += delim.length;
  }
  failedFrom.set(delim, from);
  return -1;
}

function parseInlineChunk(s: string, depth: number): MarkdownInline[] {
  let brackets: Map<number, number> | null = null;
  const failedEmphasis = new Map<string, number>();
  const out: MarkdownInline[] = [];
  let buf = '';
  const flush = (): void => {
    pushText(out, buf);
    buf = '';
  };
  let i = 0;
  while (i < s.length) {
    const c = s[i] as string;
    if (c === '\\' && i + 1 < s.length && PUNCT.test(s[i + 1] as string)) {
      buf += s[i + 1];
      i += 2;
      continue;
    }
    if (c === '`') {
      let n = 1;
      while (s[i + n] === '`') n++;
      const run = '`'.repeat(n);
      let j = s.indexOf(run, i + n);
      while (j >= 0 && (s[j + n] === '`' || s[j - 1] === '`')) j = s.indexOf(run, j + 1);
      if (j > 0 && j - i < SEARCH_WINDOW * 5) {
        flush();
        let code = s.slice(i + n, j);
        if (code.length > 2 && code.startsWith(' ') && code.endsWith(' '))
          code = code.slice(1, -1);
        out.push({ type: 'code', text: code });
        i = j + n;
        continue;
      }
      buf += run;
      i += n;
      continue;
    }
    const isImage = c === '!' && s[i + 1] === '[';
    if ((c === '[' || isImage) && depth < MAX_INLINE_DEPTH) {
      const open = isImage ? i + 1 : i;
      brackets ??= matchBrackets(s);
      const close = brackets.get(open) ?? -1;
      if (close > 0 && s[close + 1] === '(') {
        const dest = readDestination(s, close + 1);
        if (dest) {
          const label = s.slice(open + 1, close);
          flush();
          if (isImage) {
            // Imagem não é renderizada: só o texto alternativo, em texto simples.
            pushText(out, inlinesToText(parseInlineChunk(label, depth + 1)));
          } else {
            const children = parseInlineChunk(label, depth + 1);
            const kind = linkKind(dest.href);
            if (kind && children.length > 0) {
              out.push({ type: 'link', href: dest.href, kind, children });
            } else {
              pushAll(out, children);
            }
          }
          i = dest.end;
          continue;
        }
      }
    }
    if ((c === '*' || c === '_') && depth < MAX_INLINE_DEPTH) {
      const delim = s[i + 1] === c ? c + c : c;
      const after = s[i + delim.length];
      const before = s[i - 1];
      const canOpen = !isWs(after) && (c === '*' || !isAlnum(before));
      if (canOpen) {
        const close = findEmphasisClose(s, i + delim.length, delim, failedEmphasis);
        if (close > 0) {
          flush();
          const children = parseInlineChunk(s.slice(i + delim.length, close), depth + 1);
          out.push({ type: delim.length === 2 ? 'strong' : 'em', children });
          i = close + delim.length;
          continue;
        }
      }
      buf += delim;
      i += delim.length;
      continue;
    }
    buf += c;
    i++;
  }
  flush();
  return out;
}

export function parseInlines(source: string): MarkdownInline[] {
  if (source.length <= MAX_INLINE_CHUNK) return parseInlineChunk(source, 0);
  const out: MarkdownInline[] = [];
  for (let i = 0; i < source.length; i += MAX_INLINE_CHUNK) {
    pushAll(out, parseInlineChunk(source.slice(i, i + MAX_INLINE_CHUNK), 0));
  }
  return out;
}

// ----------------------------------------------------------------- blocos

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const LIST_ITEM = /^([ \t]*)([-*+]|\d{1,9}[.)])[ \t]+(.*)$/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const TABLE_SEP_CELL = /^:?-+:?$/;

function expandTabs(line: string): string {
  return line.includes('\t') ? line.replace(/\t/g, '    ') : line;
}

function splitCells(line: string): string[] {
  let body = line.trim();
  if (body.startsWith('|')) body = body.slice(1);
  if (body.endsWith('|') && !body.endsWith('\\|')) body = body.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i] as string;
    if (c === '\\' && body[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (c === '|') {
      cells.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

function tableSeparator(line: string | undefined): MarkdownAlign[] | null {
  if (line === undefined || !line.includes('-')) return null;
  const cells = splitCells(line);
  const align: MarkdownAlign[] = [];
  for (const cell of cells) {
    if (!TABLE_SEP_CELL.test(cell)) return null;
    const l = cell.startsWith(':');
    const r = cell.endsWith(':');
    align.push(l && r ? 'center' : r ? 'right' : l ? 'left' : null);
  }
  return align;
}

function startsTable(lines: readonly string[], i: number): boolean {
  const line = lines[i] as string;
  if (!line.includes('|')) return false;
  const align = tableSeparator(lines[i + 1]);
  return align !== null && align.length === splitCells(line).length;
}

function startsBlock(lines: readonly string[], i: number): boolean {
  const line = lines[i] as string;
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    LIST_ITEM.test(line) ||
    startsTable(lines, i)
  );
}

interface ItemBuilder {
  text: string;
  readonly children: ListBuilder[];
}
interface ListBuilder {
  readonly ordered: boolean;
  readonly items: ItemBuilder[];
}

/** Consome uma lista a partir de `start`; devolve o bloco e a próxima linha. */
function parseList(lines: readonly string[], start: number): [MarkdownBlock[], number] {
  const roots: ListBuilder[] = [];
  const stack: { indent: number; list: ListBuilder }[] = [];
  const newList = (ordered: boolean): ListBuilder => ({ ordered, items: [] });
  let i = start;
  let lastItem: ItemBuilder | null = null;
  while (i < lines.length) {
    const line = lines[i] as string;
    if (line.trim() === '') {
      let k = i;
      while (k < lines.length && (lines[k] as string).trim() === '') k++;
      const next = lines[k];
      if (next !== undefined && (LIST_ITEM.test(next) || /^ {2,}\S/.test(next))) {
        i = k;
        continue;
      }
      break;
    }
    const m = LIST_ITEM.exec(line);
    if (!m) {
      if (!lastItem || FENCE.test(line) || HEADING.test(line)) break;
      if (!/^\s/.test(line) && startsBlock(lines, i)) break;
      lastItem.text += ' ' + line.trim();
      i++;
      continue;
    }
    const indent = (m[1] as string).length;
    const ordered = /\d/.test(m[2] as string);
    while (
      stack.length > 0 &&
      indent < (stack[stack.length - 1] as { indent: number }).indent
    ) {
      stack.pop();
    }
    const top = stack[stack.length - 1];
    let target: ListBuilder;
    if (!top) {
      target = newList(ordered);
      roots.push(target);
      stack.push({ indent, list: target });
    } else if (indent > top.indent && stack.length < MAX_LIST_DEPTH) {
      const parent = top.list.items[top.list.items.length - 1] as ItemBuilder;
      target = newList(ordered);
      stack.push({ indent, list: target });
      parent.children.push(target);
    } else if (top.list.ordered !== ordered) {
      // Troca de tipo de marcador no mesmo nível: nova lista irmã.
      target = newList(ordered);
      stack.pop();
      const parentTop = stack[stack.length - 1];
      if (parentTop) {
        (
          parentTop.list.items[parentTop.list.items.length - 1] as ItemBuilder
        ).children.push(target);
      } else roots.push(target);
      stack.push({ indent, list: target });
    } else {
      target = top.list;
    }
    const item: ItemBuilder = { text: (m[3] as string).trim(), children: [] };
    target.items.push(item);
    lastItem = item;
    i++;
  }
  const blocks: MarkdownBlock[] = [];
  for (const root of roots) blocks.push(finishList(root));
  return [blocks, i];
}

function finishList(list: ListBuilder): MarkdownBlock {
  return {
    type: 'list',
    ordered: list.ordered,
    items: list.items.map((it) => ({
      inlines: parseInlines(it.text),
      children: it.children.map(finishList),
    })),
  };
}

export function parseMarkdown(text: string): MarkdownBlock[] {
  try {
    return parseBlocks(String(text));
  } catch {
    return [
      {
        type: 'paragraph',
        inlines: [{ type: 'text', text: String(text).slice(0, 10000) }],
      },
    ];
  }
}

function parseBlocks(text: string): MarkdownBlock[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map(expandTabs);
  const blocks: MarkdownBlock[] = [];
  const used = new Set<string>();
  const counts = new Map<string, number>();
  const uniqueId = (base: string): string => {
    let id = base;
    let n = counts.get(base) ?? 0;
    if (n > 0 || used.has(id)) {
      do {
        n++;
        id = `${base}-${n}`;
      } while (used.has(id));
    }
    counts.set(base, n);
    used.add(id);
    return id;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] as string;
    if (line.trim() === '') {
      i++;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1] as string;
      const body: string[] = [];
      i++;
      while (i < lines.length) {
        const l = lines[i] as string;
        const t = l.trim();
        if (t.startsWith(marker) && /^(.)\1*$/.test(t) && t[0] === marker[0]) {
          i++;
          break;
        }
        body.push(l);
        i++;
      }
      blocks.push({ type: 'code', lang: fence[2] as string, text: body.join('\n') });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      const inlines = parseInlines(heading[2] as string);
      blocks.push({
        type: 'heading',
        level: (heading[1] as string).length as 1 | 2 | 3 | 4 | 5 | 6,
        inlines,
        id: uniqueId(slugifyHeading(inlinesToText(inlines))),
      });
      i++;
      continue;
    }
    if (RULE.test(line)) {
      i++; // linha horizontal: fora do subconjunto, descartada
      continue;
    }
    if (startsTable(lines, i)) {
      const header = splitCells(line);
      const align = tableSeparator(lines[i + 1]) as MarkdownAlign[];
      const rows: MarkdownInline[][][] = [];
      i += 2;
      while (i < lines.length) {
        const l = lines[i] as string;
        if (l.trim() === '' || !l.includes('|')) break;
        const cells = splitCells(l);
        rows.push(align.map((_, c) => parseInlines(cells[c] ?? '')));
        i++;
      }
      blocks.push({
        type: 'table',
        header: header.map((h) => parseInlines(h)),
        align,
        rows,
      });
      continue;
    }
    if (LIST_ITEM.test(line)) {
      const [listBlocks, next] = parseList(lines, i);
      blocks.push(...listBlocks);
      i = next;
      continue;
    }
    const para: string[] = [line.trim()];
    i++;
    while (
      i < lines.length &&
      (lines[i] as string).trim() !== '' &&
      !startsBlock(lines, i)
    ) {
      para.push((lines[i] as string).trim());
      i++;
    }
    blocks.push({ type: 'paragraph', inlines: parseInlines(para.join(' ')) });
  }
  return blocks;
}
