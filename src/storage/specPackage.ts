import {
  isTextPackageFile,
  packageDirOf,
  packageWithinLimits,
  toLibraryFiles,
  type PackageEntry,
  type Project,
} from '../model';
import { validateLibrary, type LibraryIssue } from '../model/library';
import { mapLimit } from '../utils/mapLimit';
import { reportError } from '../utils/report';
import { FOLDER_CONCURRENCY } from './folderConcurrency';
import type { ProjectStorage } from './types';

/**
 * Library problem as the app shows it: the one from `validateLibrary` plus, optionally, a
 * code for those the app itself raises. With `code`, the interface shows the translated text and
 * `message` stays as a fallback (logs). The code lives here and not in `src/model/` because the model
 * is input to the MCP release.
 */
export interface AppLibraryIssue extends Omit<LibraryIssue, 'code'> {
  readonly code?: LibraryIssue['code'] | 'package-too-big';
}

/** Problems of the applied library (levels 1 and 2) by specialization id. */
export type LibraryIssues = ReadonlyMap<string, readonly AppLibraryIssue[]>;

/** Reads all the files of `specs/<id>/`: text of the `.json` and `.md`, the others only as present. */
export async function readSpecPackage(
  storage: ProjectStorage,
  dir: string,
): Promise<{ entries: PackageEntry[]; bytes: number } | null> {
  const paths = await storage.listSpecDir(dir);
  if (!packageWithinLimits(paths.length, 0)) return null;
  // Reading in parallel with a limit; the result follows the listing order. The size comes from the
  // `Blob` before reading the text: once the byte limit is exceeded, nobody opens or converts
  // a file anymore (the package becomes `null`).
  let total = 0;
  let overflow = false;
  const read = await mapLimit(paths, FOLDER_CONCURRENCY, async (path) => {
    if (overflow) return null;
    const blob = await storage.readSpecFile(path);
    if (!blob) return null;
    total += blob.size;
    if (!packageWithinLimits(0, total)) overflow = true;
    if (overflow) return null;
    const entry: PackageEntry = isTextPackageFile(path)
      ? { path, text: await blob.text() }
      : { path };
    return { entry, size: blob.size };
  });
  if (overflow) return null;
  const entries: PackageEntry[] = [];
  let bytes = 0;
  for (const item of read) {
    if (!item) continue;
    bytes += item.size;
    entries.push(item.entry);
  }
  return { entries, bytes };
}

const TOO_BIG: AppLibraryIssue = {
  file: '',
  path: '',
  message: 'pacote grande demais para conferir (limite de arquivos ou de bytes)',
  severity: 'error',
  // The interface shows the translated text (`library.packageTooBig`), not this message.
  code: 'package-too-big',
};

/** The in-memory package (relative path → text or bytes) as the validator receives it. */
export function packageEntriesOf(
  dir: string,
  files: ReadonlyMap<string, string | Blob>,
): { entries: PackageEntry[]; bytes: number } {
  const encoder = new TextEncoder();
  const entries: PackageEntry[] = [];
  let bytes = 0;
  for (const [rel, data] of files) {
    const path = `${dir}/${rel}`;
    if (typeof data === 'string') {
      bytes += encoder.encode(data).length;
      entries.push({ path, text: data });
    } else {
      bytes += data.size;
      entries.push({ path });
    }
  }
  return { entries, bytes };
}

/**
 * Validates (levels 1 and 2) ONE specialization from the package files already in memory
 * (`pkg`, with the specialization file included), or returns the too-large-package
 * problem. A null `pkg` is the package that exceeded the limit when read.
 */
export function libraryIssuesOf(
  spec: { readonly file: string },
  dir: string,
  pkg: { entries: PackageEntry[]; bytes: number } | null,
): readonly AppLibraryIssue[] {
  if (pkg === null || !packageWithinLimits(pkg.entries.length, pkg.bytes))
    return [TOO_BIG];
  return validateLibrary({
    files: toLibraryFiles(dir, pkg.entries),
    specPath: spec.file.slice(dir.length + 1),
    level: 2,
  }).issues;
}

/**
 * Validates (levels 1 and 2, without the drawing proof, which is expensive) the package copy of each
 * project specialization that lives in a `specs/<id>/` folder. Never throws: a read
 * failure goes to Diagnostics (`reportError`) and the specialization is left without an entry.
 * Only with the specializations that have a package; empty if none has.
 */
export async function loadLibraryIssues(
  storage: ProjectStorage,
  project: Pick<Project, 'specializations'>,
): Promise<LibraryIssues> {
  const result = new Map<string, readonly AppLibraryIssue[]>();
  // The specializations go in series and the parallelism stays inside each package: the peak of
  // simultaneous reads to the folder is `FOLDER_CONCURRENCY`. The result follows the order of the specializations.
  const found = await mapLimit(project.specializations, 1, async (s) => {
    const dir = packageDirOf(s.file);
    if (dir === null) return null;
    try {
      return [
        s.id,
        libraryIssuesOf(s, dir, await readSpecPackage(storage, dir)),
      ] as const;
    } catch (e) {
      reportError('open.libraryIssues', e);
      return null;
    }
  });
  for (const entry of found) if (entry) result.set(entry[0], entry[1]);
  return result;
}
