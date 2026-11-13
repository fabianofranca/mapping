import { isOpener, isPunct, skipAngle, unquoteName, type TokenStream } from '../tokens';
import { positionOf } from '../source';

// Acha as funções `fun nome(…)` de um arquivo, com as anotações que vêm antes (`@Composable`,
// `@Deprecated`) e o KDoc colado nelas. Não é uma gramática: lê o cabeçalho, o `(` e o `)` dele.

export interface FunctionDecl {
  readonly name: string;
  /** Índice do `(` e do `)` da lista de parâmetros. */
  readonly open: number;
  readonly close: number;
  /** Índice do token `fun`. */
  readonly funIndex: number;
  /** Linha (1 em diante) do `fun`. */
  readonly line: number;
  readonly composable: boolean;
  readonly deprecated: boolean;
  /** O KDoc colado antes da declaração (texto cru), se houver. */
  readonly doc?: string;
}

const MODIFIERS = new Set([
  'public',
  'private',
  'protected',
  'internal',
  'inline',
  'suspend',
  'override',
  'open',
  'abstract',
  'final',
  'operator',
  'infix',
  'tailrec',
  'external',
  'expect',
  'actual',
]);

interface Annotation {
  /** Índice do `@`. */
  readonly start: number;
  readonly name: string;
}

/** O índice do primeiro token do nome da anotação (com os `a.b.` na frente e o `alvo:` do `@get:Nome`). */
function annotationNameStart(stream: TokenStream, nameIndex: number): number {
  const { tokens } = stream;
  let start = nameIndex;
  while (isPunct(stream, start - 1, '.') && tokens[start - 2]?.kind === 'ident')
    start -= 2;
  const useSite = isPunct(stream, start - 1, ':') && tokens[start - 2]?.kind === 'ident';
  return useSite && isPunct(stream, start - 3, '@') ? start - 2 : start;
}

/** A anotação que termina no token `end` (o nome, ou o `)` dos argumentos), lida de trás para frente. */
function annotationEndingAt(stream: TokenStream, end: number): Annotation | undefined {
  const nameIndex = isPunct(stream, end, ')') ? stream.match[end]! - 1 : end;
  const name = stream.tokens[nameIndex];
  if (name?.kind !== 'ident') return undefined;
  const start = annotationNameStart(stream, nameIndex);
  return isPunct(stream, start - 1, '@')
    ? { start: start - 1, name: name.text }
    : undefined;
}

interface Chain {
  readonly first: number;
  readonly names: readonly string[];
}

/** Os modificadores e as anotações que vêm antes do `fun`: o primeiro token deles e os nomes das anotações. */
function readChain(stream: TokenStream, funIndex: number): Chain {
  const names: string[] = [];
  let first = funIndex;
  let j = funIndex - 1;
  while (j >= 0) {
    const token = stream.tokens[j]!;
    if (token.kind === 'ident' && MODIFIERS.has(token.text)) {
      first = j;
      j--;
      continue;
    }
    const annotation = annotationEndingAt(stream, j);
    if (annotation === undefined) break;
    names.push(annotation.name);
    first = annotation.start;
    j = annotation.start - 1;
  }
  return { first, names };
}

/** O índice do `(` do cabeçalho que começa no `fun` (pula genéricos e receptor); `undefined` se não é função. */
function findOpenParen(stream: TokenStream, funIndex: number): number | undefined {
  const { tokens } = stream;
  let j = funIndex + 1;
  if (isPunct(stream, j, '<')) j = skipAngle(stream, j);
  while (j < tokens.length) {
    const token = tokens[j]!;
    if (token.kind === 'punct' && token.text === '(') return j;
    if (token.kind === 'punct' && ['{', '}', '=', ';'].includes(token.text))
      return undefined;
    j = token.text === '<' ? skipAngle(stream, j) : j + 1;
  }
  return undefined;
}

/** O nome e o `(` do cabeçalho que começa no `fun`. */
function readHeader(
  stream: TokenStream,
  funIndex: number,
): { name: string; open: number } | undefined {
  const open = findOpenParen(stream, funIndex);
  const name = open === undefined ? undefined : stream.tokens[open - 1];
  if (open === undefined || name?.kind !== 'ident') return undefined;
  return { name: unquoteName(name.text), open };
}

const FUNCTIONS = new WeakMap<TokenStream, FunctionDecl[]>();

/** Todas as funções do arquivo, em ordem de fonte (calculado uma vez por arquivo). */
export function findFunctions(stream: TokenStream): FunctionDecl[] {
  const cached = FUNCTIONS.get(stream);
  if (cached !== undefined) return cached;
  const found = scanFunctions(stream);
  FUNCTIONS.set(stream, found);
  return found;
}

function scanFunctions(stream: TokenStream): FunctionDecl[] {
  const found: FunctionDecl[] = [];
  stream.tokens.forEach((token, funIndex) => {
    if (token.kind !== 'ident' || token.text !== 'fun') return;
    const header = readHeader(stream, funIndex);
    if (header === undefined || !isOpener(stream.tokens[header.open])) return;
    const chain = readChain(stream, funIndex);
    const doc = stream.tokens[chain.first]?.doc;
    found.push({
      name: header.name,
      open: header.open,
      close: stream.match[header.open]!,
      funIndex,
      line: positionOf(stream.src, token.start).line,
      composable: chain.names.includes('Composable'),
      deprecated: chain.names.includes('Deprecated'),
      ...(doc === undefined ? {} : { doc }),
    });
  });
  return found;
}
