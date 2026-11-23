import type { z } from 'zod';
import {
  BUILTIN_TOKENS,
  MODE_AXIS,
  TOKEN_NAME_PATTERN,
  isLiteralColor,
  isPerModeValue,
  tokenKind,
  type Obj,
  type TokenKind,
} from './components/tokens';
import { addSpecIssue, specMsg, type SpecMsg } from './specIssueCode';

// Validation of the specialization's `tokens` (`formatVersion` 15 and later) and the entry points of the
// pure resolver. Up to 22 the shape is `modes` plus `values` (a literal, or one literal per mode); 23 (stage
// #1900, NV1) adds `axes`, aliases (`{ "$token": … }`), composite values, per-axis values (`{ "$axis": … }`)
// and the `{ "$value": … }` metadata wrapper (see `docs/SPEC-FORMAT.md`, "Design tokens"). The resolver
// itself lives in `components/tokens.ts`, next to `resolveTokens`, and is re-exported here. No browser
// APIs: reusable by the MCP server.

export {
  knownTokenKinds,
  resolveTokens,
  tokenAxes,
  type TokenSelection,
} from './components/tokens';

/** The first `formatVersion` with axes, aliases, composites and the wrapper. */
export const NAMED_VALUES_VERSION = 23;

type Path = (string | number)[];
type Add = (path: Path, message: string | SpecMsg) => void;

/** Checks a `$notices` list (the notice rules of `formatVersion` 10) and reports at `[...wrapperPath, '$notices']`. */
export type NoticeChecker = (
  value: unknown,
  wrapperPath: Path,
  ctx: z.RefinementCtx,
) => void;

const FIELD_NAME = /^[a-z][a-zA-Z0-9]*$/;
const WRAPPER_KEYS: readonly string[] = ['$value', '$description', '$group', '$notices'];

const isObject = (value: unknown): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isLiteral = (value: unknown): value is string | number =>
  (typeof value === 'string' && value !== '') ||
  (typeof value === 'number' && Number.isFinite(value));

/** `tokens` (`formatVersion` 15 and later): `modes`/`axes` and `values` by name `^[a-z0-9][a-z0-9-]*$`. */
export function checkTokens(
  spec: { formatVersion: number; tokens?: unknown },
  ctx: z.RefinementCtx,
  checkNotices: NoticeChecker,
): void {
  if (spec.tokens === undefined) return;
  const add: Add = (path, message) => addSpecIssue(ctx, path, message);
  if (spec.formatVersion < 15) {
    add(['tokens'], specMsg('spec.onlyFormat', { version: '15' }));
    return;
  }
  if (!isObject(spec.tokens)) return add(['tokens'], specMsg('spec.tokensShape'));
  if (spec.formatVersion < NAMED_VALUES_VERSION) checkModesTokens(spec.tokens, add);
  else checkNamedValues(spec.tokens, { add, ctx, checkNotices });
}

// ---- `modes` and `axes` ---------------------------------------------------------------------------

/** A non-empty list of distinct names (`modes`, or the entries of an axis). Returns it, or `null` if invalid. */
function entryList(list: unknown, path: Path, add: Add): readonly string[] | null {
  if (!Array.isArray(list) || list.length === 0) {
    add(path, specMsg('spec.tokenModesEmpty'));
    return null;
  }
  const seen = new Set<string>();
  let ok = true;
  list.forEach((entry: unknown, i) => {
    if (typeof entry !== 'string' || !TOKEN_NAME_PATTERN.test(entry)) {
      add([...path, i], specMsg('spec.tokenModeInvalid'));
      ok = false;
    } else if (seen.has(entry)) {
      add([...path, i], specMsg('spec.tokenModeRepeated', { mode: entry }));
      ok = false;
    }
    if (typeof entry === 'string') seen.add(entry);
  });
  return ok ? (list as string[]) : null;
}

