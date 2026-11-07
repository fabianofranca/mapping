import { REF_SCHEME, normalizeId, refImageLabel } from './itemRef';
import {
  parseAnyRef,
  type AnyRef,
  type ItemAnyRef,
  type ParsedAnyRef,
} from './refGrammar';
import type { SubRef } from './refGrammar';
import { parseMarkdown, inlinesToText } from './markdown';
import type { MarkdownBlock, MarkdownInline } from './markdown';
import { memoByProject, projectIndex } from './projectIndex';
import { instanceLabel, tableRows } from './refs';
import { fieldOf, typeOfAnnotation } from './specLookup';
import { fieldLabel, typeName } from './typedDisplay';
import type { Thread } from './thread';
import type { Annotation, JsonValue, Project } from './types';

// Citações das conversas (etapa Comentários, decisões 28, 29 e 33). A citação é um link
// markdown comum, `[<rótulo>](mapping://<projeto>/<letra>/<código>…)`, sem sintaxe nova. Aqui:
// extrair os links de um texto, escapar o rótulo, resolver o código NO PROJETO DA CONVERSA (o
// `<projeto>` da URL é ignorado), o rótulo vivo (o nome de agora do alvo) e os backlinks
// ("Citada em"). Puro: tudo chega por argumento (projeto, conversas, propostas), nada é global.

// ------------------------------------------------------------------ extrair

/** Um link `mapping://` do texto de uma mensagem. */
export interface Citation {
  /** O rótulo entre colchetes, desescapado (a reserva do chip). */
  readonly label: string;
  /** O destino do link, como escrito. */
  readonly url: string;
  /** A referência lida pela gramática estrita; `null` = o link não fecha a gramática (quebrado). */
  readonly ref: ParsedAnyRef | null;
}

/**
 * Link da biblioteca (`mapping://<typeId>` e `mapping://<specId>/<typeId>`): no máximo dois
 * segmentos depois do esquema. Não é citação (a gramática das referências exige ao menos
 * `<projeto>/<letra>/<código>`).
 */
export function isLibraryLink(href: string): boolean {
  return href.slice(REF_SCHEME.length).split('/').length <= 2;
}

function collectInlines(inlines: readonly MarkdownInline[], out: Citation[]): void {
  for (const node of inlines) {
    if (node.type === 'link') {
      if (node.kind === 'mapping' && !isLibraryLink(node.href)) {
        out.push({
          label: inlinesToText(node.children),
          url: node.href,
          ref: parseAnyRef(node.href),
        });
      }
    } else if (node.type === 'strong' || node.type === 'em') {
      collectInlines(node.children, out);
    }
  }
}

function collectList(
  items: readonly {
    inlines: readonly MarkdownInline[];
    children: readonly MarkdownBlock[];
  }[],
  out: Citation[],
): void {
  for (const item of items) {
    collectInlines(item.inlines, out);
    collectBlocks(item.children, out);
  }
}

function collectTable(
  header: readonly (readonly MarkdownInline[])[],
  rows: readonly (readonly (readonly MarkdownInline[])[])[],
  out: Citation[],
): void {
  for (const cell of header) collectInlines(cell, out);
  for (const row of rows) for (const cell of row) collectInlines(cell, out);
}

function collectBlock(block: MarkdownBlock, out: Citation[]): void {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
      return collectInlines(block.inlines, out);
    case 'quote':
      return collectBlocks(block.children, out);
    case 'list':
      return collectList(block.items, out);
    case 'table':
      return collectTable(block.header, block.rows, out);
    case 'code':
      return;
  }
}

function collectBlocks(blocks: readonly MarkdownBlock[], out: Citation[]): void {
  for (const block of blocks) collectBlock(block, out);
}

/**
 * Os links `mapping://` do texto, na ordem em que aparecem. Usa o mesmo leitor de markdown
 * que desenha a mensagem, então vale o que a tela mostra como link (link em código não conta).
 * Ignora links comuns (`https://`, `#âncora`) e os da biblioteca. Um link `mapping://` que não
 * fecha a gramática estrita volta com `ref: null` (citação quebrada).
 */
export function extractCitations(text: string): Citation[] {
  const out: Citation[] = [];
  collectBlocks(parseMarkdown(text, { lineBreaks: true }), out);
  return out;
}

// ------------------------------------------------------------------ escrever

/** Escapa `[`, `]` e `\` do rótulo, para ele caber entre os colchetes do link. */
export function escapeCitationLabel(label: string): string {
  return label.replace(/[\\[\]]/g, (c) => `\\${c}`);
}

