import {
  formatCheckIssues,
  reportWithFormatChecks,
  specFileOf,
  toLibraryFiles,
  type FormatRunner,
  type PackageEntry,
  type PackageReader,
  type Spec,
  type TextMeasurer,
} from '../model';
import { isImagePath } from '../model/components/imagePath';
import { MAX_IMAGE_BYTES } from '../model/libraryImages';
import { validateLibrary, type LibraryIssue, type LibraryReport } from '../model/library';
import type { SpecPackageFiles } from './project';
import { textMeasurer } from './textMeasure';

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

// ---------------------------------------------------------------------------- the file formats

/** What the format checks need from the app: the executor (the sandbox) and, optionally, the text measurer. */
export interface PackageFormatDeps {
  readonly run: FormatRunner;
  /** The measurer of the drawings that give the projection its slots; the app's own by default. */
  readonly measure?: () => TextMeasurer;
}

/** Reads a package file as text (a Blob is read); `null` when the package has none. */
export function packageTextReader(files: SpecPackageFiles): PackageReader {
  return async (path) => {
    const data = files.get(path);
    if (data === undefined) return null;
    return typeof data === 'string' ? data : data.text();
  };
}

/**
 * The report with the problems of the specialization's file formats added (stage #2035, decision 13):
 * the plugin loads and defines a function, and its examples round-trip or apply. They run on an
 * explicit action only (applying or updating a package, opening a library from the home screen),
 * never when a project opens (decision 10). A problem is an error, so `ok` turns false.
 */
export function withFormatChecks(
  files: SpecPackageFiles,
  report: LibraryReport,
  deps: PackageFormatDeps,
): Promise<LibraryReport> {
  const specPath =
    report.spec === undefined
      ? undefined
      : specFileOf(libraryInputFiles(files), report.spec);
  return reportWithFormatChecks(
    report,
    specPath,
    packageTextReader(files),
    (pkg, read, level) =>
      formatCheckIssues(pkg, read, level, {
        run: deps.run,
        measure: (deps.measure ?? (() => textMeasurer.peek()))(),
      }),
  );
}

/** The three levels and, after them, the format checks (asynchronous: the plugins run isolated). */
export async function validatePackageWithFormats(
  files: SpecPackageFiles,
  previous: Spec | undefined,
  imageBytes: PackageImageBytes | undefined,
  deps: PackageFormatDeps,
): Promise<LibraryReport> {
  return withFormatChecks(files, validatePackage(files, previous, imageBytes), deps);
}

/** Only the problems the format checks add to `report` (the Catalog of a library shows them after its own). */
export async function formatIssuesOf(
  files: SpecPackageFiles,
  report: LibraryReport,
  deps: PackageFormatDeps,
): Promise<readonly LibraryIssue[]> {
  const checked = await withFormatChecks(files, report, deps);
  return checked.issues.slice(report.issues.length);
}