/** `tokens.axes`: axis name → entries. The invalid axes are reported and left out of the result. */
function declaredAxes(axes: unknown, add: Add): Map<string, readonly string[]> {
  const out = new Map<string, readonly string[]>();
  if (!isObject(axes)) {
    add(['tokens', 'axes'], specMsg('spec.mustBeObject'));
    return out;
  }
  for (const [axis, list] of Object.entries(axes)) {
    const path: Path = ['tokens', 'axes', axis];
    if (!TOKEN_NAME_PATTERN.test(axis)) {
      add(path, specMsg('spec.tokenNameInvalid'));
      continue;
    }
    const entries = entryList(list, path, add);
    if (entries !== null) out.set(axis, entries);
  }
  return out;
}

interface Declared {
  readonly axes: ReadonlyMap<string, readonly string[]>;
  /** The valid `modes`, when the library declares them (to read the legacy per-mode object). */
  readonly modes: readonly string[] | undefined;
}

/** `modes` or `axes` (not both); `modes` is the axis `mode`. In 23 neither is required. */
function declaredEntries(tokens: Obj, add: Add): Declared {
  const hasModes = tokens.modes !== undefined;
  if (hasModes && tokens.axes !== undefined) {
    add(['tokens', 'axes'], specMsg('spec.tokenModesAndAxes'));
  }
  if (!hasModes) {
    const axes = tokens.axes === undefined ? new Map() : declaredAxes(tokens.axes, add);
    return { axes, modes: undefined };
  }
  const modes = entryList(tokens.modes, ['tokens', 'modes'], add);
  return {
    axes: modes === null ? new Map() : new Map([[MODE_AXIS, modes]]),
    modes: modes ?? undefined,
  };
}

// ---- formatVersion 15 to 22: `modes` plus a literal or one literal per mode -------------------------

/** Only `modes` and `values` are valid in `tokens` (`axes` is for 23): the rest is an unknown key. */
function checkModesKeys(tokens: Obj, add: Add): void {
  for (const key of Object.keys(tokens)) {
    if (key === 'axes') {
      add(['tokens', 'axes'], specMsg('spec.onlyFormat', { version: '23' }));
    } else if (key !== 'modes' && key !== 'values') {
      add(['tokens', key], specMsg('spec.tokenKeyUnknown', { key }));
    }
  }
}

/** A token: a literal (applies in all modes) or one literal per mode, all of the same type. */
function checkModesValue(
  name: string,
  value: unknown,
  modes: readonly string[],
  add: Add,
): void {
  const path = ['tokens', 'values', name];
  if (isLiteral(value)) return;
  if (!isObject(value)) return add(path, specMsg('spec.tokenValueShape'));
  const given = Object.keys(value);
  const missing = modes.filter((m) => !given.includes(m));
  const extra = given.filter((m) => !modes.includes(m));
  if (missing.length > 0) {
    add(path, specMsg('spec.tokenModeMissing', { modes: missing.join(', ') }));
  }
  if (extra.length > 0) {
    add(path, specMsg('spec.tokenModeExtra', { modes: extra.join(', ') }));
  }
  const literals = given.map((m) => value[m]);
  if (!literals.every(isLiteral)) {
    add(path, specMsg('spec.tokenModeValueShape'));
  } else if (new Set(literals.map((l) => typeof l)).size > 1) {
    add(path, specMsg('spec.tokenModesSameType'));
  }
}

/** The 15 to 22 rules: `modes` required, each value a literal or one literal per mode. */
function checkModesTokens(tokens: Obj, add: Add): void {
  checkModesKeys(tokens, add);
  const modes = entryList(tokens.modes, ['tokens', 'modes'], add);
  const values = tokens.values;
  if (!isObject(values)) return add(['tokens', 'values'], specMsg('spec.mustBeObject'));
  for (const [name, value] of Object.entries(values)) {
    if (!TOKEN_NAME_PATTERN.test(name)) {
      add(['tokens', 'values', name], specMsg('spec.tokenNameInvalid'));
    } else if (modes !== null) {
      checkModesValue(name, value, modes, add);
    }
  }
}

