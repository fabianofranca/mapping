import { REF_SCHEME, normalizeId, refImageLabel, shortCodesFor } from './itemRef';
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
import type { Thread, ThreadMessage } from './thread';
import { threadSubject } from './threadView';
import type { Annotation, JsonValue, Project } from './types';

// Thread citations (Comments stage, decisions 28, 29 and 33). A citation is a plain markdown
// link, `[<label>](mapping://<project>/<letter>/<code>…)`, with no new syntax. Here:
// extract the links from a text, escape the label, resolve the code IN THE THREAD'S PROJECT (the
// `<project>` in the URL is ignored), the live label (the target's current name) and the backlinks
// ("Cited in"). Pure: everything arrives by argument (project, threads, proposals), nothing is global.

// ------------------------------------------------------------------ extract

/** A `mapping://` link in the text of a message. */
export interface Citation {
  /** The label between brackets, unescaped (the chip's fallback). */
  readonly label: string;
  /** The link's destination, as written. */
  readonly url: string;
  /** The reference read by the strict grammar; `null` = the link does not close the grammar (broken). */
  readonly ref: ParsedAnyRef | null;
}

/**
 * Library link (`mapping://<typeId>` and `mapping://<specId>/<typeId>`): at most two
 * segments after the scheme. Not a citation (the reference grammar requires at least
 * `<project>/<letter>/<code>`).
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
 * The `mapping://` links in the text, in the order they appear. Uses the same markdown reader
 * that draws the message, so whatever the screen shows as a link counts (a link in code does not).
 * Ignores plain links (`https://`, `#anchor`) and the library ones. A `mapping://` link that does not
 * close the strict grammar comes back with `ref: null` (broken citation).
 */
export function extractCitations(text: string): Citation[] {
  const out: Citation[] = [];
  collectBlocks(parseMarkdown(text, { lineBreaks: true }), out);
  return out;
}

// ------------------------------------------------------------------ write

