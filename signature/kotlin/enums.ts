import { findBodyOpen, isPunct, isWord, topLevel, type TokenStream } from '../tokens';

// `enum class Nome { A, B(1), C { … }; … }`: as constantes, na ordem da declaração.

/** Pula as anotações de uma constante (`@Deprecated("x") A`): o índice do primeiro token que não é anotação. */
function skipEntryAnnotations(stream: TokenStream, from: number): number {
  let j = from;
  while (isPunct(stream, j, '@')) {
    j += 2;
    while (isPunct(stream, j, '.')) j += 2;
    if (isPunct(stream, j, '(')) j = stream.match[j]! + 1;
  }
  return j;
}

/** As constantes do corpo do enum que abre em `open`. */
function readEntries(stream: TokenStream, open: number): string[] {
  const close = stream.match[open]!;
  const entries: string[] = [];
  let expectEntry = true;
  let skipUntil = open + 1;
  for (const i of topLevel(stream, open + 1, close)) {
    if (i < skipUntil) continue;
    if (isPunct(stream, i, ';')) break;
    if (isPunct(stream, i, ',')) {
      expectEntry = true;
      continue;
    }
    if (!expectEntry) continue;
    const at = skipEntryAnnotations(stream, i);
    const token = stream.tokens[at];
    if (token?.kind !== 'ident') break;
    entries.push(token.text);
    expectEntry = false;
    skipUntil = at + 1;
  }
  return entries;
}

/** Nome do `enum class` → constantes (a primeira declaração de cada nome vale). */
export function findEnums(stream: TokenStream): Map<string, string[]> {
  const enums = new Map<string, string[]>();
  stream.tokens.forEach((token, i) => {
    if (
      token.kind !== 'ident' ||
      token.text !== 'enum' ||
      !isWord(stream, i + 1, 'class')
    )
      return;
    const name = stream.tokens[i + 2];
    const open = findBodyOpen(stream, i + 3);
    if (name?.kind !== 'ident' || open === undefined || enums.has(name.text)) return;
    enums.set(name.text, readEntries(stream, open));
  });
  return enums;
}
