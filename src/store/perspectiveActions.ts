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

// Ações das perspectivas (etapa #659, PE2). Cada uma é uma entrada do desfazer (`store.apply`),
// menos `setPerspectiveLocal`, que mexe em onde a perspectiva mora (arquivo ou navegador) e não
// no projeto. As "Para todos" e as "Só eu" vivem juntas em `project.perspectives`; o Quem vê é o
// conjunto `localIds` do estado.

/** De onde a perspectiva nova começa: a Principal (`null`), vazia ou a cópia de uma (por id). */
export type NewPerspectiveStart = null | 'empty' | string;

export interface NewPerspectiveArgs {
  readonly name: string;
  readonly startFrom: NewPerspectiveStart;
  /** `true` = "Só eu" (fica no navegador); `false` = "Para todos" (vai no `mapping.json`). */
  readonly local: boolean;
  readonly hiddenLayers?: readonly string[];
}

export interface PerspectiveActions {
  /** Cria e devolve o id. `local` sem IndexedDB falha com `local-unavailable`. */
  createPerspective(args: NewPerspectiveArgs): ActionResult<string>;
  renamePerspective(id: string, name: string): ActionResult;
  /** A cópia herda o Quem vê da original. Devolve o id da cópia. */
  duplicatePerspective(id: string, name: string): ActionResult<string>;
  removePerspective(id: string): ActionResult;
  /** Envia raízes; a fonte é a perspectiva aberta (ou a Principal). */
  sendRootsToPerspective(targetId: string, rootIds: readonly string[]): ActionResult;
  removeRootsFromPerspective(id: string, rootIds: readonly string[]): ActionResult;
  setPerspectiveHiddenLayers(id: string, layerIds: readonly string[]): ActionResult;
  /** Tira a marca "Veio de…" da raiz (as chegadas da última operação também). */
  dismissArrival(rootId: string): ActionResult;
  /**
   * Quem vê: `local = false` leva ao `mapping.json` (espera a gravação) e só então tira do
   * navegador; `local = true` grava no navegador primeiro e deixa o arquivo ser regravado sem
   * ela. Não entra no desfazer.
   */
  setPerspectiveLocal(id: string, local: boolean): Promise<ActionResult>;
}

export interface PerspectiveActionDeps {
  readonly store: ProjectStore;
  readonly state: PerspectiveStateHandle;
  readonly newId: () => string;
  readonly setPerspectiveLocal: (id: string, local: boolean) => Promise<ActionResult>;
}

/** A perspectiva-origem de "Começar de": a Principal, vazia ou uma do projeto (por id). */
function startOf(p: Project, startFrom: NewPerspectiveStart): PerspectiveStart {
  if (startFrom === null || startFrom === 'empty') return startFrom;
  return findById(p.perspectives, startFrom);
}

export function createPerspectiveActions(
  deps: PerspectiveActionDeps,
): PerspectiveActions {
  const { store, state, newId } = deps;

  /**
   * Cria a perspectiva `id` com o Quem vê dado: o id entra em `localIds` junto com o projeto
   * (no mesmo lote), para o `mapping.json` nunca chegar a citar uma "Só eu".
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
