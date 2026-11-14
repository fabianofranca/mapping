import { fail } from './errors';
import type { Project } from './types';

// Copyable reference to a project item (stage 3a): `mapping://<project>/<m|i|a>/<code>`,
// the URL only (project encoded). The app copies, the agent (MCP) pastes. Pure functions, no DOM
// or Node. Not to be confused with `refs.ts`, which handles the strong references between
// annotations.

/**
 * `m` = marking (and arrow: arrow ids and marking ids share the space, ME4), `i` =
 * container, `a` = annotation.
 */
export type ItemKind = 'm' | 'i' | 'a';

export const ITEM_KINDS: readonly ItemKind[] = ['m', 'i', 'a'];

/** Scheme of the copyable references. */
export const REF_SCHEME = 'mapping://';

/** Initial length of the code; it grows 4 characters at a time on a collision. */
export const SHORT_CODE_LENGTH = 8;
const SHORT_CODE_STEP = 4;

/** Id without hyphens and in lowercase: the form in which the code is cut and compared. */
export function normalizeId(id: string): string {
  return id.replaceAll('-', '').toLowerCase();
}

function idsOf(p: Project, kind: ItemKind): readonly string[] {
  if (kind === 'm') return [...p.markings, ...p.arrows].map((item) => item.id);
  const items = kind === 'i' ? p.containers : p.annotations;
  return items.map((item) => item.id);
}

function commonPrefix(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let n = 0;
  while (n < max && a[n] === b[n]) n++;
  return n;
}

const cache = new WeakMap<
  Project,
  Partial<Record<ItemKind, ReadonlyMap<string, string>>>
>();

/**
 * Short code of each id in a list, in one pass (O(n log n)): the first 8 characters of
 * the normalized id; if another id in the list starts the same, 12, then 16 and so on,
 * until it is unique. It serves any set of ids (project items, proposals).
 */
export function shortCodesFor(ids: readonly string[]): ReadonlyMap<string, string> {
  const entries = ids
    .map((id) => ({ id, norm: normalizeId(id) }))
    .sort((a, b) => (a.norm < b.norm ? -1 : a.norm > b.norm ? 1 : 0));
  const codes = new Map<string, string>();
  entries.forEach((entry, index) => {
    // In alphabetical order, an item's longest common prefix is with a neighbor.
    const shared = Math.max(
      index > 0 ? commonPrefix(entry.norm, entries[index - 1]!.norm) : 0,
      index < entries.length - 1 ? commonPrefix(entry.norm, entries[index + 1]!.norm) : 0,
    );
    let length = SHORT_CODE_LENGTH;
    while (length <= shared) length += SHORT_CODE_STEP;
    codes.set(entry.id, entry.norm.slice(0, length));
  });
  return codes;
}

/**
 * Short code of all the items of a kind (`shortCodesFor` over the kind's ids).
 * Memoized per project.
 */
export function shortCodes(p: Project, kind: ItemKind): ReadonlyMap<string, string> {
  const slot = cache.get(p) ?? {};
  cache.set(p, slot);
  const cached = slot[kind];
  if (cached) return cached;
  const codes = shortCodesFor(idsOf(p, kind));
  slot[kind] = codes;
  return codes;
}

/** Short code of the item `id`, unique among the items of the same kind. Fails with `not-found` if the id does not exist. */
export function shortCode(p: Project, kind: ItemKind, id: string): string {
  return shortCodes(p, kind).get(id) ?? fail('not-found', id);
}

/**
 * Ids the code designates: the id whose normalized form is exactly the code (it wins,
 * for short ids that are a prefix of others) or, failing that, all those that
 * start with the code. `kind: null` searches all three kinds.
 */
export function matchShortCode(
  p: Project,
  kind: ItemKind | null,
  code: string,
): readonly { readonly kind: ItemKind; readonly id: string }[] {
  const wanted = normalizeId(code);
  if (wanted === '') return [];
  const found: { kind: ItemKind; id: string }[] = [];
  for (const k of kind ? [kind] : ITEM_KINDS) {
    const ids = idsOf(p, k).filter((id) => normalizeId(id).startsWith(wanted));
    const exact = ids.filter((id) => normalizeId(id) === wanted);
    for (const id of exact.length > 0 ? exact : ids) found.push({ kind: k, id });
  }
  return found;
}

/**
 * Name of the image that the MCP uses in readable labels (`imageLabel`, `resolve`): the given
 * name or, with no name, the file name without the folder (`images/signup.webp` →
 * `signup.webp`). A container with no file and no name: `null` (the caller decides the text,
 * the app through the translation and the MCP in Portuguese).
 */
export function refImageLabel(image: {
  readonly name: string | null;
  readonly file: string | null;
}): string | null {
  if (image.name !== null) return image.name;
  return image.file === null ? null : image.file.slice(image.file.lastIndexOf('/') + 1);
}

export interface FormatRefArgs {
  /** Name of the project's folder. */
  readonly project: string;
  readonly kind: ItemKind;
  /** Result of `shortCode`. */
  readonly code: string;
}

/**
 * URL segment with only the *unreserved* set of RFC 3986 (`A-Z a-z 0-9 - . _ ~`): everything
 * else becomes uppercase `%XX` (UTF-8). It is `encodeURIComponent` with `! ' ( ) *` also
 * encoded (`(` and `)` break markdown links).
 */
export function encodeRefSegment(segment: string): string {
  return encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** `mapping://<project>/<m|i|a>/<code>`: the URL only, with the project encoded. */
export function formatRef({ project, kind, code }: FormatRefArgs): string {
  return `${REF_SCHEME}${encodeRefSegment(project)}/${kind}/${code}`;
}

export interface ParsedRef {
  /** Name of the project's folder; `null` when the reference does not carry it. */
  readonly project: string | null;
  /** `null` when only a code or id came: it applies to any kind. */
  readonly kind: ItemKind | null;
  /** Short code or full id, normalized (no hyphens, lowercase). */
  readonly code: string;
}

/** Decodes the segment; `null` if the `%` is invalid or it is not valid UTF-8. */
function decodeSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

const CODE = /^[0-9a-zA-Z_-]+$/;
const FULL_REF =
  /^mapping:\/\/((?:[A-Za-z0-9\-._~]|%[0-9A-Fa-f]{2})+)\/([mia])\/([0-9a-zA-Z_-]+)$/;
const SHORT_REF = /^([mia])\/([0-9a-zA-Z_-]+)$/;

/**
 * Interprets what the user or the agent pasted. It accepts:
 * - the strict URL `mapping://project/m/3f2a9c1e` (project encoded, nothing after the code);
 * - `m/3f2a9c1e`, with the project given separately;
 * - just the code or the full id (with or without hyphens).
 * Returns `null` if the text has none of these formats.
 */
export function parseRef(text: string): ParsedRef | null {
  const input = text.trim();
  const full = FULL_REF.exec(input);
  if (full) {
    const project = decodeSegment(full[1]!);
    if (project === null) return null;
    return { project, kind: full[2] as ItemKind, code: normalizeId(full[3]!) };
  }
  const short = SHORT_REF.exec(input);
  if (short) {
    return { project: null, kind: short[1] as ItemKind, code: normalizeId(short[2]!) };
  }
  if (CODE.test(input) && normalizeId(input) !== '') {
    return { project: null, kind: null, code: normalizeId(input) };
  }
  return null;
}
