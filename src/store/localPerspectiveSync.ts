import { effect } from '@preact/signals';
import { reconcilePerspective, type Perspective, type Project } from '../model';
import type { LocalPerspectiveStore } from '../storage/localPerspectives';
import { reportError } from '../utils/report';
import type { ProjectStore } from './history';
import type { PerspectiveStateHandle } from './perspectives';

// As perspectivas "Só eu" na sessão (etapa #659, PE2): junção com o projeto ao abrir e ao
// recarregar, e a sincronia com o IndexedDB. Na memória elas vivem em `project.perspectives`,
// junto com as "Para todos"; o que as distingue é `PerspectiveState.localIds`.

/** O projeto com as "Só eu" juntas e o conjunto dos ids delas. */
export interface WithLocals {
  readonly project: Project;
  readonly ids: ReadonlySet<string>;
}

/**
 * Junta as "Só eu" ao projeto (no fim da lista). Cada uma passa por `reconcilePerspective` de
 * `before` (o projeto em que ela valia) para `project`: ao abrir, `before === project` (só limpa);
 * numa recarga externa, `before` é o projeto da memória de antes. O id que o arquivo já tem
 * é descartado (vale o do arquivo), e id repetido na lista também.
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
 * O projeto da recarga externa (`loaded`, o que o disco tem) com as "Só eu" da memória
 * (`previous`). Se o arquivo novo é de outro projeto (`project.id` diferente), não junta nada.
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
  /** O que o IndexedDB tinha ao abrir (para só gravar quando a lista de agora difere). */
  readonly initial: readonly Perspective[];
}

export interface LocalSync {
  /** Mantém o id no IndexedDB mesmo fora de `localIds` (a ida ao arquivo ainda não foi gravada). */
  hold(id: string): void;
  /** Solta o `hold`; o IndexedDB passa a refletir só as "Só eu". */
  release(id: string): void;
  /** Grava já (e espera) a lista das "Só eu" com `id` junto. `false` se não gravou. */
  persistIncluding(id: string): Promise<boolean>;
  /** Espera as gravações no IndexedDB que estão na fila. */
  settled(): Promise<void>;
  /** Para de observar e espera a fila. */
  dispose(): Promise<void>;
}

/**
 * Liga o projeto confirmado ao IndexedDB: sempre que a lista das "Só eu" (por identidade dos
 * objetos) muda, grava `save(project.id, lista)`, em fila, sem bloquear. Erro vai para o
 * Diagnóstico e a próxima mudança tenta de novo. Sem a loja (`null`), não faz nada.
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

  /** Enfileira a gravação; diz se deu certo. Falha esquece `lastSaved` para tentar de novo. */
  const write = (list: readonly Perspective[]): Promise<boolean> => {
    if (localStore === null) return Promise.resolve(false);
    lastSaved = list;
    const job = queue.then(() => localStore.save(projectId, list));
    const outcome = job.then(
      () => true,
      () => {
        // O `save` já registrou a falha no Diagnóstico.
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
    // Lê os dois para ser reavaliado; `sync` usa `peek`.
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