// ---- formatVersion 23: the shape of each value -----------------------------------------------------

interface Env {
  readonly add: Add;
  readonly ctx: z.RefinementCtx;
  readonly checkNotices: NoticeChecker;
  readonly axes: ReadonlyMap<string, readonly string[]>;
  readonly modes: readonly string[] | undefined;
}

/** A reference to a token (`name`) or to one field of a composite (`name.field`), with its modifiers. */
interface AliasRef {
  readonly name: string;
  readonly field: string | undefined;
  readonly alpha: unknown;
  readonly over: unknown;
}

/** A value after its shape was checked (the errors of the shape are already reported). */
type Node =
  | { readonly t: 'lit'; readonly kind: TokenKind }
  | { readonly t: 'alias'; readonly path: Path; readonly ref: AliasRef }
  | {
      readonly t: 'axis';
      readonly path: Path;
      readonly branches: readonly Node[];
    }
  | {
      readonly t: 'composite';
      readonly path: Path;
      readonly fields: ReadonlyMap<string, Node>;
    };

/** `value`: where a composite may stand; `field`: inside a composite (scalars only). */
type Scope = 'value' | 'field';

/** The reference `name` or `name.field` of an alias, split at the first dot. */
function splitRef(text: string): { name: string; field: string | undefined } {
  const dot = text.indexOf('.');
  return dot < 0
    ? { name: text, field: undefined }
    : { name: text.slice(0, dot), field: text.slice(dot + 1) };
}

function parseAlias(raw: Obj, path: Path, env: Env): Node | null {
  let ok = true;
  for (const key of Object.keys(raw)) {
    if (key === '$token' || key === 'alpha' || key === 'over') continue;
    env.add([...path, key], specMsg('spec.tokenKeyUnknown', { key }));
    ok = false;
  }
  if (typeof raw.$token !== 'string') {
    env.add([...path, '$token'], specMsg('spec.mustBeText'));
    return null;
  }
  const { name, field } = splitRef(raw.$token);
  const ref: AliasRef = { name, field, alpha: raw.alpha, over: raw.over };
  return ok ? { t: 'alias', path, ref } : null;
}

/** The entries of a per-axis value against the axis: all of them and only them. */
function checkAxisKeys(
  given: readonly string[],
  entries: readonly string[],
  path: Path,
  add: Add,
): void {
  const missing = entries.filter((e) => !given.includes(e));
  const extra = given.filter((e) => !entries.includes(e));
  if (missing.length > 0) {
    add(path, specMsg('spec.tokenModeMissing', { modes: missing.join(', ') }));
  }
  if (extra.length > 0) {
    add(path, specMsg('spec.tokenModeExtra', { modes: extra.join(', ') }));
  }
}

/** The branches of a per-axis value (`raw` holds one value per entry of `axis`). */
function parseBranches(
  raw: Obj,
  axis: string,
  entries: readonly string[],
  path: Path,
  env: Env,
  scope: Scope,
  used: ReadonlySet<string>,
): Node | null {
  const given = Object.keys(raw).filter((key) => key !== '$axis');
  checkAxisKeys(given, entries, path, env.add);
  const inside = new Set(used).add(axis);
  const branches: Node[] = [];
  for (const key of given.filter((k) => entries.includes(k))) {
    const node = parseValue(raw[key], [...path, key], env, scope, inside);
    if (node !== null) branches.push(node);
  }
  const complete = branches.length === entries.length && given.length === entries.length;
  return complete ? { t: 'axis', path, branches } : null;
}

function parseAxis(
  raw: Obj,
  path: Path,
  env: Env,
  scope: Scope,
  used: ReadonlySet<string>,
): Node | null {
  const axis = raw.$axis;
  if (typeof axis !== 'string') {
    env.add([...path, '$axis'], specMsg('spec.mustBeText'));
    return null;
  }
  const entries = env.axes.get(axis);
  if (entries === undefined) {
    env.add(path, specMsg('spec.tokenAxisUndeclared', { axis }));
    return null;
  }
  if (used.has(axis)) {
    env.add(path, specMsg('spec.tokenAxisReused', { axis }));
    return null;
  }
  return parseBranches(raw, axis, entries, path, env, scope, used);
}

