import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import {
  DEFAULT_ICON_VIEWBOX,
  ICONS_FORMAT,
  ICONS_FORMAT_VERSION,
  parseIconsFile,
  parseIconsText,
  type IconDef,
} from '../src/model/components/icons';
import { svgToIcon, type SvgColors } from '../src/model/components/svgIcon';
import { SVG_MAX_BYTES } from '../src/model/components/svgXml';
import { enclosingProject } from './createProject';
import { ToolError } from './errors';
import { MAX_TEXT_FILE_BYTES, packageByPath, type PackageSource } from './library';
import { hasParentSegment, isWithin, writeFileAtomic, type Roots } from './paths';

// `import_icons` (stage #2087, FG3): turns SVG files into entries of the icons file the library
// package declares (`icons` in the specialization), through the pure converter `svgToIcon`
// (`src/model/components/svgIcon.ts`). The icons file is package DATA, not code: the tool reads only
// `.svg` files (the extension is checked before the content is opened) and writes only that one
// `.json`, atomically, after validating the merged file with `parseIconsFile`. It never writes the
// specialization, a project, `specs/` or anything outside the roots.

type Json = Record<string, unknown>;

/** Files of a folder import (decision 8): more than this is an error, nothing written. */
export const MAX_SVG_FILES = 500;

export interface ImportIconsArgs {
  readonly path: string;
  readonly svg: string;
  readonly name?: string;
  readonly replace?: boolean;
  readonly colors?: SvgColors;
  readonly mirror?: boolean;
  readonly dryRun?: boolean;
}

/** An SVG file read from disk, or the reason it was not. */
interface SvgSource {
  readonly file: string;
  readonly text?: string;
  readonly problem?: string;
}

/** The icons file as found on disk (`null` text: it does not exist yet). */
interface IconsTarget {
  /** Absolute path of the file to write. */
  readonly target: string;
  /** Path relative to the package folder, as the specialization cites it. */
  readonly file: string;
  /** The parsed file; `undefined` when it does not exist yet. */
  readonly existing?: Json;
}

const isSvgPath = (path: string): boolean => extname(path).toLowerCase() === '.svg';

const invalidArguments = (message: string, details: Json = {}): ToolError =>
  new ToolError('invalid-arguments', message, details);

// ---------------------------------------------------------------------------------------------
// Input: the SVG file or folder

/** The files an `svg` argument names: a `.svg` file, or the `.svg` files of a folder (no recursion). */
async function readSvgSources(
  roots: Roots,
  svg: string,
  name: string | undefined,
): Promise<readonly SvgSource[]> {
  const { real } = await roots.resolveExisting(svg);
  const info = await stat(real);
  if (info.isDirectory()) {
    if (name !== undefined) {
      throw invalidArguments(
        '`name` only applies to a single .svg file, not to a folder',
        {
          svg,
        },
      );
    }
    return readFolder(roots, real);
  }
  // A single file: refused by extension (the given one and the real one, behind a symbolic link)
  // before it is opened.
  if (!info.isFile() || !isSvgPath(svg) || !isSvgPath(real)) {
    throw invalidArguments(`\`svg\` must be a .svg file or a folder: ${svg}`, { svg });
  }
  const read = await readSvg(basename(svg), real, info.size);
  if (read.problem !== undefined) throw invalidArguments(read.problem, { svg });
  return [read];
}

async function readFolder(roots: Roots, dir: string): Promise<readonly SvgSource[]> {
  const names = (await readdir(dir)).filter(isSvgPath).sort();
  if (names.length > MAX_SVG_FILES) {
    throw invalidArguments(
      `the folder has ${names.length} .svg files: the limit is ${MAX_SVG_FILES} per call`,
      { limit: MAX_SVG_FILES, found: names.length },
    );
  }
  const sources: SvgSource[] = [];
  for (const file of names) sources.push(await readFolderEntry(roots, dir, file));
  return sources;
}

