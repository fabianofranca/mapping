import type {
  SignatureParam,
  SignatureRole,
  SignatureValue,
} from '../../src/model/signatures';
import {
  findEquals,
  readAnnotations,
  splitParams,
  type Annotations,
  type EnumTable,
  type Range,
} from '../paramList';
import {
  errorAtToken,
  isPunct,
  joinTokens,
  topLevel,
  unquoteName,
  type TokenStream,
} from '../tokens';
import { valueFor } from './literals';

// A lista de parâmetros de uma função: separa por vírgulas no nível de cima (parênteses, chaves,
// colchetes e `<>` de genéricos não separam) e lê cada `[anotações] [vararg] nome: Tipo [= padrão]`.

const PARAM_MODIFIERS = new Set(['vararg', 'noinline', 'crossinline', 'val', 'var']);
const STATE_SUFFIX = /(?:InteractionSource|State|FocusRequester|ScrollBehavior)$/;

/** O tipo sem o `?` final e sem os parênteses que o envolvem inteiro: `(@Composable () -> Unit)?`. */
function coreRange(stream: TokenStream, range: Range): Range {
  let { from, to } = range;
  for (;;) {
    if (to - from >= 1 && isPunct(stream, to - 1, '?')) to--;
    const wrapped = isPunct(stream, from, '(') && stream.match[from] === to - 1;
    if (!wrapped) return { from, to };
    from++;
    to--;
  }
}

/** O tipo tem `->` no nível de cima (função), fora dos `<>` de genéricos? */
function isFunctionType(stream: TokenStream, range: Range): boolean {
  let angle = 0;
  for (const i of topLevel(stream, range.from, range.to)) {
    if (isPunct(stream, i, '<')) angle++;
    else if (isPunct(stream, i, '>')) angle--;
    else if (angle === 0 && isPunct(stream, i, '->')) return true;
  }
  return false;
}

/** O nome do tipo sem os argumentos de genéricos (`State<Int>` → `State`). */
function baseName(stream: TokenStream, range: Range): string {
  let end = range.to;
  for (let i = range.from; i < range.to; i++) {
    if (isPunct(stream, i, '<')) {
      end = i;
      break;
    }
  }
  return joinTokens(stream, range.from, end).replace(/\s+/g, '');
}

/** O tipo é só um nome (com pontos), sem genéricos, funções nem anotações? */
function isPlainName(stream: TokenStream, range: Range): boolean {
  if (range.to <= range.from) return false;
  for (let i = range.from; i < range.to; i++) {
    const token = stream.tokens[i]!;
    const ok = token.kind === 'ident' || (token.kind === 'punct' && token.text === '.');
    if (!ok) return false;
  }
  return true;
}

/** `@Composable` antes dos parênteses (`@Composable (() -> Unit)?`) ou dentro deles (`(@Composable () -> Unit)?`). */
function isComposableFunction(stream: TokenStream, range: Range, core: Range): boolean {
  const outer = readAnnotations(stream, range.from, range.to);
  const inner = readAnnotations(stream, core.from, core.to);
  return outer.names.includes('Composable') || inner.names.includes('Composable');
}

/** `state` pelo sufixo do nome, a menos que o tipo seja um `enum class` conhecido. */
function isStateType(name: string, enums: EnumTable): boolean {
  return STATE_SUFFIX.test(name) && !enums.has(name.slice(name.lastIndexOf('.') + 1));
}

function roleOf(
  stream: TokenStream,
  range: Range,
  vararg: boolean,
  enums: EnumTable,
): SignatureRole {
  if (vararg) return 'other';
  const lead = readAnnotations(stream, range.from, range.to);
  const core = coreRange(stream, { from: lead.end, to: range.to });
  if (isFunctionType(stream, core)) {
    return isComposableFunction(stream, range, core) ? 'slot' : 'callback';
  }
  const name = baseName(stream, core);
  if (name === 'Modifier' || name.endsWith('.Modifier')) return 'modifier';
  return isStateType(name, enums) ? 'state' : 'value';
}

interface Declared {
  readonly range: Range;
  readonly annotations: Annotations;
  readonly vararg: boolean;
  readonly name: string;
  readonly type: Range;
  readonly defaultRange: Range | undefined;
}