/**
 * `[<rótulo escapado>](<url>)`: a citação como a app a grava no texto. O rótulo não pode ser
 * vazio (`[](url)` não é link em markdown): quem não tem nome usa um texto neutro.
 */
export function formatCitation(label: string, url: string): string {
  return `[${escapeCitationLabel(label)}](${url})`;
}

// ------------------------------------------------------------------ resolver

type IdTarget<K extends string> = { readonly kind: K; readonly id: string };

/**
 * O que uma citação aponta: as formas de âncora (menos o ponto solto, que ninguém cita), mais a
 * conversa e a proposta. O `id` é sempre o id completo, nunca o código curto. Compatível com
 * `ThreadAnchor` nas formas que as duas têm.
 */
export type CitationTarget =
  | IdTarget<'marking'>
  | IdTarget<'container'>
  | IdTarget<'annotation'>
  | IdTarget<'arrow'>
  | IdTarget<'layer'>
  | IdTarget<'thread'>
  | IdTarget<'proposal'>
  | { readonly kind: 'field'; readonly annotationId: string; readonly key: string }
  | { readonly kind: 'entry'; readonly annotationId: string; readonly entryId: string }
  | {
      readonly kind: 'row';
      readonly annotationId: string;
      readonly key: string;
      readonly rowId: string;
    };

export type CitationTargetKind = CitationTarget['kind'];

export type CitationResolution =
  | { readonly found: true; readonly target: CitationTarget }
  | {
      readonly found: false;
      /**
       * `missing`: o código não existe (ou o campo, par ou linha não existe na anotação);
       * `ambiguous`: o código curto serve a mais de um alvo; `invalid`: o link nem fecha a
       * gramática (`ref` nulo).
       */
      readonly reason: 'missing' | 'ambiguous' | 'invalid';
    };

/** Proposta como a citação precisa dela: o id (para o código) e o título (para o rótulo). */
export interface CitationProposal {
  readonly id: string;
  readonly title: string;
}

/** Tudo de que a resolução precisa. As listas incluem as conversas abertas e as resolvidas. */
export interface CitationContext {
  /** O projeto da conversa: o `<projeto>` da URL é ignorado. */
  readonly project: Project;
  readonly threads: readonly Thread[];
  readonly proposals: readonly CitationProposal[];
  /**
   * Assunto da conversa (`threadSubject`, decisão 17). Sem ele, vale a primeira linha da
   * primeira mensagem, cortada em 80 caracteres.
   */
  readonly subjectOf?: (thread: Thread) => string;
}

type CodeMatcher = (code: string) => readonly string[];

function lowerBound(sorted: readonly string[], wanted: string): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((sorted[mid] as string) < wanted) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Casa um código com uma lista de ids, como `matchShortCode`: o id cujo normalizado é
 * exatamente o código vence; na falta dele, todos os que começam com o código. Monta a
 * ordenação uma vez e consulta por busca binária.
 */
function buildMatcher(ids: readonly string[]): CodeMatcher {
  const entries = [...new Set(ids)]
    .map((id) => ({ id, norm: normalizeId(id) }))
    .sort((a, b) => (a.norm < b.norm ? -1 : a.norm > b.norm ? 1 : 0));
  const norms = entries.map((e) => e.norm);
  return (code) => {
    const wanted = normalizeId(code);
    if (wanted === '') return [];
    const found: string[] = [];
    const exact: string[] = [];
    for (let i = lowerBound(norms, wanted); i < entries.length; i++) {
      const entry = entries[i] as { id: string; norm: string };
      if (!entry.norm.startsWith(wanted)) break;
      found.push(entry.id);
      if (entry.norm === wanted) exact.push(entry.id);
    }
    return exact.length > 0 ? exact : found;
  };
}

interface ProjectMatchers {
  readonly m: CodeMatcher;
  readonly i: CodeMatcher;
  readonly a: CodeMatcher;
  readonly l: CodeMatcher;
}

const projectMatchers = memoByProject((p): ProjectMatchers => ({
  m: buildMatcher([...p.markings, ...p.arrows].map((x) => x.id)),
  i: buildMatcher(p.containers.map((x) => x.id)),
  a: buildMatcher(p.annotations.map((x) => x.id)),
  l: buildMatcher(p.layers.map((x) => x.id)),
}));

