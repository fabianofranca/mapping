import { batch } from '@preact/signals';
import {
  addPerspective,
  buildPerspective,
  duplicatePerspective,
  removePerspective,
  removeRootsFromPerspective,
  renamePerspective,
  sendRootsToPerspective,
  setPerspectiveHiddenLayers,
  type Perspective,
  type PerspectiveStart,
  type Project,
} from '../model';
import { findById } from '../model/project';
import type { ActionResult, ProjectStore } from './history';
import { openPerspectiveIn, type PerspectiveStateHandle } from './perspectives';

// Perspective actions (stage #659, PE2). Each one is an undo entry (`store.apply`),
// except `setPerspectiveLocal`, which changes where the perspective lives (file or browser) and not
// the project. The "For everyone" and the "Only me" ones live together in `project.perspectives`;
// "Who sees" is the
// `localIds` set of the state.

/**
 * Where the new perspective starts from: the Main one (`null`), an empty one or a copy of one (by
 * id).
 */
export type NewPerspectiveStart = null | 'empty' | string;

export interface NewPerspectiveArgs {
  readonly name: string;
  readonly startFrom: NewPerspectiveStart;
  /**
   * `true` = "Only me" (stays in the browser); `false` = "For everyone" (goes in the
   * `mapping.json`).
   */
  readonly local: boolean;
  readonly hiddenLayers?: readonly string[];
}

export interface PerspectiveActions {
  /** Creates and returns the id. `local` without IndexedDB fails with `local-unavailable`. */
  createPerspective(args: NewPerspectiveArgs): ActionResult<string>;
  renamePerspective(id: string, name: string): ActionResult;
  /** The copy inherits the original's Who sees. Returns the copy's id. */
  duplicatePerspective(id: string, name: string): ActionResult<string>;
  removePerspective(id: string): ActionResult;
  /** Sends roots; the source is the open perspective (or the Main one). */
  sendRootsToPerspective(targetId: string, rootIds: readonly string[]): ActionResult;
  removeRootsFromPerspective(id: string, rootIds: readonly string[]): ActionResult;
  setPerspectiveHiddenLayers(id: string, layerIds: readonly string[]): ActionResult;
  /** Removes the "Came from…" mark from the root (the arrivals of the last operation too). */
  dismissArrival(rootId: string): ActionResult;
  /**
   * Who sees: `local = false` takes it to the `mapping.json` (waits for the write) and only then
   * removes it from the browser; `local = true` writes to the browser first and lets the file be
   * rewritten without it. It does not enter undo.
   */
  setPerspectiveLocal(id: string, local: boolean): Promise<ActionResult>;
}

export interface PerspectiveActionDeps {
  readonly store: ProjectStore;
  readonly state: PerspectiveStateHandle;
  readonly newId: () => string;
  readonly setPerspectiveLocal: (id: string, local: boolean) => Promise<ActionResult>;
}

/**
 * The source perspective of "Start from": the Main one, an empty one or one of the project (by id).
 */
function startOf(p: Project, startFrom: NewPerspectiveStart): PerspectiveStart {
  if (startFrom === null || startFrom === 'empty') return startFrom;
  return findById(p.perspectives, startFrom);
}

export function createPerspectiveActions(
  deps: PerspectiveActionDeps,
): PerspectiveActions {
  const { store, state, newId } = deps;

  /**
   * Creates the perspective `id` with the given Who sees: the id enters `localIds` together with
   * the project (in the same batch), so the `mapping.json` never ends up citing an "Only me".
   */
  const applyNew = (
    id: string,
    local: boolean,
    op: (p: Project) => Project,
  ): ActionResult<string> => {
    if (local && !state.localAvailable) return { ok: false, error: 'local-unavailable' };
    const result = batch((): ActionResult => {
      if (local) state.setLocal(id, true);
      const applied = store.apply(op);
      if (!applied.ok && local) state.setLocal(id, false);
      return applied;
    });
    return result.ok ? { ok: true, value: id } : result;
  };

  return {
    createPerspective(args) {
      const id = newId();
      return applyNew(id, args.local, (p) => {
        const perspective: Perspective = buildPerspective(p, {
          id,
          name: args.name,
          startFrom: startOf(p, args.startFrom),
          ...(args.hiddenLayers === undefined ? {} : { hiddenLayers: args.hiddenLayers }),
        });
        return addPerspective(p, perspective);
      });
    },

    renamePerspective: (id, name) => store.apply((p) => renamePerspective(p, id, name)),

    duplicatePerspective(id, name) {
      const copyId = newId();
      return applyNew(copyId, state.localIds.peek().has(id), (p) =>
        duplicatePerspective(p, id, copyId, name),
      );
    },

    removePerspective: (id) => store.apply((p) => removePerspective(p, id)),

    sendRootsToPerspective: (targetId, rootIds) =>
      store.apply((p) =>
        sendRootsToPerspective(
          p,
          targetId,
          rootIds,
          openPerspectiveIn(p, state.openId()),
        ),
      ),

    removeRootsFromPerspective: (id, rootIds) =>
      store.apply((p) => removeRootsFromPerspective(p, id, rootIds)),

    setPerspectiveHiddenLayers: (id, layerIds) =>
      store.apply((p) => setPerspectiveHiddenLayers(p, id, layerIds)),

    dismissArrival(rootId) {
      const result = store.apply((p) =>
        p.arrivals.some((a) => a.root === rootId)
          ? { ...p, arrivals: p.arrivals.filter((a) => a.root !== rootId) }
          : p,
      );
      if (result.ok) {
        state.arrivals.value = state.arrivals.peek().filter((a) => a.root !== rootId);
      }
      return result;
    },

    setPerspectiveLocal: deps.setPerspectiveLocal,
  };
}
