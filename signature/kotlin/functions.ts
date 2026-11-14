import { isOpener, isPunct, skipAngle, unquoteName, type TokenStream } from '../tokens';
import { positionOf } from '../source';

// Finds the `fun name(…)` functions of a file, with the annotations that come before them
// (`@Composable`, `@Deprecated`) and the KDoc attached to them. Not a grammar: it reads the header, its `(` and `)`.

export interface FunctionDecl {
  readonly name: string;
  /** Index of the `(` and `)` of the parameter list. */
  readonly open: number;
  readonly close: number;
  /** Index of the `fun` token. */
  readonly funIndex: number;
  /** Line (1-based) of the `fun`. */
  readonly line: number;
  readonly composable: boolean;
  readonly deprecated: boolean;
  /** The KDoc attached before the declaration (raw text), if any. */
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
  /** Index of the `@`. */
  readonly start: number;
  readonly name: string;
}

/** The index of the first token of the annotation name (with the leading `a.b.` and the `target:` of `@get:Name`). */
function annotationNameStart(stream: TokenStream, nameIndex: number): number {
  const { tokens } = stream;
  let start = nameIndex;
  while (isPunct(stream, start - 1, '.') && tokens[start - 2]?.kind === 'ident')
    start -= 2;
  const useSite = isPunct(stream, start - 1, ':') && tokens[start - 2]?.kind === 'ident';
  return useSite && isPunct(stream, start - 3, '@') ? start - 2 : start;
}

/** The annotation that ends at the token `end` (the name, or the `)` of the arguments), read backwards. */
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

/** The modifiers and annotations that come before the `fun`: their first token and the annotation names. */
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

/** The index of the `(` of the header that starts at the `fun` (skips generics and receiver); `undefined` if it is not a function. */
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

/** The name and the `(` of the header that starts at the `fun`. */
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

/** All the functions of the file, in source order (computed once per file). */
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
