// A análise do texto de um tipo Swift (já normalizado nos espaços): atributos na frente
// (`@escaping`, `@ViewBuilder`), `?` e parênteses que envolvem, função (`->` no nível de cima),
// nome simples e genéricos. Sobre o texto, não sobre os tokens: serve também ao tipo inferido.

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

/** O índice do `)` que fecha o `(` de `from` (ou -1). */
function closingParen(text: string, from: number): number {
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return i;
  }
  return -1;
}

/** Tira os `?`/`!` do fim e os parênteses que envolvem o tipo inteiro: `(() -> Void)?` → `() -> Void`. */
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

/** O índice do `->` no nível de cima (fora de parênteses, colchetes e `<>`), ou -1. */
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

/** O nome do tipo sem os genéricos nem `some`/`any`, qualificado como veio (`Binding<Bool>` → `Binding`); vazio se não é um nome. */
export function baseName(text: string): string {
  const inner = unwrap(text).replace(/^(?:some|any)\s+/, '');
  const angle = inner.indexOf('<');
  const head = (angle < 0 ? inner : inner.slice(0, angle)).trim();
  return PLAIN_NAME.test(head) ? head : '';
}

/** O nome simples do tipo, sem qualificação, só se não há genéricos (`Swift.Int` → `Int`); vazio se não é um nome simples. */
export function simpleName(text: string): string {
  const inner = unwrap(text);
  return PLAIN_NAME.test(inner) ? inner.slice(inner.lastIndexOf('.') + 1) : '';
}

export const lastSegment = (name: string): string =>
  name.slice(name.lastIndexOf('.') + 1);

/** O que vem depois do `->` de um tipo função (o tipo que devolve). */
export function returnType(text: string): string {
  const arrow = topLevelArrow(text);
  return arrow < 0 ? '' : text.slice(arrow + 2).trim();
}
