import { randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, stat } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { NOTES_LIBRARY } from '../libraries/notas';
import {
  DEFAULT_LAYER_COLOR,
  GITIGNORE_FILE,
  MAPPING_FILE,
  applyBundledLibrary,
  bundledLibraryDiskFiles,
  createProject,
  gitignoreWithBackups,
  serialize,
} from '../src/model';
import { ToolError } from './errors';
import { Roots, writeFileAtomic } from './paths';
import { errnoCode, writeNewFile } from './proposalStore';

const DEFAULT_FIRST_LAYER = 'Camada 1';

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Is some folder above `dir`, up to the root, already a project? Projects do not nest. */
async function enclosingProject(dir: string, roots: Roots): Promise<string | null> {
  const boundaries = new Set([
    ...roots.roots,
    ...(await roots.realRoots()).filter((r): r is string => r !== null),
  ]);
  for (let current = dirname(dir); ; current = dirname(current)) {
    if (await exists(join(current, MAPPING_FILE))) return current;
    if (boundaries.has(current) || dirname(current) === current) return null;
  }
}

/** Like the app (`ensureGitignore`): the text comes from `gitignoreWithBackups`; here only the disk. */
async function ensureGitignore(dir: string): Promise<void> {
  const file = join(dir, GITIGNORE_FILE);
  const next = gitignoreWithBackups(
    (await exists(file)) ? await readFile(file, 'utf8') : '',
  );
  if (next !== null) await writeFileAtomic(file, next);
}

/**
 * Writes `mapping.json` without overwriting: one that appeared since the `already-exists` check
 * (another process, the app) stays as it is and the tool returns the same error as for a folder with a project.
 */
async function writeMappingFile(dir: string, text: string, shown: string): Promise<void> {
  try {
    await writeNewFile(join(dir, MAPPING_FILE), text);
  } catch (error) {
    if (errnoCode(error) !== 'EEXIST') throw error;
    throw new ToolError('already-exists', `a project already exists at ${shown}`, {
      path: shown,
    });
  }
}

export interface CreateProjectArgs {
  readonly path: string;
  readonly name: string;
  readonly root?: string;
  readonly firstLayerName?: string;
  /**
   * Applies the bundled notes library (the `Notas` layer, `specs/notas/`). Default `true`; `false`
   * creates the project without it.
   */
  readonly notes?: boolean;
}

export interface CreatedProject {
  readonly name: string;
  readonly path: string;
  readonly dir: string;
}

/** Creates the project folder (`mapping.json` and `.gitignore`) inside a root. */
export async function createProjectFolder(
  roots: Roots,
  args: CreateProjectArgs,
): Promise<CreatedProject> {
  const name = args.name.trim();
  if (name === '')
    throw new ToolError('invalid-name', 'the project name cannot be empty');
  const dir = await roots.resolveNew(args.path, args.root);

  if (await exists(join(dir, MAPPING_FILE))) {
    throw new ToolError('already-exists', `a project already exists at ${args.path}`, {
      path: args.path,
    });
  }
  const enclosing = await enclosingProject(dir, roots);
  if (enclosing !== null) {
    throw new ToolError(
      'nested-project',
      `the folder is inside the project "${basename(enclosing)}"; projects do not nest`,
      { project: enclosing },
    );
  }

  let project = createProject({
    name,
    now: new Date().toISOString(),
    firstLayer: {
      id: randomUUID(),
      name: args.firstLayerName?.trim() || DEFAULT_FIRST_LAYER,
      color: DEFAULT_LAYER_COLOR,
    },
  });
  // Like the app: the notes library goes in by default, through the path of any library.
  let packageFiles = new Map<string, string>();
  if (args.notes !== false) {
    project = applyBundledLibrary(project, NOTES_LIBRARY, { newId: randomUUID }).project;
    packageFiles = bundledLibraryDiskFiles(project, NOTES_LIBRARY);
  }
  // No `images/`: like the app, the folder is only created with the first image (when applying a proposal).
  await mkdir(dir, { recursive: true });
  // Checks again with the folder already created: a symbolic link in the path only shows up now.
  const inside = await roots.assertInside(await realpath(dir), args.path);
  await ensureGitignore(dir);
  // The package before the `mapping.json` that cites it.
  for (const [path, text] of packageFiles) {
    const target = join(dir, ...path.split('/'));
    await mkdir(dirname(target), { recursive: true });
    await writeFileAtomic(target, text);
  }
  await writeMappingFile(dir, serialize(project), args.path);
  return {
    name: basename(dir),
    path: relative(inside.realRoot, inside.real).split('\\').join('/') || '.',
    dir: inside.real,
  };
}
