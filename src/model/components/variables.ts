/**
 * Component variables (formatVersion 4, stage #1504): `"let": { "name": <expression> }` in a
 * `frame` and `{ "$var": "name" }` where an expression or condition is valid.
 *
 * Expansion happens at read time, before the check (`parseComponent`): each `$var` is replaced
 * by the variable's content, like a macro, and the returned component has no `let` or `$var`.
 * Hence `$index`, the row columns (`$field` inside a `repeat`) and `$size` inside a variable are
 * those of the place of use, and the content is checked where it is used, with the type the
 * position expects. A variable with no use is not checked. No DOM.
 *
 * Scope: the variable is valid in the keys of the `frame` itself and in those of the descendants
 * (including the `template` of a `repeat`). An inner `let` hides the outer one; within the same
 * `let` the order is free (a `$var` points to the `let` of the same frame, even if declared
 * later, before going up to the outer ones).
 */
import { isRecord } from '../isRecord';

type Rec = Record<string, unknown>;

/** The name of a variable. */
export const VARIABLE_NAME_PATTERN = /^[a-z][a-zA-Z0-9]*$/;

/** The node ceiling that variable substitution may create (the rest of the file is not counted). */
export const MAX_EXPANDED_NODES = 100000;

/** How many variables can be expanded one inside another (the stack does not overflow). */
const MAX_CHAIN = 500;

/** An expansion problem: path in the expanded component (`rewrite` takes it to the file's). */
export interface VariableIssue {
  readonly path: string;
  readonly message: string;
}

export interface VariableExpansion {
  /** The `template` without `let` or `$var` (the same reference when there were none). */
  readonly value: unknown;
  readonly issues: VariableIssue[];
  /** Takes a path of the expanded component to the file's, with the `$var(<name>)` where used. */
  readonly rewrite: (path: string) => string;
}

interface Scope {
  readonly vars: Rec;
  readonly parent: Scope | null;
  /** Path of the `let` (`template.children[0].let`). */
  readonly path: string;
}

interface Active {
  readonly scope: Scope;
  readonly name: string;
}

interface State {
  readonly issues: VariableIssue[];
  readonly seen: Set<string>;
  readonly marks: Map<string, string[]>;
  readonly active: Active[];
  nodes: number;
  /** How many variables are being expanded now: inside them the copy is always new. */
  depth: number;
  over: boolean;
}

const EXPECTED_NAME = 'expected a variable name ([a-z][a-zA-Z0-9]*)';

function join(path: string, key: string): string {
  return path === '' ? key : `${path}.${key}`;
}