function parseField(
  raw: Obj,
  key: string,
  path: Path,
  env: Env,
  used: ReadonlySet<string>,
): Node | null {
  const at = [...path, key];
  if (key.startsWith('$')) {
    env.add(at, specMsg('spec.tokenKeyUnknown', { key }));
    return null;
  }
  if (!FIELD_NAME.test(key)) {
    env.add(at, specMsg('spec.tokenFieldInvalid'));
    return null;
  }
  return parseValue(raw[key], at, env, 'field', used);
}

function parseComposite(
  raw: Obj,
  path: Path,
  env: Env,
  scope: Scope,
  used: ReadonlySet<string>,
): Node | null {
  if (scope === 'field') {
    env.add(path, specMsg('spec.tokenCompositeNested'));
    return null;
  }
  const keys = Object.keys(raw);
  if (keys.length === 0) {
    env.add(path, specMsg('spec.tokenCompositeEmpty'));
    return null;
  }
  const fields = new Map<string, Node>();
  for (const key of keys) {
    const node = parseField(raw, key, path, env, used);
    if (node !== null) fields.set(key, node);
  }
  return fields.size === keys.length ? { t: 'composite', path, fields } : null;
}

/** A value: a literal, an alias, a per-axis value or (in `value` scope) a composite. */
function parseValue(
  raw: unknown,
  path: Path,
  env: Env,
  scope: Scope,
  used: ReadonlySet<string>,
): Node | null {
  if (isLiteral(raw)) return { t: 'lit', kind: tokenKind(raw) };
  if (!isObject(raw)) {
    env.add(path, specMsg('spec.tokenValueForm'));
    return null;
  }
  if ('$value' in raw) {
    env.add(path, specMsg('spec.tokenWrapperNested'));
    return null;
  }
  if ('$token' in raw) return parseAlias(raw, path, env);
  if ('$axis' in raw) return parseAxis(raw, path, env, scope, used);
  if (env.modes !== undefined && isPerModeValue(raw, env.modes)) {
    return parseBranches(raw, MODE_AXIS, env.modes, path, env, scope, used);
  }
  return parseComposite(raw, path, env, scope, used);
}

/** `$description`, `$group` and `$notices` of the wrapper. */
function checkWrapperMeta(raw: Obj, path: Path, env: Env): void {
  const { $description, $group, $notices } = raw;
  if ($description !== undefined && typeof $description !== 'string') {
    env.add([...path, '$description'], specMsg('spec.mustBeText'));
  }
  if (
    $group !== undefined &&
    (typeof $group !== 'string' || !TOKEN_NAME_PATTERN.test($group))
  ) {
    env.add([...path, '$group'], specMsg('spec.tokenGroupInvalid'));
  }
  if ($notices !== undefined) env.checkNotices($notices, path, env.ctx);
}

function parseWrapper(raw: Obj, path: Path, env: Env): Node | null {
  for (const key of Object.keys(raw)) {
    if (!WRAPPER_KEYS.includes(key)) {
      env.add([...path, key], specMsg('spec.tokenKeyUnknown', { key }));
    }
  }
  checkWrapperMeta(raw, path, env);
  if (!('$value' in raw)) {
    env.add([...path, '$value'], specMsg('spec.required'));
    return null;
  }
  return parseValue(raw.$value, [...path, '$value'], env, 'value', new Set());
}

/** The entry of a token: the wrapper (any of its keys) around a value, or the value itself. */
function parseEntry(raw: unknown, path: Path, env: Env): Node | null {
  const wrapped = isObject(raw) && WRAPPER_KEYS.some((key) => key in raw);
  return wrapped
    ? parseWrapper(raw, path, env)
    : parseValue(raw, path, env, 'value', new Set());
}

