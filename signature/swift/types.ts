// Parsing the text of a Swift type (already whitespace-normalized): leading attributes
// (`@escaping`, `@ViewBuilder`), wrapping `?` and parentheses, function (`->` at the top level),
// simple name and generics. Over the text, not the tokens: it also serves the inferred type.

const LEADING_ATTRIBUTE = /^@[\w.]+(?:\([^)]*\))?\s*/;
const SPECIFIER = /^(?:inout|borrowing|consuming|isolated|sending)\s+/;
const PLAIN_NAME = /^[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*$/;
const OPENERS = '([<{';
const CLOSERS = ')]>}';

export interface TypeParts {
  /** Os nomes dos atributos na frente (`escaping`, `ViewBuilder`). */
  readonly attributes: readonly string[];
  /** `inout` e afins. */
  readonly specifier: boolean;
  /** O tipo sem os atributos nem os especificadores. */
  readonly core: string;
}

/** Separa os atributos e os especificadores da frente do tipo. */
export function splitType(text: string): TypeParts {
  const attributes: string[] = [];
  let core = text.trim();
  let specifier = false;
  for (;;) {
    const attribute = LEADING_ATTRIBUTE.exec(core);
    const mark = SPECIFIER.exec(core);
    const found = attribute ?? mark;
    if (found === null) break;
    if (attribute !== null)
      attributes.push(/^@([\w.]+)/.exec(found[0])![1]!.split('.').pop()!);
    else specifier = true;
    core = core.slice(found[0].length);
  }
  return { attributes, specifier, core };
}

/** The index of the `)` that closes the `(` at `from` (or -1). */
function closingParen(text: string, from: number): number {
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return i;
  }
  return -1;
}

/** Strips the trailing `?`/`!` and the parentheses wrapping the whole type: `(() -> Void)?` → `() -> Void`. */
export function unwrap(text: string): string {
  let core = text.trim();
  for (;;) {
    const stripped = core.replace(/[?!]+$/, '');
    const wrapped =
      stripped.startsWith('(') && closingParen(stripped, 0) === stripped.length - 1;
    core = wrapped ? stripped.slice(1, -1).trim() : stripped;
    if (!wrapped) return core;
  }
}

/** The index of the top-level `->` (outside parentheses, brackets and `<>`), or -1. */
export function topLevelArrow(text: string): number {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (OPENERS.includes(c)) depth++;
    else if (c === '-' && text[i + 1] === '>') {
      if (depth === 0) return i;
      i++;
    } else if (CLOSERS.includes(c)) depth--;
  }
  return -1;
}

/** The type name without generics or `some`/`any`, qualified as it came (`Binding<Bool>` → `Binding`); empty if it is not a name. */
export function baseName(text: string): string {
  const inner = unwrap(text).replace(/^(?:some|any)\s+/, '');
  const angle = inner.indexOf('<');
  const head = (angle < 0 ? inner : inner.slice(0, angle)).trim();
  return PLAIN_NAME.test(head) ? head : '';
}

/** The type's simple name, without qualification, only if there are no generics (`Swift.Int` → `Int`); empty if it is not a simple name. */
export function simpleName(text: string): string {
  const inner = unwrap(text);
  return PLAIN_NAME.test(inner) ? inner.slice(inner.lastIndexOf('.') + 1) : '';
}

export const lastSegment = (name: string): string =>
  name.slice(name.lastIndexOf('.') + 1);

/** What comes after the `->` of a function type (the type it returns). */
export function returnType(text: string): string {
  const arrow = topLevelArrow(text);
  return arrow < 0 ? '' : text.slice(arrow + 2).trim();
}
