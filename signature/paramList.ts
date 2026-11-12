import { isOpener, isPunct, topLevel, type TokenStream } from './tokens';

// A lista de parâmetros, comum aos leitores: separa por vírgulas no nível de cima (parênteses,
// chaves, colchetes e `<>` de genéricos não separam) e lê as anotações (`@Nome`, `@Nome(args)`)
// que vêm antes de um parâmetro ou de uma declaração.

export interface Range {
  readonly from: number;
  readonly to: number;
}

interface AngleState {
  angle: number;
  inDefault: boolean;
}

/** Um `<` abre genérico no tipo; no padrão, só quando cola no identificador que vem antes (`listOf<A>()`). */
function opensAngle(stream: TokenStream, index: number, inDefault: boolean): boolean {
  if (!inDefault) return true;
  const previous = stream.tokens[index - 1];
  return previous?.kind === 'ident' && previous.end === stream.tokens[index]!.start;
}

function trackAngle(stream: TokenStream, index: number, state: AngleState): void {
  const token = stream.tokens[index]!;
  if (token.kind !== 'punct') return;
  if (token.text === '=' && state.angle === 0) state.inDefault = true;
  else if (token.text === '<' && opensAngle(stream, index, state.inDefault))
    state.angle++;
  else if (token.text === '>' && state.angle > 0) state.angle--;
}

/** Os intervalos de tokens de cada parâmetro da lista `(open … close)`; a vírgula final é aceita. */
export function splitParams(stream: TokenStream, open: number, close: number): Range[] {
  const ranges: Range[] = [];
  const state: AngleState = { angle: 0, inDefault: false };
  let from = open + 1;
  for (const i of topLevel(stream, open + 1, close)) {
    if (isPunct(stream, i, ',') && state.angle === 0) {
      if (i > from) ranges.push({ from, to: i });
      from = i + 1;
      state.inDefault = false;
    } else if (!isOpener(stream.tokens[i])) trackAngle(stream, i, state);
  }
  if (close > from) ranges.push({ from, to: close });
  return ranges;
}

export interface Annotations {
  readonly end: number;
  readonly names: readonly string[];
}

/** O token `index` cola no anterior (sem espaço)? Os argumentos de uma anotação vêm colados: `@Composable () -> Unit` não os tem. */
function adjacent(stream: TokenStream, index: number): boolean {
  return stream.tokens[index - 1]?.end === stream.tokens[index]?.start;
}

/** O último segmento do nome (qualificado) que começa em `from`, e o índice depois dele. */
function lastSegment(stream: TokenStream, from: number): { name: string; next: number } {
  let name = stream.tokens[from]?.text ?? '';
  let next = from + 1;
  while (isPunct(stream, next, '.')) {
    name = stream.tokens[next + 1]?.text ?? name;
    next += 2;
  }
  return { name, next };
}

export interface Attribute {
  /** O último segmento do nome (`@a.b.Nome` → `Nome`). */
  readonly name: string;
  /** Índice do `@` e o do token depois da anotação (com os argumentos, se houver). */
  readonly start: number;
  readonly end: number;
  /** Índice do `(` dos argumentos, se a anotação os tem. */
  readonly args?: number;
}

/** A anotação que começa no `@` de `from` (`@Nome`, `@a.b.Nome`, `@param:Nome`, com argumentos opcionais). */
export function readAttribute(stream: TokenStream, from: number): Attribute {
  let i = from + 1;
  if (isPunct(stream, i + 1, ':')) i += 2;
  const qualified = lastSegment(stream, i);
  const hasArgs =
    isPunct(stream, qualified.next, '(') && adjacent(stream, qualified.next);
  const end = hasArgs ? stream.match[qualified.next]! + 1 : qualified.next;
  return {
    name: qualified.name,
    start: from,
    end,
    ...(hasArgs ? { args: qualified.next } : {}),
  };
}

/** As anotações que começam em `from` (`@Nome`, `@a.b.Nome`, `@param:Nome`, com argumentos opcionais). */
export function readAnnotations(
  stream: TokenStream,
  from: number,
  to: number,
): Annotations {
  const names: string[] = [];
  let i = from;
  while (i < to && isPunct(stream, i, '@')) {
    const attribute = readAttribute(stream, i);
    names.push(attribute.name);
    i = attribute.end;
  }
  return { end: i, names };
}

/** Os valores de cada `enum` conhecido (do arquivo e dos `--also`): nome → opções, na ordem. */
export type EnumTable = ReadonlyMap<string, readonly string[]>;

/** O `=` do padrão (o primeiro no nível de cima), se houver. */
export function findEquals(
  stream: TokenStream,
  from: number,
  to: number,
): number | undefined {
  for (const i of topLevel(stream, from, to)) if (isPunct(stream, i, '=')) return i;
  return undefined;
}
