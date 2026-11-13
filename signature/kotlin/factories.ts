import type { SignatureFactory } from '../../src/model/signatures';
import { splitParams, type EnumTable } from '../paramList';
import { findBodyOpen, topLevel, type TokenStream } from '../tokens';
import { findFunctions, type FunctionDecl } from './functions';
import { parseParams } from './params';

// A fábrica de um padrão `Objeto.fabrica(...)`: a `fun fabrica(` de dentro de `object Objeto { … }`,
// no mesmo arquivo e nos `--also` (nessa ordem). Entre as de mesmo nome, descartam-se as
// `@Deprecated` e fica a de mais parâmetros (empate: a primeira).

export interface KotlinFile {
  readonly stream: TokenStream;
  /** O `package` do arquivo (vazio se não declara). */
  readonly pkg: string;
}

export interface FoundFactory {
  readonly factory: SignatureFactory;
  /** O KDoc da função escolhida (texto cru), para o `doc` de `<param>.<paramDaFábrica>`. */
  readonly doc: string | undefined;
}

const FACTORY_DEFAULT = /^([A-Z]\w*)\.([a-z]\w*)\(/;

/** O fim do literal de texto ou de caractere que abre em `from` (aspas `"` ou `'`). */
function skipQuoted(text: string, from: number): number {
  const quote = text[from]!;
  let i = from + 1;
  while (i < text.length && text[i] !== quote) i += text[i] === '\\' ? 2 : 1;
  return i;
}

/** O índice do `)` que fecha o `(` em `open` (ignora parênteses dentro de literais); -1 se não fecha. */
function closingParen(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const char = text[i]!;
    if (char === '"' || char === "'") i = skipQuoted(text, i);
    else if (char === '(') depth++;
    else if (char === ')' && --depth === 0) return i;
  }
  return -1;
}

/** `Objeto.fabrica(...)` inteiro: o nome do objeto e o da função, se o padrão é só essa chamada. */
export function factoryCall(
  defaultText: string | undefined,
): [string, string] | undefined {
  const match = defaultText === undefined ? null : FACTORY_DEFAULT.exec(defaultText);
  if (defaultText === undefined || match === null) return undefined;
  const open = match[0].length - 1;
  return closingParen(defaultText, open) === defaultText.length - 1
    ? [match[1]!, match[2]!]
    : undefined;
}

/** As funções que são membros diretos (nível de cima do corpo) de algum `object` com este nome. */
function objectMembers(stream: TokenStream, objectName: string): FunctionDecl[] {
  return membersByObject(stream).get(objectName) ?? [];
}

const MEMBERS = new WeakMap<TokenStream, Map<string, FunctionDecl[]>>();

/** Os membros diretos de cada `object` do arquivo, por nome; calculado uma vez por arquivo. */
function membersByObject(stream: TokenStream): Map<string, FunctionDecl[]> {
  const cached = MEMBERS.get(stream);
  if (cached !== undefined) return cached;
  const functions = findFunctions(stream);
  const byName = new Map<string, FunctionDecl[]>();
  stream.tokens.forEach((token, i) => {
    const name = stream.tokens[i + 1];
    if (token.kind !== 'ident' || token.text !== 'object' || name?.kind !== 'ident')
      return;
    const open = findBodyOpen(stream, i + 2);
    if (open === undefined) return;
    const direct = new Set(topLevel(stream, open + 1, stream.match[open]!));
    const list = byName.get(name.text) ?? [];
    list.push(...functions.filter((f) => direct.has(f.funIndex)));
    byName.set(name.text, list);
  });
  MEMBERS.set(stream, byName);
  return byName;
}

/** Entre as funções de mesmo nome: sem as `@Deprecated`, a de mais parâmetros (empate: a primeira). */
function pickFactory(
  stream: TokenStream,
  members: readonly FunctionDecl[],
  functionName: string,
): FunctionDecl | undefined {
  let best: FunctionDecl | undefined;
  let bestCount = 0;
  for (const fn of members) {
    if (fn.name !== functionName || fn.deprecated) continue;
    const count = splitParams(stream, fn.open, fn.close).length;
    if (count > bestCount) {
      best = fn;
      bestCount = count;
    }
  }
  return best;
}

/** A fábrica `objectName.functionName` no primeiro arquivo que a tem (a que não tem parâmetros não conta). */
export function findFactory(
  files: readonly KotlinFile[],
  objectName: string,
  functionName: string,
  enums: EnumTable,
): FoundFactory | undefined {
  for (const file of files) {
    const best = pickFactory(
      file.stream,
      objectMembers(file.stream, objectName),
      functionName,
    );
    if (best === undefined) continue;
    const params = parseParams(file.stream, best.open, best.close, enums);
    const prefix = file.pkg === '' ? '' : `${file.pkg}.`;
    return {
      factory: { call: `${prefix}${objectName}.${functionName}`, params },
      doc: best.doc,
    };
  }
  return undefined;
}