/** Memoiza por lista (as conversas e as propostas chegam como a mesma lista a cada consulta). */
function memoByList<T extends { readonly id: string }, V>(
  build: (list: readonly T[]) => V,
): (list: readonly T[]) => V {
  const cache = new WeakMap<readonly T[], V>();
  return (list) => {
    const cached = cache.get(list);
    if (cached !== undefined) return cached;
    const value = build(list);
    cache.set(list, value);
    return value;
  };
}

const listMatcher = memoByList<{ readonly id: string }, CodeMatcher>((list) =>
  buildMatcher(list.map((x) => x.id)),
);

const listById = memoByList<{ readonly id: string }, ReadonlyMap<string, unknown>>(
  (list) => {
    const map = new Map<string, unknown>();
    for (const item of list) if (!map.has(item.id)) map.set(item.id, item);
    return map;
  },
);

function threadById(ctx: CitationContext, id: string): Thread | undefined {
  return listById(ctx.threads).get(id) as Thread | undefined;
}

function proposalById(ctx: CitationContext, id: string): CitationProposal | undefined {
  return listById(ctx.proposals).get(id) as CitationProposal | undefined;
}

type Found = { readonly found: true; readonly target: CitationTarget };

function foundOf(target: CitationTarget): Found {
  return { found: true, target };
}

/** Um só id casou: monta o alvo (que pode ainda não existir: `null`); senão, o motivo. */
function single(
  ids: readonly string[],
  build: (id: string) => CitationTarget | null,
): CitationResolution {
  if (ids.length === 0) return { found: false, reason: 'missing' };
  if (ids.length > 1) return { found: false, reason: 'ambiguous' };
  const target = build(ids[0] as string);
  return target ? foundOf(target) : { found: false, reason: 'missing' };
}

const ITEM_RESOLVERS: {
  readonly [K in ItemAnyRef['kind']]: (
    ctx: CitationContext,
    code: string,
  ) => CitationResolution;
} = {
  m: (ctx, code) =>
    single(projectMatchers(ctx.project).m(code), (id) =>
      projectIndex(ctx.project).arrows.has(id)
        ? { kind: 'arrow', id }
        : { kind: 'marking', id },
    ),
  i: (ctx, code) =>
    single(projectMatchers(ctx.project).i(code), (id) => ({ kind: 'container', id })),
  a: (ctx, code) =>
    single(projectMatchers(ctx.project).a(code), (id) => ({ kind: 'annotation', id })),
  l: (ctx, code) =>
    single(projectMatchers(ctx.project).l(code), (id) => ({ kind: 'layer', id })),
  c: (ctx, code) =>
    single(listMatcher(ctx.threads)(code), (id) => ({ kind: 'thread', id })),
  p: (ctx, code) =>
    single(listMatcher(ctx.proposals)(code), (id) => ({ kind: 'proposal', id })),
};

/** O campo existe na anotação: o tipo o declara ou, sem tipo, há valor com essa key. */
function hasField(p: Project, a: Annotation, key: string): boolean {
  if (a.values === null) return false;
  const type = typeOfAnnotation(p, a)?.type;
  return type ? fieldOf(type, key) !== null : key in a.values;
}

/** O campo `key` é uma `table` (pelo tipo ou, sem tipo, pelo valor). */
function isTableField(p: Project, a: Annotation, key: string): boolean {
  if (a.values === null) return false;
  const type = typeOfAnnotation(p, a)?.type;
  if (!type) return Array.isArray(a.values[key]);
  return fieldOf(type, key)?.type === 'table';
}

function resolveSubOf(p: Project, a: Annotation, ref: SubRef): CitationResolution {
  if (ref.type === 'entry') {
    if (a.type !== null) return { found: false, reason: 'missing' };
    const ids = buildMatcher(a.entries.map((e) => e.id))(ref.entry);
    return single(ids, (entryId) => ({ kind: 'entry', annotationId: a.id, entryId }));
  }
  if (!hasField(p, a, ref.key)) return { found: false, reason: 'missing' };
  if (ref.type === 'field') {
    return foundOf({ kind: 'field', annotationId: a.id, key: ref.key });
  }
  if (!isTableField(p, a, ref.key)) return { found: false, reason: 'missing' };
  const rows = tableRows(a.values?.[ref.key]);
  const ids = buildMatcher(rows.map((r) => r._id))(ref.row);
  return single(ids, (rowId) => ({
    kind: 'row',
    annotationId: a.id,
    key: ref.key,
    rowId,
  }));
}

