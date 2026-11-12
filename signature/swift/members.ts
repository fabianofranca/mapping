import { readAttribute, type Attribute, type Range } from '../paramList';
import { isPunct, joinTokens, topLevel, type TokenStream } from '../tokens';

// As declarações de um corpo Swift (arquivo, struct, enum…): como o texto não tem `;` nem delimita
// as linhas, um membro termina onde a próxima linha começa um token no nível de cima, a menos que
// a linha anterior peça continuação (`,`, `=`, `->`, operador) ou só tenha atributos e modificadores.

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
/** `class` só é modificador antes de um destes (`class var`, `class func`); senão é a declaração. */
const CLASS_MEMBER = new Set(['var', 'let', 'func', 'subscript']);
/** O que, no fim de uma linha, pede que a próxima continue a mesma declaração. */
const CONTINUES = new Set([',', '.', ':', '=', '->', '&', '|', '+', '*', '/', '-', '\\']);

export interface Prefix {
  /** O índice do primeiro token depois dos atributos e modificadores. */
  readonly end: number;
  readonly attributes: readonly Attribute[];
  /** Os modificadores, com o `(set)` quando há: `public`, `private(set)`. */
  readonly modifiers: readonly string[];
}

function isModifier(stream: TokenStream, index: number): boolean {
  const token = stream.tokens[index]!;
  if (token.kind !== 'ident' || !MODIFIERS.has(token.text)) return false;
  if (token.text !== 'class') return true;
  return CLASS_MEMBER.has(stream.tokens[index + 1]?.text ?? '');
}

/** O modificador em `index` e o índice depois dele (e do `(set)` colado). */
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

/** Os atributos e modificadores que começam em `from` (até `to`). */
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

/** O token `index` começa uma linha? */
function firstOnLine(stream: TokenStream, index: number): boolean {
  const previous = stream.tokens[index - 1];
  if (previous === undefined) return true;
  return stream.src.text.slice(previous.end, stream.tokens[index]!.start).includes('\n');
}

function continuesBefore(stream: TokenStream, index: number): boolean {
  const previous = stream.tokens[index - 1]!;
  const next = stream.tokens[index]!;
  return (
    (previous.kind === 'punct' && CONTINUES.has(previous.text)) ||
    (next.kind === 'punct' && next.text === '.')
  );
}

/** Os intervalos de tokens de cada membro do trecho `[from, to)`. */
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