/** One entry of the folder: a link that leaves the roots, or that is not an `.svg`, is a problem of that file. */
async function readFolderEntry(
  roots: Roots,
  dir: string,
  file: string,
): Promise<SvgSource> {
  let real: string;
  try {
    real = await realpath(join(dir, file));
  } catch {
    return { file, problem: 'the file cannot be read' };
  }
  if ((await roots.locate(real)) === null) {
    return {
      file,
      problem: 'outside-roots: the link points outside the configured roots',
    };
  }
  if (!isSvgPath(real))
    return { file, problem: 'the link does not point to an .svg file' };
  const info = await stat(real);
  if (!info.isFile()) return { file, problem: 'not a file' };
  return readSvg(file, real, info.size);
}

async function readSvg(file: string, real: string, size: number): Promise<SvgSource> {
  if (size > SVG_MAX_BYTES) {
    return { file, problem: `the SVG is larger than ${SVG_MAX_BYTES / 1024} KB` };
  }
  return { file, text: await readFile(real, 'utf8') };
}

// ---------------------------------------------------------------------------------------------
// Target: the icons file of the package

const iconsNotDeclared = (spec: PackageSource): ToolError =>
  new ToolError(
    'icons-not-declared',
    `the specialization ${spec.specPath} does not declare an icons file`,
    {
      hint: 'declare `"icons": "icons/icons.json"` in the specialization (formatVersion 15) and run import_icons again: the tool never edits the specialization',
    },
  );

const invalidIconsPath = (ref: string, why: string): ToolError =>
  new ToolError('invalid-library', `the \`icons\` path "${ref}" ${why}`, {
    hint: 'declare a .json file inside the package folder, other than the specialization',
  });

/** The icons file as the specialization cites it: a `.json` inside the package folder, never the specialization. */
function iconsRelativePath(pkg: PackageSource): string {
  const ref = pkg.spec.icons ?? '';
  if (ref === '') throw iconsNotDeclared(pkg);
  const file = pkg.resolve(ref);
  if (
    file === '' ||
    file.includes('\\') ||
    file.startsWith('/') ||
    hasParentSegment(file)
  ) {
    throw invalidIconsPath(ref, 'leaves the package folder');
  }
  if (extname(file).toLowerCase() !== '.json')
    throw invalidIconsPath(ref, 'is not a .json file');
  if (file === pkg.specPath) throw invalidIconsPath(ref, 'is the specialization itself');
  return file;
}

const invalidIconsFile = (file: string, errors: readonly string[]): ToolError =>
  new ToolError('invalid-library', `the icons file ${file} is invalid`, {
    file,
    errors: errors.slice(0, 20),
    hint: 'fix the file (validate_library shows each problem) before importing',
  });

/** The nearest existing ancestor of a file that does not exist yet must not leave the package through a link. */
async function assertNewFileInside(
  roots: Roots,
  realDir: string,
  target: string,
  file: string,
): Promise<void> {
  for (let existing = dirname(target); ; existing = dirname(existing)) {
    try {
      const real = await realpath(existing);
      if (!isWithin(realDir, real)) {
        throw new ToolError(
          'outside-roots',
          `the icons file would be written outside the package folder: ${file}`,
          { path: file },
        );
      }
      return;
    } catch (error) {
      if (error instanceof ToolError) throw error;
      if (dirname(existing) === existing) throw error;
    }
  }
}

/** Finds and reads the icons file; one that does not exist yet comes back without `existing`. */
async function readIconsTarget(
  roots: Roots,
  pkg: PackageSource,
  file: string,
): Promise<IconsTarget> {
  const target = join(pkg.dir, file);
  const realDir = await realpath(pkg.dir);
  const real = await realpath(target).catch(() => null);
  if (real === null) {
    await roots.resolveNew(target);
    await assertNewFileInside(roots, realDir, target, file);
    return { target, file };
  }
  if (!isWithin(realDir, real) || (await roots.locate(real)) === null) {
    throw new ToolError(
      'outside-roots',
      `the icons file points outside the package folder: ${file}`,
      { path: file },
    );
  }
  const info = await stat(real);
  if (!info.isFile() || info.size > MAX_TEXT_FILE_BYTES) {
    throw invalidIconsFile(file, ['not a file, or larger than the limit']);
  }
  const parsed = parseIconsText(await readFile(real, 'utf8'));
  if (!parsed.ok) throw invalidIconsFile(file, parsed.errors);
  return { target: real, file, existing: parsed.set as unknown as Json };
}

