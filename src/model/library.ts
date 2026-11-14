import type { ComponentFile } from './components/componentFormat';
import { findSlot } from './components/arrange';
import { resolvePath, type TextFile } from './components/library';
import { INDEX_FIELD, isAnchorFieldName } from './components/expressions';
import {
  collectFieldKeys,
  parseComponent,
  type TokenRef,
} from './components/parseComponent';
import {
  iconNodes,
  parseIconsText,
  type IconNodeRef,
  type IconSet,
} from './components/icons';
import { knownTokenKinds, type TokenKind } from './components/tokens';
import { iconLiteralIssues, iconOptionIssues } from './libraryIcons';
import {
  parseSpecText,
  type Spec,
  type SpecAnnotationType,
  type SpecField,
  type SpecIssue,
  type SpecMigrationStep,
} from './spec';
import { specWarnings } from './specWarnings';
import { missingMigrations } from './specVersions';
import { drawingIssues } from './libraryDrawing';
import { libraryIssue } from './libraryIssue';
import { checkSignatures } from './librarySignature';
import type { ModelMessageTemplateCode } from './messages';
import type { ModelMessage } from './modelMessage';

// Library validator in three levels (Library stage, phase B1). Pure: it receives the package
// files ALREADY READ (text of the `.json` and `.md`, presence of the binaries) and returns the
// list of problems; it never reads disk or network. The three gateways (app, MCP server and
// skill) call this same function.
//
// An error prevents use, a warning allows it. `ok` means "no `error`".
//
// Levels (each one only runs if `level` includes it and if the previous one left what it needs):
//   1. each file in isolation, strict: the specialization (`parseSpec` + `specWarnings`), each
//      component (`parseComponent`), the `.md` documents, and which files the package cites or
//      leaves unused;
//   2. coherence between the files: slot, template fields, files of the external examples,
//      fonts, the origins' `scrim` and the version contract (`previous`);
//   3. drawing proof (`libraryDrawing.ts`): instantiates each component and runs the external
//      examples through the declaration.
// Without a readable specialization there is no level 2 or 3; an invalid or missing component
// does not stop the others from going through levels 2 and 3.
//
// Order of `issues` (fixed, the tests depend on it): all of level 1, then those of 2, then those
// of 3. Within each level, the order of the specialization:
//   level 1: specialization errors (in `parseSpec` order), its warnings (`specWarnings`); then,
//            type by type (layers and types in order): the `component` file (missing or its
//            errors; a file cited by two types is read once) and the `doc` one; finally the
//            unreferenced files, in the order of the `files` list;
//   level 2: type by type: repeated component, `slot`, template fields (error), `preview` fields
//            and type fields the template does not use (warning), files of the type's external
//            examples; then the fonts, the origins (`scrim`, example screens) and, last, the
//            version contract (id, `version`, breaks without a migration, steps that cite what
//            did not exist);
//   level 3: see `libraryDrawing.ts`.

export interface LibraryFile {
  /** Path relative to the package root, with `/`. */
  readonly path: string;
  /** Content of the `.json` and `.md` files. */
  readonly text?: string;
  /** `true` for a present binary (font); the content is not read. */
  readonly binary?: boolean;
}

export interface LibraryIssue {
  /** File where the problem is (`""` when it belongs to the package). */
  readonly file: string;
  /** Path inside the file (`layers[0].annotationTypes[2].component`), `""` if there is none. */
  readonly path: string;
  readonly message: string;
  readonly severity: 'error' | 'warning';
  /**
   * Stable code of problems that the interface shows translated (`src/model/messages/`);
   * `message` keeps the text in Portuguese (MCP and tests).
   */
  readonly code?: ModelMessageTemplateCode;
  /** Translation data (`{key}`, `{path}`…). */
  readonly params?: Readonly<Record<string, string | number>>;
  /** Message from another module that the interface translates and puts in the `{reason}` of the outer text. */
  readonly detail?: ModelMessage;
}

export interface LibraryInput {
  readonly files: readonly LibraryFile[];
  /** Path of the specialization file; without it, looks for the only `"format": "mapping-spec"`. */
  readonly specPath?: string;
  /** Previous version of the package: turns on the version contract at level 2. */
  readonly previous?: Spec;
  /** How far to go (default 3). */
  readonly level?: 1 | 2 | 3;
}

export interface LibraryReport {
  /** With no `error`. */
  readonly ok: boolean;
  /** In order: level 1, then 2, then 3 (see the file header). */
  readonly issues: readonly LibraryIssue[];
  readonly errors: readonly LibraryIssue[];
  readonly warnings: readonly LibraryIssue[];
  /** The specialization read (absent when level 1 could not read it). */
  readonly spec?: Spec;
  readonly summary: {
    /** The highest level that ran (lower than requested when there was no readable specialization). */
    readonly level: 1 | 2 | 3;
    /** Annotation types of the specialization. */
    readonly types: number;
    /** Distinct component files cited by the types. */
    readonly components: number;
    /** Distinct document files cited by the types. */
    readonly docs: number;
    /** The types' examples plus the origins' example screens. */
    readonly examples: number;
    /** Declared fonts. */
    readonly fonts: number;
  };
}

