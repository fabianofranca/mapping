import { isRecord } from './isRecord';
import { isValidCodePath } from './codeLocations';
import { packagePathError } from './packagePaths';
import { addSpecIssue, packagePathMsg, specMsg, type SpecMsg } from './specIssueCode';
import type { z } from 'zod';

// `fileFormats` (`formatVersion` 20, stage #1923, decisions 7 and 10): the file formats that the
// specialization knows how to read and write, each one handled by a plugin (a `.js` file of the
// package). This module holds the declaration: its shape, the version and the cross checks
// (unique ids and example names). The key is outside the version contract (`diffSpecs` ignores
// it, like `code` and `sources`); the files themselves (plugin, examples, `input`) are checked
// by the library validator (`library.ts`). Nothing here runs a plugin. No browser APIs.

/** First `formatVersion` of `fileFormats`. */
export const FILE_FORMATS_VERSION = 20;
/** The only plugin contract that exists (`fileFormats[].contract`). */
export const FORMAT_PLUGIN_CONTRACT = 1;
/** A plugin file larger than this is refused (level 1 of the library validator). */
export const MAX_PLUGIN_BYTES = 1024 * 1024;

export type FileFormatScope = 'project' | 'container';

/** An example of a format: a text in the format; `input` (a `.json` projection) feeds `generate`. */
export interface SpecFileFormatExample {
  name: string;
  /** Package path of the text in the format. */
  file: string;
  /** Package path of a `.json` projection (an example of a plugin that only has `generate`). */
  input?: string;
}

export interface SpecFileFormat {
  /** `[a-z0-9][a-z0-9-]*`, unique in the specialization; cited as `<specId>/<formatId>`. */
  id: string;
  name: string;
  /** Lowercase, without the dot (`yaml`, `csv`). */
  extension: string;
  /** Package path of the plugin, ending in `.js`. */
  plugin: string;
  contract: typeof FORMAT_PLUGIN_CONTRACT;
  /** What the plugin sees: the whole project (default) or one container. */
  scope?: FileFormatScope;
  description?: string;
  examples?: SpecFileFormatExample[];
}

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const EXTENSION_RE = /^[a-z0-9]+$/;
const FORMAT_KEYS = new Set([
  'id',
  'name',
  'extension',
  'plugin',
  'contract',
  'scope',
  'description',
  'examples',
]);
const EXAMPLE_KEYS = new Set(['name', 'file', 'input']);

type Path = (string | number)[];
type Add = (path: Path, message: string | SpecMsg) => void;

/** `value` is a non-empty text? Otherwise, the error at `path` ("required", "must be text" or "cannot be empty"). */
function checkText(value: unknown, path: Path, add: Add, required: boolean): void {
  if (value === undefined) {
    if (required) add(path, specMsg('spec.required'));
  } else if (typeof value !== 'string') {
    add(path, specMsg('spec.mustBeText'));
  } else if (value === '') {
    add(path, specMsg('spec.notEmpty'));
  }
}

function checkUnknownKeys(
  entry: { readonly [key: string]: unknown },
  allowed: ReadonlySet<string>,
  path: Path,
  add: Add,
): void {
  for (const key of Object.keys(entry)) {
    if (!allowed.has(key))
      add([...path, key], specMsg('spec.fileFormatKeyUnknown', { key }));
  }
}

/** A package path (`ext` undefined: any extension) in `entry[key]`. */
function checkPackagePath(
  value: unknown,
  path: Path,
  add: Add,
  options: { required: boolean; ext?: string },
): void {
  if (typeof value !== 'string' || value === '') {
    return checkText(value, path, add, options.required);
  }
  if (options.ext === undefined) {
    if (!isValidCodePath(value)) add(path, specMsg('spec.packagePathInvalid'));
    return;
  }
  const error = packagePathError(value, options.ext);
  if (error !== undefined) add(path, packagePathMsg(error));
}