/** Pula `vararg`, `noinline`, `crossinline`, `val` e `var`; diz onde o nome começa e se havia `vararg`. */
function readModifiers(
  stream: TokenStream,
  from: number,
  to: number,
): { at: number; vararg: boolean } {
  let at = from;
  let vararg = false;
  while (at < to && PARAM_MODIFIERS.has(stream.tokens[at]!.text)) {
    if (stream.tokens[at]!.text === 'vararg') vararg = true;
    at++;
  }
  return { at, vararg };
}

function declare(stream: TokenStream, range: Range): Declared {
  const annotations = readAnnotations(stream, range.from, range.to);
  const { at, vararg } = readModifiers(stream, annotations.end, range.to);
  const name = stream.tokens[at];
  if (at >= range.to || name?.kind !== 'ident' || !isPunct(stream, at + 1, ':')) {
    const where = Math.min(at, range.to - 1);
    throw errorAtToken(stream, where, 'parâmetro mal formado: esperado "nome: Tipo"');
  }
  const eq = findEquals(stream, at + 2, range.to);
  const type = { from: at + 2, to: eq ?? range.to };
  if (type.to <= type.from)
    throw errorAtToken(stream, at, `parâmetro "${name.text}" sem tipo`);
  if (eq !== undefined && eq + 1 >= range.to) {
    throw errorAtToken(stream, eq, `parâmetro "${name.text}" sem valor depois do "="`);
  }
  const defaultRange = eq === undefined ? undefined : { from: eq + 1, to: range.to };
  return { range, annotations, vararg, name: unquoteName(name.text), type, defaultRange };
}

function typeText(stream: TokenStream, d: Declared): string {
  const annotation =
    d.annotations.end > d.range.from
      ? [joinTokens(stream, d.range.from, d.annotations.end)]
      : [];
  const body = joinTokens(stream, d.type.from, d.type.to);
  return [...annotation, d.vararg ? `vararg ${body}` : body].join(' ');
}

/** O nome do tipo para o `kind` (sem qualificação): `androidx.…Color` → `Color`; vazio se não for um nome simples. */
function valueTypeName(stream: TokenStream, core: Range): string {
  if (!isPlainName(stream, core)) return '';
  const name = joinTokens(stream, core.from, core.to);
  return name.slice(name.lastIndexOf('.') + 1);
}

/** O tipo tem `<` (genérico)? */
function hasAngle(stream: TokenStream, range: Range): boolean {
  for (let i = range.from; i < range.to; i++) if (isPunct(stream, i, '<')) return true;
  return false;
}

/** O `value` do parâmetro: genéricos e parâmetros com anotação própria são opaque. */
function valueOf(
  stream: TokenStream,
  d: Declared,
  defaultText: string | undefined,
  enums: EnumTable,
): SignatureValue {
  const core = coreRange(stream, d.type);
  const own = d.annotations.end > d.range.from;
  if (own || hasAngle(stream, core)) return { kind: 'opaque' };
  return valueFor(valueTypeName(stream, core), defaultText, enums);
}

function readParam(stream: TokenStream, range: Range, enums: EnumTable): SignatureParam {
  const d = declare(stream, range);
  const role = roleOf(stream, d.type, d.vararg, enums);
  const defaultText =
    d.defaultRange && joinTokens(stream, d.defaultRange.from, d.defaultRange.to);
  const param: SignatureParam = {
    name: d.name,
    role,
    type: typeText(stream, d),
    ...(defaultText === undefined ? { required: true } : { default: defaultText }),
  };
  return role === 'value'
    ? { ...param, value: valueOf(stream, d, defaultText, enums) }
    : param;
}

/** Os parâmetros da lista `(open … close)`, na ordem da fonte, ainda sem as fábricas. */
export function parseParams(
  stream: TokenStream,
  open: number,
  close: number,
  enums: EnumTable,
): SignatureParam[] {
  return splitParams(stream, open, close).map((range) => readParam(stream, range, enums));
}

/** Só os nomes dos parâmetros da lista `(open … close)`. */
export function parameterNames(
  stream: TokenStream,
  open: number,
  close: number,
): string[] {
  return splitParams(stream, open, close).map((range) => declare(stream, range).name);
}
