import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { parseSpecText, type Spec } from '../src/model';
import { resolvePath } from '../src/model/components/library';
import {
  validateLibrary,
  type LibraryFile,
  type LibraryIssue,
} from '../src/model/library';
import {
  MAX_PACKAGE_BYTES,
  MAX_PACKAGE_FILES as MODEL_PACKAGE_FILES,
  usesPackageFiles,
} from '../src/model/libraryPackage';
import { docClonesChecker, externalDocWarnings } from './docFiles';
import { ToolError } from './errors';
import { hasParentSegment, isWithin, type Roots } from './paths';

// Library package (Library stage, B2): `validate_library` reads the package FOLDER and calls
// `validateLibrary` (`src/model/library.ts`), the same function as the app and the skill. Here only
// the disk is read: `.json`/`.md` texts, the rest becomes `binary: true` without reading the content.
// Symbolic links are never followed (the folder and the files must actually be inside the
// roots). Read-only; nothing is applied to any project.

type Json = Record<string, unknown>;

/** Files in a package folder; above this the request is refused. */
export const MAX_PACKAGE_FILES = 2000;
/** Sum of the texts read (`.json` and `.md`). */
export const MAX_PACKAGE_TEXT_BYTES = 32 * 1024 * 1024;
/** A text larger than this does not belong to a reasonable package. */
const MAX_TEXT_FILE_BYTES = 8 * 1024 * 1024;
/** Maximum depth of package subfolders. */
const MAX_DEPTH = 8;
/** Errors and warnings returned at once. */
export const MAX_ISSUES = 100;
/** An external-system example larger than this goes only by path (`get_component`). */
export const MAX_EXAMPLE_JSON_BYTES = 16 * 1024;

const isTextPath = (path: string): boolean => /\.(json|md)$/i.test(path);

interface Walked {
  readonly path: string;
  readonly real: string;
  readonly size: number;
}

interface WalkResult {
  readonly files: Walked[];
  /** Skipped folders (hidden, `node_modules` and beyond `MAX_DEPTH` levels), relative to the folder. */
  readonly ignored: string[];
}

/** Regular files of the folder (recursive, in path order); ignores links and hidden entries. */
async function walkFiles(dir: string): Promise<WalkResult> {
  const found: Walked[] = [];
  const ignored: string[] = [];
  const visit = async (current: string, prefix: string, depth: number) => {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.name.startsWith('.') || entry.name === 'node_modules') {
        if (entry.isDirectory()) ignored.push(path);
        continue;
      }
      const real = join(current, entry.name);
      if (entry.isDirectory()) {
        if (depth < MAX_DEPTH) await visit(real, path, depth + 1);
        else ignored.push(path);
      } else if (entry.isFile()) {
        if (found.length >= MAX_PACKAGE_FILES) {
          throw new ToolError(
            'package-too-large',
            `the package has too many files (more than ${MAX_PACKAGE_FILES})`,
            { limit: MAX_PACKAGE_FILES },
          );
        }
        found.push({ path, real, size: (await stat(real)).size });
      }
    }
  };
  await visit(dir, '', 0);
  return { files: found, ignored };
}

/** How many skipped folders the warning cites by name. */
const MAX_IGNORED_LISTED = 20;

/** `ignored-paths` warning: the package has folders the read skipped (never an error). */
export function ignoredPathsIssues(ignored: readonly string[]): LibraryIssue[] {
  if (ignored.length === 0) return [];
  const shown = ignored.slice(0, MAX_IGNORED_LISTED).join(', ');
  const more =
    ignored.length > MAX_IGNORED_LISTED
      ? ` and ${ignored.length - MAX_IGNORED_LISTED} more`
      : '';
  return [
    {
      file: '',
      path: 'ignored-paths',
      message: `folders ignored while reading the package (hidden, node_modules or beyond ${MAX_DEPTH} levels): ${shown}${more}`,
      severity: 'warning',
    },
  ];
}

