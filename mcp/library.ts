import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { parseSpecText, type Spec } from '../src/model';
import { resolvePath } from '../src/model/components/library';
import {
  validateLibrary,
  type LibraryFile,
  type LibraryIssue,
} from '../src/model/library';
import { ToolError } from './errors';
import { hasParentSegment, isWithin, type Roots } from './paths';

// Pacote de biblioteca (etapa Biblioteca, B2): `validate_library` lê a PASTA do pacote e chama
// `validateLibrary` (`src/model/library.ts`), a mesma função da app e da skill. Aqui só se lê
// o disco: textos de `.json`/`.md`, o resto vira `binary: true` sem ler o conteúdo. Links
// simbólicos nunca são seguidos (a pasta e os arquivos precisam estar de fato dentro das
// raízes). Somente leitura; nada é aplicado a projeto algum.

type Json = Record<string, unknown>;

/** Arquivos de uma pasta de pacote; acima disto o pedido é recusado. */
export const MAX_PACKAGE_FILES = 2000;
/** Soma dos textos lidos (`.json` e `.md`). */
export const MAX_PACKAGE_TEXT_BYTES = 32 * 1024 * 1024;
/** Um texto maior que isto não é de um pacote razoável. */
const MAX_TEXT_FILE_BYTES = 8 * 1024 * 1024;
/** Profundidade máxima de subpastas do pacote. */
const MAX_DEPTH = 8;
/** Erros e avisos devolvidos de uma vez. */
export const MAX_ISSUES = 100;
/** Exemplo de sistema externo maior que isto vai só pelo caminho (`get_component`). */
export const MAX_EXAMPLE_JSON_BYTES = 16 * 1024;

const isTextPath = (path: string): boolean => /\.(json|md)$/i.test(path);

interface Walked {
  readonly path: string;
  readonly real: string;
  readonly size: number;
}

/** Arquivos regulares da pasta (recursivo, em ordem de caminho); ignora links e entradas ocultas. */
async function walkFiles(dir: string): Promise<Walked[]> {
  const found: Walked[] = [];
  const visit = async (current: string, prefix: string, depth: number) => {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      const real = join(current, entry.name);
      if (entry.isDirectory()) {
        if (depth < MAX_DEPTH) await visit(real, path, depth + 1);
      } else if (entry.isFile()) {
        if (found.length >= MAX_PACKAGE_FILES) {
          throw new ToolError(
            'package-too-large',
            `o pacote tem arquivos demais (mais de ${MAX_PACKAGE_FILES})`,
            { limit: MAX_PACKAGE_FILES },
          );
        }
        found.push({ path, real, size: (await stat(real)).size });
      }
    }
  };
  await visit(dir, '', 0);
  return found;
}

/** O pacote lido do disco, pronto para `validateLibrary`. */
export interface ReadPackage {
  /** Caminho real da pasta do pacote. */
  readonly dir: string;
  readonly files: readonly LibraryFile[];
  /** Arquivo da especialização, quando o pedido o indicou (relativo à pasta). */
  readonly specPath?: string;
}

/** Lê a pasta do pacote: `path` é a pasta ou o arquivo da especialização dentro dela. */
export async function readPackage(roots: Roots, path: string): Promise<ReadPackage> {
  const { real } = await roots.resolveExisting(path);
  const info = await stat(real);
  let dir = real;
  let specPath: string | undefined;
  if (info.isFile()) {
    dir = dirname(real);
    specPath = basename(real);
  } else if (!info.isDirectory()) {
    throw new ToolError('not-a-file', `não é uma pasta nem um arquivo: ${path}`, {
      path,
    });
  }
  await roots.assertInside(dir, path);
  const walked = await walkFiles(dir);
  let total = 0;
  const files: LibraryFile[] = [];
  for (const file of walked) {
    if (!isTextPath(file.path)) {
      files.push({ path: file.path, binary: true });
      continue;
    }
    if (file.size > MAX_TEXT_FILE_BYTES) {
      throw new ToolError('file-too-large', `arquivo grande demais: ${file.path}`, {
        path: file.path,
        limit: MAX_TEXT_FILE_BYTES,
      });
    }
    total += file.size;
    if (total > MAX_PACKAGE_TEXT_BYTES) {
      throw new ToolError(
        'package-too-large',
        `os textos do pacote somam mais de ${MAX_PACKAGE_TEXT_BYTES} bytes`,
        { limit: MAX_PACKAGE_TEXT_BYTES },
      );
    }
    files.push({ path: file.path, text: await readFile(file.real, 'utf8') });
  }
  return { dir, files, ...(specPath === undefined ? {} : { specPath }) };
}

