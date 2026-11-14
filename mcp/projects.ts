import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, isAbsolute, join, relative, sep } from 'node:path';
import {
  EMPTY_CATALOG,
  MAPPING_FILE,
  componentPaths,
  deserializeParsed,
  loadSpecComponents,
  referencedSpecFilesOf,
  type ComponentCatalog,
  type DeserializeError,
  type DeserializeResult,
  type Project,
  type Spec,
  type SpecFont,
  type SpecComponents,
  type SpecFileWarning,
} from '../src/model';
import { resolvePath, type LoadedFont } from '../src/model/components/library';
import { ToolError } from './errors';
import { createFontBook, type FontBook } from './image/textMeasurer';
import { Roots, resolveProjectFile } from './paths';

/** How many folder levels discovery walks below each root. */
const MAX_DEPTH = 16;
/** A `mapping.json` larger than this is refused, so memory is not exhausted. */
const MAX_PROJECT_BYTES = 64 * 1024 * 1024;
const SKIPPED_DIRS: ReadonlySet<string> = new Set(['node_modules']);

/** Where a project in a folder is. */
export interface ProjectLocation {
  /** Name of the project folder: it is the `<project>` of `mapping://` references. */
  readonly name: string;
  /** Real, absolute path of the folder. */
  readonly dir: string;
  /** Root (as configured) in which the folder was found. */
  readonly root: string;
  /** Path of the folder relative to the root, with `/` (`.` if the root itself is the project). */
  readonly path: string;
}

export interface LoadedProject {
  readonly location: ProjectLocation;
  readonly project: Project;
  /** File of a version newer than the server understands: read-only. */
  readonly readOnly: boolean;
  readonly migratedFrom: number | null;
  readonly specWarnings: readonly SpecFileWarning[];
  /**
   * Components of the specializations in a folder (`specs/<id>/`, formatVersion 4), read once
   * on load. The server only uses them to measure and check (`minSize`, `get_marking_image`):
   * it never fixes or writes a drawing.
   */
  readonly catalog: ComponentCatalog;
  /**
   * Fonts that measure and draw the text of the drawing image: the built-in one and the `fonts` of the
   * libraries (files in `specs/<id>/`). Absent = only the built-in one.
   */
  readonly fonts?: FontBook;
}

async function isProjectDir(dir: string): Promise<boolean> {
  try {
    return (await stat(join(dir, MAPPING_FILE))).isFile();
  } catch {
    return false;
  }
}

function locationOf(dir: string, realRoot: string, root: string): ProjectLocation {
  const rel = relative(realRoot, dir).split(sep).join('/');
  return { name: basename(dir), dir, root, path: rel === '' ? '.' : rel };
}

async function walk(
  dir: string,
  realRoot: string,
  root: string,
  depth: number,
  found: Map<string, ProjectLocation>,
): Promise<void> {
  if (await isProjectDir(dir)) {
    if (!found.has(dir)) found.set(dir, locationOf(dir, realRoot, root));
    return;
  }
  if (depth >= MAX_DEPTH) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    // Folder without read permission: not a reachable project, the search goes on in the others.
    return;
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    // `isDirectory()` is false for symbolic links: the search never follows them.
    if (
      !entry.isDirectory() ||
      entry.name.startsWith('.') ||
      SKIPPED_DIRS.has(entry.name)
    ) {
      continue;
    }
    await walk(join(dir, entry.name), realRoot, root, depth + 1, found);
  }
}

/** Folders with `mapping.json` below the roots (any depth, up to `MAX_DEPTH`), in path order. */
export async function discoverProjects(roots: Roots): Promise<ProjectLocation[]> {
  return [...(await roots.perCall('discoverProjects', () => discover(roots)))];
}

async function discover(roots: Roots): Promise<ProjectLocation[]> {
  const found = new Map<string, ProjectLocation>();
  const reals = await roots.realRoots();
  for (const [index, realRoot] of reals.entries()) {
    if (realRoot === null) continue;
    await walk(realRoot, realRoot, roots.roots[index]!, 0, found);
  }
  return [...found.values()].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
}

function looksLikePath(query: string): boolean {
  return query === '.' || isAbsolute(query) || /[\\/]/.test(query);
}

/**
 * Finds the project from what the agent gave: the folder name (at any depth of the
 * roots), the path relative to a root (`apps/signup`) or the absolute path inside them.
 * A name repeated in two folders returns the candidates and asks for the path.
 */
