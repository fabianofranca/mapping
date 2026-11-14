import { syntaxError, type SourceFile } from './source';

// The tokenizer's result: the code tokens (without comments), the pair of each delimiter
// `()`, `[]`, `{}` and some operations shared by all the readers.

export type TokenKind = 'ident' | 'number' | 'string' | 'char' | 'punct';

export interface Token {
  readonly kind: TokenKind;
  readonly text: string;
  readonly start: number;
  readonly end: number;
  /** The KDoc (documentation comment) attached before this token, if any (raw text). */
  readonly doc?: string;
}

export interface TokenStream {
  readonly src: SourceFile;
  readonly tokens: readonly Token[];
  /** For each `(`, `[` and `{`, the index of the closer; for each closer, that of the opener; else -1. */
  readonly match: readonly number[];
}

const OPENERS = new Set(['(', '[', '{']);

/** The name without Kotlin's backticks: `` `object` `` → `object`. */
export function unquoteName(text: string): string {
  return text.replace(/^`|`$/g, '');
}

export function isOpener(token: Token | undefined): boolean {
  return token !== undefined && token.kind === 'punct' && OPENERS.has(token.text);
}

/** Is the token `index` a punctuation mark with this text? */
export function isPunct(stream: TokenStream, index: number, text: string): boolean {
  const token = stream.tokens[index];
  return token !== undefined && token.kind === 'punct' && token.text === text;
}

/** Is the token `index` an identifier (or word) with this text? */
export function isWord(stream: TokenStream, index: number, text: string): boolean {
  const token = stream.tokens[index];
  return token !== undefined && token.kind === 'ident' && token.text === text;
}

/**
 * The indexes of `[from, to)` at the top level: an opener appears and what is inside it (up to
 * the closer) is skipped.
 */
export function* topLevel(
  stream: TokenStream,
  from: number,
  to: number,
): Generator<number> {
  let i = from;
  while (i < to) {
    yield i;
    i = isOpener(stream.tokens[i]) ? stream.match[i]! + 1 : i + 1;
  }
}

/** The index after the `>` that closes the `<` at `index` (generics); the end of the tokens if it never closes. */
export function skipAngle(stream: TokenStream, index: number): number {
  let depth = 0;
  let i = index;
  while (i < stream.tokens.length) {
    const token = stream.tokens[i]!;
    if (isOpener(token)) {
      i = stream.match[i]! + 1;
      continue;
    }
    if (token.kind === 'punct' && token.text === '<') depth++;
    else if (token.kind === 'punct' && token.text === '>') depth--;
    i++;
    if (depth === 0) return i;
  }
  return i;
}

const TIGHT_AFTER = new Set(['(', '[', '<', '.']);
const TIGHT_BEFORE = new Set([')', ']', '>', ',', '.']);

/** What separates two neighboring tokens in the normalized text: nothing, or a space. */
function gap(src: SourceFile, previous: Token, next: Token): string {
  if (next.start === previous.end) return '';
  const between = src.text.slice(previous.end, next.start);
  const tight = TIGHT_AFTER.has(previous.text) || TIGHT_BEFORE.has(next.text);
  return tight && between.includes('\n') ? '' : ' ';
}

/**
 * The text of the tokens `[from, to)` with normalized whitespace: one space where there was a space,
 * line break or comment (nothing, if the break sat next to `( [ < .` or `) ] > , .`).
 */
export function joinTokens(stream: TokenStream, from: number, to: number): string {
  let out = '';
  for (let i = from; i < to; i++) {
    const token = stream.tokens[i]!;
    if (i > from) out += gap(stream.src, stream.tokens[i - 1]!, token);
    out += token.text;
  }
  return out;
}

/** Syntax error at the start of the token `index` (or of the last one, if past the end). */
export function errorAtToken(stream: TokenStream, index: number, message: string): Error {
  const token = stream.tokens[index] ?? stream.tokens[stream.tokens.length - 1];
  return syntaxError(stream.src, token?.start ?? 0, message);
}

/** The index of the `{` of the body of the declaration that starts at `from`, skipping what comes before (constructor, supertypes, generics). */
export function findBodyOpen(stream: TokenStream, from: number): number | undefined {
  let j = from;
  while (j < stream.tokens.length) {
    if (isPunct(stream, j, '{')) return j;
    if (isPunct(stream, j, ';') || isPunct(stream, j, '}')) return undefined;
    j = isOpener(stream.tokens[j]) ? stream.match[j]! + 1 : j + 1;
  }
  return undefined;
}