// ---------------------------------------------------------------------------------------------
// Convert and merge

interface Converted {
  readonly name: string;
  readonly file: string;
  readonly icon: IconDef;
}

interface Problem {
  readonly file: string;
  readonly message: string;
}

interface Conversion {
  readonly converted: Converted[];
  readonly errors: Problem[];
  /** The file's `viewBox`: the existing one, or the first imported icon's. */
  readonly viewBox: readonly [number, number];
}

type SvgOptions = NonNullable<Parameters<typeof svgToIcon>[1]>;
type ViewBox = readonly [number, number];

/**
 * One file. Without a `viewBox` for the file (it does not exist yet), the first icon that converts
 * gives it, and that icon is converted again so it omits its own.
 */
function convertSource(
  source: SvgSource,
  options: SvgOptions,
  known: ViewBox | undefined,
): { result: ReturnType<typeof svgToIcon>; viewBox: ViewBox | undefined } {
  const withBox = (box: ViewBox | undefined): SvgOptions => ({
    ...options,
    file: source.file,
    ...(box === undefined ? {} : { defaultViewBox: box }),
  });
  const first = svgToIcon(source.text ?? '', withBox(known));
  if (!first.ok || known !== undefined) return { result: first, viewBox: known };
  return {
    result: svgToIcon(source.text ?? '', withBox(first.viewBox)),
    viewBox: first.viewBox,
  };
}

/** Converts every readable file, in input order; two files that give the same name: the second is an error. */
function convertAll(
  sources: readonly SvgSource[],
  options: SvgOptions,
  known: ViewBox | undefined,
): Conversion {
  const converted: Converted[] = [];
  const errors: Problem[] = [];
  const usedBy = new Map<string, string>();
  let viewBox = known;
  for (const source of sources) {
    if (source.problem !== undefined) {
      errors.push({ file: source.file, message: source.problem });
      continue;
    }
    const step = convertSource(source, options, viewBox);
    viewBox = step.viewBox;
    const { result } = step;
    if (!result.ok) {
      const message = result.problems.map((p) => p.text).join('; ');
      errors.push({ file: source.file, message });
      continue;
    }
    const name = result.name ?? '';
    const first = usedBy.get(name);
    if (first !== undefined) {
      const message = `the name "${name}" is already used by ${first}`;
      errors.push({ file: source.file, message });
      continue;
    }
    usedBy.set(name, source.file);
    converted.push({ name, file: source.file, icon: result.icon });
  }
  return { converted, errors, viewBox: viewBox ?? DEFAULT_ICON_VIEWBOX };
}

interface Merge {
  readonly icons: Record<string, IconDef>;
  readonly added: string[];
  readonly replaced: string[];
  readonly skipped: { name: string; file: string; reason: 'icon-exists' }[];
  /** The icons that were written (added or replaced). */
  readonly written: IconDef[];
}

/** New icons go after the existing ones, in input order; an existing name is skipped, or replaced in place. */
function mergeIcons(
  existing: Readonly<Record<string, IconDef>>,
  converted: readonly Converted[],
  replace: boolean,
): Merge {
  const icons: Record<string, IconDef> = { ...existing };
  const merge: Merge = { icons, added: [], replaced: [], skipped: [], written: [] };
  for (const { name, file, icon } of converted) {
    const exists = Object.hasOwn(icons, name);
    if (exists && !replace) {
      merge.skipped.push({ name, file, reason: 'icon-exists' });
      continue;
    }
    icons[name] = icon;
    (exists ? merge.replaced : merge.added).push(name);
    merge.written.push(icon);
  }
  return merge;
}

