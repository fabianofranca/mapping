import { fail } from './errors';
import { packageDirOf } from './libraryPackage';
import { serializeSpec } from './serialization';
import { parseSpecText, type Spec } from './spec';
import { applySpecialization, type SpecOpOptions } from './specializations';
import { getSpecialization } from './specLookup';
import type { Project } from './types';

// Library bundled into the build (Spatial markings stage, ME3): an ordinary package (the
// specialization's folder) that the app and the MCP apply by default. The core does not know what
// it draws; whoever bundles it (`libraries/<id>/index.ts`) hands over the files already as text.
// Pure functions: whoever writes the files (the session, the storage, the MCP) stays outside the model.

/** A bundled package: `files` maps the path inside the package folder to the text. */
export interface BundledLibrary {
  readonly id: string;
  /** Specialization file inside `files` (`notas.spec.json`). */
  readonly specFile: string;
  readonly files: ReadonlyMap<string, string>;
}

/** What `applyBundledLibrary` returns: the project and the package for the session cache. */
export interface AppliedBundledLibrary {
  readonly project: Project;
  readonly spec: Spec;
  /** The package files **without** the specialization one (which lives in the project). */
  readonly packageFiles: ReadonlyMap<string, string>;
}

function readSpec(library: BundledLibrary): Spec {
  const text = library.files.get(library.specFile);
  if (text === undefined) return fail('not-found', library.specFile);
  const parsed = parseSpecText(text);
  // An invalid bundled package is a build bug (the package test catches it): it never reaches the person.
  if (!parsed.ok) return fail('not-found', `${library.id}: ${parsed.errors.join('; ')}`);
  return parsed.spec;
}

/** Does the project already have the package's specialization (applied by default or by the person)? */
export function hasBundledLibrary(
  p: Project,
  library: Pick<BundledLibrary, 'id'>,
): boolean {
  return getSpecialization(p, library.id) !== null;
}

/**
 * Applies the bundled package like any library (`applySpecialization`, with the copy in
 * `specs/<id>/`). Fails with `spec-already-applied` if the project already has it.
 */
export function applyBundledLibrary(
  p: Project,
  library: BundledLibrary,
  options: SpecOpOptions = {},
): AppliedBundledLibrary {
  const spec = readSpec(library);
  const project = applySpecialization(p, spec, {
    ...options,
    packageSpecName: library.specFile,
  });
  const packageFiles = new Map(library.files);
  packageFiles.delete(library.specFile);
  return { project, spec, packageFiles };
}

/**
 * All the package files as they sit on the project's disk: path from the root
 * (`specs/notas/notas.spec.json`, `specs/notas/docs/nota.md`…) → text. To create the project
 * with the library already written (new project), without waiting for the session's first write.
 */
export function bundledLibraryDiskFiles(
  p: Project,
  library: Pick<BundledLibrary, 'id' | 'files' | 'specFile'>,
): Map<string, string> {
  const applied = getSpecialization(p, library.id);
  const dir = applied === null ? null : packageDirOf(applied.file);
  if (applied === null || dir === null || !applied.spec) {
    return fail('not-found', library.id);
  }
  const files = new Map<string, string>();
  for (const [path, text] of library.files) {
    if (path === library.specFile) continue;
    files.set(`${dir}/${path}`, text);
  }
  files.set(applied.file, serializeSpec(applied.spec));
  return files;
}
