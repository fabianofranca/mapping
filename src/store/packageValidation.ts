import { toLibraryFiles, type PackageEntry, type Spec } from '../model';
import { isImagePath } from '../model/components/imagePath';
import { MAX_IMAGE_BYTES } from '../model/libraryImages';
import { validateLibrary, type LibraryReport } from '../model/library';
import type { SpecPackageFiles } from './project';

// Validation of a library package already read into memory. Pure (no DOM): the import
// (`src/ui/specPackageImport.ts`) and the application of a proposal (`proposalActions.ts`) call
// the same functions.

/** The bytes of the package's image files, by path from the package root (see `packageImageBytes`). */
export type PackageImageBytes = ReadonlyMap<string, Uint8Array>;

const NO_IMAGE_BYTES: PackageImageBytes = new Map();

/**
 * Reads the bytes of the package's image files (`.png`, `.jpg`, `.jpeg`, `.webp`) so the validator
 * checks format and dimensions (decision 12 of stage #1903). A file over 1 MB is not read: its size
 * alone is the error. Text files and other binaries are not read.
 */
export async function packageImageBytes(
  files: SpecPackageFiles,
): Promise<PackageImageBytes> {
  const found = new Map<string, Uint8Array>();
  for (const [path, data] of files) {
    if (typeof data === 'string' || !isImagePath(path) || data.size > MAX_IMAGE_BYTES) {
      continue;
    }
    found.set(path, new Uint8Array(await data.arrayBuffer()));
  }
  return found;
}

/**
 * The package as the validator receives it (text of the `.json` and `.md`; an image file with its
 * size and, when read, its bytes; the rest only by presence).
 */
export function libraryInputFiles(
  files: SpecPackageFiles,
  imageBytes: PackageImageBytes = NO_IMAGE_BYTES,
) {
  const entries: PackageEntry[] = [...files].map(([path, data]) => {
    if (typeof data === 'string') return { path: `pkg/${path}`, text: data };
    const bytes = imageBytes.get(path);
    return {
      path: `pkg/${path}`,
      ...(bytes === undefined ? { size: data.size } : { bytes }),
    };
  });
  return toLibraryFiles('pkg', entries);
}

/** Level 1 only (cheap): reads the package's specialization, or nothing if it is not readable. */
export function readPackageSpec(files: SpecPackageFiles): Spec | undefined {
  return validateLibrary({ files: libraryInputFiles(files), level: 1 }).spec;
}

/** The three levels; `previous` plugs in the version contract (update). */
export function validatePackage(
  files: SpecPackageFiles,
  previous?: Spec,
  imageBytes?: PackageImageBytes,
): LibraryReport {
  return validateLibrary({
    files: libraryInputFiles(files, imageBytes),
    ...(previous ? { previous } : {}),
    level: 3,
  });
}
