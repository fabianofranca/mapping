import { readFile, realpath, stat } from 'node:fs/promises';
import { join, posix, resolve } from 'node:path';
import {
  docRepoOf,
  isValidCodePath,
  isValidLocalPath,
  type Project,
  type Spec,
  type SpecDocRef,
} from '../src/model';
import type { LibraryIssue } from '../src/model/library';
import type { LocalFile, LocalFileChecker } from './codeFiles';
import { isWithin, type Roots } from './paths';

// Documento de um tipo em repositório externo (etapa #559, PD6). Diferente do código de
// instanciação (que o servidor nunca lê: `codeFiles.ts`), o documento é um `.md` de
// documentação que o agente precisa ler, e por isso este é o outro módulo do `mcp/` que lê um
// arquivo por caminho vindo do projeto. A proteção é a mesma do `codeFiles.ts`: o
// `LocalFileChecker` confina o caminho (e o real, depois dos links simbólicos) ao diretório de
// trabalho do cliente antes de qualquer leitura; aqui só entram o tamanho e o `readFile`.
// Também confere, no `validate_library`, se o documento existe num clone (só metadados).

/** Um documento maior que isto não é lido (vai só o link). */
export const MAX_DOC_BYTES = 1024 * 1024;

export interface ExternalDoc extends LocalFile {
  /** Texto do `.md`; `null` sem clone, sem arquivo, fora do diretório de trabalho ou grande demais. */
  readonly text: string | null;
  /** Presente quando o arquivo existe mas passa de `MAX_DOC_BYTES`. */
  readonly tooLarge?: true;
}

/** Caminho do documento relativo à pasta do projeto, pelo `localPath` do clone; `null` se não dá. */
export function docLocalPath(p: Project, repoId: string, docPath: string): string | null {
  const localPath = docRepoOf(p, repoId)?.localPath ?? null;
  if (localPath === null || !isValidLocalPath(localPath)) return null;
  if (!isValidCodePath(docPath)) return null;
  return posix.join(localPath, docPath);
}

/** Lê o documento externo pelo clone do projeto, confinado ao diretório de trabalho. */
export async function readExternalDoc(
  checker: LocalFileChecker,
  workDir: string,
  projectDir: string,
  relativeToProject: string | null,
): Promise<ExternalDoc> {
  const located = await checker.check(projectDir, relativeToProject);
  if (located.exists !== true || located.localFile === null) {
    return { ...located, text: null };
  }
  const file = resolve(workDir, located.localFile);
  try {
    if ((await stat(file)).size > MAX_DOC_BYTES) {
      return { ...located, text: null, tooLarge: true };
    }
    return { ...located, text: await readFile(file, 'utf8') };
  } catch {
    return { ...located, exists: false, text: null };
  }
}

// ---------------------------------------------------------------------------
// validate_library: o documento existe no clone?

/** `true` o arquivo está no clone, `false` não está, `null` não há clone para conferir. */
export type DocChecker = (repo: string, path: string) => Promise<boolean | null>;

async function fileInside(root: string, file: string): Promise<boolean> {
  try {
    const real = await realpath(file);
    return isWithin(root, real) && (await stat(real)).isFile();
  } catch {
    return false;
  }
}

/** Conferência pelos clones do pedido (`docClones`: repositório → pasta dentro das raízes). */
export async function docClonesChecker(
  roots: Roots,
  docClones: Readonly<Record<string, string>> | undefined,
): Promise<DocChecker> {
  const reals = new Map<string, string>();
  for (const [repo, folder] of Object.entries(docClones ?? {})) {
    const { real } = await roots.resolveExisting(folder);
    reals.set(repo, real);
  }
  return async (repo, path) => {
    const root = reals.get(repo);
    if (root === undefined) return null;
    return isValidCodePath(path) ? fileInside(root, join(root, path)) : false;
  };
}

/** Conferência pelo `localPath` do projeto (`plan_library_update`). */
export function projectDocChecker(
  p: Project,
  checker: LocalFileChecker,
  projectDir: string,
): DocChecker {
  return async (repo, path) => {
    const rel = docLocalPath(p, repo, path);
    if (rel === null) return null;
    return (await checker.check(projectDir, rel)).exists;
  };
}

const unverified = (repo: string, count: number) =>
  count === 1
    ? `1 documento de ${repo} não conferido (sem clone)`
    : `${count} documentos de ${repo} não conferidos (sem clone)`;

/**
 * Avisos dos documentos externos da especialização: um por documento que o clone não tem
 * ("documento não encontrado em <repo>"; aviso, e não erro, porque o clone pode estar noutra
 * `ref`) e um por repositório sem clone, com a contagem dos documentos não conferidos.
 */
export async function externalDocWarnings(
  spec: Spec,
  file: string,
  check: DocChecker,
): Promise<LibraryIssue[]> {
  const missing: LibraryIssue[] = [];
  const unchecked = new Map<string, number>();
  for (const [i, layer] of spec.layers.entries()) {
    for (const [j, type] of layer.annotationTypes.entries()) {
      const doc: SpecDocRef | string | undefined = type.doc;
      if (doc === undefined || typeof doc === 'string') continue;
      const found = await check(doc.repo, doc.path);
      if (found === null) unchecked.set(doc.repo, (unchecked.get(doc.repo) ?? 0) + 1);
      else if (!found) {
        missing.push({
          file,
          path: `layers[${i}].annotationTypes[${j}].doc`,
          message: `documento não encontrado em ${doc.repo}: ${doc.path}`,
          severity: 'warning',
        });
      }
    }
  }
  const repoIndex = (repo: string) =>
    (spec.docRepos ?? []).findIndex((r) => r.id === repo);
  return [
    ...missing,
    ...[...unchecked].map(([repo, count]) => ({
      file,
      path: repoIndex(repo) < 0 ? 'docRepos' : `docRepos[${repoIndex(repo)}]`,
      message: unverified(repo, count),
      severity: 'warning' as const,
    })),
  ];
}
