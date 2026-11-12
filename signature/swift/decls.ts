import type { Range } from '../paramList';
import { positionOf } from '../source';
import {
  findBodyOpen,
  isPunct,
  joinTokens,
  skipAngle,
  topLevel,
  type TokenStream,
} from '../tokens';
import { caseName } from './literals';
import { readPrefix, splitMembers } from './members';

// As declarações de tipo de um arquivo Swift (`struct`, `class`, `enum`, `actor`, `extension`), em
// qualquer nível, com os tipos que as envolvem, e os `enum` com os casos. Lê o cabeçalho e o
// corpo; não é uma gramática.

const TYPE_KEYWORDS = new Set(['struct', 'class', 'enum', 'actor', 'extension']);

export interface TypeDecl {
  readonly keyword: string;
  /** O nome simples (`ProfileCard`); numa `extension`, o nome qualificado como veio. */
  readonly name: string;
  /** Os tipos que a envolvem, de fora para dentro. */
  readonly enclosing: readonly string[];
  /** O `{` e o `}` do corpo. */
  readonly open: number;
  readonly close: number;
  readonly line: number;
  /** O comentário de documentação colado na declaração (texto cru). */
  readonly doc?: string;
  /** Os genéricos que são `View` (`<Content: View>` ou `where Content: View`). */
  readonly viewGenerics: ReadonlySet<string>;
}

/** Os intervalos de `[from, to)` separados por vírgula no nível de cima, contando `<>` (genéricos). */
function splitCommas(stream: TokenStream, from: number, to: number): Range[] {
  const ranges: Range[] = [];
  let angle = 0;
  let start = from;
  for (const i of topLevel(stream, from, to)) {
    const token = stream.tokens[i]!;
    if (token.kind !== 'punct') continue;
    if (token.text === '<') angle++;
    else if (token.text === '>' && angle > 0) angle--;
    else if (token.text === ',' && angle === 0) {
      ranges.push({ from: start, to: i });
      start = i + 1;
    }
  }
  if (to > start) ranges.push({ from: start, to });
  return ranges;
}

/** O nome do `X: View` de um pedaço (`Content: View`), se for esse. */
function viewConstraint(stream: TokenStream, range: Range): string | undefined {
  for (const i of topLevel(stream, range.from, range.to)) {
    if (!isPunct(stream, i, ':')) continue;
    const bound = joinTokens(stream, i + 1, range.to).replace(/\s+/g, '');
    const name = joinTokens(stream, range.from, i).trim();
    const isView = bound === 'View' || bound === 'SwiftUI.View';
    return isView && /^\w+$/.test(name) ? name : undefined;
  }
  return undefined;
}

/** Os genéricos `View` do cabeçalho: o `<…>` depois do nome e o `where …` antes do corpo. */
function viewGenericsOf(
  stream: TokenStream,
  nameEnd: number,
  genericsEnd: number,
  open: number,
): Set<string> {
  const found = new Set<string>();
  const ranges: Range[] =
    genericsEnd > nameEnd ? splitCommas(stream, nameEnd + 1, genericsEnd - 1) : [];
  for (let i = genericsEnd; i < open; i++) {
    if (stream.tokens[i]!.text !== 'where') continue;
    ranges.push(...splitCommas(stream, i + 1, open));
    break;
  }
  for (const range of ranges) {
    const name = viewConstraint(stream, range);
    if (name !== undefined) found.add(name);
  }
  return found;
}

/** O nome (qualificado, para a `extension`) que começa em `from` e o índice depois dele. */
function readName(stream: TokenStream, from: number): { name: string; end: number } {
  let end = from + 1;
  while (isPunct(stream, end, '.') && stream.tokens[end + 1]?.kind === 'ident') end += 2;
  return { name: joinTokens(stream, from, end).replace(/\s+/g, ''), end };
}

function readDecl(
  stream: TokenStream,
  member: Range,
  keywordAt: number,
  enclosing: readonly string[],
): TypeDecl | undefined {
  const nameToken = stream.tokens[keywordAt + 1];
  if (nameToken?.kind !== 'ident') return undefined;
  const { name, end } = readName(stream, keywordAt + 1);
  const genericsEnd = isPunct(stream, end, '<') ? skipAngle(stream, end) : end;
  const open = findBodyOpen(stream, genericsEnd);
  if (open === undefined || open >= member.to) return undefined;
  const doc = stream.tokens[member.from]!.doc;
  return {
    keyword: stream.tokens[keywordAt]!.text,
    name,
    enclosing,
    open,
    close: stream.match[open]!,
    line: positionOf(stream.src, stream.tokens[keywordAt]!.start).line,
    ...(doc === undefined ? {} : { doc }),
    viewGenerics: viewGenericsOf(stream, end, genericsEnd, open),
  };
}

function walk(
  stream: TokenStream,
  range: Range,
  enclosing: readonly string[],
  out: TypeDecl[],
): void {
  for (const member of splitMembers(stream, range.from, range.to)) {
    const at = readPrefix(stream, member.from, member.to).end;
    const keyword = stream.tokens[at];
    if (at >= member.to || keyword?.kind !== 'ident' || !TYPE_KEYWORDS.has(keyword.text))
      continue;
    const decl = readDecl(stream, member, at, enclosing);
    if (decl === undefined) continue;
    out.push(decl);
    walk(stream, { from: decl.open + 1, to: decl.close }, [...enclosing, decl.name], out);
  }
}

/** Todas as declarações de tipo do arquivo, em ordem de fonte (as de dentro depois da que as envolve). */
export function findTypeDecls(stream: TokenStream): TypeDecl[] {
  const out: TypeDecl[] = [];
  walk(stream, { from: 0, to: stream.tokens.length }, [], out);
  return out;
}

interface EnumCases {
  readonly options: string[];
  /** Algum caso tem valor associado: não dá para escolher só pelo nome. */
  readonly associated: boolean;
}

/** Os casos de um `case a, b = 1, c(Int)`: nomes e se algum tem valor associado. */
function readCases(stream: TokenStream, member: Range, from: number): EnumCases {
  const options: string[] = [];
  let associated = false;
  for (const piece of splitCommas(stream, from, member.to)) {
    const name = stream.tokens[piece.from];
    if (name?.kind !== 'ident') continue;
    options.push(caseName(name.text));
    if (isPunct(stream, piece.from + 1, '(')) associated = true;
  }
  return { options, associated };
}

/** Os casos do corpo de um `enum`, na ordem da declaração. */
function casesOf(stream: TokenStream, decl: TypeDecl): EnumCases {
  const options: string[] = [];
  let associated = false;
  for (const member of splitMembers(stream, decl.open + 1, decl.close)) {
    const at = readPrefix(stream, member.from, member.to).end;
    if (stream.tokens[at]?.text !== 'case' || at >= member.to) continue;
    const cases = readCases(stream, member, at + 1);
    options.push(...cases.options);
    associated ||= cases.associated;
  }
  return { options, associated };
}

/** As constantes de um `enum` simples (sem valor associado): `Nome → casos`, na ordem da declaração. */
export function enumsOf(stream: TokenStream): Map<string, readonly string[]> {
  const enums = new Map<string, readonly string[]>();
  for (const decl of findTypeDecls(stream)) {
    if (decl.keyword !== 'enum' || enums.has(decl.name)) continue;
    const { options, associated } = casesOf(stream, decl);
    if (!associated && options.length > 0) enums.set(decl.name, options);
  }
  return enums;
}