/** `out[key] = value`, without a JSON file's `__proto__` key replacing the copy's prototype. */
function put(out: Rec, key: string, value: unknown): void {
  if (key === '__proto__')
    Object.defineProperty(out, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  else out[key] = value;
}

function report(st: State, path: string, message: string): void {
  const key = `${path}\u0000${message}`;
  if (st.seen.has(key)) return;
  st.seen.add(key);
  st.issues.push({ path, message });
}

/** Inserts `.$var(<name>)` after each path prefix that was the place of a `$var`. */
function rewritePath(
  path: string,
  marks: ReadonlyMap<string, readonly string[]>,
): string {
  if (marks.size === 0) return path;
  let out = '';
  let from = 0;
  for (let i = 0; i <= path.length; i++) {
    const ch = path[i];
    if (i !== path.length && ch !== '.' && ch !== '[') continue;
    out += path.slice(from, i);
    from = i;
    const names = marks.get(path.slice(0, i));
    if (names !== undefined) out += names.map((n) => `.$var(${n})`).join('');
  }
  return out + path.slice(from);
}

function lookup(scope: Scope | null, name: string): Scope | null {
  for (let s = scope; s !== null; s = s.parent) {
    if (Object.prototype.hasOwnProperty.call(s.vars, name)) return s;
  }
  return null;
}

function substitute(use: Rec, path: string, scope: Scope | null, st: State): unknown {
  const extra = Object.keys(use).filter((key) => key !== '$var');
  for (const key of extra) report(st, join(path, key), `unknown key: ${key}`);
  if (extra.length > 0) return use;
  const name = use.$var;
  if (typeof name !== 'string' || !VARIABLE_NAME_PATTERN.test(name)) {
    report(st, join(path, '$var'), EXPECTED_NAME);
    return use;
  }
  const owner = lookup(scope, name);
  if (owner === null) {
    report(st, path, `undefined variable: ${name}`);
    return use;
  }
  const start = st.active.findIndex((a) => a.scope === owner && a.name === name);
  if (start >= 0) {
    const chain = [...st.active.slice(start).map((a) => a.name), name];
    report(st, join(owner.path, name), `variable cycle: ${chain.join(' → ')}`);
    return use;
  }
  if (st.active.length >= MAX_CHAIN) {
    tooBig(st);
    return use;
  }
  st.marks.set(path, [...(st.marks.get(path) ?? []), name]);
  st.active.push({ scope: owner, name });
  st.depth++;
  const out = expandValue(owner.vars[name], path, owner, st);
  st.depth--;
  st.active.pop();
  return out;
}

function expandList(
  list: readonly unknown[],
  path: string,
  scope: Scope | null,
  st: State,
) {
  let changed = st.depth > 0;
  const out = list.map((item, i) => {
    const next = expandValue(item, `${path}[${i}]`, scope, st);
    if (next !== item) changed = true;
    return next;
  });
  return changed ? out : list;
}

function expandEntries(
  value: Rec,
  path: string,
  scope: Scope | null,
  st: State,
): unknown {
  let changed = st.depth > 0;
  const out: Rec = {};
  for (const [key, item] of Object.entries(value)) {
    const next = expandValue(item, join(path, key), scope, st);
    if (next !== item) changed = true;
    put(out, key, next);
  }
  return changed ? out : value;
}

/** Counts the node created by the substitution (only inside a variable); stops at the ceiling. */
function count(st: State): void {
  if (st.depth === 0) return;
  st.nodes++;
  if (st.nodes > MAX_EXPANDED_NODES) tooBig(st);
}

function tooBig(st: State): void {
  if (st.over) return;
  st.over = true;
  report(
    st,
    '',
    `variable expansion too large (more than ${MAX_EXPANDED_NODES} nodes)`,
  );
}

/** A value (expression, condition, literal or style object) with the `$var`s replaced. */
function expandValue(
  value: unknown,
  path: string,
  scope: Scope | null,
  st: State,
): unknown {
  count(st);
  if (st.over) return value;
  if (Array.isArray(value)) return expandList(value, path, scope, st);
  if (!isRecord(value)) return value;
  if ('$var' in value) return substitute(value, path, scope, st);
  return expandEntries(value, path, scope, st);
}

/** The scope the frame's `let` opens (checking it); `null` when the node has no frame `let`. */
function openScope(
  node: Rec,
  path: string,
  parent: Scope | null,
  st: State,
): Scope | null {
  if (node.type !== 'frame' || !('let' in node)) return null;
  const at = join(path, 'let');
  if (!isRecord(node.let)) {
    report(st, at, 'expected an object');
    return null;
  }
  for (const name of Object.keys(node.let))
    if (!VARIABLE_NAME_PATTERN.test(name)) report(st, join(at, name), EXPECTED_NAME);
  return { vars: node.let, parent, path: at };
}

/** The children of `children` and the `template` are nodes; the rest of the keys is a value. */
function expandKey(
  key: string,
  value: unknown,
  path: string,
  scope: Scope | null,
  st: State,
): unknown {
  const at = join(path, key);
  if (key === 'template' && isRecord(value)) return expandNode(value, at, scope, st);
  if (key !== 'children' || !Array.isArray(value))
    return expandValue(value, at, scope, st);
  let changed = false;
  const out = value.map((child: unknown, i) => {
    const next = expandNode(child, `${at}[${i}]`, scope, st);
    if (next !== child) changed = true;
    return next;
  });
  return changed ? out : value;
}

/** A node with the `let` applied and the `$var`s of the keys (and of the descendants) replaced. */
function expandNode(
  node: unknown,
  path: string,
  scope: Scope | null,
  st: State,
): unknown {
  if (!isRecord(node)) return expandValue(node, path, scope, st);
  const own = openScope(node, path, scope, st);
  const inner = own ?? scope;
  const stripped = node.type === 'frame' && 'let' in node;
  let changed = stripped;
  const out: Rec = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'let' && stripped) continue;
    const next = expandKey(key, value, path, inner, st);
    if (next !== value) changed = true;
    put(out, key, next);
  }
  return changed ? out : node;
}

/**
 * Replaces the `template`'s `$var`s with the variables' content and removes the frames' `let`s.
 * The problems (invalid name, undefined variable, cycle, ceiling) come in `issues`, and then
 * `value` must not be checked (the tree is incomplete).
 */
export function expandVariables(template: unknown, path = 'template'): VariableExpansion {
  const st: State = {
    issues: [],
    seen: new Set(),
    marks: new Map(),
    active: [],
    nodes: 0,
    depth: 0,
    over: false,
  };
  const value = expandNode(template, path, null, st);
  return { value, issues: st.issues, rewrite: (p) => rewritePath(p, st.marks) };
}

/**
 * The paths of every frame `let` and every `{ "$var" }` of the `template` as they are written
 * (including in the content of unused variables): the version check uses them in a
 * `formatVersion` earlier than 4.
 */
export function variableSyntaxPaths(node: unknown, path = 'template'): string[] {
  if (Array.isArray(node))
    return node.flatMap((v, i) => variableSyntaxPaths(v, `${path}[${i}]`));
  if (!isRecord(node)) return [];
  if ('$var' in node) return [path];
  const found: string[] = [];
  for (const [key, value] of Object.entries(node)) {
    const at = join(path, key);
    if (key === 'let' && node.type === 'frame') found.push(at);
    found.push(...variableSyntaxPaths(value, at));
  }
  return found;
}
