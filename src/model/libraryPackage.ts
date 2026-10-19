import type { LibraryFile } from './library';
import type { Spec } from './spec';

// O pacote da biblioteca no projeto: a pasta da especialização copiada para
// `specs/<id>/` (docs/SPEC-FORMAT.md, "Biblioteca: o pacote"). Funções puras sobre caminhos;
// quem lê e grava os arquivos é o armazenamento (`src/storage/`).

/** Pasta das cópias das especializações, relativa à raiz do projeto. */
const SPECS_ROOT = 'specs';

/** Mais arquivos que isto num pacote: recusado (e não lido ao abrir o projeto). */
export const MAX_PACKAGE_FILES = 500;
/** Mais bytes que isto num pacote (soma dos arquivos): recusado. */
export const MAX_PACKAGE_BYTES = 64 * 1024 * 1024;

const PACKAGE_FILE_RE = /^specs\/([^/]+)\/.+$/;

/**
 * `specs/<base>` para o arquivo da especialização de um pacote (`specs/material3/m3.spec.json`);
 * `null` para a cópia única da v1 a v3 (`specs/sdui.json`) ou qualquer outro caminho.
 */
export function packageDirOf(file: string): string | null {
  const base = PACKAGE_FILE_RE.exec(file)?.[1];
  return base === undefined ? null : `${SPECS_ROOT}/${base}`;
}

/** O `file` da especialização aponta para dentro de uma pasta de pacote? */
export function isPackageFile(file: string): boolean {
  return packageDirOf(file) !== null;
}

/**
 * A especialização cita arquivos do pacote? Só então ela precisa da pasta inteira. Cita quando
 * é `formatVersion` 4 ou mais e tem algum tipo com `component`, `doc` ou `examples`, ou `fonts`
 * ou `origins` na raiz. `migrations` não conta (é só o contrato de versão). As v1 a v3 nunca
 * citam. Quem não cita vale como arquivo isolado (`specs/<id>.json`), como a v1 a v3.
 */
export function usesPackageFiles(spec: Spec): boolean {
  if (spec.formatVersion < 4) return false;
  if (spec.fonts !== undefined && spec.fonts.length > 0) return true;
  if (spec.origins !== undefined && spec.origins.length > 0) return true;
  return spec.layers.some((layer) =>
    layer.annotationTypes.some(
      (type) =>
        type.component !== undefined ||
        type.doc !== undefined ||
        (type.examples !== undefined && type.examples.length > 0),
    ),
  );
}

/** `.json` e `.md` são texto (lidos pelo validador); o resto (fontes) é binário. */
export function isTextPackageFile(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith('.json') || lower.endsWith('.md');
}

/** O pacote cabe nos limites (`MAX_PACKAGE_FILES` e `MAX_PACKAGE_BYTES`)? */
export function packageWithinLimits(fileCount: number, totalBytes: number): boolean {
  return fileCount <= MAX_PACKAGE_FILES && totalBytes <= MAX_PACKAGE_BYTES;
}

/** Um arquivo do pacote como o armazenamento o entrega, com o caminho a partir da raiz do projeto. */
export interface PackageEntry {
  readonly path: string;
  /** Conteúdo dos arquivos de texto (`isTextPackageFile`). */
  readonly text?: string;
}

/**
 * Monta `LibraryInput.files` a partir dos arquivos de `specs/<id>/`: o caminho passa a ser
 * relativo à pasta do pacote. Arquivos fora de `dir` são ignorados; um arquivo de texto sem
 * `text` (não lido) não entra; os demais entram como binário presente.
 */
export function toLibraryFiles(
  dir: string,
  entries: readonly PackageEntry[],
): LibraryFile[] {
  const prefix = `${dir}/`;
  const files: LibraryFile[] = [];
  for (const entry of entries) {
    if (!entry.path.startsWith(prefix) || entry.path.length === prefix.length) continue;
    const path = entry.path.slice(prefix.length);
    if (isTextPackageFile(path)) {
      if (entry.text !== undefined) files.push({ path, text: entry.text });
    } else {
      files.push({ path, binary: true });
    }
  }
  return files;
}

/**
 * Nome (na raiz do pacote) do arquivo da especialização `specId`, entre os `.json` da raiz
 * cujo texto (valor `string` do mapa; binários não contam) declara `"format": "mapping-spec"`
 * e esse `id`. Sem exatamente um, `<specId>.spec.json`.
 */
export function packageSpecNameOf(
  files: ReadonlyMap<string, unknown>,
  specId: string,
): string {
  const found: string[] = [];
  for (const [path, text] of files) {
    if (path.includes('/') || typeof text !== 'string') continue;
    if (!path.toLowerCase().endsWith('.json')) continue;
    try {
      const json: unknown = JSON.parse(text);
      if (typeof json !== 'object' || json === null) continue;
      const format: unknown = Reflect.get(json, 'format');
      const id: unknown = Reflect.get(json, 'id');
      if ((format === 'mapping-spec' || format === 'mapeador-spec') && id === specId) {
        found.push(path);
      }
    } catch {
      // Não é JSON: não é candidato.
    }
  }
  return found.length === 1 && found[0] !== undefined ? found[0] : `${specId}.spec.json`;
}
