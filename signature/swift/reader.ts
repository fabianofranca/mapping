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
import type { EnumTable } from '../paramList';
import {
  buildParam,
  callLabel,
  readInitParams,
  type BuildContext,
  type RawParam,
} from './params';
import {
  readExtensionInits,
  readStruct,
  type InitDecl,
  type StructMembers,
} from './struct';

// SwiftUI reader (`mapping-signature/swift@1`): the record of a `struct … : View` from the file
// text. The explicit `init` (chosen by `--init` when there is more than one) or the memberwise.
// Rules and limits in signature/README.md.

export const SWIFT_EXTRACTOR = 'mapping-signature/swift@1';

function load(file: { name: string; text: string }): TokenStream {
  return tokenize(makeSource(file.name, file.text), SWIFT_DIALECT);
}

/** The `--symbol`: the struct name is the last segment; the prefix (module or enclosing type) only disambiguates. */
function splitSymbol(symbol: string): { prefix: string; name: string } {
  const cut = symbol.lastIndexOf('.');
  return cut < 0
    ? { prefix: '', name: symbol }
    : { prefix: symbol.slice(0, cut), name: symbol.slice(cut + 1) };
}

function structList(candidates: readonly TypeDecl[]): string {
  return candidates
    .map((decl, i) => {
      const inside =
        decl.enclosing.length === 0 ? 'at top level' : decl.enclosing.join('.');
      return `  ${i}: line ${decl.line} (inside ${inside})`;
    })
    .join('\n');
}

function chooseStruct(stream: TokenStream, symbol: string): TypeDecl {
  const { prefix, name } = splitSymbol(symbol);
  const where = stream.src.name;
  const all = findTypeDecls(stream).filter(
    (d) => d.keyword === 'struct' && d.name === name,
  );
  if (all.length === 0) throw new CliError(`struct ${name} not found in ${where}`);
  if (all.length === 1) return all[0]!;
  const wanted = prefix.slice(prefix.lastIndexOf('.') + 1);
  const inside = all.filter((d) => d.enclosing[d.enclosing.length - 1] === wanted);
  const candidates = inside.length === 0 ? all : inside;
  if (candidates.length === 1) return candidates[0]!;
  throw new CliError(
    `struct ${name} appears ${candidates.length} times in ${where}; qualify the --symbol with the enclosing type (<Type>.${name}):\n${structList(candidates)}`,
  );
}

/** One entry of the `--init` list: the memberwise one, or an `init` and the file it was read from. */
type Candidate =
  | { readonly kind: 'memberwise'; readonly labels: string }
  | {
      readonly kind: 'init';
      readonly init: InitDecl;
      readonly stream: TokenStream;
      /** The name of the `--also` file the `init` is in; none for the main file. */
      readonly file?: string;
    };

const fileName = (path: string): string => path.slice(path.search(/[^\\/]*$/));

const labelsOf = (raws: readonly RawParam[]): string =>
  raws.map((raw) => `${callLabel(raw)}:`).join('');

/** The extensions of the struct in a file: the name is the struct's, qualified by the types that enclose it. */
function extensionsOf(stream: TokenStream, decl: TypeDecl): TypeDecl[] {
  const name = [...decl.enclosing, decl.name].join('.');
  return findTypeDecls(stream).filter(
    (d) => d.keyword === 'extension' && d.name === name,
  );
}

/**
 * The list of `--init` (decision 13): the `init`s of the struct body, in file order (or, with none and
 * with some in an extension, the memberwise as 0); then those of the extensions, in the main file and in
 * each `--also`, in the order given. Empty when the struct declares no `init` anywhere.
 */
function candidatesOf(
  main: TokenStream,
  alsos: readonly TokenStream[],
  decl: TypeDecl,
  members: StructMembers,
): Candidate[] {
  const own = members.inits.map((init): Candidate => ({
    kind: 'init',
    init,
    stream: main,
  }));
  const fromExtensions = [main, ...alsos].flatMap((stream, index) => {
    const file = index === 0 ? {} : { file: fileName(stream.src.name) };
    return extensionsOf(stream, decl)
      .flatMap((extension) => readExtensionInits(stream, extension))
      .map((init): Candidate => ({ kind: 'init', init, stream, ...file }));
  });
  if (own.length > 0 || fromExtensions.length === 0) return [...own, ...fromExtensions];
  const labels = labelsOf(members.props.map((p) => p.param));
  return [{ kind: 'memberwise', labels }, ...fromExtensions];
}

/** The list, one line per candidate: `  <index>: [<file> ]line <n> [deprecated] [private] (_:badge:style:)`. */
function listInits(candidates: readonly Candidate[]): string {
  return candidates
    .map((candidate, index) => {
      if (candidate.kind === 'memberwise')
        return `  ${index}: memberwise (${candidate.labels})`;
      const { init, stream, file } = candidate;
      const labels = labelsOf(readInitParams(stream, init.open, init.close));
      const mark = `${init.deprecated ? ' [deprecated]' : ''}${init.hidden ? ' [private]' : ''}`;
      return `  ${index}: ${file === undefined ? '' : `${file} `}line ${init.line}${mark} (${labels})`;
    })
    .join('\n');
}

const isCallable = (candidate: Candidate): boolean =>
  candidate.kind === 'memberwise' ||
  (!candidate.init.deprecated && !candidate.init.hidden);

const isHidden = (candidate: Candidate): boolean =>
  candidate.kind === 'init' && candidate.init.hidden;

function chooseInit(
  stream: TokenStream,
  decl: TypeDecl,
  candidates: readonly Candidate[],
  requested: number | undefined,
): Candidate {
  const where = stream.src.name;
  if (candidates.length === 0) {
    if (requested === undefined || requested === 0)
      return { kind: 'memberwise', labels: '' };
    throw new CliError(
      `--init ${requested} is not in the list: ${decl.name} declares no init and only has the memberwise (index 0)`,
    );
  }
  if (requested !== undefined) {
    const chosen = candidates[requested];
    if (chosen !== undefined) return chosen;
    throw new CliError(
      `--init ${requested} is not in the list: ${decl.name} has ${candidates.length} inits in ${where} (indexes 0 to ${candidates.length - 1}):\n${listInits(candidates)}`,
    );
  }
  const alive = candidates.filter(isCallable);
  if (alive.length === 1) return alive[0]!;
  const hidden = candidates.some(isHidden);
  const reason =
    alive.length === 0
      ? `${decl.name} only has deprecated inits${hidden ? ' or private' : ''} in ${where}`
      : `${decl.name} has ${alive.length} inits (not counting the deprecated${hidden ? ' and private' : ''} ones) in ${where}`;
  throw new CliError(
    `ambiguous init: ${reason}; pick one with --init <n>:\n${listInits(candidates)}`,
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

/** The text of each parameter: the `init`'s `- Parameter`, the struct's and the property's `///` (in that order). */
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
  const alsos = request.also.map(load);
  const enums = collectEnums([main, ...alsos]);
  const decl = chooseStruct(main, request.symbol);
  const members = readStruct(main, decl);
  const candidates = candidatesOf(main, alsos, decl, members);
  const chosen = chooseInit(main, decl, candidates, request.init);
  const context: BuildContext = { enums, viewGenerics: decl.viewGenerics };
  const raws =
    chosen.kind === 'init'
      ? readInitParams(chosen.stream, chosen.init.open, chosen.init.close)
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
