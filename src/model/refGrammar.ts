import { REF_SCHEME, encodeRefSegment, normalizeId, shortCodesFor } from './itemRef';
import type { ItemKind } from './itemRef';
import { fail } from './errors';
import type { Project } from './types';

// Full grammar of the `mapping://` reference (comments stage, decision 27):
//
//   mapping://<project>/<m|i|a|p|l|c>/<code>              item, proposal, layer, thread
//   mapping://<project>/a/<code>/f/<field>                typed field (the key, encoded)
//   mapping://<project>/a/<code>/e/<code>                 entry of the free annotation
//   mapping://<project>/a/<code>/f/<field>/r/<code>       table row
//
// The letters and segments come after the code, never as a suffix. Reading is strict:
// any extra suffix, `?`, `#`, inner space, empty segment or unknown letter gives
// `null`. `parseRef`/`ParsedRef` (m|i|a) in `itemRef.ts` stay as they were; this is the
// additional API. The library document links (`mapping://<typeId>` and
// `mapping://<specId>/<typeId>`) have at most two segments and the new grammar requires the
// second to be a letter followed by a code: they are never confused.

/** Reference letters: those of `ItemKind` plus proposal (`p`), layer (`l`) and thread (`c`). */
export type AnyRefKind = ItemKind | 'p' | 'l' | 'c';

export const ANY_REF_KINDS: readonly AnyRefKind[] = ['m', 'i', 'a', 'p', 'l', 'c'];

export interface ItemAnyRef {
  readonly type: 'item';
  readonly kind: AnyRefKind;
  /**
   * `m`, `i`, `a`: normalized (no hyphens, lowercase), as in `parseRef`. `p`, `l`, `c`:
   * as received (proposal ids have dots and underscores); whoever compares uses `normalizeId`.
   */
  readonly code: string;
}

export interface FieldAnyRef {
  readonly type: 'field';
  /** Annotation code (normalized). */
  readonly annotation: string;
  /** The field's key, already decoded. */
  readonly key: string;
}

export interface EntryAnyRef {
  readonly type: 'entry';
  readonly annotation: string;
  /** Code of the entry among the annotation's entries (as received). */
  readonly entry: string;
}

export interface RowAnyRef {
  readonly type: 'row';
  readonly annotation: string;
  readonly key: string;
  /** Code of the row among the table's rows (as received). */
  readonly row: string;
}

/** Sub-reference: a part of an annotation. */
export type SubRef = FieldAnyRef | EntryAnyRef | RowAnyRef;

export type AnyRef = ItemAnyRef | SubRef;

export interface ParsedAnyRef {
  /** Project folder name, decoded; `null` in the short forms. */
  readonly project: string | null;
  readonly ref: AnyRef;
}

/** `mapping://<project>/…` from a reference of any form. */
export function formatAnyRef(project: string, ref: AnyRef): string {
  const base = `${REF_SCHEME}${encodeRefSegment(project)}`;
  if (ref.type === 'item') return `${base}/${ref.kind}/${ref.code}`;
  return `${base}/${subPath(ref)}`;
}

/** `mapping://<project>/a/<code>/f/<field>[/r/<code>]` or `…/e/<code>`. */
export function formatSubRef(project: string, ref: SubRef): string {
  return formatAnyRef(project, ref);
}

function subPath(ref: SubRef): string {
  if (ref.type === 'entry') return `a/${ref.annotation}/e/${ref.entry}`;
  const field = `a/${ref.annotation}/f/${encodeRefSegment(ref.key)}`;
  return ref.type === 'field' ? field : `${field}/r/${ref.row}`;
}

const SEGMENT = /^(?:[A-Za-z0-9\-._~]|%[0-9A-Fa-f]{2})+$/;
/** Code of m, i and a (and the annotation's in sub-references): as in `parseRef`. */
const CODE_ITEM = /^[0-9a-zA-Z-]+$/;
/** Code of p, l, c, e, r: accepts dot and underscore. */
const CODE_WIDE = /^[0-9a-zA-Z._-]+$/;

