import { randomBytes } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { mkdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path, {
  basename,
  dirname,
  isAbsolute,
  join,
  resolve,
  type PlatformPath,
} from 'node:path';
import { ToolError } from './errors';

// Path safety: the server only reads and writes inside the configured roots. The scratch folders
// (`--scratch`) are read-only and serve only the input files of a batch (`resolveInputFile`).
// It rejects `..`, absolute paths outside them and symbolic links that lead outside.

/** What `isWithin` uses from `node:path` (the test passes `path.win32`). */
export type PathApi = Pick<PlatformPath, 'relative' | 'sep' | 'isAbsolute'>;

/**
 * `child` is `parent` or is inside it (lexical comparison of absolute paths). `api` is the
 * system's; on Windows (`path.win32`) the comparison ignores case and respects the drive.
 */
export function isWithin(parent: string, child: string, api: PathApi = path): boolean {
  const rel = api.relative(parent, child);
  return (
    rel === '' ||
    (rel !== '..' && !rel.startsWith(`..${api.sep}`) && !api.isAbsolute(rel))
  );
}

/** Some segment is `..`. Backslashes count as a separator (Windows). */
export function hasParentSegment(value: string): boolean {
  return value.split(/[\\/]/).some((segment) => segment === '..');
}

function isNotFound(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/** Path as the user typed it, validated only in form (without touching the disk). */
function assertPlainPath(input: string): void {
  if (input === '' || input.includes('\0')) {
    throw new ToolError('invalid-path', 'empty or invalid path');
  }
  if (hasParentSegment(input)) {
    throw new ToolError('outside-roots', `path with ".." refused: ${input}`, {
      path: input,
    });
  }
}

/** A real path (without symbolic links) inside one of the roots. */
export interface InsideRoot {
  /** Real path of what was requested. */
  readonly real: string;
  /** Root as configured (absolute). */
  readonly root: string;
  /** Real path of the root. */
  readonly realRoot: string;
}

/** An existing input file of a batch, found inside a root or inside a scratch folder. */
export interface InputFile {
  /** Real path (without symbolic links). */
  readonly real: string;
  /** Found in a scratch folder (read-only), not in a root. */
  readonly scratch: boolean;
}

/** A group of folders (the roots, or the scratch folders) with their real paths. */
interface Area {
  readonly dirs: readonly string[];
  readonly reals: readonly (string | null)[];
  readonly scratch: boolean;
}

/** Is `value` (absolute) inside one of the area's folders, as configured or by real path? */
function areaHolds(area: Area, value: string): boolean {
  return [...area.dirs, ...area.reals].some(
    (dir) => dir !== null && isWithin(dir, value),
  );
}

/** Is the real path inside one of the area's folders (compared by real path)? */
function areaHoldsReal(area: Area, real: string): boolean {
  return area.reals.some((dir) => dir !== null && isWithin(dir, real));
}

function outsideRootsAndScratch(input: string): ToolError {
  return new ToolError(
    'outside-roots',
    `the path points outside the configured roots and scratch folders: ${input}`,
    { path: input },
  );
}

/** A scratch folder and a root that overlap, as configured. */
export interface ScratchOverlap {
  readonly root: string;
  readonly scratch: string;
}

/** Real path of an existing folder; `null` for one that does not exist (compared by its path only). */
function realFolder(folder: string): string | null {
  try {
    return realpathSync(folder);
  } catch {
    return null;
  }
}

/** The two folders are the same or one is inside the other. */
function nested(a: string, b: string): boolean {
  return isWithin(a, b) || isWithin(b, a);
}

/**
 * The first pair of a root and a scratch folder (both absolute) that overlap: one inside the
 * other or the same folder, by the path as configured or by the real path (symbolic links
 * resolved). A folder that does not exist yet is compared by its path. `null` when there is none.
 */
export function scratchOverlap(
  roots: readonly string[],
  scratch: readonly string[],
): ScratchOverlap | null {
  for (const root of roots) {
    const realRoot = realFolder(root);
    for (const folder of scratch) {
      const realScratch = realFolder(folder);
      const forms: [string, string][] = [[root, folder]];
      if (realRoot !== null) forms.push([realRoot, folder]);
      if (realScratch !== null) forms.push([root, realScratch]);
      if (realRoot !== null && realScratch !== null) forms.push([realRoot, realScratch]);
      if (forms.some(([a, b]) => nested(a, b))) return { root, scratch: folder };
    }
  }
  return null;
}

export class Roots {
  /**
   * `roots` already resolved (absolute). `workDir` is the client's working directory (the
   * server process's): relative root paths are taken from it, and it is the limit
   * of the code-file check (`codeFiles.ts`). `scratch` (absolute too) are the read-only
   * folders for the batch's input files: only `resolveInputFile` looks at them.
   */
  constructor(
    readonly roots: readonly string[],
    readonly workDir: string = process.cwd(),
    readonly scratch: readonly string[] = [],
  ) {}

  /** Within a tool call (`beginCall`), what has already been resolved is kept here. */
  private scoped = false;
  private readonly memo = new Map<string, Promise<unknown>>();

  /**
   * Starts a tool call: what the roots resolved in the previous call (real paths,
   * project discovery) is discarded and, until the next call, each thing is resolved
   * only once. Without `beginCall` nothing is cached.
   */
  beginCall(): void {
    this.scoped = true;
    this.memo.clear();
  }

  /** Resolves `compute` once per tool call (every time, without `beginCall`). */
  perCall<T>(key: string, compute: () => Promise<T>): Promise<T> {
    if (!this.scoped) return compute();
    let hit = this.memo.get(key) as Promise<T> | undefined;
    if (hit === undefined) {
      hit = compute();
      this.memo.set(key, hit);
    }
    return hit;
  }

  /** Real path of each root; `null` for one that does not exist (it may be created after startup). */
  realRoots(): Promise<readonly (string | null)[]> {
    return this.perCall('realRoots', () =>
      Promise.all(this.roots.map((root) => realpath(root).catch(() => null))),
    );
  }

  /** Real path of each scratch folder; `null` for one that does not exist (the agent creates it on demand). */
  realScratch(): Promise<readonly (string | null)[]> {
    return this.perCall('realScratch', () =>
      Promise.all(this.scratch.map((folder) => realpath(folder).catch(() => null))),
    );
  }

  /** Is the real path inside some root? Returns which one. */
  async locate(real: string): Promise<InsideRoot | null> {
    const reals = await this.realRoots();
    for (const [index, realRoot] of reals.entries()) {
      if (realRoot !== null && isWithin(realRoot, real)) {
        return { real, root: this.roots[index]!, realRoot };
      }
    }
    return null;
  }

  /** Fails with `outside-roots` if the real path is not inside a root. */
  async assertInside(real: string, shown: string = real): Promise<InsideRoot> {
    const found = await this.locate(real);
    if (!found) {
      throw new ToolError(
        'outside-roots',
        `the path points outside the configured roots: ${shown}`,
        { path: shown },
      );
    }
    return found;
  }

  /**
   * Resolves an existing path given by the agent: relative to a root or absolute
   * inside one. Refuses `..`, absolute paths outside the roots and symbolic links that leave them.
   */
  async resolveExisting(input: string): Promise<InsideRoot> {
    return (await this.resolveExistingAll(input))[0]!;
  }

  /**
   * Like `resolveExisting`, but returns the path under each root where it exists (in root
   * order): with several roots, whoever looks for something specific (a project) tries them all.
   */
  async resolveExistingAll(input: string): Promise<InsideRoot[]> {
    assertPlainPath(input);
    const candidates = await this.candidates(input);
    const found: InsideRoot[] = [];
    let leftRoots = false;
    for (const candidate of candidates) {
      let real: string;
      try {
        real = await realpath(candidate);
      } catch (error) {
        if (isNotFound(error)) continue;
        throw error;
      }
      const inside = await this.locate(real);
      if (inside) found.push(inside);
      else leftRoots = true;
    }
    if (found.length > 0) return found;
    if (leftRoots) {
      throw new ToolError(
        'outside-roots',
        `the path points outside the configured roots: ${input}`,
        { path: input },
      );
    }
    throw new ToolError('path-not-found', `path not found: ${input}`, {
      path: input,
    });
  }

  /**
   * Resolves an existing INPUT file of a batch (`operationsFile`, an image to add): a relative
   * path is tried in the roots first and then in the scratch folders; an absolute path must be
   * inside a root or a scratch folder. Refuses `..`, absolute paths outside both and symbolic
   * links that leave them (`outside-roots`). Read-only: nothing is written with the result.
   */
  async resolveInputFile(input: string): Promise<InputFile> {
    assertPlainPath(input);
    const areas: Area[] = [
      { dirs: this.roots, reals: await this.realRoots(), scratch: false },
      { dirs: this.scratch, reals: await this.realScratch(), scratch: true },
    ];
    return isAbsolute(input)
      ? this.absoluteInput(input, areas)
      : this.relativeInput(input, areas);
  }

  private async absoluteInput(input: string, areas: readonly Area[]): Promise<InputFile> {
    const holding = areas.filter((candidate) => areaHolds(candidate, input));
    if (holding.length === 0) throw outsideRootsAndScratch(input);
    const real = await realpath(input).catch((error: unknown) => {
      if (isNotFound(error)) {
        throw new ToolError('path-not-found', `path not found: ${input}`, {
          path: input,
        });
      }
      throw error;
    });
    // A link in one area may lead into the other: the real path decides which holds it.
    const area = areas.find((candidate) => areaHoldsReal(candidate, real));
    if (area === undefined) throw outsideRootsAndScratch(input);
    return { real, scratch: area.scratch };
  }

  private async relativeInput(input: string, areas: readonly Area[]): Promise<InputFile> {
    let left = false;
    for (const area of areas) {
      for (const dir of area.dirs) {
        let real: string;
        try {
          real = await realpath(join(dir, input));
        } catch (error) {
          if (isNotFound(error)) continue;
          throw error;
        }
        // A link may lead into the other area: the real path decides, across all areas
        // (as `absoluteInput` does).
        const holder = areas.find((candidate) => areaHoldsReal(candidate, real));
        if (holder !== undefined) return { real, scratch: holder.scratch };
        left = true;
      }
    }
    if (left) throw outsideRootsAndScratch(input);
    throw new ToolError('path-not-found', `path not found: ${input}`, { path: input });
  }

  /**
   * Resolves a path that may not exist yet (creation): the lexical path must be
   * inside a root and the nearest existing ancestor must not leave it through a symbolic link.
   * Returns the absolute path to create.
   */
  async resolveNew(input: string, rootHint?: string): Promise<string> {
    assertPlainPath(input);
    const target = await this.newTarget(input, rootHint);
    let existing = target;
    for (;;) {
      try {
        const real = await realpath(existing);
        await this.assertInside(real, input);
        return target;
      } catch (error) {
        if (!isNotFound(error)) throw error;
        const parent = dirname(existing);
        if (parent === existing) {
          throw new ToolError('outside-roots', `path outside the roots: ${input}`, {
            path: input,
          });
        }
        existing = parent;
      }
    }
  }

  private async candidates(input: string): Promise<string[]> {
    if (isAbsolute(input)) {
      const reals = (await this.realRoots()).filter((r): r is string => r !== null);
      const inside = [...this.roots, ...reals].some((root) => isWithin(root, input));
      if (!inside) {
        throw new ToolError(
          'outside-roots',
          `absolute path outside the configured roots: ${input}`,
          { path: input },
        );
      }
      return [input];
    }
    return this.roots.map((root) => join(root, input));
  }

  private async newTarget(input: string, rootHint?: string): Promise<string> {
    if (isAbsolute(input)) {
      // Outside all roots: `outside-roots` before looking at `root` (security speaks first).
      const [candidate] = await this.candidates(input);
      if (rootHint !== undefined) {
        const index = await this.resolveRoot(rootHint);
        if (!(await this.isUnderRoot(index, candidate!))) {
          throw new ToolError(
            'invalid-arguments',
            `the absolute path is not under the root given in \`root\`: ${input}`,
            { path: input, root: this.roots[index] },
          );
        }
      }
      return candidate!;
    }
    if (rootHint !== undefined) {
      return join(this.roots[await this.resolveRoot(rootHint)]!, input);
    }
    if (this.roots.length === 1) return join(this.roots[0]!, input);
    throw new ToolError(
      'root-required',
      'there is more than one root: give `root` or an absolute path inside one of them',
      { roots: this.roots },
    );
  }

  /**
   * Is the absolute `path` (it may not exist yet) inside root `index`? Compares with the root
   * as configured and with its real path, and also the real path of the nearest existing
   * ancestor (a symbolic link in the middle of the path).
   */
  private async isUnderRoot(index: number, target: string): Promise<boolean> {
    const root = this.roots[index]!;
    const realRoot = (await this.realRoots())[index] ?? null;
    if (isWithin(root, target) || (realRoot !== null && isWithin(realRoot, target))) {
      return true;
    }
    if (realRoot === null) return false;
    for (let existing = target; ; existing = dirname(existing)) {
      try {
        return isWithin(realRoot, await realpath(existing));
      } catch (error) {
        if (!isNotFound(error) || dirname(existing) === existing) return false;
      }
    }
  }

  /**
   * Index of the root the agent's `root` indicates, in order: the path as in `--root`
   * (resolved from the working directory, as `main.ts` does: relative, with `./`,
   * with a trailing slash or absolute), the same real path (symbolic link to the root), or the
   * folder name, if only one root has it. A repeated name asks for the path.
   */
  private async resolveRoot(hint: string): Promise<number> {
    const unknown = (message: string) =>
      new ToolError('unknown-root', message, { roots: this.roots });
    if (hint.trim() === '' || hint.includes('\0')) {
      throw unknown('empty or invalid root');
    }
    const asPath = resolve(this.workDir, hint);
    const reals = await this.realRoots();
    const realHint = await realpath(asPath).catch(() => null);
    const byPath = this.roots.findIndex(
      (root, index) =>
        root === asPath || (realHint !== null && reals[index] === realHint),
    );
    if (byPath >= 0) return byPath;
    const byName = this.roots.flatMap((root, index) =>
      basename(root) === hint ? [index] : [],
    );
    if (byName.length === 1) return byName[0]!;
    if (byName.length > 1) {
      throw unknown(`the name "${hint}" matches more than one root: use the path`);
    }
    throw unknown(`unknown root: ${hint}`);
  }
}

/**
 * Path of a file cited inside the project (`images/photo.png`, `specs/sdui.json`):
 * relative, without `..`, without a backslash and, once symbolic links are resolved,
 * inside the roots. `null` if the path is invalid or the file does not exist.
 */
export async function resolveProjectFile(
  roots: Roots,
  projectDir: string,
  file: string,
): Promise<string | null> {
  if (file === '' || file.includes('\0') || file.includes('\\') || isAbsolute(file)) {
    return null;
  }
  if (hasParentSegment(file)) return null;
  try {
    const real = await realpath(join(projectDir, file));
    return (await roots.locate(real)) ? real : null;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/**
 * Writes atomically: a temporary file in the same folder, then renamed over the target.
 * `createFolder` first creates the target's folder (a new file in a folder that does not exist yet).
 */
export async function writeFileAtomic(
  path: string,
  data: string,
  options: { readonly createFolder?: boolean } = {},
): Promise<void> {
  if (options.createFolder === true) await mkdir(dirname(path), { recursive: true });
  const temp = join(
    dirname(path),
    `.${basename(path)}.${randomBytes(6).toString('hex')}.tmp`,
  );
  try {
    await writeFile(temp, data, { encoding: 'utf8', flag: 'wx' });
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}
