import JSZip from 'jszip';
import {
  MAX_PACKAGE_FILES,
  isTextPackageFile,
  packageWithinLimits,
  toLibraryFiles,
  type PackageEntry,
  type Spec,
} from '../model';
import { validateLibrary, type LibraryReport } from '../model/library';
import type { DirectoryHandleLike } from '../storage/folder';
import type { SpecPackageFiles } from '../store/project';

// Importar um pacote de biblioteca (docs/SPEC-FORMAT.md, "Biblioteca: o pacote") escolhido
// pelo usuário: lê a pasta (`showDirectoryPicker`) ou o zip para a memória, com os limites
// de `libraryPackage.ts`, e valida pelos três níveis. A gravação em `specs/<id>/` é da sessão.

export type PackageReadResult =
  | { readonly ok: true; readonly files: SpecPackageFiles }
  | { readonly ok: false; readonly reason: 'too-big' | 'empty' };

type Picker = (options: { mode: 'read' }) => Promise<DirectoryHandleLike>;

/** O navegador oferece `showDirectoryPicker` (Chrome/Edge)? */
export function canPickDirectory(): boolean {
  return typeof Reflect.get(globalThis, 'showDirectoryPicker') === 'function';
}

/** Abre o seletor de pasta (só leitura). `null` se o usuário cancelar. */
export async function pickPackageDirectory(): Promise<DirectoryHandleLike | null> {
  const picker: unknown = Reflect.get(globalThis, 'showDirectoryPicker');
  if (typeof picker !== 'function') return null;
  try {
    return await (picker as Picker).call(globalThis, { mode: 'read' });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null;
    throw e;
  }
}

/** Entradas escondidas (`.git`, `.DS_Store`) e a sobra do macOS nos zips não são do pacote. */
function ignored(path: string): boolean {
  return path.split('/').some((part) => part.startsWith('.') || part === '__MACOSX');
}

/** Acumula os arquivos respeitando os limites; `false` quando estoura. */
class Collector {
  readonly files = new Map<string, string | Blob>();
  private bytes = 0;

  add(path: string, data: string | Blob, size: number): boolean {
    this.bytes += size;
    if (!packageWithinLimits(this.files.size + 1, this.bytes)) return false;
    this.files.set(path, data);
    return true;
  }
}

/** Se todos os arquivos estão numa única pasta-raiz, tira esse prefixo. */
function stripSingleRoot(files: ReadonlyMap<string, string | Blob>): SpecPackageFiles {
  const roots = new Set<string>();
  for (const path of files.keys()) {
    if (!path.includes('/')) return files;
    roots.add(path.slice(0, path.indexOf('/')));
  }
  if (roots.size !== 1) return files;
  const prefix = `${[...roots][0] ?? ''}/`;
  return new Map([...files].map(([path, data]) => [path.slice(prefix.length), data]));
}

function finish(collector: Collector): PackageReadResult {
  return collector.files.size === 0
    ? { ok: false, reason: 'empty' }
    : { ok: true, files: stripSingleRoot(collector.files) };
}

/** Copia a pasta para a memória (texto dos `.json` e `.md`, Blob dos demais). */
export async function readPackageFromDirectory(
  root: DirectoryHandleLike,
): Promise<PackageReadResult> {
  const collector = new Collector();
  const walk = async (dir: DirectoryHandleLike, prefix: string): Promise<boolean> => {
    for await (const entry of dir.values()) {
      const path = `${prefix}${entry.name}`;
      if (ignored(path)) continue;
      if (entry.kind === 'directory') {
        if (!(await walk(entry, `${path}/`))) return false;
        continue;
      }
      const file = await entry.getFile();
      const data = isTextPackageFile(path)
        ? await file.text()
        : new Blob([await file.arrayBuffer()]);
      if (!collector.add(path, data, file.size)) return false;
    }
    return true;
  };
  if (!(await walk(root, ''))) return { ok: false, reason: 'too-big' };
  return finish(collector);
}

/** Lê o zip (uma pasta-raiz única é tirada) para a memória. */
export async function readPackageFromZip(zipFile: Blob): Promise<PackageReadResult> {
  const zip = await JSZip.loadAsync(await zipFile.arrayBuffer());
  const names = Object.keys(zip.files).filter(
    (name) => !zip.files[name]?.dir && !ignored(name),
  );
  if (names.length > MAX_PACKAGE_FILES) return { ok: false, reason: 'too-big' };
  const collector = new Collector();
  for (const name of names) {
    const entry = zip.files[name];
    if (!entry) continue;
    if (isTextPackageFile(name)) {
      const text = await entry.async('string');
      if (!collector.add(name, text, text.length))
        return { ok: false, reason: 'too-big' };
    } else {
      const blob = await entry.async('blob');
      if (!collector.add(name, blob, blob.size)) return { ok: false, reason: 'too-big' };
    }
  }
  return finish(collector);
}

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
