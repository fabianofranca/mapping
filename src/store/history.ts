import { batch, computed, signal, type ReadonlySignal } from '@preact/signals';
import { ModelError, type ModelErrorCode } from '../model/errors';
import { touchProject } from '../model/project';
import type { Project } from '../model/types';
import { reportError } from '../utils/report';

/** Limite de entradas na pilha de desfazer. */
export const HISTORY_LIMIT = 100;

/** Operação pura aplicada ao projeto (ver `src/model/`). */
export type Operation = (p: Project) => Project;

export type StoreErrorCode =
  | ModelErrorCode
  | 'no-project'
  | 'read-only'
  | 'gesture-active'
  | 'reviewing'
  // Perspectivas "Só eu" (#659): sem IndexedDB, ou a gravação nele falhou.
  | 'local-unavailable'
  // Perspectivas: levar uma "Só eu" ao arquivo não gravou o `mapping.json`.
  | 'save-failed'
  // Perspectivas: comando que só vale na Principal (desenhar no canvas, rota de seta, arrumar, excluir raiz).
  | 'principal-only';

/**
 * Efeito fora do projeto ligado a uma entrada do histórico: aplicar as aceitas
 * de uma proposta também marca a proposta como aplicada, e desfazer/refazer essa entrada
 * precisa desfazer/refazer isso junto. `tag` identifica o dono (o id da proposta). Uma
 * entrada com `link` nasce da revisão, então passa pelo bloqueio de somente leitura dela.
 */
export interface HistoryLink {
  readonly tag: string;
  /**
   * Desfazer/refazer o efeito. A promessa traz o resultado da gravação: enquanto está
   * pendente o histórico fica parado, e uma falha reverte o passo. Sem promessa (efeito
   * síncrono), vale como sucesso.
   */
  readonly undo: () => Promise<LinkResult> | undefined;
  readonly redo: () => Promise<LinkResult> | undefined;
}

export type LinkResult =
  { readonly ok: true } | { readonly ok: false; readonly error: string };

/** A última falha de um vínculo (o passo foi revertido); `seq` distingue falhas iguais seguidas. */
export interface LinkFailure {
  readonly seq: number;
  readonly error: string;
}

export interface ApplyOptions {
  readonly link?: HistoryLink;
}

