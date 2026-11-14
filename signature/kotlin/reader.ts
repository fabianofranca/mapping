import {
  SIGNATURE_FORMAT,
  SIGNATURE_FORMAT_VERSION,
  type CodeSignatureSource,
  type Signature,
  type SignatureParam,
} from '../../src/model/signatures';
import { CliError } from '../errors';
import { tokenize } from '../lexer';
import type { CodeRequest } from '../request';
import type { EnumTable } from '../paramList';
import { makeSource } from '../source';
import { isPunct, type TokenStream } from '../tokens';
import { parseParamDocs } from './doc';
import { findEnums } from './enums';
import {
  factoryCall,
  findFactory,
  type FoundFactory,
  type KotlinFile,
} from './factories';
import { findFunctions, type FunctionDecl } from './functions';
import { chooseOverload } from './overloads';
import { parseParams } from './params';

// Kotlin reader (`mapping-signature/kotlin@1`): the record of a `@Composable` function from the
// file text. Rules and limits in signature/README.md.

export const KOTLIN_EXTRACTOR = 'mapping-signature/kotlin@1';

/** The file's `package`: `package a.b.c` (empty if there is none). */
function packageOf(stream: TokenStream): string {
  const index = stream.tokens.findIndex(
    (t, i) => t.kind === 'ident' && t.text === 'package' && !isPunct(stream, i - 1, '.'),
  );
  if (index < 0) return '';
  const parts: string[] = [];
  for (let i = index + 1; stream.tokens[i] !== undefined; i += 2) {
    const token = stream.tokens[i]!;
    if (token.kind !== 'ident') break;
    parts.push(token.text);
    if (!isPunct(stream, i + 1, '.')) break;
  }
  return parts.join('.');
}

function load(file: { name: string; text: string }): KotlinFile {
  const stream = tokenize(makeSource(file.name, file.text));
  return { stream, pkg: packageOf(stream) };
}

/** The simple name of the `--symbol` (last segment), checking the prefix against the file's `package`. */
function simpleName(symbol: string, pkg: string, fileName: string): string {
  const cut = symbol.lastIndexOf('.');
  if (cut < 0) return symbol;
  const prefix = symbol.slice(0, cut);
  if (prefix !== pkg) {
    const declared = pkg === '' ? 'declares no package' : `declares the package ${pkg}`;
    throw new CliError(
      `--symbol ${symbol}: the prefix ${prefix} is not the file's package (${fileName} ${declared})`,
    );
  }
  return symbol.slice(cut + 1);
}

/** The constants of every `enum class` in the file and in the `--also` files (the first declaration of each name wins). */
function collectEnums(files: readonly KotlinFile[]): EnumTable {
  const all = new Map<string, readonly string[]>();
  for (const file of files) {
    for (const [name, options] of findEnums(file.stream))
      if (!all.has(name)) all.set(name, options);
  }
  return all;
}

/** Adds the factory to the parameter (which loses its `value`, as in the format's example). */
function withFactory(param: SignatureParam, found: FoundFactory): SignatureParam {
  const { name, role, type, default: def, required } = param;
  return {
    name,
    role,
    type,
    ...(def === undefined ? {} : { default: def }),
    ...(required === undefined ? {} : { required }),
    factory: found.factory,
  };
}

interface Resolved {
  readonly params: SignatureParam[];
  /** The factories' KDoc, by parameter name. */
  readonly factoryDocs: Map<string, Map<string, string>>;
}

function resolveFactories(
  files: readonly KotlinFile[],
  params: SignatureParam[],
  enums: EnumTable,
): Resolved {
  const factoryDocs = new Map<string, Map<string, string>>();
  const resolved = params.map((param) => {
    const call = factoryCall(param.default);
    const found =
      call === undefined ? undefined : findFactory(files, call[0], call[1], enums);
    if (found === undefined) return param;
    factoryDocs.set(param.name, parseParamDocs(found.doc));
    return withFactory(param, found);
  });
  return { params: resolved, factoryDocs };
}

/** The `doc` in parameter order: `name` and, after it, `name.factoryParam`. */
function buildDoc(
  params: readonly SignatureParam[],
  own: Map<string, string>,
  factoryDocs: Map<string, Map<string, string>>,
): Record<string, string> {
  const doc: Record<string, string> = {};
  for (const param of params) {
    const text = own.get(param.name);
    if (text !== undefined) doc[param.name] = text;
    for (const inner of param.factory?.params ?? []) {
      const innerText = factoryDocs.get(param.name)?.get(inner.name);
      if (innerText !== undefined) doc[`${param.name}.${inner.name}`] = innerText;
    }
  }
  return doc;
}

function candidatesOf(stream: TokenStream, name: string): FunctionDecl[] {
  return findFunctions(stream).filter((fn) => fn.name === name && fn.composable);
}

export function extractKotlin(request: CodeRequest): Signature {
  const main = load(request.file);
  const files = [main, ...request.also.map(load)];
  const name = simpleName(request.symbol, main.pkg, request.file.name);
  const candidates = candidatesOf(main.stream, name);
  if (candidates.length === 0) {
    throw new CliError(
      `@Composable function ${name} not found in ${request.file.name}`,
    );
  }
  const chosen = chooseOverload(main.stream, candidates, name, request.overload);
  const enums = collectEnums(files);
  const { params, factoryDocs } = resolveFactories(
    files,
    parseParams(main.stream, chosen.open, chosen.close, enums),
    enums,
  );
  const doc = buildDoc(params, parseParamDocs(chosen.doc), factoryDocs);
  const source: CodeSignatureSource = {
    kind: 'code',
    platform: 'compose',
    language: 'kotlin',
    symbol: main.pkg === '' ? name : `${main.pkg}.${name}`,
    path: request.path,
    ...(request.ref === undefined ? {} : { ref: request.ref }),
    extractor: KOTLIN_EXTRACTOR,
    ...(request.overload === undefined ? {} : { overload: request.overload }),
  };
  return {
    format: SIGNATURE_FORMAT,
    formatVersion: SIGNATURE_FORMAT_VERSION,
    source,
    params,
    ...(Object.keys(doc).length === 0 ? {} : { doc }),
  };
}
