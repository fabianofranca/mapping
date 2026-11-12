import {
  SIGNATURE_FORMAT,
  SIGNATURE_FORMAT_VERSION,
  type CodeSignatureSource,
  type Signature,
  type SignatureParam,
} from '../../src/model/signatures';
import { CliError } from '../errors';
import { SWIFT_DIALECT, tokenize } from '../lexer';
import type { CodeRequest } from '../request';
import { makeSource } from '../source';
import type { TokenStream } from '../tokens';
import { enumsOf, findTypeDecls, type TypeDecl } from './decls';
import { parseParamDocs, summaryOf } from './doc';
import type { EnumTable } from './literals';
import {
  buildParam,
  callLabel,
  readInitParams,
  type BuildContext,
  type RawParam,
} from './params';
import { readStruct, type InitDecl, type StructMembers } from './struct';

// Leitor SwiftUI (`mapping-signature/swift@1`): a ficha de uma `struct … : View` a partir do texto
// do arquivo. O `init` explícito (escolhido por `--init` quando há mais de um) ou o memberwise.
// Regras e limites em signature/README.md.

export const SWIFT_EXTRACTOR = 'mapping-signature/swift@1';

function load(file: { name: string; text: string }): TokenStream {
  return tokenize(makeSource(file.name, file.text), SWIFT_DIALECT);
}

/** O `--symbol`: o nome da struct é o último segmento; o prefixo (módulo ou tipo que a envolve) só desambigua. */
function splitSymbol(symbol: string): { prefix: string; name: string } {
  const cut = symbol.lastIndexOf('.');
  return cut < 0
    ? { prefix: '', name: symbol }
    : { prefix: symbol.slice(0, cut), name: symbol.slice(cut + 1) };
}

function structList(candidates: readonly TypeDecl[]): string {
  return candidates
    .map((decl, i) => {
      const inside = decl.enclosing.length === 0 ? 'no topo' : decl.enclosing.join('.');
      return `  ${i}: linha ${decl.line} (dentro de ${inside})`;
    })
    .join('\n');
}

function chooseStruct(stream: TokenStream, symbol: string): TypeDecl {
  const { prefix, name } = splitSymbol(symbol);
  const where = stream.src.name;
  const all = findTypeDecls(stream).filter(
    (d) => d.keyword === 'struct' && d.name === name,
  );
  if (all.length === 0) throw new CliError(`struct ${name} não encontrada em ${where}`);
  if (all.length === 1) return all[0]!;
  const wanted = prefix.slice(prefix.lastIndexOf('.') + 1);
  const inside = all.filter((d) => d.enclosing[d.enclosing.length - 1] === wanted);
  const candidates = inside.length === 0 ? all : inside;
  if (candidates.length === 1) return candidates[0]!;
  throw new CliError(
    `struct ${name} aparece ${candidates.length} vezes em ${where}; qualifique o --symbol com o tipo que a envolve (<Tipo>.${name}):\n${structList(candidates)}`,
  );
}

/** A lista de uma linha por `init`: `  <índice>: linha <n> [deprecated] (_:badge:style:)`. */
function listInits(stream: TokenStream, inits: readonly InitDecl[]): string {
  return inits
    .map((init, index) => {
      const labels = readInitParams(stream, init.open, init.close).map(callLabel);
      const mark = init.deprecated ? ' [deprecated]' : '';
      return `  ${index}: linha ${init.line}${mark} (${labels.map((l) => `${l}:`).join('')})`;
    })
    .join('\n');
}

type Chosen =
  { readonly kind: 'init'; readonly init: InitDecl } | { readonly kind: 'memberwise' };

function chooseInit(
  stream: TokenStream,
  decl: TypeDecl,
  inits: readonly InitDecl[],
  requested: number | undefined,
): Chosen {
  const where = stream.src.name;
  if (inits.length === 0) {
    if (requested === undefined || requested === 0) return { kind: 'memberwise' };
    throw new CliError(
      `--init ${requested} fora da lista: ${decl.name} não declara init e só tem o memberwise (índice 0)`,
    );
  }
  if (requested !== undefined) {
    const chosen = inits[requested];
    if (chosen !== undefined) return { kind: 'init', init: chosen };
    throw new CliError(
      `--init ${requested} fora da lista: ${decl.name} tem ${inits.length} inits em ${where} (índices de 0 a ${inits.length - 1}):\n${listInits(stream, inits)}`,
    );
  }
  const alive = inits.filter((init) => !init.deprecated);
  if (alive.length === 1) return { kind: 'init', init: alive[0]! };
  const reason =
    alive.length === 0
      ? `${decl.name} só tem inits deprecated em ${where}`
      : `${decl.name} tem ${alive.length} inits (fora os deprecated) em ${where}`;
  throw new CliError(
    `init ambíguo: ${reason}; escolha um com --init <n>:\n${listInits(stream, inits)}`,
  );
}

function collectEnums(streams: readonly TokenStream[]): EnumTable {
  const all = new Map<string, readonly string[]>();
  for (const stream of streams) {
    for (const [name, options] of enumsOf(stream))
      if (!all.has(name)) all.set(name, options);
  }
  return all;
}

/** O texto de cada parâmetro: o `- Parameter` do `init`, o da struct e o `///` da propriedade (nessa ordem). */
function buildDoc(
  raws: readonly RawParam[],
  sources: readonly ReadonlyMap<string, string>[],
  members: StructMembers,
): Record<string, string> {
  const doc: Record<string, string> = {};
  for (const raw of raws) {
    const keys =
      raw.label === undefined || raw.label === '_' ? [raw.name] : [raw.name, raw.label];
    const own = summaryOf(members.propDocs.get(raw.name));
    const text =
      sources
        .map((s) => keys.map((k) => s.get(k)).find((t) => t !== undefined))
        .find((t) => t !== undefined) ?? own;
    if (text !== undefined) doc[raw.name] = text;
  }
  return doc;
}

export function extractSwift(request: CodeRequest): Signature {
  const main = load(request.file);
  const enums = collectEnums([main, ...request.also.map(load)]);
  const decl = chooseStruct(main, request.symbol);
  const members = readStruct(main, decl);
  const chosen = chooseInit(main, decl, members.inits, request.init);
  const context: BuildContext = { enums, viewGenerics: decl.viewGenerics };
  const raws =
    chosen.kind === 'init'
      ? readInitParams(main, chosen.init.open, chosen.init.close)
      : members.props.map((p) => p.param);
  const params: SignatureParam[] = raws.map((raw) => buildParam(raw, context));
  const markups = [
    ...(chosen.kind === 'init' ? [parseParamDocs(chosen.init.doc)] : []),
    parseParamDocs(decl.doc),
  ];
  const doc = buildDoc(raws, markups, members);
  const source: CodeSignatureSource = {
    kind: 'code',
    platform: 'swiftui',
    language: 'swift',
    symbol: request.symbol,
    path: request.path,
    ...(request.ref === undefined ? {} : { ref: request.ref }),
    extractor: SWIFT_EXTRACTOR,
    ...(request.init === undefined ? {} : { init: request.init }),
  };
  return {
    format: SIGNATURE_FORMAT,
    formatVersion: SIGNATURE_FORMAT_VERSION,
    source,
    params,
    ...(Object.keys(doc).length === 0 ? {} : { doc }),
  };
}
