import {
  isTextPackageFile,
  packageDirOf,
  packageWithinLimits,
  toLibraryFiles,
  type PackageEntry,
  type Project,
} from '../model';
import { validateLibrary, type LibraryIssue } from '../model/library';
import { mapLimit } from '../utils/mapLimit';
import { reportError } from '../utils/report';
import { FOLDER_CONCURRENCY } from './folderConcurrency';
import type { ProjectStorage } from './types';

/**
 * Problema da biblioteca como a app o mostra: o do `validateLibrary` mais, opcionalmente, um
 * código para os que a própria app levanta. Com `code`, a interface mostra o texto traduzido e
 * `message` fica como reserva (logs). O código vive aqui e não em `src/model/` porque o modelo
 * é entrada da release do MCP.
 */
export interface AppLibraryIssue extends Omit<LibraryIssue, 'code'> {
  readonly code?: LibraryIssue['code'] | 'package-too-big';
}

/** Problemas da biblioteca aplicada (níveis 1 e 2) por id de especialização. */
export type LibraryIssues = ReadonlyMap<string, readonly AppLibraryIssue[]>;

/** Lê todos os arquivos de `specs/<id>/`: texto dos `.json` e `.md`, os demais só em presença. */
export async function readSpecPackage(
  storage: ProjectStorage,
  dir: string,
): Promise<{ entries: PackageEntry[]; bytes: number } | null> {
  const paths = await storage.listSpecDir(dir);
  if (!packageWithinLimits(paths.length, 0)) return null;
  // Leitura em paralelo com limite; o resultado, o cálculo de bytes e o corte seguem a ordem
  // da listagem (pode ler um pouco além do limite antes de cortar, o resultado é o mesmo).
  const read = await mapLimit(paths, FOLDER_CONCURRENCY, async (path) => {
    const blob = await storage.readSpecFile(path);
    if (!blob) return null;
    const entry: PackageEntry = isTextPackageFile(path)
      ? { path, text: await blob.text() }
      : { path };
    return { entry, size: blob.size };
  });
  const entries: PackageEntry[] = [];
  let bytes = 0;
  for (const item of read) {
    if (!item) continue;
    bytes += item.size;
    if (!packageWithinLimits(0, bytes)) return null;
    entries.push(item.entry);
  }
  return { entries, bytes };
}

const TOO_BIG: AppLibraryIssue = {
  file: '',
  path: '',
  message: 'pacote grande demais para conferir (limite de arquivos ou de bytes)',
  severity: 'error',
  // A interface mostra o texto traduzido (`library.packageTooBig`), não esta mensagem.
  code: 'package-too-big',
};

/** O pacote em memória (caminho relativo → texto ou bytes) como o validador o recebe. */
export function packageEntriesOf(
  dir: string,
  files: ReadonlyMap<string, string | Blob>,
): { entries: PackageEntry[]; bytes: number } {
  const encoder = new TextEncoder();
  const entries: PackageEntry[] = [];
  let bytes = 0;
  for (const [rel, data] of files) {
    const path = `${dir}/${rel}`;
    if (typeof data === 'string') {
      bytes += encoder.encode(data).length;
      entries.push({ path, text: data });
    } else {
      bytes += data.size;
      entries.push({ path });
    }
  }
  return { entries, bytes };
}

/**
 * Valida (níveis 1 e 2) UMA especialização a partir dos arquivos do pacote já em memória
 * (`pkg`, com o arquivo da especialização incluso), ou devolve o problema de pacote grande
 * demais. `pkg` nulo é o pacote que passou do limite ao ser lido.
 */
export function libraryIssuesOf(
  spec: { readonly file: string },
  dir: string,
  pkg: { entries: PackageEntry[]; bytes: number } | null,
): readonly AppLibraryIssue[] {
  if (pkg === null || !packageWithinLimits(pkg.entries.length, pkg.bytes))
    return [TOO_BIG];
  return validateLibrary({
    files: toLibraryFiles(dir, pkg.entries),
    specPath: spec.file.slice(dir.length + 1),
    level: 2,
  }).issues;
}

/**
 * Valida (níveis 1 e 2, sem a prova de desenho, que é cara) a cópia do pacote de cada
 * especialização do projeto que mora numa pasta `specs/<id>/`. Nunca lança: uma falha de
 * leitura vai para o Diagnóstico (`reportError`) e a especialização fica sem entrada.
 * Só com as especializações que têm pacote; vazio se nenhuma tem.
 */
export async function loadLibraryIssues(
  storage: ProjectStorage,
  project: Pick<Project, 'specializations'>,
): Promise<LibraryIssues> {
  const result = new Map<string, readonly AppLibraryIssue[]>();
  // Os pacotes são lidos em paralelo; o resultado segue a ordem das especializações.
  const found = await Promise.all(
    project.specializations.map(async (s) => {
      const dir = packageDirOf(s.file);
      if (dir === null) return null;
      try {
        return [
          s.id,
          libraryIssuesOf(s, dir, await readSpecPackage(storage, dir)),
        ] as const;
      } catch (e) {
        reportError('open.libraryIssues', e);
        return null;
      }
    }),
  );
  for (const entry of found) if (entry) result.set(entry[0], entry[1]);
  return result;
}