/** The package read from disk, ready for `validateLibrary`. */
export interface ReadPackage {
  /** Real path of the package folder. */
  readonly dir: string;
  readonly files: readonly LibraryFile[];
  /** Folders skipped on read (see `ignoredPathsIssues`). */
  readonly ignoredPaths: readonly string[];
  /** Specialization file, when the request indicated it (relative to the folder). */
  readonly specPath?: string;
  /** With `raw`: the raw content of ALL files (binaries included), by relative path. */
  readonly bytes?: ReadonlyMap<string, Uint8Array>;
}

export interface ReadPackageOptions {
  /**
   * Also reads the content of the binaries (to carry the package in a proposal). Adds the
   * limits of the app's package (`MAX_PACKAGE_FILES` and `MAX_PACKAGE_BYTES` of the model): above
   * them the app would refuse the folder.
   */
  readonly raw?: boolean;
  /** Real path already resolved (relative to the project, for example); without it, resolves `path` in the roots. */
  readonly real?: string;
}

/** Reads the package folder: `path` is the folder or the specialization file inside it. */
export async function readPackage(
  roots: Roots,
  path: string,
  options: ReadPackageOptions = {},
): Promise<ReadPackage> {
  const real = options.real ?? (await roots.resolveExisting(path)).real;
  const info = await stat(real);
  let dir = real;
  let specPath: string | undefined;
  if (info.isFile()) {
    dir = dirname(real);
    specPath = basename(real);
  } else if (!info.isDirectory()) {
    throw new ToolError('not-a-file', `not a folder or a file: ${path}`, {
      path,
    });
  }
  await roots.assertInside(dir, path);
  const { files: walked, ignored } = await walkFiles(dir);
  if (options.raw) {
    const bytes = walked.reduce((sum, file) => sum + file.size, 0);
    if (walked.length > MODEL_PACKAGE_FILES || bytes > MAX_PACKAGE_BYTES) {
      throw new ToolError(
        'package-too-large',
        `the package has ${walked.length} file(s) and ${bytes} bytes: the app accepts up to ${MODEL_PACKAGE_FILES} files and ${MAX_PACKAGE_BYTES} bytes`,
        { limit: MODEL_PACKAGE_FILES, limitBytes: MAX_PACKAGE_BYTES },
      );
    }
  }
  const raw = new Map<string, Uint8Array>();
  let total = 0;
  const files: LibraryFile[] = [];
  for (const file of walked) {
    if (!isTextPath(file.path)) {
      if (options.raw) raw.set(file.path, await readFile(file.real));
      files.push({ path: file.path, binary: true });
      continue;
    }
    if (file.size > MAX_TEXT_FILE_BYTES) {
      throw new ToolError('file-too-large', `file too large: ${file.path}`, {
        path: file.path,
        limit: MAX_TEXT_FILE_BYTES,
      });
    }
    total += file.size;
    if (total > MAX_PACKAGE_TEXT_BYTES) {
      throw new ToolError(
        'package-too-large',
        `the package texts add up to more than ${MAX_PACKAGE_TEXT_BYTES} bytes`,
        { limit: MAX_PACKAGE_TEXT_BYTES },
      );
    }
    const content = await readFile(file.real);
    if (options.raw) raw.set(file.path, content);
    files.push({ path: file.path, text: content.toString('utf8') });
  }
  return {
    dir,
    files,
    ignoredPaths: ignored,
    ...(specPath === undefined ? {} : { specPath }),
    ...(options.raw ? { bytes: raw } : {}),
  };
}

/** Reads and validates the file of a previous version of the specialization (wires up the version contract). */
export async function readPreviousSpec(roots: Roots, path: string): Promise<Spec> {
  const { real } = await roots.resolveExisting(path);
  const info = await stat(real);
  if (!info.isFile()) {
    throw new ToolError('not-a-file', `not a file: ${path}`, { path });
  }
  if (info.size > MAX_TEXT_FILE_BYTES) {
    throw new ToolError('file-too-large', `file too large: ${path}`, { path });
  }
  const parsed = parseSpecText(await readFile(real, 'utf8'));
  if (!parsed.ok) {
    throw new ToolError('invalid-spec', `the previous version is invalid: ${path}`, {
      path,
      errors: parsed.errors.slice(0, 20),
    });
  }
  return parsed.spec;
}

