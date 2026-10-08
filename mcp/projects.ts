import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, isAbsolute, join, relative, sep } from 'node:path';
import {
  deserialize,
  referencedSpecFiles,
  type DeserializeError,
  type Project,
  type SpecFileWarning,
} from '../src/model';
import { ToolError } from './errors';
import { Roots, resolveProjectFile } from './paths';

/** Arquivo do projeto na raiz da pasta (igual ao `MAPPING_FILE` da app). */
export const MAPPING_FILE = 'mapping.json';
/** Quantos níveis de pastas a descoberta percorre abaixo de cada raiz. */
const MAX_DEPTH = 16;
/** `mapping.json` maior que isto é recusado, para não esgotar a memória. */
const MAX_PROJECT_BYTES = 64 * 1024 * 1024;
const SKIPPED_DIRS: ReadonlySet<string> = new Set(['node_modules']);

/** Onde um projeto em pasta está. */
export interface ProjectLocation {
  /** Nome da pasta do projeto: é o `<projeto>` das referências `mapping://`. */
  readonly name: string;
  /** Caminho real e absoluto da pasta. */
  readonly dir: string;
  /** Raiz (como configurada) em que a pasta foi encontrada. */
  readonly root: string;
  /** Caminho da pasta relativo à raiz, com `/` (`.` se a própria raiz é o projeto). */
  readonly path: string;
}

export interface LoadedProject {
  readonly location: ProjectLocation;
  readonly project: Project;
  /** Arquivo de uma versão mais nova do que o servidor entende: só leitura. */
  readonly readOnly: boolean;
  readonly migratedFrom: number | null;
  readonly specWarnings: readonly SpecFileWarning[];
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
    // Pasta sem permissão de leitura: não é um projeto alcançável, a busca segue nas outras.
    return;
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    // `isDirectory()` é falso para links simbólicos: a busca nunca os segue.
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

/** Pastas com `mapping.json` abaixo das raízes (qualquer profundidade, até `MAX_DEPTH`), em ordem de caminho. */
export async function discoverProjects(roots: Roots): Promise<ProjectLocation[]> {
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
 * Acha o projeto pelo que o agente informou: o nome da pasta (em qualquer profundidade das
 * raízes), o caminho relativo a uma raiz (`apps/cadastro`) ou o caminho absoluto dentro delas.
 * Nome repetido em duas pastas devolve as candidatas e pede o caminho.
 */
export async function findProject(roots: Roots, query: string): Promise<ProjectLocation> {
  const wanted = query.trim();
  if (wanted === '') throw new ToolError('invalid-project', 'informe o projeto');
  if (looksLikePath(wanted)) {
    const inside = await roots.resolveExisting(wanted);
    if (!(await isProjectDir(inside.real))) {
      throw new ToolError(
        'project-not-found',
        `a pasta não é um projeto Mapping (sem ${MAPPING_FILE}): ${wanted}`,
        { project: wanted },
      );
    }
    return locationOf(inside.real, inside.realRoot, inside.root);
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
      `há mais de um projeto chamado "${wanted}": informe o caminho`,
      { project: wanted, candidates: matches.map((l) => ({ path: l.path, dir: l.dir })) },
    );
  }
  throw new ToolError('project-not-found', `projeto não encontrado: ${wanted}`, {
    project: wanted,
    available: all.slice(0, 20).map((l) => l.name),
    hint: 'use list_projects para ver os projetos das raízes',
  });
}

function describeError(error: DeserializeError): string {
  switch (error.code) {
    case 'invalid-json':
      return 'o mapping.json não é um JSON válido';
    case 'invalid-schema':
      return `o mapping.json não segue o formato: ${error.details.slice(0, 400)}`;
    case 'unsupported-version':
      return `versão de schema não suportada: ${String(error.version)}`;
    case 'missing-migration':
      return `não há migração a partir da versão ${error.from}`;
    case 'invariant-violation':
      return `o mapping.json viola ${error.issues.length} regra(s) do modelo`;
  }
}

async function readText(roots: Roots, dir: string, file: string): Promise<string | null> {
  const real = await resolveProjectFile(roots, dir, file);
  if (real === null) return null;
  if ((await stat(real)).size > MAX_PROJECT_BYTES) {
    throw new ToolError('file-too-large', `arquivo grande demais: ${file}`);
  }
  return readFile(real, 'utf8');
}

/** Lê o projeto da pasta: `mapping.json` e as cópias de `specs/`, validados pelo `src/model/`. */
export async function loadProject(
  roots: Roots,
  location: ProjectLocation,
): Promise<LoadedProject> {
  const text = await readText(roots, location.dir, MAPPING_FILE);
  if (text === null) {
    throw new ToolError(
      'invalid-project',
      `não foi possível ler ${MAPPING_FILE} de ${location.name}`,
      { project: location.name },
    );
  }
  const specs = new Map<string, string>();
  for (const file of referencedSpecFiles(text)) {
    const specText = await readText(roots, location.dir, file);
    if (specText !== null) specs.set(file, specText);
  }
  const result = deserialize(text, undefined, specs);
  if (!result.ok) {
    throw new ToolError('invalid-project', describeError(result.error), {
      project: location.name,
      reason: result.error,
    });
  }
  return {
    location,
    project: result.project,
    readOnly: result.readOnly,
    migratedFrom: result.migratedFrom,
    specWarnings: result.specWarnings,
  };
}