/** Lê e valida o arquivo de uma versão anterior da especialização (liga o contrato de versão). */
export async function readPreviousSpec(roots: Roots, path: string): Promise<Spec> {
  const { real } = await roots.resolveExisting(path);
  const info = await stat(real);
  if (!info.isFile()) {
    throw new ToolError('not-a-file', `não é um arquivo: ${path}`, { path });
  }
  if (info.size > MAX_TEXT_FILE_BYTES) {
    throw new ToolError('file-too-large', `arquivo grande demais: ${path}`, { path });
  }
  const parsed = parseSpecText(await readFile(real, 'utf8'));
  if (!parsed.ok) {
    throw new ToolError('invalid-spec', `a versão anterior é inválida: ${path}`, {
      path,
      errors: parsed.errors.slice(0, 20),
    });
  }
  return parsed.spec;
}

/** Resumo da especialização (contagens do que ela declara). */
export function libraryCounts(spec: Spec): Json {
  const types = spec.layers.flatMap((layer) => layer.annotationTypes);
  return {
    components: types.filter((t) => t.component !== undefined).length,
    docs: types.filter((t) => t.doc !== undefined).length,
    examples:
      types.reduce((sum, t) => sum + (t.examples ?? []).length, 0) +
      (spec.origins ?? []).reduce((sum, o) => sum + (o.examples ?? []).length, 0),
    fonts: (spec.fonts ?? []).length,
    origins: (spec.origins ?? []).length,
    migrations: (spec.migrations ?? []).length,
  };
}

function issueView(issue: LibraryIssue): Json {
  return {
    file: issue.file,
    path: issue.path,
    message: issue.message,
    severity: issue.severity,
  };
}

/** `validate_library`: os três níveis sobre a pasta, no formato das outras tools de validação. */
export async function validateLibraryTool(
  roots: Roots,
  args: {
    path: string;
    previous?: string | undefined;
    level?: 1 | 2 | 3 | undefined;
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
  const warnings = report.warnings.map(issueView);
  const hint = report.ok
    ? warnings.length > 0
      ? 'a biblioteca é válida; os avisos deixam usar, mas costumam apontar descuidos (fonte ausente, conteúdo maior que a caixa, arquivo sem uso)'
      : 'a biblioteca é válida e pode ser aplicada pela app (Especializações › pasta ou zip do pacote); o servidor não aplica pacote'
    : 'corrija os erros (`file` e `path` apontam o trecho) e valide de novo; erro impede usar, aviso deixa usar';
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

/** Acesso preguiçoso aos arquivos de um pacote (do pedido por `path` ou da cópia no projeto). */
export interface PackageSource {
  readonly spec: Spec;
  /** Arquivo da especialização relativo à pasta do pacote. */
  readonly specPath: string;
  /** Texto do arquivo (caminho relativo à pasta); `null` se não existe. */
  read(path: string): Promise<string | null>;
  /** Caminho de um arquivo citado pela especialização, relativo à pasta. */
  resolve(ref: string): string;
}

/** Lê um arquivo do pacote sem sair da pasta nem das raízes; `null` se não existe ou é inválido. */
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

/** Pacote pedido por `path` (a pasta ou o arquivo da especialização). */
export async function packageByPath(roots: Roots, path: string): Promise<PackageSource> {
  const { real } = await roots.resolveExisting(path);
  const info = await stat(real);
  let dir = real;
  let specPath: string | undefined;
  if (info.isFile()) {
    dir = dirname(real);
    specPath = basename(real);
  } else if (!info.isDirectory()) {
    throw new ToolError('not-a-file', `não é uma pasta nem um arquivo: ${path}`, {
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
          ? `nenhuma especialização (.json com "format": "mapping-spec") na pasta: ${path}`
          : `há ${candidates.length} especializações na pasta (${candidates.join(', ')}): indique o arquivo`,
        { path },
      );
    }
    specPath = candidates[0]!;
  }
  const text = await readPackageFile(roots, dir, specPath);
  if (text === null) {
    throw new ToolError(
      'path-not-found',
      `arquivo da especialização não encontrado: ${path}`,
      {
        path,
      },
    );
  }
  const parsed = parseSpecText(text);
  if (!parsed.ok) {
    throw new ToolError('invalid-spec', `especialização inválida: ${path}`, {
      path,
      errors: parsed.errors.slice(0, 20),
      hint: 'use validate_library para ver os problemas do pacote',
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
 * Arquivos do pacote aplicado a um projeto (`specs/<id>/…`), relativos à pasta; vazio se a
 * cópia é um arquivo único (v1 a v3, ou a cópia incompleta de um v4).
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
  return { dir: dir.split('\\').join('/'), files: walked.map((f) => f.path) };
}

/** Fonte de um pacote aplicado: lê dentro de `specs/<id>/` do projeto. */
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