/**
 * The text of a `.json` file inside the roots (the signature sheet of `plan_signature_import`).
 * Reads only JSON: another extension is refused before opening (the server does not read code; decision 1 of #1079).
 */
export async function readJsonFile(roots: Roots, path: string): Promise<string> {
  const refuse = (): never => {
    throw new ToolError('signature-invalid', `the sheet must be a .json file: ${path}`, {
      path,
      hint: 'the server does not read code: extract the sheet with tools/mapping-signature.mjs (or write it by hand) and pass the .json',
    });
  };
  if (!isJsonPath(path)) refuse();
  const { real } = await roots.resolveExisting(path);
  // A `.json` symbolic link to code: also check the real path, before reading.
  if (!isJsonPath(real)) refuse();
  const info = await stat(real);
  if (!info.isFile()) {
    throw new ToolError('not-a-file', `not a file: ${path}`, { path });
  }
  if (info.size > MAX_TEXT_FILE_BYTES) {
    throw new ToolError('file-too-large', `file too large: ${path}`, { path });
  }
  return readFile(real, 'utf8');
}

const isJsonPath = (path: string): boolean => path.toLowerCase().endsWith('.json');

/** Summary of the specialization (counts of what it declares). */
export function libraryCounts(spec: Spec): Json {
  const types = spec.layers.flatMap((layer) => layer.annotationTypes);
  return {
    components: types.filter((t) => t.component !== undefined).length,
    docs: types.filter((t) => t.doc !== undefined).length,
    examples:
      types.reduce((sum, t) => sum + (t.examples ?? []).length, 0) +
      (spec.origins ?? []).reduce((sum, o) => sum + (o.examples ?? []).length, 0),
    ...(types.some((t) => t.structural === true)
      ? { structural: types.filter((t) => t.structural === true).length }
      : {}),
    fonts: (spec.fonts ?? []).length,
    origins: (spec.origins ?? []).length,
    migrations: (spec.migrations ?? []).length,
    ...(spec.icons === undefined ? {} : { icons: spec.icons }),
  };
}

export function issueView(issue: LibraryIssue): Json {
  return {
    file: issue.file,
    path: issue.path,
    message: issue.message,
    severity: issue.severity,
  };
}

async function docWarningsOf(
  roots: Roots,
  spec: Spec | undefined,
  specPath: string | undefined,
  docClones: Readonly<Record<string, string>> | undefined,
): Promise<LibraryIssue[]> {
  if (spec === undefined) return [];
  const check = await docClonesChecker(roots, docClones);
  return externalDocWarnings(spec, specPath ?? '', check);
}

