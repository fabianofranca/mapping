import { isOpener, isPunct, topLevel, type TokenStream } from './tokens';

// The parameter list, shared by the readers: splits on top-level commas (parentheses,
// braces, brackets and generic `<>` do not split) and reads the annotations (`@Name`, `@Name(args)`)
// that come before a parameter or a declaration.

export interface Range {
  readonly from: number;
  readonly to: number;
}

interface AngleState {
  angle: number;
  inDefault: boolean;
}

/** A `<` opens a generic in the type; in the default, only when it sticks to the preceding identifier (`listOf<A>()`). */
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

/** The token ranges of each parameter in the list `(open … close)`; a trailing comma is accepted. */
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

/** Does the token `index` stick to the previous one (no space)? An annotation's arguments come attached: `@Composable () -> Unit` has none. */
function adjacent(stream: TokenStream, index: number): boolean {
  return stream.tokens[index - 1]?.end === stream.tokens[index]?.start;
}

/** The last segment of the (qualified) name starting at `from`, and the index after it. */
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
  /** The last segment of the name (`@a.b.Name` → `Name`). */
  readonly name: string;
  /** Index of the `@` and that of the token after the annotation (with the arguments, if any). */
  readonly start: number;
  readonly end: number;
  /** Index of the `(` of the arguments, if the annotation has them. */
  readonly args?: number;
}

/** The annotation starting at the `@` of `from` (`@Name`, `@a.b.Name`, `@param:Name`, with optional arguments). */
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

/** The annotations starting at `from` (`@Name`, `@a.b.Name`, `@param:Name`, with optional arguments). */
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

/** The values of each known `enum` (from the file and the `--also` ones): name → options, in order. */
export type EnumTable = ReadonlyMap<string, readonly string[]>;

/** The `=` of the default (the first at top level), if any. */
export function findEquals(
  stream: TokenStream,
  from: number,
  to: number,
): number | undefined {
  for (const i of topLevel(stream, from, to)) if (isPunct(stream, i, '=')) return i;
  return undefined;
}
