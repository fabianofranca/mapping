import { batch, computed, signal, type ReadonlySignal } from '@preact/signals';
import { ModelError, type ModelErrorCode } from '../model/errors';
import { touchProject } from '../model/project';
import type { Project } from '../model/types';

/** Limite de entradas na pilha de desfazer. */
export const HISTORY_LIMIT = 100;

/** Operação pura aplicada ao projeto (ver `src/model/`). */
export type Operation = (p: Project) => Project;

export type StoreErrorCode =
  ModelErrorCode | 'no-project' | 'read-only' | 'gesture-active';

export type ActionResult<T = void> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: StoreErrorCode };

export interface ProjectStoreDeps {
  /** Data ISO usada em `project.updatedAt`. */
  readonly now?: () => string;
}

export interface LoadOptions {
  readonly readOnly?: boolean;
}

/**
 * Estado do projeto (o que vai para o JSON) com desfazer/refazer.
 * O histórico é uma pilha de snapshots imutáveis. Estado de UI não entra aqui.
 */
export interface ProjectStore {
  /** Projeto atual, com a prévia do gesto em andamento (lido pelo canvas, para a geometria). */
  readonly project: ReadonlySignal<Project | null>;
  /**
   * Projeto sem as prévias de gesto: fora de um gesto é o mesmo objeto de `project`;
   * durante o gesto fica no projeto do início e só muda no `commitGesture`/`cancelGesture`.
   * A interface e o estado derivado leem este, para não renderizar a cada `pointermove`.
   */
  readonly committed: ReadonlySignal<Project | null>;
  readonly readOnly: ReadonlySignal<boolean>;
  readonly canUndo: ReadonlySignal<boolean>;
  readonly canRedo: ReadonlySignal<boolean>;
  /** Incrementa a cada alteração do projeto (útil para o salvamento automático). */
  readonly revision: ReadonlySignal<number>;
  readonly gestureActive: ReadonlySignal<boolean>;

  /**
   * Arquivos de imagem referenciados pelo projeto atual ou por qualquer
   * snapshot do histórico (desfazer/refazer/gesto). Quem guarda o conteúdo de
   * imagens removidas só precisa dele enquanto o arquivo estiver neste conjunto.
   */
  referencedImageFiles(): ReadonlySet<string>;

  load(project: Project, options?: LoadOptions): void;
  close(): void;
  /** Aplica a operação e cria uma entrada no histórico. */
  apply(op: Operation): ActionResult;
  undo(): boolean;
  redo(): boolean;

  /** Começa um gesto (arrastar/redimensionar): as prévias não entram no histórico. */
  beginGesture(): ActionResult;
  /**
   * Prévia do gesto: aplica `op` ao projeto do início do gesto. Se a operação
   * falhar, o projeto fica na última prévia válida.
   */
  updateGesture(op: Operation): ActionResult;
  /** Termina o gesto gerando uma única entrada no histórico (se algo mudou). */
  commitGesture(): void;
  /** Descarta o gesto e volta ao projeto do início dele. */
  cancelGesture(): void;
}

function run(op: Operation, p: Project): ActionResult<Project> {
  try {
    return { ok: true, value: op(p) };
  } catch (e) {
    if (e instanceof ModelError) return { ok: false, error: e.code };
    throw e;
  }
}

export function createProjectStore(deps: ProjectStoreDeps = {}): ProjectStore {
  const now = deps.now ?? (() => new Date().toISOString());

  const project = signal<Project | null>(null);
  const readOnly = signal(false);
  const past = signal<readonly Project[]>([]);
  const future = signal<readonly Project[]>([]);
  const revision = signal(0);
  /** Projeto no início do gesto em andamento; `null` quando não há gesto. */
  const gestureBase = signal<Project | null>(null);

  const guard = (): ActionResult<Project> => {
    const current = project.value;
    if (!current) return { ok: false, error: 'no-project' };
    if (readOnly.value) return { ok: false, error: 'read-only' };
    return { ok: true, value: current };
  };

  const commit = (before: Project, after: Project) => {
    past.value = [...past.value, before].slice(-HISTORY_LIMIT);
    future.value = [];
    project.value = touchProject(after, now());
    revision.value++;
  };

  const committed = computed(() => gestureBase.value ?? project.value);

  return {
    project,
    committed,
    readOnly,
    revision,
    canUndo: computed(() => past.value.length > 0 && gestureBase.value === null),
    canRedo: computed(() => future.value.length > 0 && gestureBase.value === null),
    gestureActive: computed(() => gestureBase.value !== null),

    referencedImageFiles() {
      const files = new Set<string>();
      // Snapshots vizinhos costumam compartilhar o mesmo array de imagens.
      const seen = new Set<readonly unknown[]>();
      const collect = (p: Project | null) => {
        if (!p || seen.has(p.images)) return;
        seen.add(p.images);
        for (const image of p.images) files.add(image.file);
      };
      collect(project.peek());
      collect(gestureBase.peek());
      for (const p of past.peek()) collect(p);
      for (const p of future.peek()) collect(p);
      return files;
    },

    load(p, options = {}) {
      batch(() => {
        project.value = p;
        readOnly.value = options.readOnly ?? false;
        past.value = [];
        future.value = [];
        gestureBase.value = null;
        revision.value = 0;
      });
    },

    close() {
      batch(() => {
        project.value = null;
        readOnly.value = false;
        past.value = [];
        future.value = [];
        gestureBase.value = null;
      });
    },

    apply(op) {
      if (gestureBase.value) return { ok: false, error: 'gesture-active' };
      const current = guard();
      if (!current.ok) return current;
      const result = run(op, current.value);
      if (!result.ok) return result;
      if (result.value !== current.value) commit(current.value, result.value);
      return { ok: true, value: undefined };
    },

    undo() {
      const previous = past.value.at(-1);
      const current = project.value;
      if (!previous || !current || gestureBase.value || readOnly.value) return false;
      past.value = past.value.slice(0, -1);
      future.value = [current, ...future.value];
      project.value = touchProject(previous, now());
      revision.value++;
      return true;
    },

    redo() {
      const [next, ...rest] = future.value;
      const current = project.value;
      if (!next || !current || gestureBase.value || readOnly.value) return false;
      future.value = rest;
      past.value = [...past.value, current].slice(-HISTORY_LIMIT);
      project.value = touchProject(next, now());
      revision.value++;
      return true;
    },

    beginGesture() {
      if (gestureBase.value) return { ok: false, error: 'gesture-active' };
      const current = guard();
      if (!current.ok) return current;
      gestureBase.value = current.value;
      return { ok: true, value: undefined };
    },

    updateGesture(op) {
      const base = gestureBase.value;
      if (!base) return { ok: false, error: 'no-project' };
      const result = run(op, base);
      if (!result.ok) return result;
      project.value = result.value;
      return { ok: true, value: undefined };
    },

    commitGesture() {
      const base = gestureBase.value;
      const current = project.value;
      // Em lote: `committed` passa direto do projeto do início para o final.
      batch(() => {
        gestureBase.value = null;
        if (base && current && current !== base) commit(base, current);
      });
    },

    cancelGesture() {
      const base = gestureBase.value;
      batch(() => {
        gestureBase.value = null;
        if (base) project.value = base;
      });
    },
  };
}
