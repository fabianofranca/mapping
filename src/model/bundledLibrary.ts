import { fail } from './errors';
import { packageDirOf } from './libraryPackage';
import { serializeSpec } from './serialization';
import { parseSpecText, type Spec } from './spec';
import { applySpecialization, type SpecOpOptions } from './specializations';
import { getSpecialization } from './specLookup';
import type { Project } from './types';

// Biblioteca embutida no build (etapa Marcações espaciais, ME3): um pacote comum (a pasta da
// especialização) que a app e o MCP aplicam por padrão. O núcleo não sabe o que ela desenha;
// quem a embute (`libraries/<id>/index.ts`) entrega os arquivos já como texto. Funções puras:
// quem grava os arquivos (a sessão, o armazenamento, o MCP) fica fora do modelo.

/** Um pacote embutido: `files` mapeia o caminho dentro da pasta do pacote ao texto. */
export interface BundledLibrary {
  readonly id: string;
  /** Arquivo da especialização dentro de `files` (`notas.spec.json`). */
  readonly specFile: string;
  readonly files: ReadonlyMap<string, string>;
}

/** O que `applyBundledLibrary` devolve: o projeto e o pacote para o cache da sessão. */
export interface AppliedBundledLibrary {
  readonly project: Project;
  readonly spec: Spec;
  /** Os arquivos do pacote **sem** o da especialização (que vive no projeto). */
  readonly packageFiles: ReadonlyMap<string, string>;
}

function readSpec(library: BundledLibrary): Spec {
  const text = library.files.get(library.specFile);
  if (text === undefined) return fail('not-found', library.specFile);
  const parsed = parseSpecText(text);
  // Um pacote embutido inválido é bug do build (o teste do pacote o pega): nunca chega à pessoa.
  if (!parsed.ok) return fail('not-found', `${library.id}: ${parsed.errors.join('; ')}`);
  return parsed.spec;
}

/** O projeto já tem a especialização do pacote (aplicada por padrão ou pela pessoa)? */
export function hasBundledLibrary(
  p: Project,
  library: Pick<BundledLibrary, 'id'>,
): boolean {
  return getSpecialization(p, library.id) !== null;
}

/**
 * Aplica o pacote embutido como qualquer biblioteca (`applySpecialization`, com a cópia em
 * `specs/<id>/`). Falha com `spec-already-applied` se o projeto já a tem.
 */
export function applyBundledLibrary(
  p: Project,
  library: BundledLibrary,
  options: SpecOpOptions = {},
): AppliedBundledLibrary {
  const spec = readSpec(library);
  const project = applySpecialization(p, spec, {
    ...options,
    packageSpecName: library.specFile,
  });
  const packageFiles = new Map(library.files);
  packageFiles.delete(library.specFile);
  return { project, spec, packageFiles };
}

/**
 * Todos os arquivos do pacote como ficam no disco do projeto: caminho a partir da raiz
 * (`specs/notas/notas.spec.json`, `specs/notas/docs/nota.md`…) → texto. Para criar o projeto
 * já com a biblioteca gravada (projeto novo), sem esperar a primeira gravação da sessão.
 */
export function bundledLibraryDiskFiles(
  p: Project,
  library: Pick<BundledLibrary, 'id' | 'files' | 'specFile'>,
): Map<string, string> {
  const applied = getSpecialization(p, library.id);
  const dir = applied === null ? null : packageDirOf(applied.file);
  if (applied === null || dir === null || !applied.spec) {
    return fail('not-found', library.id);
  }
  const files = new Map<string, string>();
  for (const [path, text] of library.files) {
    if (path === library.specFile) continue;
    files.set(`${dir}/${path}`, text);
  }
  files.set(applied.file, serializeSpec(applied.spec));
  return files;
}
