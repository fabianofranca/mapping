import {
  liveLabel,
  type CitationContext,
  type CitationTarget,
  type CitationTargetKind,
} from './citations';
import { refImageLabel, shortCodes, shortCodesFor } from './itemRef';
import {
  formatAnyRef,
  layerShortCodes,
  parseAnyRef,
  threadShortCodes,
  type AnyRef,
  type AnyRefKind,
  type SubRef,
} from './refGrammar';
import { projectIndex } from './projectIndex';
import { tableRows } from './refs';
import type { Thread, ThreadAnchor } from './thread';
import { typeOfAnnotation } from './specLookup';
import { annotationTitle } from './typedDisplay';
import type { Annotation, Project } from './types';
import { fold } from './fold';

// Citation targets for the interface (Comments stage, decisions 30 and 31): the URL of a target,
// the label the chip stores and the `@` search in the composer. Pure: everything comes by argument.

// ------------------------------------------------------------------ URL

/** Proposal code in the URL: the whole id (the grammar accepts letters, digits, `.`, `_`, `-`). */
const PROPOSAL_CODE = /^[0-9a-zA-Z._-]+$/;

const threadCodeCache = new WeakMap<readonly Thread[], ReadonlyMap<string, string>>();

/** Short code of each thread, unique among ALL (open and resolved); memoized per list. */
function threadCodes(threads: readonly Thread[]): ReadonlyMap<string, string> {
  const cached = threadCodeCache.get(threads);
  if (cached) return cached;
  const codes = threadShortCodes(threads.map((t) => t.id));
  threadCodeCache.set(threads, codes);
  return codes;
}

type IdKind = Exclude<CitationTargetKind, 'field' | 'entry' | 'row'>;

interface IdRef {
  readonly letter: AnyRefKind;
  readonly code: (
    p: Project,
    threads: readonly Thread[],
    id: string,
  ) => string | undefined;
}

const ID_REFS: Readonly<Record<IdKind, IdRef>> = {
  marking: { letter: 'm', code: (p, _t, id) => shortCodes(p, 'm').get(id) },
  arrow: { letter: 'm', code: (p, _t, id) => shortCodes(p, 'm').get(id) },
  container: { letter: 'i', code: (p, _t, id) => shortCodes(p, 'i').get(id) },
  annotation: { letter: 'a', code: (p, _t, id) => shortCodes(p, 'a').get(id) },
  layer: { letter: 'l', code: (p, _t, id) => layerShortCodes(p).get(id) },
  thread: { letter: 'c', code: (_p, threads, id) => threadCodes(threads).get(id) },
  proposal: {
    letter: 'p',
    code: (_p, _t, id) => (PROPOSAL_CODE.test(id) ? id : undefined),
  },
};

type PartTarget = Extract<CitationTarget, { kind: 'field' | 'entry' | 'row' }>;

/** Code of the pair or row among the annotation's siblings. */
function siblingCode(ids: readonly string[], id: string): string | undefined {
  return shortCodesFor(ids).get(id);
}

function subRefOf(p: Project, target: PartTarget): SubRef | null {
  const annotation = projectIndex(p).annotations.get(target.annotationId);
  const code = shortCodes(p, 'a').get(target.annotationId);
  if (!annotation || code === undefined) return null;
  if (target.kind === 'field')
    return { type: 'field', annotation: code, key: target.key };
  if (target.kind === 'entry') {
    const entry = siblingCode(
      annotation.entries.map((e) => e.id),
      target.entryId,
    );
    return entry === undefined ? null : { type: 'entry', annotation: code, entry };
  }
  const rowIds = tableRows(annotation.values?.[target.key]).map((r) => r._id);
  const row = siblingCode(rowIds, target.rowId);
  return row === undefined
    ? null
    : { type: 'row', annotation: code, key: target.key, row };
}

function refOfTarget(
  p: Project,
  threads: readonly Thread[],
  target: CitationTarget,
): AnyRef | null {
  if (target.kind === 'field' || target.kind === 'entry' || target.kind === 'row') {
    return subRefOf(p, target);
  }
  const spec = ID_REFS[target.kind];
  const code = spec.code(p, threads, target.id);
  return code === undefined ? null : { type: 'item', kind: spec.letter, code };
}

/**
 * `mapping://<project>/…` of the target, with the short code of each part (marking, container,
 * annotation, arrow, layer and thread by the codes unique among all of the kind; proposal by id;
 * field `…/a/<code>/f/<key>`; pair `…/e/<code>` and row `…/r/<code>` among the siblings). `null`
 * if the target does not exist in the project (or the code does not fit the grammar). Resolving
 * the URL returns the same target.
 */
export function citationUrl(
  projectName: string,
  project: Project,
  threads: readonly Thread[],
  target: CitationTarget,
): string | null {
  const ref = refOfTarget(project, threads, target);
  if (!ref) return null;
  const url = formatAnyRef(projectName, ref);
  return parseAnyRef(url) ? url : null;
}

// ------------------------------------------------------------------ label

/**
 * The label the chip stores: the target's current name; without a name (or a target that does not
 * exist), the neutral text `unnamed`, which the interface translates.
 */
