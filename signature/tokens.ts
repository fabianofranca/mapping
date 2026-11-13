import { syntaxError, type SourceFile } from './source';

// O resultado do tokenizador: os tokens de código (sem comentários), o par de cada delimitador
// `()`, `[]`, `{}` e algumas operações comuns a todos os leitores.

export type TokenKind = 'ident' | 'number' | 'string' | 'char' | 'punct';

export interface Token {
  readonly kind: TokenKind;
  readonly text: string;
  readonly start: number;
  readonly end: number;
  /** O KDoc (comentário de documentação) colado antes deste token, se houver (texto cru). */
  readonly doc?: string;
}

export interface TokenStream {
  readonly src: SourceFile;
  readonly tokens: readonly Token[];
  /** Para cada `(`, `[` e `{`, o índice do fechamento; para cada fechamento, o do abridor; senão -1. */
  readonly match: readonly number[];
}

const OPENERS = new Set(['(', '[', '{']);

/** O nome sem as crases de Kotlin: `` `object` `` → `object`. */
export function unquoteName(text: string): string {
  return text.replace(/^`|`$/g, '');
}

export function isOpener(token: Token | undefined): boolean {
  return token !== undefined && token.kind === 'punct' && OPENERS.has(token.text);
}

/** O token `index` é um sinal de pontuação com este texto? */
export function isPunct(stream: TokenStream, index: number, text: string): boolean {
  const token = stream.tokens[index];
  return token !== undefined && token.kind === 'punct' && token.text === text;
}

/** O token `index` é um identificador (ou palavra) com este texto? */
export function isWord(stream: TokenStream, index: number, text: string): boolean {
  const token = stream.tokens[index];
  return token !== undefined && token.kind === 'ident' && token.text === text;
}

/**
 * Os índices de `[from, to)` no nível de cima: um abridor aparece e o que há dentro dele (até o
 * fechamento) é pulado.
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

/** O índice depois do `>` que fecha o `<` de `index` (genéricos); o fim dos tokens se não fechar. */
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

/** O que separa dois tokens vizinhos no texto normalizado: nada, ou um espaço. */
function gap(src: SourceFile, previous: Token, next: Token): string {
  if (next.start === previous.end) return '';
  const between = src.text.slice(previous.end, next.start);
  const tight = TIGHT_AFTER.has(previous.text) || TIGHT_BEFORE.has(next.text);
  return tight && between.includes('\n') ? '' : ' ';
}

/**
 * O texto dos tokens `[from, to)` com os espaços normalizados: um espaço onde havia espaço, quebra
 * de linha ou comentário (nada, se a quebra ficava junto de `( [ < .` ou de `) ] > , .`).
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

/** Erro de sintaxe no começo do token `index` (ou do último, se passou do fim). */
export function errorAtToken(stream: TokenStream, index: number, message: string): Error {
  const token = stream.tokens[index] ?? stream.tokens[stream.tokens.length - 1];
  return syntaxError(stream.src, token?.start ?? 0, message);
}

/** O índice do `{` do corpo da declaração que começa em `from`, pulando o que vem antes (construtor, supertipos, genéricos). */
export function findBodyOpen(stream: TokenStream, from: number): number | undefined {
  let j = from;
  while (j < stream.tokens.length) {
    if (isPunct(stream, j, '{')) return j;
    if (isPunct(stream, j, ';') || isPunct(stream, j, '}')) return undefined;
    j = isOpener(stream.tokens[j]) ? stream.match[j]! + 1 : j + 1;
  }
  return undefined;
}
