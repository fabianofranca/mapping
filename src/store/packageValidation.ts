import { toLibraryFiles, type PackageEntry, type Spec } from '../model';
import { validateLibrary, type LibraryReport } from '../model/library';
import type { SpecPackageFiles } from './project';

// Validation of a library package already read into memory. Pure (no DOM): the import
// (`src/ui/specPackageImport.ts`) and the application of a proposal (`proposalActions.ts`) call
// the same functions.

/**
 * The package as the validator receives it (text of the `.json` and `.md`, the rest only by
 * presence).
 */
export function libraryInputFiles(files: SpecPackageFiles) {
  const entries: PackageEntry[] = [...files].map(([path, data]) => ({
    path: `pkg/${path}`,
    ...(typeof data === 'string' ? { text: data } : {}),
  }));
  return toLibraryFiles('pkg', entries);
}

/** Level 1 only (cheap): reads the package's specialization, or nothing if it is not readable. */
export function readPackageSpec(files: SpecPackageFiles): Spec | undefined {
  return validateLibrary({ files: libraryInputFiles(files), level: 1 }).spec;
}

/** The three levels; `previous` plugs in the version contract (update). */
export function validatePackage(files: SpecPackageFiles, previous?: Spec): LibraryReport {
  return validateLibrary({
    files: libraryInputFiles(files),
    ...(previous ? { previous } : {}),
    level: 3,
  });
}