/** Escapes `[`, `]`, `\`, `*`, `_` and backtick of the label: it fits between the brackets and rereads the same. */
export function escapeCitationLabel(label: string): string {
  return label.replace(/[\\[\]*_`]/g, (c) => `\\${c}`);
}

/**
 * `[<escaped label>](<url>)`: the citation as the app writes it in the text. The label cannot be
 * empty (`[](url)` is not a link in markdown): whoever has no name uses a neutral text.
 */
export function formatCitation(label: string, url: string): string {
  return `[${escapeCitationLabel(label)}](${url})`;
}

// ------------------------------------------------------------------ resolve

type IdTarget<K extends string> = { readonly kind: K; readonly id: string };

/**
 * What a citation points to: the anchor forms (except the loose point, which nobody cites), plus the
 * thread and the proposal. The `id` is always the full id, never the short code. Compatible with
 * `ThreadAnchor` in the forms that both have.
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
       * `missing`: the code does not exist (or the field, pair or row does not exist in the annotation);
       * `ambiguous`: the short code serves more than one target; `invalid`: the link does not even close the
       * grammar (`ref` null).
       */
      readonly reason: 'missing' | 'ambiguous' | 'invalid';
    };

/** Proposal as the citation needs it: the id (for the code) and the title (for the label). */
export interface CitationProposal {
  readonly id: string;
  readonly title: string;
}

/** Everything the resolution needs. The lists include open and resolved threads. */
export interface CitationContext {
  /** The thread's project: the `<project>` in the URL is ignored. */
  readonly project: Project;
  readonly threads: readonly Thread[];
  readonly proposals: readonly CitationProposal[];
  /**
   * Subject of the thread (`threadSubject`, decision 17). Without it, the first line of the
   * first message counts, cut at 80 characters.
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
 * Matches a code against a list of ids, like `matchShortCode`: the id whose normalized form is
 * exactly the code wins; failing that, all those that start with the code. It builds the
 * sort once and queries by binary search.
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

/** Memoizes per list (threads and proposals arrive as the same list on each query). */
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

const proposalByShortCode = memoByList<
  { readonly id: string },
  ReadonlyMap<string, string>
>((list) => {
  const byCode = new Map<string, string>();
  for (const [id, code] of shortCodesFor(list.map((x) => x.id))) byCode.set(code, id);
  return byCode;
});

function proposalIdsFor(
  proposals: readonly { readonly id: string }[],
  code: string,
): readonly string[] {
  if (listById(proposals).has(code)) return [code];
  const id = proposalByShortCode(proposals).get(code);
  return id === undefined ? [] : [id];
}

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

/** Only one id matched: builds the target (which may not exist yet: `null`); otherwise, the reason. */
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
    // Exact id or the short code the MCP emits (`shortCodesFor`, 8 hex): never a free prefix
    // (decision 11), otherwise a deleted `p/botoes` would fall into `botoes-2`.
    single(proposalIdsFor(ctx.proposals, code), (id) => ({
      kind: 'proposal',
      id,
    })),
};

/** The field exists in the annotation: the type declares it or, without a type, there is a value with that key. */
function hasField(p: Project, a: Annotation, key: string): boolean {
  if (a.values === null) return false;
  const type = typeOfAnnotation(p, a)?.type;
  return type ? fieldOf(type, key) !== null : Object.hasOwn(a.values, key);
}

/** The field `key` is a `table` (by the type or, without a type, by the value). */
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
 * Resolves the reference in the thread's project (the `<project>` in the URL has already been dropped by whoever
 * read it). Short code without a target, ambiguous, or a field/pair/row the annotation does not have: missing target.
 */
export function resolveCitation(ctx: CitationContext, ref: AnyRef): CitationResolution {
  if (ref.type === 'item') return ITEM_RESOLVERS[ref.kind](ctx, ref.code);
  return resolveSub(ctx, ref);
}

/** Stable key of a target, to compare and deduplicate. */
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

// ------------------------------------------------------------------ live label

/** The default subject is that of `threadSubject` (without markdown, cut at a code point). */
function defaultSubject(thread: Thread): string {
  return threadSubject(thread);
}

/** `undefined`: the target no longer exists (the resolution went stale). `null`: it exists, without a name. */
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

/** Text of the `rowLabel` column; without it, the row's position (1, 2…), as in `refLabel`. */
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

/** The text the chip shows. */
export interface LiveLabel {
  /**
   * The target's current name. `null`: the target exists but has no name (marking, arrow or
   * container without a name…); the interface shows the translated text. Broken: the fallback label.
   */
  readonly label: string | null;
  /** The target no longer exists (or the link never closed): the chip is struck through. */
  readonly broken: boolean;
}

/**
 * Live label of the resolved target (decision 29): marking, container, arrow and annotation show the
 * name; field, the `label`; pair, the `key`; row, the `rowLabel` column; layer, the name; thread,
 * the subject; proposal, the title. Broken citation: `fallback` (the link's label), `broken`.
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

/** An extracted citation, already resolved and with the live label. */
export interface LiveCitation extends LiveLabel {
  readonly citation: Citation;
  readonly resolution: CitationResolution;
}

/** Resolves the citation (`ref` null: `invalid`) and computes the live label. */
export function liveCitation(ctx: CitationContext, citation: Citation): LiveCitation {
  const resolution: CitationResolution = citation.ref
    ? resolveCitation(ctx, citation.ref.ref)
    : { found: false, reason: 'invalid' };
  return { citation, resolution, ...liveLabel(ctx, resolution, citation.label) };
}

// ------------------------------------------------------------------ targets and backlinks

const CITATIONS_OF_MESSAGE = new WeakMap<ThreadMessage, readonly Citation[]>();

/** The message's citations, read once (the message is immutable and passes from revision to revision). */
function messageCitations(message: ThreadMessage): readonly Citation[] {
  let found = CITATIONS_OF_MESSAGE.get(message);
  if (!found) {
    found = extractCitations(message.text);
    CITATIONS_OF_MESSAGE.set(message, found);
  }
  return found;
}

/**
 * Targets that the thread cites (the citations that resolve), without repeats, in text order, from the
 * oldest messages to the newest. Serves the "cites the selection" filter.
 */
export function citedTargets(thread: Thread, ctx: CitationContext): CitationTarget[] {
  const seen = new Set<string>();
  const targets: CitationTarget[] = [];
  for (const message of thread.messages) {
    for (const citation of messageCitations(message)) {
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

/** Ids of the threads that the message cites (`c/<code>` that resolves to a single thread). */
function citedThreadIds(thread: Thread, match: CodeMatcher): Set<string> {
  const ids = new Set<string>();
  for (const message of thread.messages) {
    for (const citation of messageCitations(message)) {
      const ref = citation.ref?.ref;
      if (ref?.type !== 'item' || ref.kind !== 'c') continue;
      const matches = match(ref.code);
      if (matches.length === 1) ids.add(matches[0] as string);
    }
  }
  return ids;
}

/**
 * "Cited in" (decision 33): for each thread cited by another, the ids of the threads that
 * cite it, in list order. Considers open and resolved ones, ignores self-citation and does not
 * repeat. Only the cited threads have an entry in the map.
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
      if (list) list.push(thread.id);
      else result.set(cited, [thread.id]);
    }
  }
  return result;
}