/** `validate_library`: the three levels over the folder, in the format of the other validation tools. */
export async function validateLibraryTool(
  roots: Roots,
  args: {
    path: string;
    previous?: string | undefined;
    level?: 1 | 2 | 3 | undefined;
    docClones?: Readonly<Record<string, string>> | undefined;
  },
  summarize: (spec: Spec) => Json,
): Promise<Json> {
  const pkg = await readPackage(roots, args.path);
  const previous =
    args.previous === undefined
      ? undefined
      : await readPreviousSpec(roots, args.previous);
  const report = validateLibrary({
    files: pkg.files,
    ...(pkg.specPath === undefined ? {} : { specPath: pkg.specPath }),
    ...(previous === undefined ? {} : { previous }),
    ...(args.level === undefined ? {} : { level: args.level }),
  });
  const errors = report.errors.map(issueView);
  // Document in an external repository: outside the package, it is checked here (a warning, never an error).
  const docWarnings = await docWarningsOf(
    roots,
    report.spec,
    pkg.specPath,
    args.docClones,
  );
  const warnings = [
    ...report.warnings,
    ...docWarnings,
    ...ignoredPathsIssues(pkg.ignoredPaths),
  ].map(issueView);
  const hint = report.ok
    ? warnings.length > 0
      ? 'the library is valid; warnings allow using it, but they usually point to oversights (missing font, content larger than the box, unused file)'
      : 'the library is valid: apply it by proposal (`apply_specialization` or, on an already applied library, `update_specialization`, with `file` of the folder; before that, `plan_library_update` shows the impact) or through the app (Specializations › package folder or zip)'
    : 'fix the errors (`file` and `path` point to the spot) and validate again; an error prevents use, a warning allows it';
  return {
    valid: report.ok,
    path: args.path,
    ...(report.spec === undefined
      ? {}
      : { spec: { ...summarize(report.spec), ...libraryCounts(report.spec) } }),
    summary: report.summary,
    errors: errors.slice(0, MAX_ISSUES),
    ...(errors.length > MAX_ISSUES ? { moreErrors: errors.length - MAX_ISSUES } : {}),
    warnings: warnings.slice(0, MAX_ISSUES),
    ...(warnings.length > MAX_ISSUES
      ? { moreWarnings: warnings.length - MAX_ISSUES }
      : {}),
    hint,
  };
}

/** Lazy access to the files of a package (from the request by `path` or from the copy in the project). */
export interface PackageSource {
  readonly spec: Spec;
  /** Specialization file relative to the package folder. */
  readonly specPath: string;
  /** Text of the file (path relative to the folder); `null` if it does not exist. */
  read(path: string): Promise<string | null>;
  /** Path of a file cited by the specialization, relative to the folder. */
  resolve(ref: string): string;
}

/** Reads a package file without leaving the folder or the roots; `null` if it does not exist or is invalid. */
export async function readPackageFile(
  roots: Roots,
  dir: string,
  path: string,
): Promise<string | null> {
  if (
    path === '' ||
    path.includes('\0') ||
    path.includes('\\') ||
    hasParentSegment(path)
  ) {
    return null;
  }
  let real: string;
  try {
    real = await realpath(join(dir, path));
  } catch {
    return null;
  }
  const realDir = await realpath(dir).catch(() => dir);
  if (!isWithin(realDir, real) || (await roots.locate(real)) === null) return null;
  const info = await stat(real);
  if (!info.isFile() || info.size > MAX_TEXT_FILE_BYTES) return null;
  return readFile(real, 'utf8');
}

/** Package requested by `path` (the folder or the specialization file). */
export async function packageByPath(roots: Roots, path: string): Promise<PackageSource> {
  const { real } = await roots.resolveExisting(path);
  const info = await stat(real);
  let dir = real;
  let specPath: string | undefined;
  if (info.isFile()) {
    dir = dirname(real);
    specPath = basename(real);
  } else if (!info.isDirectory()) {
    throw new ToolError('not-a-file', `not a folder or a file: ${path}`, {
      path,
    });
  }
  await roots.assertInside(dir, path);
  if (specPath === undefined) {
    const candidates: string[] = [];
    for (const name of (await readdir(dir)).sort()) {
      if (!name.toLowerCase().endsWith('.json')) continue;
      const text = await readPackageFile(roots, dir, name);
      if (text !== null && /"format"\s*:\s*"mapping-spec"/.test(text))
        candidates.push(name);
    }
    if (candidates.length !== 1) {
      throw new ToolError(
        'invalid-spec',
        candidates.length === 0
          ? `no specialization (.json with "format": "mapping-spec") in the folder: ${path}`
          : `there are ${candidates.length} specializations in the folder (${candidates.join(', ')}): indicate the file`,
        { path },
      );
    }
    specPath = candidates[0]!;
  }
  const text = await readPackageFile(roots, dir, specPath);
  if (text === null) {
    throw new ToolError('path-not-found', `specialization file not found: ${path}`, {
      path,
    });
  }
  const parsed = parseSpecText(text);
  if (!parsed.ok) {
    throw new ToolError('invalid-spec', `invalid specialization: ${path}`, {
      path,
      errors: parsed.errors.slice(0, 20),
      hint: 'use validate_library to see the package problems',
    });
  }
  const spec = parsed.spec;
  const base = specPath;
  return {
    spec,
    specPath: base,
    read: (file) => readPackageFile(roots, dir, file),
    resolve: (ref) => resolvePath(base, ref),
  };
}

