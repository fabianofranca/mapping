import JSZip from 'jszip';
import { MAX_PACKAGE_FILES, isTextPackageFile, packageWithinLimits } from '../model';
import type { DirectoryHandleLike } from '../storage/folder';
import type { SpecPackageFiles } from '../store/project';

// Import a library package (docs/SPEC-FORMAT.md, "Library: the package") chosen by the user: reads
// the folder (`showDirectoryPicker`) or the zip into memory, with the limits of
// `libraryPackage.ts`, and validates through the three levels. Writing to `specs/<id>/` is the
// session's.

export type PackageReadResult =
  | { readonly ok: true; readonly files: SpecPackageFiles }
  | { readonly ok: false; readonly reason: 'too-big' | 'empty' };

type Picker = (options: { mode: 'read' }) => Promise<DirectoryHandleLike>;

/** Does the browser offer `showDirectoryPicker` (Chrome/Edge)? */
export function canPickDirectory(): boolean {
  return typeof Reflect.get(globalThis, 'showDirectoryPicker') === 'function';
}

/** Opens the folder picker (read-only). `null` if the user cancels. */
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

/** Hidden entries (`.git`, `.DS_Store`) and macOS leftovers in zips are not part of the package. */
function ignored(path: string): boolean {
  return path.split('/').some((part) => part.startsWith('.') || part === '__MACOSX');
}

/** Accumulates the files respecting the limits; `false` when it overflows. */
class Collector {
  readonly files = new Map<string, string | Blob>();
  private bytes = 0;

  /** Does one more file of `size` bytes still fit? Used to refuse before reading the content. */
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

/** Size in bytes (UTF-8) of a text read from a file. */
function textBytes(text: string): number {
  return encoder.encode(text).length;
}

/**
  * Uncompressed size that the zip declares for the entry (the central directory), or `null` if the
  * JSZip version does not expose it. JSZip checks the declared size when decompressing.
 */
function declaredSize(entry: JSZip.JSZipObject): number | null {
  const data: unknown = Reflect.get(entry, '_data');
  const size: unknown =
    typeof data === 'object' && data !== null
      ? Reflect.get(data, 'uncompressedSize')
      : undefined;
  return typeof size === 'number' && Number.isFinite(size) ? size : null;
}

/** If all files are in a single root folder, strips that prefix. */
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

/** Copies the folder into memory (text of the `.json` and `.md`, Blob for the rest). */
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
      // The size comes from the file: refuses before reading the content.
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

/** Reads the zip (a single root folder is stripped) into memory. */
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
    // Refuses by the declared size, before decompressing (compression bomb).
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

// The (pure) validation lives in the store, which uses it when applying a proposal; here it is only
// re-exported.
export {
  libraryInputFiles,
  readPackageSpec,
  validatePackage,
} from '../store/packageValidation';