function resolveSub(ctx: CitationContext, ref: SubRef): CitationResolution {
  const ids = projectMatchers(ctx.project).a(ref.annotation);
  if (ids.length > 1) return { found: false, reason: 'ambiguous' };
  const annotation = projectIndex(ctx.project).annotations.get(ids[0] ?? '');
  if (!annotation) return { found: false, reason: 'missing' };
  return resolveSubOf(ctx.project, annotation, ref);
}

/**
 * Resolve a referência no projeto da conversa (o `<projeto>` da URL já foi descartado por quem
 * leu). Código curto sem alvo, ambíguo, ou campo/par/linha que a anotação não tem: alvo ausente.
 */
export function resolveCitation(ctx: CitationContext, ref: AnyRef): CitationResolution {
  if (ref.type === 'item') return ITEM_RESOLVERS[ref.kind](ctx, ref.code);
  return resolveSub(ctx, ref);
}

/** Chave estável de um alvo, para comparar e deduplicar. */
export function citationTargetKey(target: CitationTarget): string {
  switch (target.kind) {
    case 'field':
      return `field\u0000${target.annotationId}\u0000${target.key}`;
    case 'entry':
      return `entry\u0000${target.annotationId}\u0000${target.entryId}`;
    case 'row':
      return `row\u0000${target.annotationId}\u0000${target.key}\u0000${target.rowId}`;
    default:
      return `${target.kind}\u0000${target.id}`;
  }
}

// ------------------------------------------------------------------ rótulo vivo

/** Quantos caracteres tem o assunto padrão (o de `threadSubject`). */
const DEFAULT_SUBJECT_MAX = 80;

function defaultSubject(thread: Thread): string {
  const first = thread.messages[0]?.text ?? '';
  const line = first.split('\n').find((l) => l.trim() !== '') ?? '';
  return line.trim().slice(0, DEFAULT_SUBJECT_MAX);
}

/** `undefined`: o alvo não existe mais (a resolução ficou velha). `null`: existe, sem nome. */
type Labeler<T extends CitationTarget> = (
  ctx: CitationContext,
  target: T,
) => string | null | undefined;

type TargetOf<K extends CitationTargetKind> = Extract<CitationTarget, { kind: K }>;

function nonEmpty(text: string | null): string | null {
  return text === null || text === '' ? null : text;
}

function annotationOf(ctx: CitationContext, id: string): Annotation | undefined {
  return projectIndex(ctx.project).annotations.get(id);
}

const labelField: Labeler<TargetOf<'field'>> = (ctx, t) => {
  const a = annotationOf(ctx, t.annotationId);
  if (!a || !hasField(ctx.project, a, t.key)) return undefined;
  const type = typeOfAnnotation(ctx.project, a)?.type;
  const field = type ? fieldOf(type, t.key) : null;
  return field ? fieldLabel(field) : t.key;
};

/** Texto da coluna do `rowLabel`; sem ele, a posição da linha (1, 2…), como em `refLabel`. */
function rowText(value: JsonValue | undefined, index: number): string {
  if (typeof value === 'string' && value !== '') return value;
  if (typeof value === 'number') return String(value);
  return `#${index + 1}`;
}

const labelRow: Labeler<TargetOf<'row'>> = (ctx, t) => {
  const a = annotationOf(ctx, t.annotationId);
  if (!a?.values) return undefined;
  const rows = tableRows(a.values[t.key]);
  const index = rows.findIndex((r) => r._id === t.rowId);
  const row = rows[index];
  if (!row) return undefined;
  const type = typeOfAnnotation(ctx.project, a)?.type;
  const field = type ? fieldOf(type, t.key) : null;
  const column = field?.type === 'table' ? field.rowLabel : undefined;
  return rowText(column ? row[column] : undefined, index);
};

const LABELERS: { readonly [K in CitationTargetKind]: Labeler<TargetOf<K>> } = {
  marking: (ctx, t) => {
    const marking = projectIndex(ctx.project).markings.get(t.id);
    return marking ? marking.name : undefined;
  },
  arrow: (ctx, t) => {
    const arrow = projectIndex(ctx.project).arrows.get(t.id);
    return arrow ? arrow.name : undefined;
  },
  container: (ctx, t) => {
    const container = projectIndex(ctx.project).containers.get(t.id);
    return container ? refImageLabel(container) : undefined;
  },
  annotation: (ctx, t) => {
    const a = annotationOf(ctx, t.id);
    if (!a) return undefined;
    return instanceLabel(ctx.project, a) ?? nonEmpty(typeName(ctx.project, a));
  },
  layer: (ctx, t) => projectIndex(ctx.project).layers.get(t.id)?.name,
  field: labelField,
  entry: (ctx, t) => {
    const entry = projectIndex(ctx.project).entries.get(t.annotationId)?.get(t.entryId);
    return entry ? nonEmpty(entry.key) : undefined;
  },
  row: labelRow,
  thread: (ctx, t) => {
    const thread = threadById(ctx, t.id);
    return thread ? (ctx.subjectOf ?? defaultSubject)(thread) : undefined;
  },
  proposal: (ctx, t) => proposalById(ctx, t.id)?.title,
};

