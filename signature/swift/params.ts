import type { SignatureParam, SignatureRole } from '../../src/model/signatures';
import {
  findEquals,
  readAnnotations,
  splitParams,
  type EnumTable,
  type Range,
} from '../paramList';
import { errorAtToken, isPunct, joinTokens, topLevel, type TokenStream } from '../tokens';
import { caseName, valueFor } from './literals';
import {
  baseName,
  lastSegment,
  returnType,
  simpleName,
  splitType,
  topLevelArrow,
  unwrap,
  type TypeParts,
} from './types';

// A Swift parameter: what is read from the source (`RawParam`, from the `init` or the memberwise
// property) and the record entry (`buildParam`: the `role`, the `value.kind` and the literal `default`).

export interface RawParam {
  readonly name: string;
  /** The external label, only when it differs from the name (`_` is positional). */
  readonly label?: string;
  /** The type text in the source, with the leading attributes (`@ViewBuilder () -> Content`). */
  readonly type: string;
  /** The default's text, if any. */
  readonly default?: string;
  /** The state object (`@ObservedObject`, `@Bindable`): role `state`. */
  readonly state?: boolean;
}

export interface BuildContext {
  readonly enums: EnumTable;
  /** The struct's generics that are `View`: whatever has that type is a slot. */
  readonly viewGenerics: ReadonlySet<string>;
}

const VIEW_TYPES = new Set(['View', 'AnyView']);

function isViewType(text: string, ctx: BuildContext): boolean {
  const name = lastSegment(baseName(text));
  return VIEW_TYPES.has(name) || ctx.viewGenerics.has(name);
}

function roleOf(raw: RawParam, parts: TypeParts, ctx: BuildContext): SignatureRole {
  if (parts.specifier || parts.core.trim().endsWith('...')) return 'other';
  const core = unwrap(parts.core);
  if (topLevelArrow(core) >= 0) {
    const builder = parts.attributes.includes('ViewBuilder');
    return builder || isViewType(returnType(core), ctx) ? 'slot' : 'callback';
  }
  if (isViewType(core, ctx)) return 'slot';
  const binding = lastSegment(baseName(core)) === 'Binding';
  return raw.state === true || binding ? 'state' : 'value';
}

/** The record entry: `name`, `label`, `role`, `type`, `default` (or `required`) and, for `value`, the `value`. */
export function buildParam(raw: RawParam, ctx: BuildContext): SignatureParam {
  const parts = splitType(raw.type);
  const role = roleOf(raw, parts, ctx);
  const param: SignatureParam = {
    name: raw.name,
    ...(raw.label === undefined ? {} : { label: raw.label }),
    role,
    type: raw.type,
    ...(raw.default === undefined ? { required: true } : { default: raw.default }),
  };
  return role === 'value'
    ? { ...param, value: valueFor(simpleName(parts.core), raw.default, ctx.enums) }
    : param;
}

function findColon(stream: TokenStream, from: number, to: number): number | undefined {
  for (const i of topLevel(stream, from, to)) if (isPunct(stream, i, ':')) return i;
  return undefined;
}

/** The internal name and the external label (only if it differs) from the names before the `:`. */
function readNames(
  stream: TokenStream,
  range: Range,
  from: number,
  colon: number,
): { name: string; label?: string } {
  const tokens = stream.tokens.slice(from, colon);
  const valid =
    tokens.length >= 1 && tokens.length <= 2 && tokens.every((t) => t.kind === 'ident');
  if (!valid) {
    throw errorAtToken(
      stream,
      Math.min(from, range.to - 1),
      'malformed parameter: expected "[label] name: Type"',
    );
  }
  const name = caseName(tokens[tokens.length - 1]!.text);
  const label = tokens.length === 2 ? caseName(tokens[0]!.text) : undefined;
  return label === undefined || label === name ? { name } : { name, label };
}

/** A parameter of the `init` list: `[@Attribute] [label] name: [@escaping] Type [= default]`. */
function readInitParam(stream: TokenStream, range: Range): RawParam {
  const lead = readAnnotations(stream, range.from, range.to);
  const colon = findColon(stream, lead.end, range.to);
  if (colon === undefined) {
    throw errorAtToken(
      stream,
      range.from,
      'malformed parameter: expected "[label] name: Type"',
    );
  }
  const names = readNames(stream, range, lead.end, colon);
  const eq = findEquals(stream, colon + 1, range.to);
  const typeTo = eq ?? range.to;
  if (typeTo <= colon + 1)
    throw errorAtToken(stream, colon, `parameter "${names.name}" has no type`);
  if (eq !== undefined && eq + 1 >= range.to) {
    throw errorAtToken(
      stream,
      eq,
      `parameter "${names.name}" has no value after the "="`,
    );
  }
  const attributes =
    lead.end > range.from ? joinTokens(stream, range.from, lead.end) : '';
  const body = joinTokens(stream, colon + 1, typeTo);
  return {
    ...names,
    type: attributes === '' ? body : `${attributes} ${body}`,
    ...(eq === undefined ? {} : { default: joinTokens(stream, eq + 1, range.to) }),
  };
}

/** The parameters of an `init`'s `(open … close)` list, in source order. */
export function readInitParams(
  stream: TokenStream,
  open: number,
  close: number,
): RawParam[] {
  return splitParams(stream, open, close).map((range) => readInitParam(stream, range));
}

/** How the parameter is named in the call: `_`, the label or the name (`title:` in `(_:badge:)`). */
export function callLabel(raw: RawParam): string {
  return raw.label ?? raw.name;
}
