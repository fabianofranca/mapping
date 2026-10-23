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

const DEFAULT_FIRST_LAYER = 'Camada 1';

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Alguma pasta acima de `dir`, até a raiz, já é um projeto? Projetos não se aninham. */
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

/** Como a app (`ensureGitignore`): o texto vem de `gitignoreWithBackups`; aqui só o disco. */
async function ensureGitignore(dir: string): Promise<void> {
  const file = join(dir, GITIGNORE_FILE);
  const next = gitignoreWithBackups(
    (await exists(file)) ? await readFile(file, 'utf8') : '',
  );
  if (next !== null) await writeFileAtomic(file, next);
}

export interface CreateProjectArgs {
  readonly path: string;
  readonly name: string;
  readonly root?: string;
  readonly firstLayerName?: string;
  /**
   * Aplica a biblioteca de notas embutida (camada Notas, `specs/notas/`). Padrão `true`; `false`
   * cria o projeto sem ela.
   */
  readonly notes?: boolean;
}

export interface CreatedProject {
  readonly name: string;
  readonly path: string;
  readonly dir: string;
}

/** Cria a pasta do projeto (`mapping.json` e `.gitignore`) dentro de uma raiz. */
export async function createProjectFolder(
  roots: Roots,
  args: CreateProjectArgs,
): Promise<CreatedProject> {
  const name = args.name.trim();
  if (name === '')
    throw new ToolError('invalid-name', 'o nome do projeto não pode ser vazio');
  const dir = await roots.resolveNew(args.path, args.root);

  if (await exists(join(dir, MAPPING_FILE))) {
    throw new ToolError('already-exists', `já existe um projeto em ${args.path}`, {
      path: args.path,
    });
  }
  const enclosing = await enclosingProject(dir, roots);
  if (enclosing !== null) {
    throw new ToolError(
      'nested-project',
      `a pasta fica dentro do projeto "${basename(enclosing)}"; projetos não se aninham`,
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
  // Como a app: a biblioteca de notas entra por padrão, pelo caminho de qualquer biblioteca.
  let packageFiles = new Map<string, string>();
  if (args.notes !== false) {
    project = applyBundledLibrary(project, NOTES_LIBRARY, { newId: randomUUID }).project;
    packageFiles = bundledLibraryDiskFiles(project, NOTES_LIBRARY);
  }
  // Sem `images/`: como a app, a pasta só nasce com a primeira imagem (ao aplicar uma proposta).
  await mkdir(dir, { recursive: true });
  // Confere de novo com a pasta já criada: um link simbólico no caminho só aparece agora.
  const inside = await roots.assertInside(await realpath(dir), args.path);
  await ensureGitignore(dir);
  // O pacote antes do `mapping.json` que o cita.
  for (const [path, text] of packageFiles) {
    const target = join(dir, ...path.split('/'));
    await mkdir(dirname(target), { recursive: true });
    await writeFileAtomic(target, text);
  }
  await writeFileAtomic(join(dir, MAPPING_FILE), serialize(project));
  return {
    name: basename(dir),
    path: relative(inside.realRoot, inside.real).split('\\').join('/') || '.',
    dir: inside.real,
  };
}
