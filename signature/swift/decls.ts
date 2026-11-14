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

// The type declarations of a Swift file (`struct`, `class`, `enum`, `actor`, `extension`), at
// any level, with the types that enclose them, and the `enum`s with their cases. It reads the header and
// the body; it is not a grammar.

const TYPE_KEYWORDS = new Set(['struct', 'class', 'enum', 'actor', 'extension']);

export interface TypeDecl {
  readonly keyword: string;
  /** The simple name (`ProfileCard`); for an `extension`, the qualified name as it came. */
  readonly name: string;
  /** The types that enclose it, from outside in. */
  readonly enclosing: readonly string[];
  /** The `{` and the `}` of the body. */
  readonly open: number;
  readonly close: number;
  readonly line: number;
  /** The doc comment attached to the declaration (raw text). */
  readonly doc?: string;
  /** The generics that are `View` (`<Content: View>` or `where Content: View`). */
  readonly viewGenerics: ReadonlySet<string>;
}

/** The ranges of `[from, to)` separated by commas at the top level, counting `<>` (generics). */
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

/** The name of the `X: View` in a piece (`Content: View`), if it is one. */
function viewConstraint(stream: TokenStream, range: Range): string | undefined {
  for (const i of topLevel(stream, range.from, range.to)) {
    if (!isPunct(stream, i, ':')) continue;
    const bound = joinTokens(stream, i + 1, range.to).replace(/\s+/g, '');
    const name = joinTokens(stream, range.from, i).trim();
    // `View & Equatable` is also a view: it is enough for one of the parts to be `View`
    const isView = bound.split('&').some((b) => b === 'View' || b === 'SwiftUI.View');
    return isView && /^\w+$/.test(name) ? name : undefined;
  }
  return undefined;
}

/** The `View` generics of the header: the `<…>` after the name and the `where …` before the body. */
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

/** The name (qualified, for the `extension`) that starts at `from` and the index after it. */
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

/** All the type declarations of the file, in source order (inner ones after the one enclosing them). */
export function findTypeDecls(stream: TokenStream): TypeDecl[] {
  const out: TypeDecl[] = [];
  walk(stream, { from: 0, to: stream.tokens.length }, [], out);
  return out;
}

interface EnumCases {
  readonly options: string[];
  /** Some case has an associated value: it cannot be chosen by name alone. */
  readonly associated: boolean;
}

/** The cases of a `case a, b = 1, c(Int)`: names and whether any has an associated value. */
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

/** The cases of an `enum` body, in declaration order. */
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

/** The constants of a simple `enum` (no associated value): `Name → cases`, in declaration order. */
export function enumsOf(stream: TokenStream): Map<string, readonly string[]> {
  const enums = new Map<string, readonly string[]>();
  for (const decl of findTypeDecls(stream)) {
    if (decl.keyword !== 'enum' || enums.has(decl.name)) continue;
    const { options, associated } = casesOf(stream, decl);
    if (!associated && options.length > 0) enums.set(decl.name, options);
  }
  return enums;
}