/** O texto que o chip mostra. */
export interface LiveLabel {
  /**
   * O nome de agora do alvo. `null`: o alvo existe mas não tem nome (marcação, seta ou
   * container sem nome…); a interface mostra o texto traduzido. Quebrada: o rótulo de reserva.
   */
  readonly label: string | null;
  /** O alvo não existe mais (ou o link nunca fechou): o chip fica riscado. */
  readonly broken: boolean;
}

/**
 * Rótulo vivo do alvo resolvido (decisão 29): marcação, container, seta e anotação mostram o
 * nome; campo, o `label`; par, a `key`; linha, a coluna do `rowLabel`; camada, o nome; conversa,
 * o assunto; proposta, o título. Citação quebrada: `fallback` (o rótulo do link), `broken`.
 */
export function liveLabel(
  ctx: CitationContext,
  resolution: CitationResolution,
  fallback: string,
): LiveLabel {
  if (!resolution.found) return { label: fallback, broken: true };
  const target = resolution.target;
  const labeler = LABELERS[target.kind] as Labeler<CitationTarget>;
  const label = labeler(ctx, target);
  return label === undefined
    ? { label: fallback, broken: true }
    : { label, broken: false };
}

/** Uma citação extraída, já resolvida e com o rótulo vivo. */
export interface LiveCitation extends LiveLabel {
  readonly citation: Citation;
  readonly resolution: CitationResolution;
}

/** Resolve a citação (`ref` nulo: `invalid`) e calcula o rótulo vivo. */
export function liveCitation(ctx: CitationContext, citation: Citation): LiveCitation {
  const resolution: CitationResolution = citation.ref
    ? resolveCitation(ctx, citation.ref.ref)
    : { found: false, reason: 'invalid' };
  return { citation, resolution, ...liveLabel(ctx, resolution, citation.label) };
}

// ------------------------------------------------------------------ alvos e backlinks

/**
 * Alvos que a conversa cita (as citações que resolvem), sem repetir, na ordem do texto, das
 * mensagens mais antigas às mais novas. Serve ao filtro "cita a seleção".
 */
export function citedTargets(thread: Thread, ctx: CitationContext): CitationTarget[] {
  const seen = new Set<string>();
  const targets: CitationTarget[] = [];
  for (const message of thread.messages) {
    for (const citation of extractCitations(message.text)) {
      if (!citation.ref) continue;
      const resolution = resolveCitation(ctx, citation.ref.ref);
      if (!resolution.found) continue;
      const key = citationTargetKey(resolution.target);
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push(resolution.target);
    }
  }
  return targets;
}

/** Ids das conversas que a mensagem cita (`c/<código>` que resolve para uma só conversa). */
function citedThreadIds(thread: Thread, match: CodeMatcher): Set<string> {
  const ids = new Set<string>();
  for (const message of thread.messages) {
    for (const citation of extractCitations(message.text)) {
      const ref = citation.ref?.ref;
      if (ref?.type !== 'item' || ref.kind !== 'c') continue;
      const matches = match(ref.code);
      if (matches.length === 1) ids.add(matches[0] as string);
    }
  }
  return ids;
}

/**
 * "Citada em" (decisão 33): para cada conversa citada por outra, os ids das conversas que a
 * citam, na ordem da lista. Considera as abertas e as resolvidas, ignora a auto-citação e não
 * repete. Só as conversas citadas têm entrada no mapa.
 */
export function backlinks(
  threads: readonly Thread[],
): ReadonlyMap<string, readonly string[]> {
  const match = listMatcher(threads);
  const result = new Map<string, string[]>();
  for (const thread of threads) {
    for (const cited of citedThreadIds(thread, match)) {
      if (cited === thread.id) continue;
      const list = result.get(cited);
      if (!list) result.set(cited, [thread.id]);
      else if (!list.includes(thread.id)) list.push(thread.id);
    }
  }
  return result;
}