/**
 * The file's version after the import: 3 only when a written path has `evenodd`, 2 when `mirror`
 * meets a version 1 file; otherwise it stays (a new file starts at 1).
 */
function versionAfter(
  current: number,
  written: readonly IconDef[],
  mirror: boolean,
): number {
  let version = current;
  if (written.some((icon) => icon.paths.some((p) => p.fillRule === 'evenodd'))) {
    version = Math.max(version, ICONS_FORMAT_VERSION);
  }
  if (mirror && written.length > 0) version = Math.max(version, 2);
  return version;
}

/**
 * The file text: 2-space indentation, a final newline and each `viewBox` (two numbers) on one line,
 * as a person writes it, so a formatter such as prettier leaves the written file as it is.
 */
export function iconsFileText(file: Json): string {
  const text = JSON.stringify(file, null, 2).replace(
    /"viewBox": \[\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]/g,
    '"viewBox": [$1, $2]',
  );
  return `${text}\n`;
}

/** The merged file (the existing one with the new `icons`, or a new one) and what the merge did. */
function mergedFile(
  existing: Json | undefined,
  conversion: Conversion,
  args: ImportIconsArgs,
): { next: Json; merge: Merge; formatVersion: number } {
  const merge = mergeIcons(
    (existing?.icons ?? {}) as Record<string, IconDef>,
    conversion.converted,
    args.replace === true,
  );
  const current = existing?.formatVersion;
  const formatVersion = versionAfter(
    typeof current === 'number' ? current : 1,
    merge.written,
    args.mirror === true,
  );
  const base: Json = existing ?? {
    format: ICONS_FORMAT,
    formatVersion,
    viewBox: conversion.viewBox,
  };
  return { next: { ...base, formatVersion, icons: merge.icons }, merge, formatVersion };
}

// ---------------------------------------------------------------------------------------------
// The tool

const libraryInProject = (path: string): ToolError =>
  new ToolError(
    'library-in-project',
    `the package is inside a Mapping project: only the app writes the project's specs/ (${path})`,
    {
      path,
      hint: 'import into the library source folder (outside any project) and apply the library through the app',
    },
  );

export async function importIcons(roots: Roots, args: ImportIconsArgs): Promise<Json> {
  const pkg = await packageByPath(roots, args.path);
  const iconsFile = iconsRelativePath(pkg);
  if ((await enclosingProject(pkg.dir, roots, true)) !== null) {
    throw libraryInProject(args.path);
  }
  const sources = await readSvgSources(roots, args.svg, args.name);
  // The icons file is read after the SVGs and written right after the merge: the window in which
  // another writer could slip in is the shortest the order allows.
  const { target, file, existing } = await readIconsTarget(roots, pkg, iconsFile);
  const conversion = convertAll(
    sources,
    {
      colors: args.colors ?? 'auto',
      ...(args.mirror === true ? { mirror: true } : {}),
      ...(args.name === undefined ? {} : { name: args.name }),
    },
    existing?.viewBox as ViewBox | undefined,
  );
  const { next, merge, formatVersion } = mergedFile(existing, conversion, args);
  // Never writes an invalid file: the merged result goes through the same validation as `validate_library`.
  const checked = parseIconsFile(next);
  if (!checked.ok) throw invalidIconsFile(file, checked.errors);
  const written = merge.written.length > 0 && args.dryRun !== true;
  if (written) {
    await writeFileAtomic(target, iconsFileText(next), { createFolder: true });
  }
  return {
    file,
    formatVersion,
    added: merge.added,
    replaced: merge.replaced,
    skipped: merge.skipped,
    errors: conversion.errors,
    written,
    hint: 'run validate_library on the package to check the written file against the components',
  };
}