// ---- formatVersion 23: aliases, kinds and cycles -----------------------------------------------------

interface Graph {
  readonly roots: ReadonlyMap<string, Node | null>;
  readonly add: Add;
  readonly kinds: Map<string, TokenKind | null>;
  readonly visiting: Set<string>;
}

function isCompositeNode(node: Node): boolean {
  if (node.t === 'composite') return true;
  return node.t === 'axis' && node.branches.some(isCompositeNode);
}

/** The nodes that hold `field` of a composite (one per branch when it varies by axis). */
function fieldNodes(node: Node, field: string): Node[] {
  if (node.t === 'composite') {
    const found = node.fields.get(field);
    return found === undefined ? [] : [found];
  }
  return node.t === 'axis' ? node.branches.flatMap((b) => fieldNodes(b, field)) : [];
}

function fieldNames(node: Node): string[] {
  if (node.t === 'composite') return [...node.fields.keys()];
  if (node.t !== 'axis') return [];
  return [...new Set(node.branches.flatMap(fieldNames))];
}

/** The literals and aliases a slot (`name` or `name.field`) is made of, through its per-axis branches. */
function slotNodes(slot: string, graph: Graph): Node[] {
  const { name, field } = splitRef(slot);
  const root = graph.roots.get(name);
  if (root === null || root === undefined) return [];
  if (field !== undefined) return fieldNodes(root, field);
  return isCompositeNode(root) ? [] : [root];
}

type Target =
  | { readonly slot: string }
  | { readonly builtin: true }
  | { readonly invalid: true }
  | { readonly error: SpecMsg };

function resolveInEntry(name: string, field: string | undefined, root: Node): Target {
  const composite = isCompositeNode(root);
  if (field === undefined) {
    return composite
      ? { error: specMsg('spec.tokenAliasComposite', { name }) }
      : { slot: name };
  }
  return composite && fieldNames(root).includes(field)
    ? { slot: `${name}.${field}` }
    : { error: specMsg('spec.tokenAliasNoField', { name, field }) };
}

/** Where an alias points: a slot, a built-in, an invalid token (already reported) or an error. */
function resolveAlias(name: string, field: string | undefined, graph: Graph): Target {
  if (!graph.roots.has(name)) {
    if (!BUILTIN_TOKENS.includes(name)) {
      return { error: specMsg('spec.tokenAliasMissing', { name }) };
    }
    return field === undefined
      ? { builtin: true }
      : { error: specMsg('spec.tokenAliasNoField', { name, field }) };
  }
  const root = graph.roots.get(name);
  return root === null || root === undefined
    ? { invalid: true }
    : resolveInEntry(name, field, root);
}

/** The single kind of a list of kinds, or `null` if one is unknown or they differ. */
function agreedKind(kinds: readonly (TokenKind | null)[]): TokenKind | null {
  const first = kinds[0] ?? null;
  return kinds.every((kind) => kind !== null && kind === first) ? first : null;
}

function targetKind(target: Target, graph: Graph): TokenKind | null {
  if ('builtin' in target) return 'family';
  return 'slot' in target ? slotKind(target.slot, graph) : null;
}

/** The kind of a scalar node: a literal's, an alias target's, the agreed one of a per-axis value. */
function nodeKind(node: Node, graph: Graph): TokenKind | null {
  if (node.t === 'lit') return node.kind;
  if (node.t === 'alias') {
    return targetKind(resolveAlias(node.ref.name, node.ref.field, graph), graph);
  }
  return node.t === 'axis'
    ? agreedKind(node.branches.map((b) => nodeKind(b, graph)))
    : null;
}

/** The kind of a slot (`null` when unknown, invalid or in a cycle). */
function slotKind(slot: string, graph: Graph): TokenKind | null {
  const known = graph.kinds.get(slot);
  if (known !== undefined) return known;
  if (graph.visiting.has(slot)) return null;
  graph.visiting.add(slot);
  const kind = agreedKind(slotNodes(slot, graph).map((n) => nodeKind(n, graph)));
  graph.visiting.delete(slot);
  graph.kinds.set(slot, kind);
  return kind;
}