export async function findProject(roots: Roots, query: string): Promise<ProjectLocation> {
  const wanted = query.trim();
  if (wanted === '') throw new ToolError('invalid-project', 'give the project');
  if (looksLikePath(wanted)) {
    // With several roots, the first one in which the path really is a project applies.
    for (const inside of await roots.resolveExistingAll(wanted)) {
      if (await isProjectDir(inside.real)) {
        return locationOf(inside.real, inside.realRoot, inside.root);
      }
    }
    throw new ToolError(
      'project-not-found',
      `the folder is not a Mapping project (no ${MAPPING_FILE}): ${wanted}`,
      { project: wanted },
    );
  }

  const all = await discoverProjects(roots);
  let matches = all.filter((l) => l.name === wanted);
  if (matches.length === 0) {
    matches = all.filter((l) => l.name.toLowerCase() === wanted.toLowerCase());
  }
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) {
    throw new ToolError(
      'ambiguous-project',
      `there is more than one project named "${wanted}": give the path`,
      { project: wanted, candidates: matches.map((l) => ({ path: l.path, dir: l.dir })) },
    );
  }
  throw new ToolError('project-not-found', `project not found: ${wanted}`, {
    project: wanted,
    available: all.slice(0, 20).map((l) => l.name),
    hint: 'use list_projects to see the projects in the roots',
  });
}

function describeError(error: DeserializeError): string {
  switch (error.code) {
    case 'invalid-json':
      return 'the mapping.json is not valid JSON';
    case 'invalid-schema':
      return `the mapping.json does not follow the format: ${error.details.slice(0, 400)}`;
    case 'unsupported-version':
      return `unsupported schema version: ${String(error.version)}`;
    case 'missing-migration':
      return `there is no migration from version ${error.from}`;
    case 'invariant-violation': {
      // The same list the app shows (the full one goes in `reason.issues`).
      const shown = error.issues.slice(0, 20).map((i) => {
        const name = i.name === undefined ? '' : ` "${i.name}"`;
        return `${i.code} (${i.entity} ${i.id}${name})`;
      });
      const more = error.issues.length > shown.length ? '; …' : '';
      return `the mapping.json violates ${error.issues.length} model rule(s): ${shown.join('; ')}${more}`;
    }
  }
}

export async function readText(
  roots: Roots,
  dir: string,
  file: string,
): Promise<string | null> {
  const real = await resolveProjectFile(roots, dir, file);
  if (real === null) return null;
  if ((await stat(real)).size > MAX_PROJECT_BYTES) {
    throw new ToolError('file-too-large', `file too large: ${file}`);
  }
  return readFile(real, 'utf8');
}

/**
 * Process cache (decision 7 of the stage): the result of interpreting `specs/` files holds
 * while the path, size and `mtime` of each one do not change; a file replaced on disk
 * changes the key. Keeps at most `MAX_CACHED` results (the oldest leaves first).
 */
const MAX_CACHED = 32;

class StampCache<T> {
  private readonly entries = new Map<string, T>();

  get(key: string): T | undefined {
    return this.entries.get(key);
  }

  set(key: string, value: T): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    if (this.entries.size > MAX_CACHED) {
      this.entries.delete(this.entries.keys().next().value!);
    }
  }
}

const catalogCache = new StampCache<SpecComponents>();
const fontCache = new StampCache<FontBook>();

/** Real path, size and `mtime` of a project file; `null` if it does not exist or cannot be read. */
async function fileStamp(
  roots: Roots,
  dir: string,
  file: string,
): Promise<{ real: string; size: number; stamp: string } | null> {
  try {
    const real = await resolveProjectFile(roots, dir, file);
    if (real === null) return null;
    const { size, mtimeMs } = await stat(real);
    return { real, size, stamp: `${real}:${size}:${mtimeMs}` };
  } catch {
    // Unreadable: without a key, the cache does not apply and the read falls into the usual handling.
    return null;
  }
}

const digest = (value: unknown): string =>
  createHash('sha1').update(JSON.stringify(value)).digest('hex');

/** The components of a specialization in a folder: from the cache, or read and interpreted. */
async function loadSpecCatalog(
  roots: Roots,
  dir: string,
  applied: Project['specializations'][number],
  spec: Spec,
): Promise<SpecComponents> {
  const paths = componentPaths(spec, applied.file);
  const stamps = await Promise.all(paths.map((path) => fileStamp(roots, dir, path)));
  const key = [
    digest(spec),
    applied.file,
    applied.version,
    ...stamps.map((s) => s?.stamp ?? '-'),
  ].join('|');
  const cached = catalogCache.get(key);
  if (cached !== undefined) return cached;
  const texts = new Map<string, string>();
  for (const path of paths) {
    try {
      const text = await readText(roots, dir, path);
      if (text !== null) texts.set(path, text);
    } catch {
      // Unreadable or too-large file: the type is left without a component (a catalog problem).
    }
  }
  const loaded = loadSpecComponents(spec, applied.file, applied.version, (path) =>
    texts.get(path),
  );
  catalogCache.set(key, loaded);
  return loaded;
}

