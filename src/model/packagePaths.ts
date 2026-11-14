import { isValidCodePath } from './codeLocations';

// File paths of a package (the folder of a specialization, formatVersion 4): relative to the
// specialization file, with `/`, without `.` or `..`, without a leading `/` and without a
// drive letter (the rule of the `code` `path`), plus the expected extension (lowercase). It
// lives outside `spec.ts` so `components/origin.ts` can use it without an import cycle;
// `spec.ts` re-exports it. The error text does not live here: it comes only from the catalog
// (`packagePathMsg`, in `specIssueCode.ts`).

/** Why the path is not valid as a package file: the reason as data (no text). */
export type PackagePathError =
  | { readonly kind: 'path' }
  | { readonly kind: 'extension'; readonly exts: readonly string[] };

/** The reason the path is not valid as a package file with one of these extensions; `undefined` if valid. */
export function packagePathError(
  path: string,
  ext: string | readonly string[],
): PackagePathError | undefined {
  const exts = typeof ext === 'string' ? [ext] : ext;
  if (!isValidCodePath(path)) return { kind: 'path' };
  const base = path.slice(path.lastIndexOf('/') + 1);
  if (!exts.some((e) => base.length > e.length && base.endsWith(e))) {
    return { kind: 'extension', exts };
  }
  return undefined;
}

/** `true` for a package file path with the given extension (or one of the extensions). */
export function isPackagePath(path: string, ext: string | readonly string[]): boolean {
  return packagePathError(path, ext) === undefined;
}