const SPEC_FORMATS: readonly unknown[] = ['mapping-spec', 'mapeador-spec'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Walks the types in the specialization's order, with each one's path. */
function eachType(
  spec: Spec,
  visit: (type: SpecAnnotationType, path: string) => void,
): void {
  spec.layers.forEach((layer, li) => {
    layer.annotationTypes.forEach((type, ti) => {
      visit(type, `layers[${li}].annotationTypes[${ti}]`);
    });
  });
}

/** The type's fields by key; `table` columns come in as `table.column`. */
function fieldKeys(type: SpecAnnotationType): Map<string, SpecField> {
  const keys = new Map<string, SpecField>();
  for (const field of type.fields) {
    keys.set(field.key, field);
    if (field.type === 'table') {
      for (const column of field.columns) keys.set(`${field.key}.${column.key}`, column);
    }
  }
  return keys;
}

/**
 * Where each field key is cited in the template's JSON (first place of each), with the path
 * inside the file. Mirrors `referencedFields` (`$field`, `$has`, `$switch` and the first item of
 * `$eq`), which only returns the keys.
 */
function fieldReferences(
  node: unknown,
  path: string,
  out: Map<string, string> = new Map(),
): Map<string, string> {
  if (Array.isArray(node)) {
    node.forEach((item, i) => fieldReferences(item, `${path}[${i}]`, out));
    return out;
  }
  if (!isRecord(node)) return out;
  const isRepeat = node.type === 'repeat';
  for (const [key, value] of Object.entries(node)) {
    const at = `${path}.${key}`;
    // `repeat`: the `template` reads columns of the row (see `repeatChecks`), not fields of the type.
    if (isRepeat && key === 'template') continue;
    if (isRepeat && key === 'field' && typeof value === 'string') {
      if (!out.has(value)) out.set(value, at);
    } else if (
      (key === '$field' || key === '$has' || key === '$switch' || key === '$rows') &&
      typeof value === 'string'
    ) {
      // `$index` is the row index of a `repeat` and `$anchor.*` come from the anchor: they are not fields of the type.
      if (
        !out.has(value) &&
        (key === '$rows' || (value !== INDEX_FIELD && !isAnchorFieldName(value)))
      )
        out.set(value, at);
    } else if (key === '$eq' && Array.isArray(value) && typeof value[0] === 'string') {
      if (!out.has(value[0]) && value[0] !== INDEX_FIELD && !isAnchorFieldName(value[0]))
        out.set(value[0], `${at}[0]`);
    } else {
      fieldReferences(value, at, out);
    }
  }
  return out;
}

/** Where the template's JSON uses `$rows` (the field's key and its path). */
function rowsReferences(
  node: unknown,
  path: string,
  out: { key: string; path: string }[] = [],
): { key: string; path: string }[] {
  if (Array.isArray(node)) {
    node.forEach((item, i) => rowsReferences(item, `${path}[${i}]`, out));
    return out;
  }
  if (!isRecord(node)) return out;
  for (const [key, value] of Object.entries(node)) {
    if (key === '$rows' && typeof value === 'string')
      out.push({ key: value, path: `${path}.${key}` });
    else rowsReferences(value, `${path}.${key}`, out);
  }
  return out;
}

/** The `repeat` nodes of the template's JSON, with each one's path (nested ones do not exist). */
function repeatNodes(
  node: unknown,
  path: string,
  out: { path: string; node: Record<string, unknown> }[] = [],
): { path: string; node: Record<string, unknown> }[] {
  if (Array.isArray(node)) {
    node.forEach((item, i) => repeatNodes(item, `${path}[${i}]`, out));
    return out;
  }
  if (!isRecord(node)) return out;
  if (node.type === 'repeat') {
    out.push({ path, node });
    return out;
  }
  for (const [key, value] of Object.entries(node))
    repeatNodes(value, `${path}.${key}`, out);
  return out;
}

/**
 * The `image` nodes with `src: { "$field": … }` of the template's JSON, with the `src` path and
 * the `repeat` that wraps them (`undefined` outside a `repeat`). A literal `src` of invalid shape
 * is a level 1 error (the parser).
 */
function imageFieldNodes(
  node: unknown,
  path: string,
  repeat: Record<string, unknown> | undefined,
  out: {
    srcPath: string;
    key: string;
    repeat: Record<string, unknown> | undefined;
  }[] = [],
): { srcPath: string; key: string; repeat: Record<string, unknown> | undefined }[] {
  if (Array.isArray(node)) {
    node.forEach((item, i) => imageFieldNodes(item, `${path}[${i}]`, repeat, out));
    return out;
  }
  if (!isRecord(node)) return out;
  if (node.type === 'image') {
    const src = node.src;
    if (isRecord(src) && typeof src.$field === 'string') {
      out.push({ srcPath: `${path}.src.$field`, key: src.$field, repeat });
    }
    return out;
  }
  for (const [key, value] of Object.entries(node)) {
    // `repeat`: the `template` reads columns of the row; the nodes inside have the `repeat` as context.
    const inner = node.type === 'repeat' && key === 'template' ? node : repeat;
    imageFieldNodes(value, `${path}.${key}`, inner, out);
  }
  return out;
}

/** The code and parameters that a parser (warnings, version contract) already brings. */
interface Coding {
  readonly messageCode?: ModelMessageTemplateCode | undefined;
  readonly messageParams?: Readonly<Record<string, string | number>> | undefined;
}

/** The code and parameters that the component or icons parser put in the problem. */
function codingOf(issue: {
  readonly code?: ModelMessageTemplateCode | undefined;
  readonly params?: Readonly<Record<string, string | number>> | undefined;
}): Coding {
  return { messageCode: issue.code, messageParams: issue.params };
}

function codeOf(coding: Coding | undefined): Pick<LibraryIssue, 'code' | 'params'> {
  if (coding?.messageCode === undefined) return {};
  return {
    code: coding.messageCode,
    ...(coding.messageParams === undefined ? {} : { params: coding.messageParams }),
  };
}

class Collector {
  readonly issues: LibraryIssue[] = [];
  /** Error built by the message catalog. */
  error(
    file: string,
    path: string,
    code: ModelMessageTemplateCode,
    params?: Readonly<Record<string, string | number>>,
  ): void {
    this.issues.push(libraryIssue('error', file, path, code, params));
  }
  /** Error passed on from a parser (with the code it already brings, when there is one). */
  passError(file: string, path: string, message: string, coding?: Coding): void {
    this.issues.push({ file, path, message, severity: 'error', ...codeOf(coding) });
  }
  /** Warning passed on from a parser (with the code it already brings, when there is one). */
  passWarning(file: string, path: string, message: string, coding?: Coding): void {
    this.issues.push({ file, path, message, severity: 'warning', ...codeOf(coding) });
  }
  /** Problem from `parseSpec`, with the code and parameters that the interface translates. */
  specIssue(file: string, issue: SpecIssue): void {
    this.issues.push({
      file,
      path: issue.path,
      message: issue.message,
      severity: 'error',
      ...(issue.code === undefined ? {} : { code: issue.code }),
      ...(issue.params === undefined ? {} : { params: issue.params }),
    });
  }
  /** Cited file that is not in the package. */
  fileNotFound(file: string, path: string, target: string): void {
    this.error(file, path, 'library.fileNotFound', { path: target });
  }
  warning(
    file: string,
    path: string,
    code: ModelMessageTemplateCode,
    params?: Readonly<Record<string, string | number>>,
  ): void {
    this.issues.push(libraryIssue('warning', file, path, code, params));
  }
}

function locateSpec(
  files: readonly LibraryFile[],
  byPath: ReadonlyMap<string, LibraryFile>,
  specPath: string | undefined,
): { path: string } | { issue: LibraryIssue } {
  if (specPath !== undefined) {
    return byPath.has(specPath)
      ? { path: specPath }
      : {
          issue: libraryIssue('error', specPath, '', 'library.specFileNotFound', {
            path: specPath,
          }),
        };
  }
  const found: string[] = [];
  for (const file of files) {
    if (!file.path.toLowerCase().endsWith('.json') || file.text === undefined) continue;
    try {
      const json: unknown = JSON.parse(file.text);
      if (isRecord(json) && SPEC_FORMATS.includes(json.format)) found.push(file.path);
    } catch {
      // Invalid JSON is not a candidate: without a readable `format` there is no telling what it is.
    }
  }
  if (found.length === 1 && found[0] !== undefined) return { path: found[0] };
  const issue =
    found.length === 0
      ? libraryIssue('error', '', '', 'library.specNotFound')
      : libraryIssue('error', '', '', 'library.specAmbiguous', {
          count: found.length,
          files: found.join(', '),
        });
  return { issue };
}

/** Levels 1 and 2 share what 1 read from the files. */
interface Package {
  readonly spec: Spec;
  readonly specPath: string;
  readonly resolve: (ref: string) => string;
  readonly byPath: ReadonlyMap<string, LibraryFile>;
  /** Valid components by resolved path. */
  readonly components: Map<string, ComponentFile>;
  /** Component JSON by resolved path (to locate the field citations). */
  readonly componentJson: Map<string, unknown>;
  /** Per component file: takes a path in the read component to that in the written file (`$var(<name>)`). */
  readonly componentRewrite: Map<string, (path: string) => string>;
  /** The `$token`s of each valid component, by resolved path. */
  readonly tokenRefs: Map<string, readonly TokenRef[]>;
  /** The icon set (`icons`), when the file exists and is valid. */
  icons?: IconSet;
  /** Resolved path of the declared icons file (`icons`). */
  iconsPath?: string;
}

// ---------------------------------------------------------------------------------------
// Level 1
// ---------------------------------------------------------------------------------------

function level1(
  files: readonly LibraryFile[],
  byPath: ReadonlyMap<string, LibraryFile>,
  specPath: string,
  out: Collector,
): Package | undefined {
  const specFile = byPath.get(specPath);
  if (specFile?.text === undefined) {
    out.error(specPath, '', 'library.notRead');
    return undefined;
  }
  const parsed = parseSpecText(specFile.text);
  if (!parsed.ok) {
    for (const issue of parsed.issues) out.specIssue(specPath, issue);
    return undefined;
  }
  const { spec, ignored } = parsed;
  for (const warning of specWarnings(spec, ignored)) {
    out.passWarning(specPath, warning.path, warning.message, warning);
  }

  const resolve = (ref: string): string => resolvePath(specPath, ref);
  const pkg: Package = {
    spec,
    specPath,
    resolve,
    byPath,
    components: new Map(),
    componentJson: new Map(),
    componentRewrite: new Map(),
    tokenRefs: new Map(),
  };
  const referenced = new Set<string>([specPath]);
  const readComponents = new Set<string>();

  eachType(spec, (type, base) => {
    if (type.component !== undefined) {
      const path = resolve(type.component);
      referenced.add(path);
      const file = byPath.get(path);
      if (file === undefined) {
        out.fileNotFound(specPath, `${base}.component`, path);
      } else if (!readComponents.has(path)) {
        readComponents.add(path);
        readComponent(file, pkg, out);
      }
    }
    // A `doc` in an external repository (object) is not a package file: level 1 does not check it.
    if (typeof type.doc === 'string') {
      const path = resolve(type.doc);
      referenced.add(path);
      const file = byPath.get(path);
      if (file === undefined) {
        out.fileNotFound(specPath, `${base}.doc`, path);
      } else if ((file.text ?? '').trim() === '') {
        out.warning(path, '', 'library.emptyDoc');
      }
    }
    (type.examples ?? []).forEach((example) => {
      if (example.file !== undefined) referenced.add(resolve(example.file));
    });
  });
  for (const origin of spec.origins ?? []) {
    for (const example of origin.examples ?? []) referenced.add(resolve(example.file));
  }
  if (spec.icons !== undefined) {
    pkg.iconsPath = resolve(spec.icons);
    referenced.add(pkg.iconsPath);
    readIcons(pkg, out);
  }
  signatureChecks(pkg, referenced, out);

  for (const file of files) {
    const lower = file.path.toLowerCase();
    if (referenced.has(file.path)) continue;
    if (lower.endsWith('.json') || lower.endsWith('.md')) {
      out.warning(file.path, '', 'library.notReferenced');
    }
  }
  return pkg;
}

/** Level 1 (formatVersion 16): the cited signature sheets exist, are valid and are those of the same code. */
function signatureChecks(pkg: Package, referenced: Set<string>, out: Collector): void {
  const { problems, referenced: cited } = checkSignatures(pkg.spec, pkg);
  for (const file of cited) referenced.add(file);
  for (const problem of problems) {
    if (problem.missing !== undefined) {
      out.fileNotFound(problem.file, problem.path, problem.missing);
    } else {
      const coding = { messageCode: problem.code, messageParams: problem.params };
      if (problem.severity === 'error')
        out.passError(problem.file, problem.path, problem.message, coding);
      else out.passWarning(problem.file, problem.path, problem.message, coding);
    }
  }
}

/** Level 1: the `icons` file exists and is a valid `mapping-icons`. */

function readIcons(pkg: Package, out: Collector): void {
  const path = pkg.iconsPath;
  if (path === undefined) return;
  const file = pkg.byPath.get(path);
  if (file === undefined) {
    out.fileNotFound(pkg.specPath, 'icons', path);
    return;
  }
  if (file.text === undefined) return void out.error(path, '', 'library.notRead');
  const parsed = parseIconsText(file.text);
  if (!parsed.ok) {
    for (const issue of parsed.issues)
      out.passError(path, issue.path, issue.message, codingOf(issue));
    return;
  }
  pkg.icons = parsed.set;
}

function readComponent(file: LibraryFile, pkg: Package, out: Collector): void {
  if (file.text === undefined) {
    out.error(file.path, '', 'library.notRead');
    return;
  }
  let json: unknown;
  try {
    json = JSON.parse(file.text);
  } catch (error) {
    out.error(file.path, '', 'library.invalidJson', { detail: messageOf(error) });
    return;
  }
  const parsed = parseComponent(json);
  if (!parsed.ok) {
    for (const issue of parsed.issues)
      out.passError(file.path, issue.path, issue.message, codingOf(issue));
    return;
  }
  for (const warning of parsed.warnings)
    out.passWarning(file.path, warning.path, warning.message, codingOf(warning));
  pkg.components.set(file.path, parsed.component);
  // The component as read (with the `$var`s replaced; it is the `json` itself when there are no
  // variables): the field-citation checks look at the drawing the engine uses, not the written `let`.
  pkg.componentJson.set(file.path, parsed.component);
  pkg.componentRewrite.set(file.path, parsed.rewrite);
  pkg.tokenRefs.set(file.path, parsed.tokenRefs);
}

// ---------------------------------------------------------------------------------------
// Level 2
// ---------------------------------------------------------------------------------------

/** Checks a cited JSON file (exists and is JSON) and stores the content read in `cache`; a file's error comes out once. */
function readJsonFile(
  pkg: Package,
  ref: string,
  path: string,
  cache: Map<string, unknown>,
  out: Collector,
  seen: Set<string>,
): void {
  const full = pkg.resolve(ref);
  const file = pkg.byPath.get(full);
  if (file === undefined) {
    out.fileNotFound(pkg.specPath, path, full);
    return;
  }
  if (seen.has(full)) return;
  seen.add(full);
  if (file.text === undefined) {
    out.error(full, '', 'library.notRead');
    return;
  }
  try {
    cache.set(full, JSON.parse(file.text));
  } catch (error) {
    out.error(full, '', 'library.invalidJson', { detail: messageOf(error) });
  }
}

/** The code of the pair (token kind, kind expected at the position): one per pair of `TOKEN_KIND_NAMES`. */
function wrongKindCode(found: TokenKind, expected: TokenKind): ModelMessageTemplateCode {
  return `library.tokenWrongKind.${found}.${expected}` as ModelMessageTemplateCode;
}

/** Each `$token` of the component exists in the specialization's `tokens` (or is built in) and has the position's kind. */
function tokenChecks(pkg: Package, path: string, out: Collector): void {
  const known = knownTokenKinds(pkg.spec.tokens);
  for (const ref of pkg.tokenRefs.get(path) ?? []) {
    const kind = known.get(ref.name);
    if (kind === undefined) {
      out.error(path, ref.path, 'library.tokenMissing', { name: ref.name });
    } else if (kind !== ref.kind) {
      out.error(path, ref.path, wrongKindCode(kind, ref.kind), { name: ref.name });
    }
  }
}

function typeCoherence(
  pkg: Package,
  type: SpecAnnotationType,
  base: string,
  out: Collector,
  used: Map<string, string>,
): void {
  if (type.component === undefined) return;
  const path = pkg.resolve(type.component);
  const other = used.get(path);
  if (other !== undefined) {
    out.warning(pkg.specPath, `${base}.component`, 'library.componentAlreadyUsed', {
      path,
      typeId: other,
    });
  } else {
    used.set(path, type.id);
  }
  const component = pkg.components.get(path);
  if (component === undefined) return;

  const slot = findSlot(component);
  (type.sources ?? []).forEach((source, index) => {
    if (source.slot === undefined) return;
    const at = `${base}.sources[${index}].slot`;
    if (slot === undefined) {
      out.error(pkg.specPath, at, 'library.noSlot', { path });
    } else if (slot.name !== source.slot) {
      out.error(pkg.specPath, at, 'library.slotMismatch', {
        path,
        slot: slot.name ?? '',
        expected: source.slot,
      });
    }
  });

  const keys = new Set(type.fields.map((f) => f.key));
  const raw = pkg.componentJson.get(path);
  const rawTemplate = isRecord(raw) ? raw.template : undefined;
  const where = fieldReferences(rawTemplate, 'template');
  const used2 = collectFieldKeys(component);
  let from = out.issues.length;
  for (const key of used2) {
    if (keys.has(key)) continue;
    out.error(path, where.get(key) ?? 'template', 'library.fieldUndeclared', {
      key,
      typeId: type.id,
    });
  }
  remapIssues(pkg, path, out.issues, from);
  // The `tokenRefs` already come with the written file's path (`parseComponent`).
  tokenChecks(pkg, path, out);
  from = out.issues.length;
  const innerUsed = repeatChecks(type, path, rawTemplate, out);
  rowsChecks(type, path, rawTemplate, out);
  imageChecks(type, path, rawTemplate, out);
  remapIssues(pkg, path, out.issues, from);
  for (const [key, value] of Object.entries(component.preview ?? {})) {
    const field = type.fields.find((f) => f.key === key);
    if (field === undefined) {
      out.warning(path, `preview.${key}`, 'library.previewNoField', {
        typeId: type.id,
        key,
      });
    } else if (field.type === 'table') {
      previewRows(type, field, key, value, path, out);
    } else if (Array.isArray(value)) {
      out.warning(path, `preview.${key}`, 'library.previewNotTable', {
        key,
        typeId: type.id,
      });
    }
  }
  const drawn = new Set([...used2, ...innerUsed]);
  const coded = fieldsUsedByCode(type);
  type.fields.forEach((field, index) => {
    // A field the drawing does not use but the `code` does (modifiers, accessibility description)
    // is not a forgotten field: it exists for the code.
    if (drawn.has(field.key) || coded.has(field.key)) return;
    out.warning(pkg.specPath, `${base}.fields[${index}]`, 'library.fieldUnused', {
      key: field.key,
      typeId: type.id,
      path,
    });
  });
}

/**
 * The paths that the citation checks (field, `repeat`, `$rows`, image, icon) give in the component
 * as read, with the variables replaced, become those of the written file (`$var(<name>)` in place
 * of the use). Applies only to the problems of `file` after `from`.
 */
function remapIssues(
  pkg: Package,
  file: string,
  issues: LibraryIssue[],
  from: number,
): void {
  const rewrite = pkg.componentRewrite.get(file);
  if (rewrite === undefined) return;
  for (let i = from; i < issues.length; i++) {
    const issue = issues[i] as LibraryIssue;
    if (issue.file === file) issues[i] = { ...issue, path: rewrite(issue.path) };
  }
}

/**
 * Fields of the type that the `code` (of any platform, with the `variants` cases) uses: key of
 * `params` or of `values`, the `field` of `variants` or a whole word of the `notes`. The `notes`
 * are where the `code` explains how a field becomes a modifier or an argument.
 */
function fieldsUsedByCode(type: SpecAnnotationType): Set<string> {
  const used = new Set<string>();
  const notes: string[] = [];
  const take = (entry: {
    params?: Record<string, string>;
    values?: Record<string, unknown>;
    notes?: string;
  }): void => {
    for (const key of Object.keys(entry.params ?? {})) used.add(key);
    for (const key of Object.keys(entry.values ?? {})) used.add(key);
    if (entry.notes !== undefined) notes.push(entry.notes);
  };
  for (const entry of Object.values(type.code ?? {})) {
    take(entry);
    if (entry.variants === undefined) continue;
    used.add(entry.variants.field);
    for (const kase of Object.values(entry.variants.cases)) take(kase);
  }
  const text = notes.join('\n');
  for (const field of type.fields) {
    const escaped = field.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`).test(text)) used.add(field.key);
  }
  return used;
}

/** The `preview` of a `table` field is a list of rows, and the rows' columns exist. */
function previewRows(
  type: SpecAnnotationType,
  field: Extract<SpecField, { type: 'table' }>,
  key: string,
  value: unknown,
  path: string,
  out: Collector,
): void {
  if (value === null) return;
  if (!Array.isArray(value)) {
    out.warning(path, `preview.${key}`, 'library.previewTableNotList', {
      key,
      typeId: type.id,
    });
    return;
  }
  const columns = new Set(field.columns.map((c) => c.key));
  value.forEach((row: unknown, i) => {
    if (!isRecord(row)) return;
    for (const column of Object.keys(row)) {
      if (column === '_id' || columns.has(column)) continue;
      out.warning(
        path,
        `preview.${key}[${i}].${column}`,
        'library.previewColumnUnknown',
        {
          column,
          key,
          typeId: type.id,
        },
      );
    }
  });
}

/**
 * The drawing's `repeat`s: the cited field is a `table` of the type (error if it exists and is
 * not) and the row's `template` only reads columns of that table or fields of the type (error on
 * the others). Returns the type's field keys (that are not columns) read inside the `template`s,
 * for the unused-field warning.
 */
function repeatChecks(
  type: SpecAnnotationType,
  path: string,
  rawTemplate: unknown,
  out: Collector,
): Set<string> {
  const fields = new Map(type.fields.map((f) => [f.key, f]));
  const innerUsed = new Set<string>();
  for (const { path: at, node } of repeatNodes(rawTemplate, 'template')) {
    const key = typeof node.field === 'string' ? node.field : undefined;
    const table = key === undefined ? undefined : fields.get(key);
    // A nonexistent field was already pointed out ("the drawing uses the field ..., which the type does not declare").
    if (table !== undefined && table.type !== 'table') {
      out.error(path, `${at}.field`, 'library.repeatNotTable', {
        key: key ?? '',
        fieldType: table.type,
        typeId: type.id,
      });
    }
    const columns = new Set(
      table?.type === 'table' ? table.columns.map((c) => c.key) : [],
    );
    const inner = fieldReferences(node.template, `${at}.template`);
    for (const [name, where] of inner) {
      if (columns.has(name)) continue;
      const own = fields.get(name);
      if (own === undefined) {
        if (table?.type === 'table') {
          out.error(path, where, 'library.repeatRowUnknownColumn', {
            name,
            key: key ?? '',
            typeId: type.id,
          });
        } else {
          out.error(path, where, 'library.repeatRowUnknown', { name, typeId: type.id });
        }
      } else {
        innerUsed.add(name);
      }
    }
  }
  return innerUsed;
}

/** `$rows` counts the rows of a `table` of the type (a field of another kind is an error; a nonexistent one was already pointed out). */
function rowsChecks(
  type: SpecAnnotationType,
  path: string,
  rawTemplate: unknown,
  out: Collector,
): void {
  const fields = new Map(type.fields.map((f) => [f.key, f]));
  for (const { key, path: at } of rowsReferences(rawTemplate, 'template')) {
    const field = fields.get(key);
    if (field !== undefined && field.type !== 'table')
      out.error(path, at, 'library.rowsNotTable', {
        key,
        fieldType: field.type,
        typeId: type.id,
      });
  }
}

/**
 * The `src` of an `image` node bound to a field (`{ "$field": k }`) reads a text: outside a
 * `repeat`, `k` is a `string` field of the type; inside, it is a `string` column of the `repeat`'s
 * `table` (which shadows the type's field) or, if not a column, a `string` field of the type. A
 * nonexistent key is already pointed out by the other checks; no origin is declared.
 */
function imageChecks(
  type: SpecAnnotationType,
  path: string,
  rawTemplate: unknown,
  out: Collector,
): void {
  const fields = new Map(type.fields.map((f) => [f.key, f]));
  for (const { srcPath, key, repeat } of imageFieldNodes(
    rawTemplate,
    'template',
    undefined,
  )) {
    const table = repeat === undefined ? undefined : fields.get(String(repeat.field));
    const column =
      table?.type === 'table' ? table.columns.find((c) => c.key === key) : undefined;
    if (column !== undefined) {
      if (column.type !== 'string') {
        out.error(path, srcPath, 'library.imageColumnNotString', {
          key,
          table: table?.key ?? '',
          typeId: type.id,
          fieldType: column.type,
        });
      }
      continue;
    }
    const own = fields.get(key);
    if (own !== undefined && own.type !== 'string') {
      out.error(path, srcPath, 'library.imageFieldNotString', {
        key,
        fieldType: own.type,
        typeId: type.id,
      });
    }
  }
}

/** What the role-step check reads from the previous version. */
interface RoleReferences {
  readonly version: number;
  /** type id (in the previous version) → role ids. */
  readonly before: ReadonlyMap<string, ReadonlySet<string>>;
  /** new type id → old id, from the migration's `rename-type`s. */
  readonly renamedFrom: ReadonlyMap<string, string>;
  readonly warn: (
    path: string,
    code: ModelMessageTemplateCode,
    params: Readonly<Record<string, string | number>>,
  ) => void;
}

/**
 * `rename-role.from` and `remove-role.role` that were not roles of the owner type in the previous
 * version (warning). The owner is read by the id it had before a `rename-type`; an owner that did
 * not exist becomes a warning on the type. The other steps do not cite an old role.
 */
function roleReference(step: SpecMigrationStep, at: string, refs: RoleReferences): void {
  if (step.op !== 'rename-role' && step.op !== 'remove-role') return;
  const role = step.op === 'rename-role' ? step.from : step.role;
  const roles = refs.before.get(refs.renamedFrom.get(step.type) ?? step.type);
  if (roles === undefined) {
    refs.warn(`${at}.type`, 'library.typeNotInVersion', {
      typeId: step.type,
      version: refs.version,
    });
  } else if (!roles.has(role)) {
    refs.warn(
      step.op === 'rename-role' ? `${at}.from` : `${at}.role`,
      'library.roleNotInVersion',
      { role, typeId: step.type, version: refs.version },
    );
  }
}

/** Steps of the migration leaving the previous version that cite what did not exist in it (warning). */
function migrationReferences(
  previous: Spec,
  spec: Spec,
  out: Collector,
  specPath: string,
): void {
  const index = (spec.migrations ?? []).findIndex((m) => m.from === previous.version);
  const migration = spec.migrations?.[index];
  if (migration === undefined) return;
  const before = new Map<string, Map<string, SpecField>>();
  eachType(previous, (type) => before.set(type.id, fieldKeys(type)));
  const renamedFrom = new Map<string, string>();
  for (const step of migration.steps) {
    if (step.op === 'rename-type') renamedFrom.set(step.to, step.from);
  }
  const rolesBefore = new Map<string, Set<string>>();
  eachType(previous, (type) =>
    rolesBefore.set(type.id, new Set((type.childRoles ?? []).map((r) => r.id))),
  );
  const roleRefs: RoleReferences = {
    version: previous.version,
    before: rolesBefore,
    renamedFrom,
    warn: (path, code, params) => out.warning(specPath, path, code, params),
  };
  const missingType = (id: string, at: string): void =>
    out.warning(specPath, at, 'library.typeNotInVersion', {
      typeId: id,
      version: previous.version,
    });
  const oldType = (step: Extract<SpecMigrationStep, { type: string }>, at: string) => {
    const fields = before.get(renamedFrom.get(step.type) ?? step.type);
    if (fields === undefined) missingType(step.type, `${at}.type`);
    return fields;
  };

  migration.steps.forEach((step, si) => {
    const at = `migrations[${index}].steps[${si}]`;
    if (step.op === 'rename-type') {
      if (!before.has(step.from)) missingType(step.from, `${at}.from`);
    } else if (step.op === 'remove-type') {
      if (!before.has(step.type)) missingType(step.type, `${at}.type`);
    } else if (step.op === 'rename-field' || step.op === 'remove-field') {
      const fields = oldType(step, at);
      const key = step.op === 'rename-field' ? step.from : step.field;
      const keyPath = step.op === 'rename-field' ? `${at}.from` : `${at}.field`;
      if (fields !== undefined && !fields.has(key)) {
        out.warning(specPath, keyPath, 'library.fieldNotInVersion', {
          key,
          typeId: step.type,
          version: previous.version,
        });
      }
    } else if (step.op === 'map-values') {
      const fields = oldType(step, at);
      if (fields === undefined) return;
      const field = fields.get(step.field);
      if (field === undefined) {
        out.warning(specPath, `${at}.field`, 'library.fieldNotInVersion', {
          key: step.field,
          typeId: step.type,
          version: previous.version,
        });
        return;
      }
      const options = field.type === 'enum' ? field.options : [];
      for (const value of Object.keys(step.values)) {
        if (!options.includes(value)) {
          out.warning(specPath, `${at}.values.${value}`, 'library.optionNotInVersion', {
            value,
            field: step.field,
            version: previous.version,
          });
        }
      }
    } else {
      roleReference(step, at, roleRefs);
    }
  });
}

function versionContract(
  previous: Spec,
  spec: Spec,
  specPath: string,
  out: Collector,
): void {
  if (previous.id !== spec.id) {
    out.error(specPath, 'id', 'library.versionOtherSpec', {
      previous: previous.id,
      id: spec.id,
    });
    return;
  }
  if (spec.version <= previous.version) {
    out.error(specPath, 'version', 'library.versionNotGrown', {
      previous: previous.version,
      version: spec.version,
    });
  }
  for (const change of missingMigrations(previous, spec)) {
    out.passError(specPath, change.path, change.message, change);
  }
  migrationReferences(previous, spec, out, specPath);
}

function level2(
  pkg: Package,
  previous: Spec | undefined,
  out: Collector,
): Map<string, unknown> {
  const { spec, specPath } = pkg;
  const used = new Map<string, string>();
  const jsons = new Map<string, unknown>();
  const seen = new Set<string>();
  eachType(spec, (type, base) => {
    typeCoherence(pkg, type, base, out, used);
    (type.examples ?? []).forEach((example, index) => {
      if (example.file === undefined) return;
      readJsonFile(
        pkg,
        example.file,
        `${base}.examples[${index}].file`,
        jsons,
        out,
        seen,
      );
    });
  });

  for (const [path, json] of pkg.componentJson) {
    const template = isRecord(json) ? json.template : undefined;
    const from = out.issues.length;
    out.issues.push(
      ...iconLiteralIssues(path, iconNodes(template), pkg.icons, pkg.iconsPath),
    );
    remapIssues(pkg, path, out.issues, from);
  }

  (spec.fonts ?? []).forEach((font, index) => {
    const path = pkg.resolve(font.file);
    if (pkg.byPath.has(path)) return;
    out.warning(specPath, `fonts[${index}].file`, 'library.fontMissing', {
      family: font.family,
      path,
    });
  });

  const typeIds = new Set<string>();
  eachType(spec, (type) => typeIds.add(type.id));
  (spec.origins ?? []).forEach((origin, oi) => {
    (origin.screen?.roots ?? []).forEach((root, ri) => {
      if (root.scrim !== undefined && !typeIds.has(root.scrim)) {
        out.error(
          specPath,
          `origins[${oi}].screen.roots[${ri}].scrim`,
          'library.scrimMissing',
          { typeId: root.scrim },
        );
      }
    });
    (origin.examples ?? []).forEach((example, ei) => {
      readJsonFile(
        pkg,
        example.file,
        `origins[${oi}].examples[${ei}].file`,
        jsons,
        out,
        seen,
      );
    });
  });

  if (previous !== undefined) versionContract(previous, spec, specPath, out);
  return jsons;
}

// ---------------------------------------------------------------------------------------
// Level 3: enum options outside the icon set
// ---------------------------------------------------------------------------------------

function iconOptionChecks(pkg: Package): LibraryIssue[] {
  const out: LibraryIssue[] = [];
  eachType(pkg.spec, (type, base) => {
    if (type.component === undefined) return;
    const json = pkg.componentJson.get(pkg.resolve(type.component));
    const nodes: IconNodeRef[] = iconNodes(isRecord(json) ? json.template : undefined);
    out.push(...iconOptionIssues(pkg.specPath, type, base, nodes, pkg.icons));
  });
  return out;
}

// ---------------------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------------------

function summarize(
  spec: Spec | undefined,
  pkg: Package | undefined,
  level: 1 | 2 | 3,
): LibraryReport['summary'] {
  if (spec === undefined || pkg === undefined) {
    return { level, types: 0, components: 0, docs: 0, examples: 0, fonts: 0 };
  }
  const components = new Set<string>();
  const docs = new Set<string>();
  let types = 0;
  let examples = 0;
  eachType(spec, (type) => {
    types += 1;
    if (type.component !== undefined) components.add(pkg.resolve(type.component));
    if (typeof type.doc === 'string') docs.add(pkg.resolve(type.doc));
    // Document in an external repository (docRepos): counts too, by repository and path.
    else if (type.doc !== undefined) docs.add(`${type.doc.repo}\u0000${type.doc.path}`);
    examples += type.examples?.length ?? 0;
  });
  for (const origin of spec.origins ?? []) examples += origin.examples?.length ?? 0;
  return {
    level,
    types,
    components: components.size,
    docs: docs.size,
    examples,
    fonts: spec.fonts?.length ?? 0,
  };
}

function report(
  issues: readonly LibraryIssue[],
  spec: Spec | undefined,
  summary: LibraryReport['summary'],
): LibraryReport {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  return {
    ok: errors.length === 0,
    issues,
    errors,
    warnings,
    ...(spec === undefined ? {} : { spec }),
    summary,
  };
}

/** Validates the package (the specialization's folder) already read; see the file header. */

export function validateLibrary(input: LibraryInput): LibraryReport {
  const wanted = input.level ?? 3;
  const byPath = new Map<string, LibraryFile>();
  for (const file of input.files) if (!byPath.has(file.path)) byPath.set(file.path, file);

  const located = locateSpec(input.files, byPath, input.specPath);
  if ('issue' in located) {
    return report([located.issue], undefined, summarize(undefined, undefined, 1));
  }

  const level1Out = new Collector();
  const pkg = level1(input.files, byPath, located.path, level1Out);
  if (pkg === undefined) {
    return report(level1Out.issues, undefined, summarize(undefined, undefined, 1));
  }
  let reached: 1 | 2 | 3 = 1;
  const level2Out = new Collector();
  const level3Out: LibraryIssue[] = [];
  if (wanted >= 2) {
    reached = 2;
    const jsons = level2(pkg, input.previous, level2Out);
    if (wanted >= 3) {
      reached = 3;
      const specFile = byPath.get(pkg.specPath);
      const textFiles: TextFile[] = [];
      if (specFile?.text !== undefined) {
        textFiles.push({ path: specFile.path, text: specFile.text });
      }
      for (const file of input.files) {
        if (file.path === pkg.specPath || file.text === undefined) continue;
        if (file.path.toLowerCase().endsWith('.json')) {
          textFiles.push({ path: file.path, text: file.text });
        }
      }
      level3Out.push(
        ...drawingIssues({
          spec: pkg.spec,
          specPath: pkg.specPath,
          resolve: pkg.resolve,
          components: pkg.components,
          jsonOf: (path) => jsons.get(path),
          textFiles,
          icons: pkg.icons,
        }),
        ...iconOptionChecks(pkg),
      );
    }
  }
  return report(
    [...level1Out.issues, ...level2Out.issues, ...level3Out],
    pkg.spec,
    summarize(pkg.spec, pkg, reached),
  );
}
