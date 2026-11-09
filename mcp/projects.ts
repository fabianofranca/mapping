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
  /**
   * Componentes das especializações em pasta (`specs/<id>/`, formatVersion 4), lidos uma vez
   * ao carregar. O servidor só os usa para medir e conferir (`minSize`, `get_marking_image`):
   * nunca arruma nem grava desenho.
   */
  readonly catalog: ComponentCatalog;
  /**
   * Fontes que medem e desenham o texto da imagem do desenho: a embutida e as `fonts` das
   * bibliotecas (arquivos em `specs/<id>/`). Ausente = só a embutida.
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
 * Acha o projeto pelo que o agente informou: o nome da pasta (em qualquer profundidade das
 * raízes), o caminho relativo a uma raiz (`apps/cadastro`) ou o caminho absoluto dentro delas.
 * Nome repetido em duas pastas devolve as candidatas e pede o caminho.
 */
export async function findProject(roots: Roots, query: string): Promise<ProjectLocation> {
  const wanted = query.trim();
  if (wanted === '') throw new ToolError('invalid-project', 'informe o projeto');
  if (looksLikePath(wanted)) {
    // Com várias raízes, vale a primeira em que o caminho é mesmo um projeto.
    for (const inside of await roots.resolveExistingAll(wanted)) {
      if (await isProjectDir(inside.real)) {
        return locationOf(inside.real, inside.realRoot, inside.root);
      }
    }
    throw new ToolError(
      'project-not-found',
      `a pasta não é um projeto Mapping (sem ${MAPPING_FILE}): ${wanted}`,
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
    case 'invariant-violation': {
      // A mesma lista que a app mostra (a completa vai em `reason.issues`).
      const shown = error.issues.slice(0, 20).map((i) => {
        const name = i.name === undefined ? '' : ` "${i.name}"`;
        return `${i.code} (${i.entity} ${i.id}${name})`;
      });
      const more = error.issues.length > shown.length ? '; …' : '';
      return `o mapping.json viola ${error.issues.length} regra(s) do modelo: ${shown.join('; ')}${more}`;
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
    throw new ToolError('file-too-large', `arquivo grande demais: ${file}`);
  }
  return readFile(real, 'utf8');
}

/**
 * Cache do processo (decisão 7 da etapa): o resultado de interpretar arquivos de `specs/` vale
 * enquanto o caminho, o tamanho e o `mtime` de cada um não mudam; um arquivo trocado no disco
 * muda a chave. Guarda no máximo `MAX_CACHED` resultados (o mais antigo sai primeiro).
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

/** Caminho real, tamanho e `mtime` de um arquivo do projeto; `null` se não existe ou não se lê. */
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
    // Ilegível: sem chave, o cache não vale e a leitura cai no tratamento de sempre.
    return null;
  }
}

const digest = (value: unknown): string =>
  createHash('sha1').update(JSON.stringify(value)).digest('hex');

/** Os componentes de uma especialização em pasta: do cache, ou lidos e interpretados. */
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
      // Arquivo ilegível ou grande demais: o tipo fica sem componente (problema no catálogo).
    }
  }
  const loaded = loadSpecComponents(spec, applied.file, applied.version, (path) =>
    texts.get(path),
  );
  catalogCache.set(key, loaded);
  return loaded;
}

/** Lê os arquivos de componente de cada especialização em pasta e monta o catálogo. */
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

/** Maior arquivo de fonte lido (o resto vale a fonte embutida). */
const MAX_FONT_BYTES = 8 * 1024 * 1024;

interface FontFile {
  readonly entry: SpecFont;
  readonly path: string;
  readonly real: string;
  readonly stamp: string;
}

/** As fontes declaradas (`fonts`) das especializações aplicadas que existem na cópia do projeto. */
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

/** As `fonts` das especializações aplicadas, com os bytes lidos da cópia do projeto. */
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
      // Fonte ilegível: vale a embutida.
    }
  }
  const book = createFontBook(loaded);
  fontCache.set(key, book);
  return book;
}

export interface LoadOptions {
  /** Interpreta as fontes das bibliotecas (padrão). `false` nas tools que só contam (`list_projects`). */
  readonly fonts?: boolean;
}

/**
 * Interpreta o `mapping.json` uma vez: o JSON serve a achar as cópias de `specs/` a ler e ao
 * modelo (`deserializeParsed`).
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

/** Lê o projeto da pasta: `mapping.json` e as cópias de `specs/`, validados pelo `src/model/`. */
export async function loadProject(
  roots: Roots,
  location: ProjectLocation,
  /** O texto do `mapping.json` já lido pelo chamador (não lê de novo). */
  given?: string,
  options: LoadOptions = {},
): Promise<LoadedProject> {
  const text = given ?? (await readText(roots, location.dir, MAPPING_FILE));
  if (text === null) {
    throw new ToolError(
      'invalid-project',
      `não foi possível ler ${MAPPING_FILE} de ${location.name}`,
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
