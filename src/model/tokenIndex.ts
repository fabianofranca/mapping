import {
  isPerModeValue,
  knownTokenKinds,
  resolveTokens,
  tokenAxes,
  tokenNotices,
  MODE_AXIS,
  type NamedTokenKind,
  type Obj,
  type SpecTokens,
  type TokenNotice,
  type TokenSelection,
  type TokenValue,
} from './components/tokens';

// The index of a specialization's tokens that `get_specialization` carries (stage #1900, NV3): per token
// name its kind, its value in a selection (the default one when none is given), whether it is an alias,
// the axes it varies by and the metadata of the `$value` wrapper. Pure; reuses the resolver of NV1.

/** One token of the index. */
export interface TokenIndexEntry {
  readonly kind: NamedTokenKind;
  /** A scalar: its value in the selection (absent when it does not resolve). */
  readonly value?: TokenValue;
  /** A composite: field → value in the selection. */
  readonly fields?: Readonly<Record<string, TokenValue>>;
  /** The target name, when the token is an alias. */
  readonly aliasOf?: string;
  /** The axes the value varies by (following aliases), in the order the axes are declared. */
  readonly varies: readonly string[];
  readonly description?: string;
  readonly group?: string;
  readonly notices?: readonly TokenNotice[];
}

const isObj = (value: unknown): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const aliasTarget = (node: unknown): string | undefined =>
  isObj(node) && typeof node.$token === 'string' ? node.$token : undefined;

/** The raw value without its metadata wrapper. */
const bodyOf = (raw: unknown): unknown =>
  isObj(raw) && '$value' in raw ? raw.$value : raw;

interface Walk {
  readonly values: Readonly<Record<string, unknown>>;
  /** `modes` of a library without `axes` (the legacy plain per-mode object). */
  readonly modes: readonly string[] | undefined;
  readonly found: Set<string>;
  readonly visited: Set<string>;
}

/** The token a reference names (`title.size` is `title`). */
const nameOf = (reference: string): string => reference.split('.')[0] ?? reference;

function walkAlias(node: Obj, walk: Walk): void {
  walkName(nameOf(node.$token as string), walk);
  walkNode(node.alpha, walk);
}

/** Collects the axes a raw value varies by, following aliases (each name once). */
function walkNode(node: unknown, walk: Walk): void {
  if (!isObj(node)) return;
  if ('$value' in node) return walkNode(node.$value, walk);
  if (typeof node.$token === 'string') return walkAlias(node, walk);
  if (typeof node.$axis === 'string') walk.found.add(node.$axis);
  else if (isPerModeValue(node, walk.modes)) walk.found.add(MODE_AXIS);
  for (const [key, child] of Object.entries(node)) {
    if (key !== '$axis') walkNode(child, walk);
  }
}

function walkName(name: string, walk: Walk): void {
  if (walk.visited.has(name) || !Object.hasOwn(walk.values, name)) return;
  walk.visited.add(name);
  walkNode(walk.values[name], walk);
}

function variesBy(tokens: SpecTokens, name: string): string[] {
  const walk: Walk = {
    values: tokens.values,
    modes: tokens.axes === undefined ? tokens.modes : undefined,
    found: new Set(),
    visited: new Set(),
  };
  walkName(name, walk);
  return [...tokenAxes(tokens).keys()].filter((axis) => walk.found.has(axis));
}

/** The metadata the wrapper of a token carries (`$description`, `$group`, `$notices`). */
function metadataOf(tokens: SpecTokens, name: string, raw: unknown) {
  const wrapper = isObj(raw) && '$value' in raw ? raw : undefined;
  const notices = tokenNotices(tokens, name);
  return {
    ...(typeof wrapper?.$description === 'string'
      ? { description: wrapper.$description }
      : {}),
    ...(typeof wrapper?.$group === 'string' ? { group: wrapper.$group } : {}),
    ...(notices.length > 0 ? { notices } : {}),
  };
}

/** The fields (`name.field`) of a composite in the resolved table, as field → value. */
function fieldsOf(
  table: Readonly<Record<string, TokenValue>>,
  name: string,
): Record<string, TokenValue> {
  const prefix = `${name}.`;
  return Object.fromEntries(
    Object.entries(table)
      .filter(([slot]) => slot.startsWith(prefix))
      .map(([slot, value]) => [slot.slice(prefix.length), value]),
  );
}

/**
 * The tokens of a specialization as an index: name → `{ kind, value | fields, aliasOf?, varies, … }`, the
 * values resolved in `selection` (the default entry of each axis when it is omitted). The built-in
 * `font-sans` and `font-mono` are not listed: only what the specialization declares.
 */
export function tokenIndex(
  tokens: SpecTokens,
  selection?: TokenSelection,
): Record<string, TokenIndexEntry> {
  const kinds = knownTokenKinds(tokens);
  const table = resolveTokens(tokens, {}, selection);
  const out: Record<string, TokenIndexEntry> = {};
  for (const [name, raw] of Object.entries(tokens.values)) {
    const kind = kinds.get(name) ?? 'composite';
    const alias = aliasTarget(bodyOf(raw));
    const resolved =
      kind === 'composite' ? { fields: fieldsOf(table, name) } : valueOf(table, name);
    out[name] = {
      kind,
      ...resolved,
      ...(alias === undefined ? {} : { aliasOf: alias }),
      varies: variesBy(tokens, name),
      ...metadataOf(tokens, name, raw),
    };
  }
  return out;
}

function valueOf(
  table: Readonly<Record<string, TokenValue>>,
  name: string,
): { value?: TokenValue } {
  return Object.hasOwn(table, name) ? { value: table[name] as TokenValue } : {};
}
