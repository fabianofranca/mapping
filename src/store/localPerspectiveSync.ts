import { effect } from '@preact/signals';
import { reconcilePerspective, type Perspective, type Project } from '../model';
import type { LocalPerspectiveStore } from '../storage/localPerspectives';
import { reportError } from '../utils/report';
import type { ProjectStore } from './history';
import type { PerspectiveStateHandle } from './perspectives';

// The "Only me" perspectives in the session (stage #659, PE2): merging with the project on open and
// on reload, and syncing with IndexedDB. In memory they live in `project.perspectives`,
// together with the "For everyone" ones; what tells them apart is `PerspectiveState.localIds`.

/** The project with the "Only me" ones merged in and the set of their ids. */
export interface WithLocals {
  readonly project: Project;
  readonly ids: ReadonlySet<string>;
}

/**
 * Merges the "Only me" ones into the project (at the end of the list). Each one goes through
 * `reconcilePerspective` from
 * `before` (the project it was valid in) to `project`: on open, `before === project` (it only
 * cleans); on an external reload, `before` is the in-memory project from before. An id the file
 * already has is discarded (the file's wins), and so is an id repeated in the list.
 */
export function mergeLocalPerspectives(
  project: Project,
  locals: readonly Perspective[],
  before: Project,
): WithLocals {
  const seen = new Set(project.perspectives.map((x) => x.id));
  const ids = new Set<string>();
  const merged: Perspective[] = [];
  for (const x of locals) {
    if (seen.has(x.id)) continue;
    seen.add(x.id);
    ids.add(x.id);
    merged.push(reconcilePerspective(before, project, x));
  }
  if (merged.length === 0) return { project, ids };
  return {
    project: { ...project, perspectives: [...project.perspectives, ...merged] },
    ids,
  };
}

/**
 * The project of the external reload (`loaded`, what the disk has) with the in-memory "Only me"
 * ones (`previous`). If the new file is from another project (different `project.id`), it merges
 * nothing.
 */
export function carryLocalPerspectives(
  previous: Project | null,
  loaded: Project,
  localIds: ReadonlySet<string>,
): WithLocals {
  if (previous === null || previous.project.id !== loaded.project.id) {
    return { project: loaded, ids: new Set() };
  }
  const locals = previous.perspectives.filter((x) => localIds.has(x.id));
  return mergeLocalPerspectives(loaded, locals, previous);
}

function sameList(a: readonly Perspective[] | null, b: readonly Perspective[]): boolean {
  return a !== null && a.length === b.length && a.every((x, i) => x === b[i]);
}

export interface LocalSyncDeps {
  readonly store: ProjectStore;
  readonly state: PerspectiveStateHandle;
  readonly localStore: LocalPerspectiveStore | null;
  readonly projectId: string;
  /** What IndexedDB had on open (to write only when the current list differs). */
  readonly initial: readonly Perspective[];
}

export interface LocalSync {
  /**
   * Keeps the id in IndexedDB even outside `localIds` (the trip to the file is not yet written).
   */
  hold(id: string): void;
  /** Releases the `hold`; IndexedDB now reflects only the "Only me" ones. */
  release(id: string): void;
  /**
   * Writes now (and waits for) the "Only me" list with `id` included. `false` if it did not write.
   */
  persistIncluding(id: string): Promise<boolean>;
  /** Waits for the IndexedDB writes that are in the queue. */
  settled(): Promise<void>;
  /** Stops watching and waits for the queue. */
  dispose(): Promise<void>;
}

/**
 * Connects the confirmed project to IndexedDB: whenever the "Only me" list (by identity of the
 * objects) changes, it writes `save(project.id, list)`, queued, without blocking. An error goes to
 * the Diagnostics and the next change tries again. Without the store (`null`), it does nothing.
 */
export function attachLocalSync(deps: LocalSyncDeps): LocalSync {
  const { store, state, localStore, projectId } = deps;
  const held = new Set<string>();
  let lastSaved: readonly Perspective[] | null = deps.initial;
  let queue: Promise<unknown> = Promise.resolve();

  const listOf = (p: Project, extra?: string) =>
    p.perspectives.filter(
      (x) => state.localIds.peek().has(x.id) || held.has(x.id) || x.id === extra,
    );

  /** Queues the write; says whether it worked. A failure forgets `lastSaved` to try again. */
  const write = (list: readonly Perspective[]): Promise<boolean> => {
    if (localStore === null) return Promise.resolve(false);
    lastSaved = list;
    const job = queue.then(() => localStore.save(projectId, list));
    const outcome = job.then(
      () => true,
      () => {
        // `save` already recorded the failure in the Diagnostics.
        if (lastSaved === list) lastSaved = null;
        return false;
      },
    );
    queue = outcome;
    return outcome;
  };

  const sync = () => {
    const p = store.committed.peek();
    if (!p || localStore === null) return;
    const list = listOf(p);
    if (!sameList(lastSaved, list)) void write(list);
  };

  const stop = effect(() => {
    // Reads both to be reevaluated; `sync` uses `peek`.
    void store.committed.value;
    void state.localIds.value;
    sync();
  });

  return {
    hold: (id) => void held.add(id),
    release(id) {
      held.delete(id);
      sync();
    },
    persistIncluding(id) {
      const p = store.committed.peek();
      if (!p) return Promise.resolve(false);
      return write(listOf(p, id));
    },
    async settled() {
      await queue;
    },
    async dispose() {
      stop();
      await queue.catch((e: unknown) => reportError('perspectives.sync', e));
    },
  };
}
