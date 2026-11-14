import type { LibraryFile } from './library';
import type { Spec, SpecAnnotationType } from './spec';

// The library package in the project: the specialization folder copied to
// `specs/<id>/` (docs/SPEC-FORMAT.md, "Library: the package"). Pure functions over paths;
// storage (`src/storage/`) is what reads and writes the files.

/** Folder of the specialization copies, relative to the project root. */
const SPECS_ROOT = 'specs';

/** More files than this in a package: refused (and not read when opening the project). */
export const MAX_PACKAGE_FILES = 500;
/** More bytes than this in a package (sum of the files): refused. */
export const MAX_PACKAGE_BYTES = 64 * 1024 * 1024;

const PACKAGE_FILE_RE = /^specs\/([^/]+)\/.+$/;

/**
 * `specs/<base>` for a package's specialization file (`specs/material3/m3.spec.json`);
 * `null` for the single copy of v1 to v3 (`specs/sdui.json`) or any other path.
 */
export function packageDirOf(file: string): string | null {
  const base = PACKAGE_FILE_RE.exec(file)?.[1];
  return base === undefined ? null : `${SPECS_ROOT}/${base}`;
}

/** Does the specialization's `file` point inside a package folder? */
export function isPackageFile(file: string): boolean {
  return packageDirOf(file) !== null;
}

/**
 * Does the specialization cite package files? Only then does it need the whole folder. It cites
 * when it is `formatVersion` 4 or higher and has some type with `component`, a text `doc` or
 * `examples`, or `fonts`, `origins` or `icons` at the root, or some signature sheet (`signature`
 * in `code`, in a `variants` case or in the type's `sources`; v16). `migrations` does not count
 * (it is only the version contract), nor does the object `doc` (`{ repo, path }`, the document
 * lives in another repository). v1 to v3 never cite. One that does not cite counts as a
 * standalone file (`specs/<id>.json`), like v1 to v3.
 */
export function usesPackageFiles(spec: Spec): boolean {
  if (spec.formatVersion < 4) return false;
  if (spec.fonts !== undefined && spec.fonts.length > 0) return true;
  if (spec.origins !== undefined && spec.origins.length > 0) return true;
  if (spec.icons !== undefined) return true;
  return spec.layers.some((layer) =>
    layer.annotationTypes.some(
      (type) =>
        type.component !== undefined ||
        typeof type.doc === 'string' ||
        (type.examples !== undefined && type.examples.length > 0) ||
        citesSignature(type),
    ),
  );
}

/** Does the type cite a signature sheet (in `code`, in a `variants` case or in `sources`)? */
function citesSignature(type: SpecAnnotationType): boolean {
  return (
    Object.values(type.code ?? {}).some(
      (entry) =>
        entry.signature !== undefined ||
        Object.values(entry.variants?.cases ?? {}).some((c) => c.signature !== undefined),
    ) || (type.sources ?? []).some((source) => source.signature !== undefined)
  );
}

/** `.json` and `.md` are text (read by the validator); the rest (fonts) is binary. */
export function isTextPackageFile(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith('.json') || lower.endsWith('.md');
}

/** Does the package fit the limits (`MAX_PACKAGE_FILES` and `MAX_PACKAGE_BYTES`)? */
export function packageWithinLimits(fileCount: number, totalBytes: number): boolean {
  return fileCount <= MAX_PACKAGE_FILES && totalBytes <= MAX_PACKAGE_BYTES;
}

/** A package file as storage delivers it, with the path from the project root. */
export interface PackageEntry {
  readonly path: string;
  /** Content of the text files (`isTextPackageFile`). */
  readonly text?: string;
}

/**
 * Builds `LibraryInput.files` from the files of `specs/<id>/`: the path becomes relative to the
 * package folder. Files outside `dir` are ignored; a text file without `text` (not read) is
 * left out; the others enter as a present binary.
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
 * Name (at the package root) of the file of specialization `specId`, among the root `.json`
 * files whose text (the map's `string` value; binaries do not count) declares
 * `"format": "mapping-spec"` and that `id`. Without exactly one, `<specId>.spec.json`.
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
      // Not JSON: not a candidate.
    }
  }
  return found.length === 1 && found[0] !== undefined ? found[0] : `${specId}.spec.json`;
}