function checkExample(example: unknown, path: Path, names: Set<string>, add: Add): void {
  if (!isRecord(example)) return add(path, specMsg('spec.mustBeObject'));
  checkUnknownKeys(example, EXAMPLE_KEYS, path, add);
  checkText(example.name, [...path, 'name'], add, true);
  if (typeof example.name === 'string' && example.name !== '') {
    if (names.has(example.name)) {
      add([...path, 'name'], specMsg('spec.exampleNameRepeated', { name: example.name }));
    }
    names.add(example.name);
  }
  checkPackagePath(example.file, [...path, 'file'], add, { required: true });
  checkPackagePath(example.input, [...path, 'input'], add, {
    required: false,
    ext: '.json',
  });
}

function checkExamples(examples: unknown, path: Path, add: Add): void {
  if (examples === undefined) return;
  if (!Array.isArray(examples)) return add(path, specMsg('spec.fileFormatExamplesShape'));
  const names = new Set<string>();
  examples.forEach((example: unknown, i) =>
    checkExample(example, [...path, i], names, add),
  );
}

/** The id and the extension are text with a fixed pattern (an empty one is reported by `checkText`). */
function checkPatterns(
  entry: { readonly [key: string]: unknown },
  path: Path,
  add: Add,
): void {
  const { id, extension } = entry;
  if (typeof id === 'string' && id !== '' && !ID_RE.test(id)) {
    add([...path, 'id'], specMsg('spec.fileFormatIdInvalid'));
  }
  if (
    typeof extension === 'string' &&
    extension !== '' &&
    !EXTENSION_RE.test(extension)
  ) {
    add([...path, 'extension'], specMsg('spec.fileFormatExtensionInvalid'));
  }
}

/** `contract` (required, only 1) and `scope` (`project` or `container`). */
function checkValues(
  entry: { readonly [key: string]: unknown },
  path: Path,
  add: Add,
): void {
  const { contract, scope } = entry;
  if (contract === undefined) add([...path, 'contract'], specMsg('spec.required'));
  else if (contract !== FORMAT_PLUGIN_CONTRACT) {
    add([...path, 'contract'], specMsg('spec.fileFormatContractInvalid'));
  }
  if (scope !== undefined && scope !== 'project' && scope !== 'container') {
    add([...path, 'scope'], specMsg('spec.fileFormatScopeInvalid'));
  }
}

function checkFormat(entry: unknown, path: Path, ids: Set<string>, add: Add): void {
  if (!isRecord(entry)) return add(path, specMsg('spec.mustBeObject'));
  checkUnknownKeys(entry, FORMAT_KEYS, path, add);
  checkText(entry.id, [...path, 'id'], add, true);
  checkText(entry.name, [...path, 'name'], add, true);
  checkText(entry.extension, [...path, 'extension'], add, true);
  checkPackagePath(entry.plugin, [...path, 'plugin'], add, {
    required: true,
    ext: '.js',
  });
  checkPatterns(entry, path, add);
  checkValues(entry, path, add);
  checkText(entry.description, [...path, 'description'], add, false);
  checkExamples(entry.examples, [...path, 'examples'], add);
  if (typeof entry.id === 'string' && entry.id !== '') {
    if (ids.has(entry.id)) {
      add([...path, 'id'], specMsg('spec.idRepeated', { id: entry.id }));
    }
    ids.add(entry.id);
  }
}

/**
 * `fileFormats` (`formatVersion` 20 only): a list of formats; each one with its rules (decision
 * 10). Before 20, `only allowed with formatVersion 20`, at `fileFormats`.
 */
export function checkFileFormats(
  spec: { formatVersion: number; fileFormats?: unknown },
  ctx: z.RefinementCtx,
): void {
  if (spec.fileFormats === undefined) return;
  const add: Add = (path, message) => addSpecIssue(ctx, path, message);
  if (spec.formatVersion < FILE_FORMATS_VERSION) {
    return add(
      ['fileFormats'],
      specMsg('spec.onlyFormat', { version: String(FILE_FORMATS_VERSION) }),
    );
  }
  if (!Array.isArray(spec.fileFormats)) {
    return add(['fileFormats'], specMsg('spec.fileFormatsShape'));
  }
  const ids = new Set<string>();
  spec.fileFormats.forEach((entry: unknown, i) =>
    checkFormat(entry, ['fileFormats', i], ids, add),
  );
}
