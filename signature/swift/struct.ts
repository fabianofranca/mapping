import type { Attribute, Range } from '../paramList';
import { positionOf } from '../source';
import { isPunct, joinTokens, skipAngle, topLevel, type TokenStream } from '../tokens';
import type { TypeDecl } from './decls';
import { inferType } from './literals';
import { readPrefix, splitMembers, type Prefix } from './members';
import type { RawParam } from './params';
import { topLevelArrow, unwrap } from './types';

// What the `struct` declares: the `init`s (the header) and the stored properties that go into the
// memberwise `init`. The memberwise one leaves out what Swift does not put in it or what is not passed from
// outside: `@State`, `@StateObject`, `@Environment`, `@EnvironmentObject`, `@FocusState`, `let` with
// a value, `static`/`class`, `lazy`, `private`/`fileprivate`, computed ones and wrappers with arguments.

/** The internal-state property wrappers: the memberwise `init` does not receive them. */
const INTERNAL_WRAPPERS = new Set([
  'State',
  'StateObject',
  'Environment',
  'EnvironmentObject',
  'FocusState',
  // Swift fills them in on its own: they are not memberwise init arguments either
  'Namespace',
  'GestureState',
  'ScaledMetric',
  'AccessibilityFocusState',
]);
/** Attributes that are not property wrappers (they can have arguments without removing the property from the memberwise). */
const PLAIN_ATTRIBUTES = new Set(['available', 'MainActor', 'objc', 'preconcurrency']);
/** Modifiers that remove the property from the memberwise `init`. */
const EXCLUDED_MODIFIERS = new Set(['static', 'class', 'lazy', 'private', 'fileprivate']);
const OBSERVERS = new Set(['willSet', 'didSet']);
const OBJECT_WRAPPERS = new Set(['ObservedObject', 'Bindable']);

export interface InitDecl {
  /** The `(` and the `)` of the parameter list. */
  readonly open: number;
  readonly close: number;
  readonly line: number;
  /** `@available(…, deprecated|unavailable|obsoleted)`. */
  readonly deprecated: boolean;
  /** `private` or `fileprivate`: not callable from outside, so it is not a candidate on its own. */
  readonly hidden: boolean;
  readonly doc?: string;
}

export interface MemberProp {
  readonly param: RawParam;
  readonly doc?: string;
}

export interface StructMembers {
  readonly inits: readonly InitDecl[];
  /** The memberwise properties, in declaration order. */
  readonly props: readonly MemberProp[];
  /** The text of the `///` of each `let`/`var` with documentation (in the memberwise or not), by name. */
  readonly propDocs: ReadonlyMap<string, string>;
}

const hasAttribute = (attributes: readonly Attribute[], name: string): boolean =>
  attributes.some((a) => a.name === name);

function isDeprecated(stream: TokenStream, attributes: readonly Attribute[]): boolean {
  return attributes.some((attribute) => {
    if (attribute.name !== 'available' || attribute.args === undefined) return false;
    const close = stream.match[attribute.args]!;
    for (let i = attribute.args + 1; i < close; i++) {
      if (['deprecated', 'unavailable', 'obsoleted'].includes(stream.tokens[i]!.text))
        return true;
    }
    return false;
  });
}

function readInit(
  stream: TokenStream,
  from: number,
  at: number,
  prefix: Prefix,
): InitDecl | undefined {
  let open = at + 1;
  while (isPunct(stream, open, '?') || isPunct(stream, open, '!')) open++;
  if (isPunct(stream, open, '<')) open = skipAngle(stream, open);
  if (!isPunct(stream, open, '(')) return undefined;
  const doc = stream.tokens[from]!.doc;
  return {
    open,
    close: stream.match[open]!,
    line: positionOf(stream.src, stream.tokens[at]!.start).line,
    deprecated: isDeprecated(stream, prefix.attributes),
    hidden: prefix.modifiers.some((m) => m === 'private' || m === 'fileprivate'),
    ...(doc === undefined ? {} : { doc }),
  };
}

interface Shape {
  /** The `=` of the default and where the default ends (before the `didSet` observers). */
  readonly eq?: number;
  readonly valueEnd: number;
  /** The end of the written type (the `=`, the `{` or the end of the member). */
  readonly typeEnd: number;
  /** Has a body that makes it computed (`{ … }` that are not observers). */
  readonly computed: boolean;
}

const startsObservers = (stream: TokenStream, open: number): boolean =>
  OBSERVERS.has(stream.tokens[open + 1]?.text ?? '');

/** The first `=` or `{` at the top level (whichever comes first). */
function firstBreak(
  stream: TokenStream,
  from: number,
  to: number,
): { eq?: number; brace?: number } {
  for (const i of topLevel(stream, from, to)) {
    if (isPunct(stream, i, '=')) return { eq: i };
    if (isPunct(stream, i, '{')) return { brace: i };
  }
  return {};
}

