import JSZip from 'jszip';
import { MAX_PACKAGE_FILES, isTextPackageFile, packageWithinLimits } from '../model';
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

  /** Mais um arquivo de `size` bytes ainda cabe? Serve para recusar antes de ler o conteúdo. */
  fits(size: number): boolean {
    return packageWithinLimits(this.files.size + 1, this.bytes + size);
  }

  add(path: string, data: string | Blob, size: number): boolean {
    if (!this.fits(size)) return false;
    this.bytes += size;
    this.files.set(path, data);
    return true;
  }
}

const encoder = new TextEncoder();

/** Tamanho em bytes (UTF-8) de um texto lido de arquivo. */
function textBytes(text: string): number {
  return encoder.encode(text).length;
}

/**
 * Tamanho descomprimido que o zip declara para a entrada (o diretório central), ou `null` se a
 * versão do JSZip não o expõe. O JSZip confere o declarado ao descomprimir.
 */
function declaredSize(entry: JSZip.JSZipObject): number | null {
  const data: unknown = Reflect.get(entry, '_data');
  const size: unknown =
    typeof data === 'object' && data !== null
      ? Reflect.get(data, 'uncompressedSize')
      : undefined;
  return typeof size === 'number' && Number.isFinite(size) ? size : null;
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
      // O tamanho vem do arquivo: recusa antes de ler o conteúdo.
      if (!collector.fits(file.size)) return false;
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
    // Recusa pelo tamanho declarado, antes de descomprimir (bomba de compressão).
    const declared = declaredSize(entry);
    if (declared !== null && !collector.fits(declared)) {
      return { ok: false, reason: 'too-big' };
    }
    if (isTextPackageFile(name)) {
      const text = await entry.async('string');
      if (!collector.add(name, text, textBytes(text)))
        return { ok: false, reason: 'too-big' };
    } else {
      const blob = await entry.async('blob');
      if (!collector.add(name, blob, blob.size)) return { ok: false, reason: 'too-big' };
    }
  }
  return finish(collector);
}

// A validação (pura) mora no store, que a usa ao aplicar uma proposta; aqui só se reexporta.
export {
  libraryInputFiles,
  readPackageSpec,
  validatePackage,
} from '../store/packageValidation';