/** Reads the component files of each specialization in a folder and builds the catalog. */
async function loadCatalog(
  roots: Roots,
  dir: string,
  project: Project,
): Promise<ComponentCatalog> {
  const catalog = new Map<string, SpecComponents>();
  for (const applied of project.specializations) {
    const { spec } = applied;
    if (!spec || spec.formatVersion < 4) continue;
    catalog.set(applied.id, await loadSpecCatalog(roots, dir, applied, spec));
  }
  return catalog.size === 0 ? EMPTY_CATALOG : catalog;
}

/** Largest font file read (the rest falls back to the built-in font). */
const MAX_FONT_BYTES = 8 * 1024 * 1024;

interface FontFile {
  readonly entry: SpecFont;
  readonly path: string;
  readonly real: string;
  readonly stamp: string;
}

/** The declared fonts (`fonts`) of the applied specializations that exist in the project's copy. */
async function fontFiles(
  roots: Roots,
  dir: string,
  project: Project,
): Promise<FontFile[]> {
  const files: FontFile[] = [];
  for (const applied of project.specializations) {
    for (const entry of applied.spec?.fonts ?? []) {
      const path = resolvePath(applied.file, entry.file);
      const found = await fileStamp(roots, dir, path);
      if (found === null || found.size > MAX_FONT_BYTES) continue;
      files.push({ entry, path, real: found.real, stamp: found.stamp });
    }
  }
  return files;
}

/** The `fonts` of the applied specializations, with the bytes read from the project's copy. */
async function loadFontBook(
  roots: Roots,
  dir: string,
  project: Project,
): Promise<FontBook> {
  const files = await fontFiles(roots, dir, project);
  if (files.length === 0) return createFontBook([]);
  const key = files
    .map((f) => `${f.stamp}|${f.entry.family}|${f.entry.weight ?? 400}|${f.entry.style}`)
    .join('\n');
  const cached = fontCache.get(key);
  if (cached !== undefined) return cached;
  const loaded: LoadedFont[] = [];
  for (const { entry, path, real } of files) {
    try {
      const bytes = await readFile(real);
      loaded.push({
        family: entry.family,
        weight: String(entry.weight ?? 400),
        style: entry.style === 'italic' ? 'italic' : 'normal',
        path,
        bytes: new Uint8Array(bytes).buffer as ArrayBuffer,
      });
    } catch {
      // Unreadable font: the built-in one applies.
    }
  }
  const book = createFontBook(loaded);
  fontCache.set(key, book);
  return book;
}

export interface LoadOptions {
  /** Interprets the fonts of the libraries (default). `false` in tools that only count (`list_projects`). */
  readonly fonts?: boolean;
}

/**
 * Interprets the `mapping.json` once: the JSON serves to find the `specs/` copies to read and the
 * model (`deserializeParsed`).
 */
async function parseMapping(
  roots: Roots,
  dir: string,
  text: string,
): Promise<DeserializeResult> {
  const specs = new Map<string, string>();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: { code: 'invalid-json' } };
  }
  for (const file of referencedSpecFilesOf(raw)) {
    const specText = await readText(roots, dir, file);
    if (specText !== null) specs.set(file, specText);
  }
  return deserializeParsed(raw, undefined, specs);
}

/** Reads the project from the folder: `mapping.json` and the `specs/` copies, validated by `src/model/`. */
export async function loadProject(
  roots: Roots,
  location: ProjectLocation,
  /** The text of `mapping.json` already read by the caller (does not read again). */
  given?: string,
  options: LoadOptions = {},
): Promise<LoadedProject> {
  const text = given ?? (await readText(roots, location.dir, MAPPING_FILE));
  if (text === null) {
    throw new ToolError(
      'invalid-project',
      `could not read ${MAPPING_FILE} of ${location.name}`,
      { project: location.name },
    );
  }
  const result = await parseMapping(roots, location.dir, text);
  if (!result.ok) {
    throw new ToolError('invalid-project', describeError(result.error), {
      project: location.name,
      reason: result.error,
    });
  }
  const catalog = await loadCatalog(roots, location.dir, result.project);
  return {
    location,
    project: result.project,
    readOnly: result.readOnly,
    migratedFrom: result.migratedFrom,
    specWarnings: result.specWarnings,
    catalog,
    ...(options.fonts === false
      ? {}
      : { fonts: await loadFontBook(roots, location.dir, result.project) }),
  };
}