/** The `{` of the observers (`didSet`) that close the member after the default, or `to` if there is none. */
function valueEndOf(stream: TokenStream, after: number, to: number): number {
  const opener = isPunct(stream, to - 1, '}') ? stream.match[to - 1]! : -1;
  return opener > after && startsObservers(stream, opener) ? opener : to;
}

/** The `=`, the `{` and the observers of a property, starting from what comes after the name. */
function shapeOf(stream: TokenStream, from: number, to: number): Shape {
  const { eq, brace } = firstBreak(stream, from, to);
  return {
    ...(eq === undefined ? {} : { eq }),
    valueEnd: valueEndOf(stream, eq ?? from, to),
    typeEnd: eq ?? brace ?? to,
    computed: brace !== undefined && !startsObservers(stream, brace),
  };
}

function typeOf(stream: TokenStream, at: number, shape: Shape, value?: string): string {
  const hasType = isPunct(stream, at + 2, ':');
  return hasType ? joinTokens(stream, at + 3, shape.typeEnd) : inferType(value);
}

function wrapped(type: string, attributes: readonly Attribute[]): string {
  if (hasAttribute(attributes, 'Binding')) return `Binding<${type}>`;
  const isFunction = topLevelArrow(unwrap(type)) >= 0;
  return hasAttribute(attributes, 'ViewBuilder') && isFunction
    ? `@ViewBuilder ${type}`
    : type;
}

/** Out of the memberwise because of a modifier or a property wrapper? */
function excluded(prefix: Prefix): boolean {
  if (prefix.modifiers.some((m) => EXCLUDED_MODIFIERS.has(m))) return true;
  return prefix.attributes.some(
    (a) =>
      INTERNAL_WRAPPERS.has(a.name) ||
      (a.args !== undefined && !PLAIN_ATTRIBUTES.has(a.name)),
  );
}

/** The written default, or `nil` for an optional `var` with no default (Swift supplies it on its own). */
function defaultOf(
  keyword: string,
  type: string,
  value: string | undefined,
): string | undefined {
  if (value !== undefined) return value;
  return keyword === 'var' && /[?!]$/.test(type.trim()) ? 'nil' : undefined;
}

function readProp(
  stream: TokenStream,
  to: number,
  at: number,
  prefix: Prefix,
): RawParam | undefined {
  const keyword = stream.tokens[at]!.text;
  const name = stream.tokens[at + 1];
  if (name?.kind !== 'ident' || excluded(prefix)) return undefined;
  const shape = shapeOf(stream, at + 2, to);
  const value =
    shape.eq === undefined ? undefined : joinTokens(stream, shape.eq + 1, shape.valueEnd);
  if (shape.computed || (keyword === 'let' && value !== undefined)) return undefined;
  const type = typeOf(stream, at, shape, value);
  const defaultText = defaultOf(keyword, type, value);
  const state = prefix.attributes.some((a) => OBJECT_WRAPPERS.has(a.name));
  return {
    name: name.text.replace(/^`|`$/g, ''),
    type: wrapped(type, prefix.attributes),
    ...(defaultText === undefined ? {} : { default: defaultText }),
    ...(state ? { state } : {}),
  };
}

interface Found {
  readonly inits: InitDecl[];
  readonly props: MemberProp[];
  readonly propDocs: Map<string, string>;
}

function readStored(
  stream: TokenStream,
  member: Range,
  at: number,
  prefix: Prefix,
  found: Found,
): void {
  const doc = stream.tokens[member.from]!.doc;
  const name = stream.tokens[at + 1]?.text.replace(/^`|`$/g, '');
  if (doc !== undefined && name !== undefined) found.propDocs.set(name, doc);
  const param = readProp(stream, member.to, at, prefix);
  if (param !== undefined)
    found.props.push({ param, ...(doc === undefined ? {} : { doc }) });
}

function readMember(stream: TokenStream, member: Range, found: Found): void {
  const prefix = readPrefix(stream, member.from, member.to);
  const at = prefix.end;
  if (at >= member.to) return;
  const word = stream.tokens[at]!.text;
  if (word === 'init') {
    const init = readInit(stream, member.from, at, prefix);
    if (init !== undefined) found.inits.push(init);
  } else if (word === 'let' || word === 'var') {
    readStored(stream, member, at, prefix, found);
  }
}

/** The `init`s and the properties of the struct body. */
export function readStruct(stream: TokenStream, decl: TypeDecl): StructMembers {
  const found: Found = { inits: [], props: [], propDocs: new Map() };
  for (const member of splitMembers(stream, decl.open + 1, decl.close))
    readMember(stream, member, found);
  return found;
}
