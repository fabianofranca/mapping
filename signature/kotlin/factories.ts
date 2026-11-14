import type { SignatureFactory } from '../../src/model/signatures';
import { splitParams, type EnumTable } from '../paramList';
import { findBodyOpen, topLevel, type TokenStream } from '../tokens';
import { findFunctions, type FunctionDecl } from './functions';
import { parseParams } from './params';

// The factory of a default `Object.factory(...)`: the `fun factory(` inside `object Object { … }`,
// in the same file and in the `--also` ones (in that order). Among those with the same name, the
// `@Deprecated` ones are dropped and the one with the most parameters stays (tie: the first).

export interface KotlinFile {
  readonly stream: TokenStream;
  /** The file's `package` (empty if it declares none). */
  readonly pkg: string;
}

export interface FoundFactory {
  readonly factory: SignatureFactory;
  /** The KDoc of the chosen function (raw text), for the `doc` of `<param>.<factoryParam>`. */
  readonly doc: string | undefined;
}

const FACTORY_DEFAULT = /^([A-Z]\w*)\.([a-z]\w*)\(/;

/** The end of the string or character literal that opens at `from` (quote `"` or `'`). */
function skipQuoted(text: string, from: number): number {
  const quote = text[from]!;
  let i = from + 1;
  while (i < text.length && text[i] !== quote) i += text[i] === '\\' ? 2 : 1;
  return i;
}

/** The index of the `)` that closes the `(` at `open` (ignores parentheses inside literals); -1 if it never closes. */
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

/** The whole `Object.factory(...)`: the object name and the function name, if the default is only that call. */
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

/** The functions that are direct members (top level of the body) of some `object` with this name. */
function objectMembers(stream: TokenStream, objectName: string): FunctionDecl[] {
  return membersByObject(stream).get(objectName) ?? [];
}

const MEMBERS = new WeakMap<TokenStream, Map<string, FunctionDecl[]>>();

/** The direct members of each `object` of the file, by name; computed once per file. */
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

/** Among the functions with the same name: without the `@Deprecated` ones, the one with the most parameters (tie: the first). */
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

/** The factory `objectName.functionName` in the first file that has it (one without parameters does not count). */
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
