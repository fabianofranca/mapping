import {
  deserialize,
  migrations,
  referencedSpecFiles,
  type DeserializeError,
  type DiscardedInherit,
  type DiscardedUrlTemplate,
  type InvariantIssue,
  type Project,
  type RepairedLoad,
} from '../model';
import { mapLimit } from '../utils/mapLimit';
import { reportError } from '../utils/report';
import { FOLDER_CONCURRENCY } from './folderConcurrency';
import { loadLibraryIssues, type LibraryIssues } from './specPackage';
import type { ProjectStorage } from './types';

export type LoadProjectResult =
  | {
      readonly ok: true;
      readonly project: Project;
      /** Version newer than the app's: opens read-only only. */
      readonly readOnly: boolean;
      /** Source version, if the file was migrated. */
      readonly migratedFrom: number | null;
      /** `urlTemplate`s discarded by the migration to schema 11 (empty if there were none). */
      readonly discardedUrlTemplates: readonly DiscardedUrlTemplate[];
      /**
       * Annotations that lost inheritance in the migration to schema 13 (empty if there were none).
       */
      readonly discardedInherit: readonly DiscardedInherit[];
      /** The `mapping.json` as it was in the storage. */
      readonly text: string;
      /**
       * Problems in the library of the specializations applied from a folder (levels 1 and 2), for
       * the Diagnostics. It never blocks opening.
       */
      readonly libraryIssues: LibraryIssues;
    }
  | {
      readonly ok: false;
      readonly error: DeserializeError['code'] | 'not-found';
      /** In `invariant-violation`: the list of problems and the possible repair. */
      readonly inconsistent?: InconsistentLoad;
    };

/** `mapping.json` with inconsistent data, as read (nothing was written). */
export interface InconsistentLoad {
  readonly issues: readonly InvariantIssue[];
  readonly repair: RepairedLoad;
  /** The original `mapping.json`: goes to `backups/` if the repair is accepted. */
  readonly text: string;
}

/**
 * Reads the `mapping.json` and the `specs/` copies it cites and validates everything. Used when
 * opening a project and when reloading it after an external change.
 */
export async function loadProject(storage: ProjectStorage): Promise<LoadProjectResult> {
  const text = await storage.loadMapping();
  if (text === null) return { ok: false, error: 'not-found' };
  const specs = new Map<string, string>();
  const files = referencedSpecFiles(text);
  const copies = await mapLimit(files, FOLDER_CONCURRENCY, (file) =>
    storage.readSpec(file).catch((e: unknown) => {
      reportError('open.readSpec', e);
      return null;
    }),
  );
  files.forEach((file, i) => {
    const spec = copies[i];
    if (spec !== null && spec !== undefined) specs.set(file, spec);
  });
  const result = deserialize(text, migrations, specs);
  if (!result.ok) {
    const { error, repair } = result;
    if (error.code === 'invariant-violation' && repair) {
      return {
        ok: false,
        error: error.code,
        inconsistent: { issues: error.issues, repair, text },
      };
    }
    return { ok: false, error: error.code };
  }
  return {
    ok: true,
    project: result.project,
    readOnly: result.readOnly,
    migratedFrom: result.migratedFrom,
    discardedUrlTemplates: result.discardedUrlTemplates,
    discardedInherit: result.discardedInherit,
    text,
    libraryIssues: await loadLibraryIssues(storage, result.project),
  };
}