/** `alpha`: a number from 0 to 1, or a `$token` of a number token. */
function checkAlpha(alpha: unknown, path: Path, graph: Graph): void {
  const at = [...path, 'alpha'];
  if (typeof alpha === 'number' && alpha >= 0 && alpha <= 1) return;
  const name = isObject(alpha) && Object.keys(alpha).length === 1 ? alpha.$token : null;
  if (typeof name !== 'string') return graph.add(at, specMsg('spec.tokenAlphaInvalid'));
  const ref = splitRef(name);
  const target = resolveAlias(ref.name, ref.field, graph);
  if ('error' in target) return graph.add(at, target.error);
  const kind = targetKind(target, graph);
  if (kind !== null && kind !== 'number') {
    graph.add(at, specMsg('spec.tokenAlphaInvalid'));
  }
}

/** `over`: a literal color or the name of a color token. */
function checkOver(over: unknown, path: Path, graph: Graph): void {
  const at = [...path, 'over'];
  if (typeof over === 'string' && isLiteralColor(over)) return;
  if (typeof over !== 'string' || !TOKEN_NAME_PATTERN.test(over)) {
    return graph.add(at, specMsg('spec.tokenOverInvalid'));
  }
  const target = resolveAlias(over, undefined, graph);
  if ('error' in target) return graph.add(at, target.error);
  const kind = targetKind(target, graph);
  if (kind !== null && kind !== 'color') graph.add(at, specMsg('spec.tokenOverInvalid'));
}

/** `alpha` and `over` only go on a color; their values follow the component rules. */
function checkModifiers(node: Node & { t: 'alias' }, target: Target, graph: Graph): void {
  const { alpha, over } = node.ref;
  if (alpha === undefined && over === undefined) return;
  const kind = targetKind(target, graph);
  if (kind === null) return;
  const at = [...node.path, '$token'];
  if (kind !== 'color') {
    if (alpha !== undefined) graph.add(at, specMsg('spec.tokenAlphaOnlyColor'));
    if (over !== undefined) graph.add(at, specMsg('spec.tokenOverOnlyColor'));
    return;
  }
  if (alpha !== undefined) checkAlpha(alpha, node.path, graph);
  if (over !== undefined) checkOver(over, node.path, graph);
}

function checkAlias(node: Node & { t: 'alias' }, graph: Graph): void {
  const target = resolveAlias(node.ref.name, node.ref.field, graph);
  if ('error' in target) graph.add(node.path, target.error);
  else checkModifiers(node, target, graph);
}

/** The branches of a per-axis value of composites: same fields, same kind per field. */
function checkCompositeBranches(node: Node & { t: 'axis' }, graph: Graph): void {
  const names = node.branches.map((b) => fieldNames(b).sort().join('\u0000'));
  if (names.some((n) => n !== names[0])) {
    return graph.add(node.path, specMsg('spec.tokenBranchFields'));
  }
  for (const field of fieldNames(node.branches[0] as Node)) {
    const kinds = node.branches
      .flatMap((b) => fieldNodes(b, field))
      .map((n) => nodeKind(n, graph));
    if (kinds.every((k) => k !== null) && new Set(kinds).size > 1) {
      return graph.add(node.path, specMsg('spec.tokenBranchKinds'));
    }
  }
}

/** The branches of a per-axis value have the same kind (all scalars of one kind, or all composites). */
function checkBranches(node: Node & { t: 'axis' }, graph: Graph): void {
  const composites = node.branches.map(isCompositeNode);
  if (composites.some(Boolean) && !composites.every(Boolean)) {
    return graph.add(node.path, specMsg('spec.tokenBranchKinds'));
  }
  if (composites.every(Boolean)) return checkCompositeBranches(node, graph);
  const kinds = node.branches.map((b) => nodeKind(b, graph));
  if (kinds.every((k) => k !== null) && new Set(kinds).size > 1) {
    graph.add(node.path, specMsg('spec.tokenBranchKinds'));
  }
}

