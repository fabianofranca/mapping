import { toLibraryFiles, type PackageEntry, type Spec } from '../model';
import { validateLibrary, type LibraryReport } from '../model/library';
import type { SpecPackageFiles } from './project';

// Validação de um pacote de biblioteca já lido para a memória. Pura (sem DOM): a importação
// (`src/ui/specPackageImport.ts`) e a aplicação de uma proposta (`proposalActions.ts`) chamam
// as mesmas funções.

/** O pacote como o validador o recebe (texto dos `.json` e `.md`, os demais só em presença). */
export function libraryInputFiles(files: SpecPackageFiles) {
  const entries: PackageEntry[] = [...files].map(([path, data]) => ({
    path: `pkg/${path}`,
    ...(typeof data === 'string' ? { text: data } : {}),
  }));
  return toLibraryFiles('pkg', entries);
}

/** Só o nível 1 (barato): lê a especialização do pacote, ou nada se ela não é legível. */
export function readPackageSpec(files: SpecPackageFiles): Spec | undefined {
  return validateLibrary({ files: libraryInputFiles(files), level: 1 }).spec;
}

/** Os três níveis; `previous` liga o contrato de versão (atualização). */
export function validatePackage(files: SpecPackageFiles, previous?: Spec): LibraryReport {
  return validateLibrary({
    files: libraryInputFiles(files),
    ...(previous ? { previous } : {}),
    level: 3,
  });
}
