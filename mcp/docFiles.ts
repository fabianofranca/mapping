import { readFile, realpath, stat } from 'node:fs/promises';
import { join, posix, resolve } from 'node:path';
import {
  docRepoOf,
  isValidCodePath,
  isValidLocalPath,
  type Project,
  type Spec,
  type SpecDocRef,
} from '../src/model';
import type { LibraryIssue } from '../src/model/library';
import type { LocalFile, LocalFileChecker } from './codeFiles';
import { isWithin, type Roots } from './paths';

// Document of a type in an external repository (stage #559, PD6). Unlike the instantiation code
// (which the server never reads: `codeFiles.ts`), the document is a documentation `.md` that
// the agent needs to read, and that is why this is the other `mcp/` module that reads a file
// by a path that comes from the project. The protection is the same as in `codeFiles.ts`: the
// `LocalFileChecker` confines the path (and the real one, after symlinks) to the client's
// working directory before any read; only the size and the `readFile` come in here.
// It also checks, in `validate_library`, whether the document exists in a clone (metadata only).

/** A document larger than this is not read (only the link goes). */
export const MAX_DOC_BYTES = 1024 * 1024;

export interface ExternalDoc extends LocalFile {
  /** Text of the `.md`; `null` with no clone, no file, outside the working directory or too large. */
  readonly text: string | null;
  /** Present when the file exists but exceeds `MAX_DOC_BYTES`. */
  readonly tooLarge?: true;
}

/** Path of the document relative to the project folder, through the clone's `localPath`; `null` if not possible. */
export function docLocalPath(p: Project, repoId: string, docPath: string): string | null {
  const localPath = docRepoOf(p, repoId)?.localPath ?? null;
  if (localPath === null || !isValidLocalPath(localPath)) return null;
  if (!isValidCodePath(docPath)) return null;
  return posix.join(localPath, docPath);
}

/** Reads the external document through the project's clone, confined to the working directory. */
export async function readExternalDoc(
  checker: LocalFileChecker,
  workDir: string,
  projectDir: string,
  relativeToProject: string | null,
): Promise<ExternalDoc> {
  const located = await checker.check(projectDir, relativeToProject);
  if (located.exists !== true || located.localFile === null) {
    return { ...located, text: null };
  }
  const file = resolve(workDir, located.localFile);
  try {
    if ((await stat(file)).size > MAX_DOC_BYTES) {
      return { ...located, text: null, tooLarge: true };
    }
    return { ...located, text: await readFile(file, 'utf8') };
  } catch {
    return { ...located, exists: false, text: null };
  }
}

// ---------------------------------------------------------------------------
// validate_library: does the document exist in the clone?

/** `true` the file is in the clone, `false` it is not, `null` there is no clone to check. */
export type DocChecker = (repo: string, path: string) => Promise<boolean | null>;

async function fileInside(root: string, file: string): Promise<boolean> {
  try {
    const real = await realpath(file);
    return isWithin(root, real) && (await stat(real)).isFile();
  } catch {
    return false;
  }
}

/** Check through the request's clones (`docClones`: repository → folder inside the roots). */
export async function docClonesChecker(
  roots: Roots,
  docClones: Readonly<Record<string, string>> | undefined,
): Promise<DocChecker> {
  const reals = new Map<string, string>();
  for (const [repo, folder] of Object.entries(docClones ?? {})) {
    const { real } = await roots.resolveExisting(folder);
    reals.set(repo, real);
  }
  return async (repo, path) => {
    const root = reals.get(repo);
    if (root === undefined) return null;
    return isValidCodePath(path) ? fileInside(root, join(root, path)) : false;
  };
}

/** Check through the project's `localPath` (`plan_library_update`). */
export function projectDocChecker(
  p: Project,
  checker: LocalFileChecker,
  projectDir: string,
): DocChecker {
  return async (repo, path) => {
    const rel = docLocalPath(p, repo, path);
    if (rel === null) return null;
    return (await checker.check(projectDir, rel)).exists;
  };
}

const unverified = (repo: string, count: number) =>
  count === 1
    ? `1 document of ${repo} not checked (no clone)`
    : `${count} documents of ${repo} not checked (no clone)`;

/**
 * Warnings for the specialization's external documents: one per document that the clone does
 * not have ("document not found in <repo>"; a warning, not an error, because the clone may be on
 * another `ref`) and one per repository without a clone, with the count of unchecked documents.
 */
export async function externalDocWarnings(
  spec: Spec,
  file: string,
  check: DocChecker,
): Promise<LibraryIssue[]> {
  const missing: LibraryIssue[] = [];
  const unchecked = new Map<string, number>();
  for (const [i, layer] of spec.layers.entries()) {
    for (const [j, type] of layer.annotationTypes.entries()) {
      const doc: SpecDocRef | string | undefined = type.doc;
      if (doc === undefined || typeof doc === 'string') continue;
      const found = await check(doc.repo, doc.path);
      if (found === null) unchecked.set(doc.repo, (unchecked.get(doc.repo) ?? 0) + 1);
      else if (!found) {
        missing.push({
          file,
          path: `layers[${i}].annotationTypes[${j}].doc`,
          message: `document not found in ${doc.repo}: ${doc.path}`,
          severity: 'warning',
        });
      }
    }
  }
  const repoIndex = (repo: string) =>
    (spec.docRepos ?? []).findIndex((r) => r.id === repo);
  return [
    ...missing,
    ...[...unchecked].map(([repo, count]) => ({
      file,
      path: repoIndex(repo) < 0 ? 'docRepos' : `docRepos[${repoIndex(repo)}]`,
      message: unverified(repo, count),
      severity: 'warning' as const,
    })),
  ];
}
