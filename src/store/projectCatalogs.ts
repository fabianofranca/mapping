import { computed, signal, type ReadonlySignal } from '@preact/signals';
import {
  buildCatalog,
  packageDirOf,
  type Catalog,
  type Project,
  type ProjectSpecialization,
} from '../model';
import type { LibraryFile } from '../model/library';
import { reportError } from '../utils/report';
import { createPendingTracker } from './pendingTracker';

// Catalogs (each component's page) of the open project's specializations with a package
// (Library stage, B5). In-memory session state, never the project's, and on demand: nothing
// is read or built until the Catalog window asks (`request`). Whoever knows how to read the
// package (the session's in-memory copy or `specs/<id>/`) hands over the files in `read`.

export interface ProjectCatalog {
  readonly specId: string;
  readonly name: string;
  readonly version: number;
  readonly catalog: Catalog;
}

export interface ProjectCatalogs {
  /** Ready catalogs; `null` until the first requested read finishes. */
  readonly entries: ReadonlySignal<readonly ProjectCatalog[] | null>;
  /** `id@version` of the specializations with a package, joined; empty if none has one. */
  readonly key: ReadonlySignal<string>;
  /** Goes up on every `invalidate`: whoever shows the catalogs asks again. */
  readonly stamp: ReadonlySignal<number>;
  /** Reads and builds what is missing (the same version is not built twice). No cost if nothing changed. */
  request(): void;
  /** The files may have changed outside: the next `request` reads again. */
  invalidate(): void;
  /** Resolves when what was requested has finished (tests). */
  whenIdle(): Promise<void>;
  dispose(): void;
}

export interface ProjectCatalogsDeps {
  /** The committed project (`store.committed`). */
  readonly project: ReadonlySignal<Project | null>;
  /** Package files (paths relative to its folder); `null` if there is nothing to read. */
  readonly read: (owner: ProjectSpecialization) => Promise<readonly LibraryFile[] | null>;
}

const keyOf = (owners: readonly ProjectSpecialization[]): string =>
  owners.map((s) => `${s.id}@${s.version}`).join('|');

export function createProjectCatalogs(deps: ProjectCatalogsDeps): ProjectCatalogs {
  const entries = signal<readonly ProjectCatalog[] | null>(null);
  const stamp = signal(0);
  const { track, whenIdle } = createPendingTracker();
  let doneKey: string | null = null;
  let run = 0;
  let disposed = false;

  const withPackage = (p: Project): ProjectSpecialization[] =>
    p.specializations.filter((s) => s.spec !== null && packageDirOf(s.file) !== null);

  async function loadOwner(
    owner: ProjectSpecialization,
  ): Promise<ProjectCatalog | null | 'failed'> {
    try {
      const files = await deps.read(owner);
      if (files === null) return null;
      const catalog = buildCatalog(files);
      return {
        specId: owner.id,
        name: catalog.spec?.name ?? owner.spec?.name ?? owner.id,
        version: owner.version,
        catalog,
      };
    } catch (error) {
      reportError('catalog.load', error);
      return 'failed';
    }
  }

  async function load(
    owners: readonly ProjectSpecialization[],
    mine: number,
    current: string,
  ) {
    // Lets the interface paint before the synchronous work of building the catalog.
    await Promise.resolve();
    const out: ProjectCatalog[] = [];
    let failed = false;
    for (const owner of owners) {
      const result = await loadOwner(owner);
      if (result === 'failed') failed = true;
      else if (result !== null) out.push(result);
    }
    if (disposed || mine !== run) return;
    // An owner that failed does not mark the key: the next request tries again (decision 16).
    if (failed && doneKey === current) doneKey = null;
    entries.value = out;
  }

  const key = computed(() => {
    const p = deps.project.value;
    return p ? keyOf(withPackage(p)) : '';
  });

  return {
    entries,
    key,
    stamp,
    request() {
      const p = deps.project.peek();
      if (!p || disposed) return;
      const owners = withPackage(p);
      const current = keyOf(owners);
      if (current === doneKey) return;
      doneKey = current;
      run += 1;
      void track(load(owners, run, current));
    },
    invalidate() {
      doneKey = null;
      stamp.value++;
    },
    whenIdle,
    dispose() {
      disposed = true;
      entries.value = null;
    },
  };
}