/**
 * Files of the package applied to a project (`specs/<id>/…`), relative to the folder; empty if the
 * copy is a single file (v1 to v3, or the incomplete copy of a v4).
 */
export async function listPackageFiles(
  roots: Roots,
  projectDir: string,
  specFile: string,
): Promise<{ dir: string; files: string[] } | null> {
  const dir = dirname(specFile);
  if (dir === '.' || dir === 'specs' || hasParentSegment(dir)) return null;
  let real: string;
  try {
    real = await realpath(join(projectDir, dir));
    if ((await roots.locate(real)) === null || !(await stat(real)).isDirectory()) {
      return null;
    }
  } catch {
    return null;
  }
  const walked = await walkFiles(real);
  return { dir: dir.split('\\').join('/'), files: walked.files.map((f) => f.path) };
}

/** Source of an applied package: reads inside the project's `specs/<id>/`. */
export function packageOfProject(
  roots: Roots,
  projectDir: string,
  specFile: string,
  spec: Spec,
): PackageSource {
  const rel = dirname(specFile);
  const dir = rel === '.' ? projectDir : join(projectDir, rel);
  const base = basename(specFile);
  return {
    spec,
    specPath: base,
    read: (file) => readPackageFile(roots, dir, file),
    resolve: (ref) => resolvePath(base, ref),
  };
}

/**
 * What a request of `apply_specialization`/`update_specialization`/`plan_library_update` points to:
 * a specialization file that does not cite package files (v1 to v3, or v4 and v5 without
 * `component`, `doc`, `examples`, `fonts`, `origins` or `icons`: only the file goes to `specs/<id>.json`) or a v4
 * package (the whole folder, with the raw content of the files).
 */
export type SpecInput =
  | { readonly kind: 'file'; readonly spec: Spec }
  | { readonly kind: 'package'; readonly pkg: ReadPackage };

/**
 * Reads what `path` points to (package folder, or specialization file, of any
 * `formatVersion`). A v4 file brings its folder along; a v1 to v3 file, only itself.
 * `real` is the already-resolved path (the batch looks first in the project folder). `raw: false`
 * (read-only, as `plan_library_update`) does not read the binaries or apply the app's limits.
 */
export async function readSpecInput(
  roots: Roots,
  path: string,
  real?: string,
  options: { raw?: boolean } = {},
): Promise<SpecInput> {
  const raw = options.raw ?? true;
  const resolved = real ?? (await roots.resolveExisting(path)).real;
  const info = await stat(resolved);
  if (info.isDirectory()) {
    return {
      kind: 'package',
      pkg: await readPackage(roots, path, { raw, real: resolved }),
    };
  }
  if (!info.isFile()) {
    throw new ToolError('not-a-file', `not a folder or a file: ${path}`, {
      path,
    });
  }
  if (info.size > MAX_TEXT_FILE_BYTES) {
    throw new ToolError('file-too-large', `file too large: ${path}`, { path });
  }
  const parsed = parseSpecText(await readFile(resolved, 'utf8'));
  if (!parsed.ok) {
    throw new ToolError('invalid-spec', `invalid specialization: ${path}`, {
      errors: parsed.errors.slice(0, 20),
      hint: 'a v4 package with a problem: use validate_library on the folder to see the errors of each file',
    });
  }
  if (!usesPackageFiles(parsed.spec)) return { kind: 'file', spec: parsed.spec };
  return {
    kind: 'package',
    pkg: await readPackage(roots, path, { raw, real: resolved }),
  };
}