function checkNode(node: Node, graph: Graph): void {
  if (node.t === 'alias') return checkAlias(node, graph);
  if (node.t === 'composite') {
    for (const field of node.fields.values()) checkNode(field, graph);
  } else if (node.t === 'axis') {
    for (const branch of node.branches) checkNode(branch, graph);
    checkBranches(node, graph);
  }
}

type AliasNode = Node & { t: 'alias' };

function aliasesOf(node: Node): AliasNode[] {
  if (node.t === 'alias') return [node];
  return node.t === 'axis' ? node.branches.flatMap(aliasesOf) : [];
}

/** Every slot of the library: a scalar token by name, each field of a composite as `name.field`. */
function allSlots(graph: Graph): string[] {
  const out: string[] = [];
  for (const [name, root] of graph.roots) {
    if (root === null) continue;
    if (isCompositeNode(root)) out.push(...fieldNames(root).map((f) => `${name}.${f}`));
    else out.push(name);
  }
  return out;
}

/** Depth-first walk of the slots an alias points to; a back edge closes a cycle, reported where it closes. */
function visitSlot(
  slot: string,
  stack: string[],
  state: Map<string, 1 | 2>,
  graph: Graph,
): void {
  state.set(slot, 1);
  stack.push(slot);
  for (const node of slotNodes(slot, graph).flatMap(aliasesOf)) {
    const target = resolveAlias(node.ref.name, node.ref.field, graph);
    if (!('slot' in target)) continue;
    const seen = state.get(target.slot);
    if (seen === 1) {
      const chain = [...stack.slice(stack.indexOf(target.slot)), target.slot];
      graph.add(node.path, specMsg('spec.tokenCycle', { chain: chain.join(' → ') }));
    } else if (seen === undefined) {
      visitSlot(target.slot, stack, state, graph);
    }
  }
  stack.pop();
  state.set(slot, 2);
}

function checkCycles(graph: Graph): void {
  const state = new Map<string, 1 | 2>();
  for (const slot of allSlots(graph)) {
    if (!state.has(slot)) visitSlot(slot, [], state, graph);
  }
}

/** `values` of a 23 library: the shape of each entry, then aliases, kinds and cycles across the tokens. */
function checkValues(values: Obj, env: Env): void {
  const roots = new Map<string, Node | null>();
  for (const [name, raw] of Object.entries(values)) {
    if (!TOKEN_NAME_PATTERN.test(name)) {
      env.add(['tokens', 'values', name], specMsg('spec.tokenNameInvalid'));
    } else {
      roots.set(name, parseEntry(raw, ['tokens', 'values', name], env));
    }
  }
  const graph: Graph = { roots, add: env.add, kinds: new Map(), visiting: new Set() };
  for (const root of roots.values()) if (root !== null) checkNode(root, graph);
  checkCycles(graph);
}

function checkNamedKeys(tokens: Obj, add: Add): void {
  for (const key of Object.keys(tokens)) {
    if (key !== 'modes' && key !== 'axes' && key !== 'values') {
      add(['tokens', key], specMsg('spec.tokenKeyUnknown', { key }));
    }
  }
}

interface Hooks {
  readonly add: Add;
  readonly ctx: z.RefinementCtx;
  readonly checkNotices: NoticeChecker;
}

/** The 23 rules: `modes` or `axes` (optional), and values with aliases, composites, axes and the wrapper. */
function checkNamedValues(tokens: Obj, hooks: Hooks): void {
  checkNamedKeys(tokens, hooks.add);
  const declared = declaredEntries(tokens, hooks.add);
  const values = tokens.values;
  if (!isObject(values)) {
    return hooks.add(['tokens', 'values'], specMsg('spec.mustBeObject'));
  }
  checkValues(values, { ...hooks, ...declared });
}
