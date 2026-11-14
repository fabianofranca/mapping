import { readAttribute, type Attribute, type Range } from '../paramList';
import { isPunct, joinTokens, topLevel, type TokenStream } from '../tokens';

// The declarations of a Swift body (file, struct, enum…): since the text has no `;` and does not delimit
// lines, a member ends where the next line starts a top-level token, unless the previous line
// asks for continuation (`,`, `=`, `->`, operator) or has only attributes and modifiers.

const MODIFIERS = new Set([
  'public',
  'private',
  'fileprivate',
  'internal',
  'open',
  'package',
  'static',
  'class',
  'final',
  'lazy',
  'weak',
  'unowned',
  'override',
  'required',
  'convenience',
  'mutating',
  'nonmutating',
  'indirect',
  'dynamic',
  'nonisolated',
  'optional',
]);
/** `class` is only a modifier before one of these (`class var`, `class func`); otherwise it is the declaration. */
const CLASS_MEMBER = new Set(['var', 'let', 'func', 'subscript']);
/** What, at the end of a line, asks the next one to continue the same declaration. */
const CONTINUES = new Set([',', '.', ':', '=', '->', '&', '|', '+', '*', '/', '-', '\\']);

export interface Prefix {
  /** The index of the first token after the attributes and modifiers. */
  readonly end: number;
  readonly attributes: readonly Attribute[];
  /** The modifiers, with the `(set)` when present: `public`, `private(set)`. */
  readonly modifiers: readonly string[];
}

function isModifier(stream: TokenStream, index: number): boolean {
  const token = stream.tokens[index]!;
  if (token.kind !== 'ident' || !MODIFIERS.has(token.text)) return false;
  if (token.text !== 'class') return true;
  return CLASS_MEMBER.has(stream.tokens[index + 1]?.text ?? '');
}

/** The modifier at `index` and the index after it (and after the attached `(set)`). */
function readModifier(
  stream: TokenStream,
  index: number,
): { text: string; next: number } {
  const text = stream.tokens[index]!.text;
  const open = index + 1;
  const glued = stream.tokens[open]?.start === stream.tokens[index]!.end;
  if (!isPunct(stream, open, '(') || !glued) return { text, next: open };
  const close = stream.match[open]!;
  return { text: `${text}(${joinTokens(stream, open + 1, close)})`, next: close + 1 };
}

/** The attributes and modifiers starting at `from` (up to `to`). */
export function readPrefix(stream: TokenStream, from: number, to: number): Prefix {
  const attributes: Attribute[] = [];
  const modifiers: string[] = [];
  let i = from;
  while (i < to) {
    if (isPunct(stream, i, '@')) {
      const attribute = readAttribute(stream, i);
      attributes.push(attribute);
      i = attribute.end;
    } else if (isModifier(stream, i)) {
      const modifier = readModifier(stream, i);
      modifiers.push(modifier.text);
      i = modifier.next;
    } else break;
  }
  return { end: i, attributes, modifiers };
}

/** Does the token `index` start a line? */
function firstOnLine(stream: TokenStream, index: number): boolean {
  const previous = stream.tokens[index - 1];
  if (previous === undefined) return true;
  return stream.src.text.slice(previous.end, stream.tokens[index]!.start).includes('\n');
}

/** Punctuation that opens a member (attribute, directive, tuple, bracket): only it does not continue the previous line. */
const OPENS_MEMBER = new Set(['@', '#', '(', '[']);

/**
 * Does the line `index` continue the previous declaration? Yes when the previous one ends in an operator or
 * comma, or when this one starts with punctuation that does not open a member (`.`, `?`, `:`, `&&`, `{` on
 * its own line…) or with the header's `where`.
 */
function continuesBefore(stream: TokenStream, index: number): boolean {
  const previous = stream.tokens[index - 1]!;
  const next = stream.tokens[index]!;
  if (previous.kind === 'punct' && CONTINUES.has(previous.text)) return true;
  if (next.kind === 'punct') return !OPENS_MEMBER.has(next.text);
  return next.kind === 'ident' && next.text === 'where';
}

/** The token ranges of each member of the span `[from, to)`. */
export function splitMembers(stream: TokenStream, from: number, to: number): Range[] {
  const members: Range[] = [];
  let start = from;
  for (const i of topLevel(stream, from, to)) {
    if (isPunct(stream, i, ';')) {
      if (i > start) members.push({ from: start, to: i });
      start = i + 1;
    } else if (
      i > start &&
      firstOnLine(stream, i) &&
      !continuesBefore(stream, i) &&
      readPrefix(stream, start, i).end < i
    ) {
      members.push({ from: start, to: i });
      start = i;
    }
  }
  if (to > start) members.push({ from: start, to });
  return members;
}