function decodeSegment(segment: string): string | null {
  if (!SEGMENT.test(segment)) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

function itemRef(letter: string, code: string): ItemAnyRef | null {
  if (letter === 'm' || letter === 'i' || letter === 'a') {
    if (!CODE_ITEM.test(code)) return null;
    const norm = normalizeId(code);
    return norm === '' ? null : { type: 'item', kind: letter, code: norm };
  }
  if (letter === 'p' || letter === 'l' || letter === 'c') {
    return CODE_WIDE.test(code) ? { type: 'item', kind: letter, code } : null;
  }
  return null;
}

function annotationCode(code: string): string | null {
  if (!CODE_ITEM.test(code)) return null;
  const norm = normalizeId(code);
  return norm === '' ? null : norm;
}

function entryRef(annotation: string, segs: readonly string[]): SubRef | null {
  const entry = segs[3]!;
  return segs.length === 4 && CODE_WIDE.test(entry)
    ? { type: 'entry', annotation, entry }
    : null;
}

function fieldRef(annotation: string, segs: readonly string[]): SubRef | null {
  const key = decodeSegment(segs[3]!);
  if (key === null) return null;
  if (segs.length === 4) return { type: 'field', annotation, key };
  const row = segs[5]!;
  return segs[4] === 'r' && CODE_WIDE.test(row)
    ? { type: 'row', annotation, key, row }
    : null;
}

function subRef(segs: readonly string[]): SubRef | null {
  const annotation = annotationCode(segs[1]!);
  if (segs[0] !== 'a' || annotation === null) return null;
  if (segs[2] === 'e') return entryRef(annotation, segs);
  return segs[2] === 'f' ? fieldRef(annotation, segs) : null;
}

function parseTail(segs: readonly string[]): AnyRef | null {
  if (segs.length === 2) return itemRef(segs[0]!, segs[1]!);
  if (segs.length === 4 || segs.length === 6) return subRef(segs);
  return null;
}

/**
 * Parses the reference in any form: the full URL (`mapping://project/…`) or the short one
 * (`a/<code>/f/<field>`, `c/<code>`…), the latter with `project: null`. The `<field>` is
 * decoded (an invalid `%` gives `null`). Does not accept a bare code (that is `parseRef`'s job).
 */
export function parseAnyRef(text: string): ParsedAnyRef | null {
  const input = text.trim();
  if (input.startsWith(REF_SCHEME)) {
    const segs = input.slice(REF_SCHEME.length).split('/');
    const project = decodeSegment(segs[0]!);
    if (project === null) return null;
    const ref = parseTail(segs.slice(1));
    return ref && { project, ref };
  }
  const ref = parseTail(input.split('/'));
  return ref && { project: null, ref };
}

// ------------------------------------------------------------ layer and thread

const layerCache = new WeakMap<Project, ReadonlyMap<string, string>>();

/** Short code of each project layer, unique among them (memoized per project). */
export function layerShortCodes(p: Project): ReadonlyMap<string, string> {
  const cached = layerCache.get(p);
  if (cached) return cached;
  const codes = shortCodesFor(p.layers.map((layer) => layer.id));
  layerCache.set(p, codes);
  return codes;
}

/** Short code of layer `id`. Fails with `not-found` if it does not exist. */
export function layerShortCode(p: Project, id: string): string {
  return layerShortCodes(p).get(id) ?? fail('not-found', id);
}

/**
 * Layer ids that the code designates: the id whose normalized form is exactly the code (wins)
 * or, failing that, all those that start with the code.
 */
export function matchLayerCode(p: Project, code: string): readonly string[] {
  const wanted = normalizeId(code);
  if (wanted === '') return [];
  const ids = p.layers
    .map((l) => l.id)
    .filter((id) => normalizeId(id).startsWith(wanted));
  const exact = ids.filter((id) => normalizeId(id) === wanted);
  return exact.length > 0 ? exact : ids;
}

/** Short code of each thread, unique among the project's (open and resolved). */
export function threadShortCodes(ids: readonly string[]): ReadonlyMap<string, string> {
  return shortCodesFor(ids);
}
