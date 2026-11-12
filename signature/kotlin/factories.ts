import type { SignatureFactory } from '../../src/model/signatures';
import { topLevel, type TokenStream } from '../tokens';
import { findBodyOpen } from './enums';
import { findFunctions, type FunctionDecl } from './functions';
import { parseParams, splitParams, type EnumTable } from './params';

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

const FACTORY_DEFAULT = /^([A-Z]\w*)\.([a-z]\w*)\(.*\)$/;

/** `Objeto.fabrica(...)`: o nome do objeto e o da função, se o padrão tem esse formato. */
export function factoryCall(
  defaultText: string | undefined,
): [string, string] | undefined {
  const match = defaultText === undefined ? null : FACTORY_DEFAULT.exec(defaultText);
  return match === null ? undefined : [match[1]!, match[2]!];
}

/** As funções que são membros diretos (nível de cima do corpo) de algum `object` com este nome. */
function objectMembers(stream: TokenStream, objectName: string): FunctionDecl[] {
  const functions = findFunctions(stream);
  const members: FunctionDecl[] = [];
  stream.tokens.forEach((token, i) => {
    const name = stream.tokens[i + 1];
    if (token.kind !== 'ident' || token.text !== 'object' || name?.text !== objectName)
      return;
    const open = findBodyOpen(stream, i + 2);
    if (open === undefined) return;
    const direct = new Set(topLevel(stream, open + 1, stream.match[open]!));
    members.push(...functions.filter((f) => direct.has(f.funIndex)));
  });
  return members;
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