export function citationLabel(
  ctx: CitationContext,
  target: CitationTarget,
  unnamed: string,
): string {
  const { label } = liveLabel(ctx, { found: true, target }, unnamed);
  return label === null || label === '' ? unnamed : label;
}

// ------------------------------------------------------------------ @ search

export type CiteGroup =
  'here' | 'marking' | 'container' | 'arrow' | 'annotation' | 'layer' | 'thread';

export interface CiteCandidate {
  readonly target: CitationTarget;
  /** What the chip stores (`citationLabel`). */
  readonly label: string;
  readonly group: CiteGroup;
  /** The short path, e.g.: "Button · Buy › variant". */
  readonly detail: string;
}

export interface CiteOptions {
  /** Neutral text for what has no name (translated by the interface). */
  readonly unnamed: string;
  /** Maximum number of candidates (default 30). */
  readonly limit?: number;
  /** Path separator (default " › "). */
  readonly separator?: string;
  /** The thread itself is not offered for citing. */
  readonly excludeThreadId?: string;
}

const DEFAULT_LIMIT = 30;
const DEFAULT_SEPARATOR = ' › ';

interface Env {
  readonly ctx: CitationContext;
  readonly unnamed: string;
  readonly separator: string;
  readonly excludeThreadId: string | undefined;
}

function join(env: Env, parts: readonly string[]): string {
  return parts.filter((part) => part !== '').join(env.separator);
}

function labelOf(env: Env, target: CitationTarget): string {
  return citationLabel(env.ctx, target, env.unnamed);
}

function namedOrEmpty(name: string | null | undefined): string {
  return name ?? '';
}

/** Container (if it has a name or file), named parent markings and, finally, the marking itself. */
function markingPath(env: Env, id: string): string {
  const idx = projectIndex(env.ctx.project);
  const own = idx.markings.get(id);
  if (!own) return '';
  const names: string[] = [labelOf(env, { kind: 'marking', id })];
  let parent = own.parentId === null ? undefined : idx.markings.get(own.parentId);
  for (let guard = idx.markings.size; parent && guard > 0; guard--) {
    names.unshift(namedOrEmpty(parent.name));
    parent = parent.parentId === null ? undefined : idx.markings.get(parent.parentId);
  }
  const container =
    own.containerId === null ? undefined : idx.containers.get(own.containerId);
  if (container) names.unshift(namedOrEmpty(refImageLabel(container)));
  return join(env, names);
}

function markingName(env: Env, id: string): string {
  const idx = projectIndex(env.ctx.project);
  const item = idx.markings.get(id) ?? idx.arrows.get(id);
  return item?.name ? item.name : env.unnamed;
}

function annotationText(env: Env, a: Annotation): string {
  return annotationTitle(env.ctx.project, a) ?? env.unnamed;
}

function annotationPath(env: Env, a: Annotation): string {
  const idx = projectIndex(env.ctx.project);
  const host = idx.markings.get(a.markingId) ?? idx.arrows.get(a.markingId);
  return join(env, [
    namedOrEmpty(host?.name),
    labelOf(env, { kind: 'annotation', id: a.id }),
  ]);
}

function partPath(env: Env, target: PartTarget): string {
  const a = projectIndex(env.ctx.project).annotations.get(target.annotationId);
  if (!a) return '';
  const parts = [annotationText(env, a)];
  if (target.kind === 'row') {
    parts.push(labelOf(env, { kind: 'field', annotationId: a.id, key: target.key }));
  }
  return join(env, [...parts, labelOf(env, target)]);
}

function arrowEnds(env: Env, id: string): string {
  const arrow = projectIndex(env.ctx.project).arrows.get(id);
  return arrow
    ? join(env, [markingName(env, arrow.from), markingName(env, arrow.to)])
    : '';
}

/** The target's short path (where it lives); empty when the name is enough. */
function detailOf(env: Env, target: CitationTarget): string {
  switch (target.kind) {
    case 'marking':
      return markingPath(env, target.id);
    case 'arrow':
      return arrowEnds(env, target.id);
    case 'annotation': {
      const a = projectIndex(env.ctx.project).annotations.get(target.id);
      return a ? annotationPath(env, a) : '';
    }
    case 'field':
    case 'entry':
    case 'row':
      return partPath(env, target);
    default:
      return '';
  }
}

function candidate(env: Env, target: CitationTarget, group: CiteGroup): CiteCandidate {
  return { target, label: labelOf(env, target), group, detail: detailOf(env, target) };
}

// ---- "here" group: fields, pairs and rows of the annotations of the thread's item

function annotationById(env: Env, id: string): readonly Annotation[] {
  const a = projectIndex(env.ctx.project).annotations.get(id);
  return a ? [a] : [];
}

function hostAnnotations(env: Env, here: ThreadAnchor | null): readonly Annotation[] {
  if (here === null) return [];
  switch (here.kind) {
    case 'marking':
    case 'arrow':
      return projectIndex(env.ctx.project).annotationsByMarking.get(here.id) ?? [];
    case 'annotation':
      return annotationById(env, here.id);
    case 'field':
    case 'entry':
    case 'row':
      return annotationById(env, here.annotationId);
    default:
      return [];
  }
}