/** Uma entrada do histórico: o projeto de antes da transição e o efeito dela. */
interface Frame {
  readonly project: Project;
  readonly link: HistoryLink | null;
}

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
   * Revisão de uma proposta aberta (etapa 4): o projeto fica somente leitura, e só as
   * entradas ligadas à proposta aberta (`ApplyOptions.link`, com `link.tag` igual ao id
   * dela) podem ser aplicadas, desfeitas e refeitas.
   */
  readonly reviewing: ReadonlySignal<boolean>;
  /**
   * Edição bloqueada por qualquer motivo: somente leitura ou revisão aberta. A interface
   * usa este para desabilitar o que seria recusado (desenhar, adicionar imagens, travar…).
   */
  readonly locked: ReadonlySignal<boolean>;
  /** Falha da gravação ao desfazer/refazer uma aplicação; a interface mostra o erro. */
  readonly linkFailure: ReadonlySignal<LinkFailure | null>;

  /**
   * Arquivos de imagem referenciados pelo projeto atual ou por qualquer
   * snapshot do histórico (desfazer/refazer/gesto). Quem guarda o conteúdo de
   * imagens removidas só precisa dele enquanto o arquivo estiver neste conjunto.
   */
  referencedImageFiles(): ReadonlySet<string>;

  load(project: Project, options?: LoadOptions): void;
  close(): void;
  /** Liga a revisão da proposta de id `tag`, ou a desliga com `null`. */
  setReviewing(tag: string | null): void;
  /** Aplica a operação e cria uma entrada no histórico. */
  apply(op: Operation, options?: ApplyOptions): ActionResult;
  /**
   * Descarta o "refazer" se alguma entrada dele tem o efeito de `tag`: a proposta mudou
   * depois do desfazer, então refazer deixaria projeto e proposta em desacordo.
   */
  discardRedoOf(tag: string): void;
  /**
   * Tira o vínculo (`HistoryLink`) de `tag` de todas as entradas, do desfazer e do refazer:
   * a proposta foi apagada, então desfazer e refazer só mexem no projeto. As entradas ficam.
   */
  detachLinks(tag: string): void;
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
  const past = signal<readonly Frame[]>([]);
  const future = signal<readonly Frame[]>([]);
  const reviewTag = signal<string | null>(null);
  const reviewing = computed(() => reviewTag.value !== null);
  const revision = signal(0);
  /** Há um desfazer/refazer de vínculo esperando a gravação: o histórico fica parado. */
  const linkPending = signal(false);
  const linkFailure = signal<LinkFailure | null>(null);
  let linkSeq = 0;
  /** Projeto no início do gesto em andamento; `null` quando não há gesto. */
  const gestureBase = signal<Project | null>(null);

  const guard = (fromReview = false): ActionResult<Project> => {
    const current = project.value;
    if (!current) return { ok: false, error: 'no-project' };
    if (readOnly.value) return { ok: false, error: 'read-only' };
    if (reviewing.value && !fromReview) return { ok: false, error: 'reviewing' };
    return { ok: true, value: current };
  };

  /**
   * Roda o efeito do vínculo. Assíncrono: o histórico para até a gravação terminar; se
   * falha, `revert` devolve o passo (só se nada mais mudou o projeto desde então).
   */
  const runLink = (run: () => Promise<LinkResult> | undefined, revert: () => void) => {
    let pending: Promise<LinkResult> | undefined;
    try {
      pending = run();
    } catch (e) {
      // Falha síncrona: igual à assíncrona, devolve o passo e deixa o erro à vista.
      reportError('history.link', e);
      batch(() => {
        revert();
        linkFailure.value = { seq: ++linkSeq, error: 'failed' };
      });
      return;
    }
    if (!pending) return;
    const token = ++linkSeq;
    const stepped = project.peek();
    linkPending.value = true;
    const settle = (result: LinkResult) => {
      batch(() => {
        if (token === linkSeq) linkPending.value = false;
        if (result.ok) return;
        if (project.peek() === stepped) revert();
        linkFailure.value = { seq: token, error: result.error };
      });
    };
    pending.then(settle, (e: unknown) => {
      reportError('history.link', e);
      settle({ ok: false, error: 'failed' });
    });
  };

  const commit = (before: Project, after: Project, link: HistoryLink | null = null) => {
    batch(() => {
      past.value = [...past.value, { project: before, link }].slice(-HISTORY_LIMIT);
      future.value = [];
      project.value = touchProject(after, now());
      revision.value++;
    });
  };

  const committed = computed(() => gestureBase.value ?? project.value);

  return {
    project,
    committed,
    readOnly,
    revision,
    canUndo: computed(() => {
      const top = past.value.at(-1);
      return (
        top !== undefined &&
        !linkPending.value &&
        gestureBase.value === null &&
        (reviewTag.value === null || top.link?.tag === reviewTag.value)
      );
    }),
    canRedo: computed(() => {
      const top = future.value[0];
      return (
        top !== undefined &&
        !linkPending.value &&
        gestureBase.value === null &&
        (reviewTag.value === null || top.link?.tag === reviewTag.value)
      );
    }),
    gestureActive: computed(() => gestureBase.value !== null),
    reviewing,
    locked: computed(() => readOnly.value || reviewing.value),
    linkFailure,

    referencedImageFiles() {
      const files = new Set<string>();
      // Snapshots vizinhos costumam compartilhar o mesmo array de imagens.
      const seen = new Set<readonly unknown[]>();
      const collect = (p: Project | null) => {
        if (!p || seen.has(p.containers)) return;
        seen.add(p.containers);
        for (const image of p.containers) if (image.file !== null) files.add(image.file);
      };
      collect(project.peek());
      collect(gestureBase.peek());
      for (const frame of past.peek()) collect(frame.project);
      for (const frame of future.peek()) collect(frame.project);
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
        linkPending.value = false;
      });
    },

    close() {
      batch(() => {
        project.value = null;
        readOnly.value = false;
        reviewTag.value = null;
        past.value = [];
        future.value = [];
        gestureBase.value = null;
        linkPending.value = false;
      });
    },

    setReviewing(tag) {
      reviewTag.value = tag;
    },

    apply(op, options = {}) {
      if (gestureBase.value) return { ok: false, error: 'gesture-active' };
      const link = options.link ?? null;
      const current = guard(link !== null);
      if (!current.ok) return current;
      const result = run(op, current.value);
      if (!result.ok) return result;
      if (result.value !== current.value) commit(current.value, result.value, link);
      return { ok: true, value: undefined };
    },

    discardRedoOf(tag) {
      if (future.value.some((frame) => frame.link?.tag === tag)) future.value = [];
    },

    detachLinks(tag) {
      const detach = (frames: readonly Frame[]): readonly Frame[] =>
        frames.some((frame) => frame.link?.tag === tag)
          ? frames.map((frame) =>
              frame.link?.tag === tag ? { project: frame.project, link: null } : frame,
            )
          : frames;
      past.value = detach(past.value);
      future.value = detach(future.value);
    },

    undo() {
      const previous = past.value.at(-1);
      const current = project.value;
      if (!previous || !current || gestureBase.value || readOnly.value) return false;
      if (linkPending.value) return false;
      if (reviewTag.value !== null && previous.link?.tag !== reviewTag.value)
        return false;
      batch(() => {
        past.value = past.value.slice(0, -1);
        future.value = [{ project: current, link: previous.link }, ...future.value];
        project.value = touchProject(previous.project, now());
        revision.value++;
      });
      const link = previous.link;
      if (link) {
        runLink(link.undo, () => {
          past.value = [...past.value, previous].slice(-HISTORY_LIMIT);
          future.value = future.value.slice(1);
          project.value = current;
          revision.value++;
        });
      }
      return true;
    },

    redo() {
      const [next, ...rest] = future.value;
      const current = project.value;
      if (!next || !current || gestureBase.value || readOnly.value) return false;
      if (linkPending.value) return false;
      if (reviewTag.value !== null && next.link?.tag !== reviewTag.value) return false;
      batch(() => {
        future.value = rest;
        past.value = [...past.value, { project: current, link: next.link }].slice(
          -HISTORY_LIMIT,
        );
        project.value = touchProject(next.project, now());
        revision.value++;
      });
      const link = next.link;
      if (link) {
        runLink(link.redo, () => {
          past.value = past.value.slice(0, -1);
          future.value = [next, ...future.value];
          project.value = current;
          revision.value++;
        });
      }
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
