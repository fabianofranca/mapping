import type { SignatureParam, SignatureRole } from '../../src/model/signatures';
import { readAnnotations, splitParams, type Range } from '../paramList';
import { errorAtToken, isPunct, joinTokens, topLevel, type TokenStream } from '../tokens';
import { caseName, valueFor, type EnumTable } from './literals';
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

// Um parâmetro Swift: o que se lê da fonte (`RawParam`, do `init` ou da propriedade do memberwise)
// e a entrada da ficha (`buildParam`: o `role`, o `value.kind` e o `default` literal).

export interface RawParam {
  readonly name: string;
  /** O rótulo externo, só quando difere do nome (`_` é posicional). */
  readonly label?: string;
  /** O texto do tipo na fonte, com os atributos da frente (`@ViewBuilder () -> Content`). */
  readonly type: string;
  /** O texto do padrão, se há. */
  readonly default?: string;
  /** O objeto de estado (`@ObservedObject`, `@Bindable`): papel `state`. */
  readonly state?: boolean;
}

export interface BuildContext {
  readonly enums: EnumTable;
  /** Os genéricos da struct que são `View`: o que tem esse tipo é um slot. */
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

/** A entrada da ficha: `name`, `label`, `role`, `type`, `default` (ou `required`) e, no `value`, o `value`. */
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

/** O `=` do padrão (o primeiro no nível de cima), se houver. */
function findEquals(stream: TokenStream, from: number, to: number): number | undefined {
  for (const i of topLevel(stream, from, to)) if (isPunct(stream, i, '=')) return i;
  return undefined;
}

function findColon(stream: TokenStream, from: number, to: number): number | undefined {
  for (const i of topLevel(stream, from, to)) if (isPunct(stream, i, ':')) return i;
  return undefined;
}

/** O nome interno e o rótulo externo (só se difere) dos nomes antes do `:`. */
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
      'parâmetro mal formado: esperado "[rótulo] nome: Tipo"',
    );
  }
  const name = caseName(tokens[tokens.length - 1]!.text);
  const label = tokens.length === 2 ? caseName(tokens[0]!.text) : undefined;
  return label === undefined || label === name ? { name } : { name, label };
}

/** Um parâmetro da lista do `init`: `[@Atributo] [rótulo] nome: [@escaping] Tipo [= padrão]`. */
function readInitParam(stream: TokenStream, range: Range): RawParam {
  const lead = readAnnotations(stream, range.from, range.to);
  const colon = findColon(stream, lead.end, range.to);
  if (colon === undefined) {
    throw errorAtToken(
      stream,
      range.from,
      'parâmetro mal formado: esperado "[rótulo] nome: Tipo"',
    );
  }
  const names = readNames(stream, range, lead.end, colon);
  const eq = findEquals(stream, colon + 1, range.to);
  const typeTo = eq ?? range.to;
  if (typeTo <= colon + 1)
    throw errorAtToken(stream, colon, `parâmetro "${names.name}" sem tipo`);
  if (eq !== undefined && eq + 1 >= range.to) {
    throw errorAtToken(stream, eq, `parâmetro "${names.name}" sem valor depois do "="`);
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

/** Os parâmetros da lista `(open … close)` de um `init`, na ordem da fonte. */
export function readInitParams(
  stream: TokenStream,
  open: number,
  close: number,
): RawParam[] {
  return splitParams(stream, open, close).map((range) => readInitParam(stream, range));
}

/** Como se chama o parâmetro na chamada: `_`, o rótulo ou o nome (`title:` no `(_:badge:)`). */
export function callLabel(raw: RawParam): string {
  return raw.label ?? raw.name;
}