function fieldKeys(env: Env, a: Annotation): readonly string[] {
  const type = typeOfAnnotation(env.ctx.project, a)?.type;
  if (type) return type.fields.map((f) => f.key);
  return a.values === null ? [] : Object.keys(a.values);
}

function* typedParts(env: Env, a: Annotation): Iterable<CiteCandidate> {
  for (const key of fieldKeys(env, a)) {
    yield candidate(env, { kind: 'field', annotationId: a.id, key }, 'here');
    for (const row of tableRows(a.values?.[key])) {
      const target: CitationTarget = {
        kind: 'row',
        annotationId: a.id,
        key,
        rowId: row._id,
      };
      yield candidate(env, target, 'here');
    }
  }
}

function* annotationParts(env: Env, a: Annotation): Iterable<CiteCandidate> {
  if (a.type !== null) {
    yield* typedParts(env, a);
    return;
  }
  for (const e of a.entries) {
    yield candidate(env, { kind: 'entry', annotationId: a.id, entryId: e.id }, 'here');
  }
}

function* hereCandidates(env: Env, here: ThreadAnchor | null): Iterable<CiteCandidate> {
  for (const a of hostAnnotations(env, here)) yield* annotationParts(env, a);
}

// ---- other groups

function* threadCandidates(env: Env): Iterable<CiteCandidate> {
  for (const t of env.ctx.threads) {
    if (t.resolved !== null || t.id === env.excludeThreadId) continue;
    const target: CitationTarget = { kind: 'thread', id: t.id };
    const anchor = t.anchor.kind === 'point' ? null : t.anchor;
    yield {
      target,
      label: labelOf(env, target),
      group: 'thread',
      detail: anchor ? detailOf(env, anchor) : '',
    };
  }
}

function* simpleGroup(
  env: Env,
  group: CiteGroup,
  kind: 'marking' | 'container' | 'arrow' | 'annotation' | 'layer',
  ids: readonly { readonly id: string }[],
): Iterable<CiteCandidate> {
  for (const item of ids) yield candidate(env, { kind, id: item.id }, group);
}

/** Candidates on demand: whoever consumes stops when it has enough, without building the rest. */
type GroupBuilder = (env: Env, here: ThreadAnchor | null) => Iterable<CiteCandidate>;

/** In `@` order: the thread item's, markings, containers, arrows, annotations, layers, threads. */
const GROUPS: readonly GroupBuilder[] = [
  hereCandidates,
  (env) => simpleGroup(env, 'marking', 'marking', env.ctx.project.markings),
  (env) => simpleGroup(env, 'container', 'container', env.ctx.project.containers),
  (env) => simpleGroup(env, 'arrow', 'arrow', env.ctx.project.arrows),
  (env) => simpleGroup(env, 'annotation', 'annotation', env.ctx.project.annotations),
  (env) => simpleGroup(env, 'layer', 'layer', env.ctx.project.layers),
  threadCandidates,
];

// ---- matching

/** 0: all words in the name; 1: in the name or the path; `null`: no match. */
function score(words: readonly string[], c: CiteCandidate): 0 | 1 | null {
  if (words.length === 0) return 0;
  const name = fold(c.label);
  if (words.every((w) => name.includes(w))) return 0;
  const full = fold(`${c.label} ${c.detail}`);
  return words.every((w) => full.includes(w)) ? 1 : null;
}

/**
 * Up to `room` of those that match, matching by name before by path (stable within each one).
 * Stops building candidates as soon as those that match by name fill the room.
 */
function matching(
  words: readonly string[],
  list: Iterable<CiteCandidate>,
  room: number,
): CiteCandidate[] {
  const byName: CiteCandidate[] = [];
  const byPath: CiteCandidate[] = [];
  for (const c of list) {
    const s = score(words, c);
    if (s === 0) byName.push(c);
    else if (s === 1) byPath.push(c);
    if (byName.length >= room) break;
  }
  return [...byName, ...byPath].slice(0, room);
}

/**
 * The `@` search (decision 31): first the fields, pairs and rows of the annotations of the
 * thread's item (`here`, its anchor), then markings, containers, arrows, annotations, layers and
 * open threads. Matches by name (and, second, by path) regardless of case and accents; an empty
 * query returns everything in the same order, up to the limit.
 */
export function citeCandidates(
  ctx: CitationContext,
  query: string,
  here: ThreadAnchor | null,
  options: CiteOptions,
): CiteCandidate[] {
  const env: Env = {
    ctx,
    unnamed: options.unnamed,
    separator: options.separator ?? DEFAULT_SEPARATOR,
    excludeThreadId: options.excludeThreadId,
  };
  const limit = options.limit ?? DEFAULT_LIMIT;
  const words = fold(query).split(/\s+/).filter(Boolean);
  const out: CiteCandidate[] = [];
  for (const build of GROUPS) {
    if (out.length >= limit) break;
    out.push(...matching(words, build(env, here), limit - out.length));
  }
  return out.slice(0, limit);
}
