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

const TOO_BIG: AppLibraryIssue = {
  file: '',
  path: '',
  message: 'pacote grande demais para conferir (limite de arquivos ou de bytes)',
  severity: 'error',
  // A interface mostra o texto traduzido (`library.packageTooBig`), não esta mensagem.
  code: 'package-too-big',
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
  const result = new Map<string, readonly AppLibraryIssue[]>();
  // Os pacotes são lidos em paralelo; o resultado segue a ordem das especializações.
  const found = await Promise.all(
    project.specializations.map(async (s) => {
      const dir = packageDirOf(s.file);
      if (dir === null) return null;
      try {
        const pkg = await readSpecPackage(storage, dir);
        if (pkg === null) return [s.id, [TOO_BIG]] as const;
        const report = validateLibrary({
          files: toLibraryFiles(dir, pkg.entries),
          specPath: s.file.slice(dir.length + 1),
          level: 2,
        });
        return [s.id, report.issues] as const;
      } catch (e) {
        reportError('open.libraryIssues', e);
        return null;
      }
    }),
  );
  for (const entry of found) if (entry) result.set(entry[0], entry[1]);
  return result;
}
