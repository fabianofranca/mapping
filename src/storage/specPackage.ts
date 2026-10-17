import {
  isTextPackageFile,
  packageDirOf,
  packageWithinLimits,
  toLibraryFiles,
  type PackageEntry,
  type Project,
} from '../model';
import { validateLibrary, type LibraryIssue } from '../model/library';
import { reportError } from '../utils/report';
import type { ProjectStorage } from './types';

/** Problemas da biblioteca aplicada (níveis 1 e 2) por id de especialização. */
export type LibraryIssues = ReadonlyMap<string, readonly LibraryIssue[]>;

/** Lê todos os arquivos de `specs/<id>/`: texto dos `.json` e `.md`, os demais só em presença. */
export async function readSpecPackage(
  storage: ProjectStorage,
  dir: string,
): Promise<{ entries: PackageEntry[]; bytes: number } | null> {
  const paths = await storage.listSpecDir(dir);
  const entries: PackageEntry[] = [];
  let bytes = 0;
  if (!packageWithinLimits(paths.length, 0)) return null;
  for (const path of paths) {
    const blob = await storage.readSpecFile(path);
    if (!blob) continue;
    bytes += blob.size;
    if (!packageWithinLimits(0, bytes)) return null;
    entries.push(isTextPackageFile(path) ? { path, text: await blob.text() } : { path });
  }
  return { entries, bytes };
}

const TOO_BIG: LibraryIssue = {
  file: '',
  path: '',
  message: 'pacote grande demais para conferir (limite de arquivos ou de bytes)',
  severity: 'error',
};

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
  const result = new Map<string, readonly LibraryIssue[]>();
  for (const s of project.specializations) {
    const dir = packageDirOf(s.file);
    if (dir === null) continue;
    try {
      const pkg = await readSpecPackage(storage, dir);
      if (pkg === null) {
        result.set(s.id, [TOO_BIG]);
        continue;
      }
      const report = validateLibrary({
        files: toLibraryFiles(dir, pkg.entries),
        specPath: s.file.slice(dir.length + 1),
        level: 2,
      });
      result.set(s.id, report.issues);
    } catch (e) {
      reportError('open.libraryIssues', e);
    }
  }
  return result;
}
