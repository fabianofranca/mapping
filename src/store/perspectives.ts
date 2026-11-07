import { batch, effect, signal, type ReadonlySignal, type Signal } from '@preact/signals';
import { z } from 'zod';
import type { Perspective, Project } from '../model';
import type { RootPlacement } from '../model/perspectivePlace';
import { readSetting, writeSetting } from '../utils/safeStorage';
import type { ProjectStore } from './history';

// Perspectivas na store (etapa #659, PE2). CONTRATO compartilhado pelas frentes da fase:
// a sessão cria o estado (`createPerspectiveState`), as actions do projeto leem a perspectiva
// aberta por `openId()`, a revisão trava a troca e o derivado monta o projeto à vista.
//
// - A perspectiva aberta é estado da UI (não entra no desfazer); `null` = a Principal. Fica
//   guardada neste navegador por `project.id` (localStorage, por `safeStorage`).
// - As "Para todos" e as "Só eu" ficam juntas em `project.perspectives` NA MEMÓRIA (assim o
//   desfazer, os gestos, a reconciliação no assentar e as operações valem para as duas). As
//   "Só eu" são as de id em `localIds`: a sessão as tira do que grava no `mapping.json`
//   (`fileProject`) e as guarda no IndexedDB por `project.id`.

/** Onde a raiz criada fora da Principal foi parar nela (para o aviso dos Detalhes, PE3). */
export interface ArrivalInfo {
  readonly root: string;
  /** A perspectiva de origem. */
  readonly from: string;
  readonly kind: RootPlacement['kind'];
  /** A raiz de referência (`near`/`occupied`), ou `null` na área de chegada. */
  readonly referenceId: string | null;
}

/** Aviso de troca forçada para a Principal. */
export type PerspectiveNotice =
  /** A perspectiva aberta sumiu (apagada aqui, noutro navegador ou numa recarga externa). */
  | { readonly kind: 'removed'; readonly name: string }
  /** A revisão de uma proposta abriu a Principal. */
  | { readonly kind: 'review' };

export interface PerspectiveState {
  /** A perspectiva aberta (`null` = a Principal). Escrever só por `open`. */
  readonly id: ReadonlySignal<string | null>;
  /** O id aberto sem rastrear (para as actions, dentro de operações). */
  openId(): string | null;
  /**
   * Abre a perspectiva (`null` = a Principal). Recusa (devolve `false`) com a troca travada ou
   * um id que o projeto não tem. Não entra no desfazer; guarda a escolha neste navegador.
   */
  open(id: string | null): boolean;
  /** Troca travada (a revisão de uma proposta mostra só a Principal, decisão 12). */
  readonly locked: ReadonlySignal<boolean>;
  /** Trava/destrava a troca. Travar abre a Principal (com o aviso `review` se estava noutra). */
  setLocked(locked: boolean): void;
  /** Último aviso de troca forçada para a Principal; a interface o mostra e o limpa. */
  readonly notice: Signal<PerspectiveNotice | null>;
  /** As chegadas da última operação que criou raízes fora da Principal (vazio se nenhuma). */
  readonly arrivals: Signal<readonly ArrivalInfo[]>;
  /** Ids das perspectivas "Só eu" (as demais de `project.perspectives` são "Para todos"). */
  readonly localIds: ReadonlySignal<ReadonlySet<string>>;
  /** Há IndexedDB para as "Só eu" (sem ele, a opção fica desabilitada, decisão 14). */
  readonly localAvailable: boolean;
}

/** A perspectiva aberta em `p` (`null` = a Principal ou um id que `p` não tem). */
export function openPerspectiveIn(p: Project, id: string | null): Perspective | null {
  if (id === null) return null;
  return p.perspectives.find((x) => x.id === id) ?? null;
}

/** `p` como vai para o arquivo: sem as perspectivas "Só eu" (o mesmo objeto se não há). */
export function fileProject(p: Project, localIds: ReadonlySet<string>): Project {
  if (localIds.size === 0 || !p.perspectives.some((x) => localIds.has(x.id))) return p;
  return { ...p, perspectives: p.perspectives.filter((x) => !localIds.has(x.id)) };
}

// ---------------------------------------------------------------------------
// A perspectiva aberta, guardada neste navegador

const OPEN_KEY = 'mapping.openPerspective';
const OPEN_VERSION = 1;
/** Projetos com a perspectiva aberta guardada (os mais recentes), no molde de `viewMode`. */
const MAX_PROJECTS = 20;

const openSchema = z.object({ id: z.string().min(1), name: z.string() });
type StoredOpen = z.infer<typeof openSchema>;
type OpenBlob = Readonly<Record<string, StoredOpen>>;

/** Lê o blob do `localStorage`; texto corrompido, outra versão ou entrada inválida somem. */
function readOpenBlob(): OpenBlob {
  const text = readSetting(OPEN_KEY);
  if (text === null) return {};
  try {
    const parsed = z
      .object({ v: z.literal(OPEN_VERSION), open: z.record(z.string(), z.unknown()) })
      .safeParse(JSON.parse(text));
    if (!parsed.success) return {};
    const out: Record<string, StoredOpen> = {};
    for (const [scope, value] of Object.entries(parsed.data.open)) {
      const entry = openSchema.safeParse(value);
      if (entry.success) out[scope] = entry.data;
    }
    return out;
  } catch {
    return {};
  }
}

/** Guarda a escolha deste projeto (`null` a apaga: a Principal é o começo). */
function writeOpen(projectId: string, entry: StoredOpen | null): void {
  const others = Object.entries(readOpenBlob()).filter(([key]) => key !== projectId);
  const next = entry === null ? others : [...others, [projectId, entry] as const];
  writeSetting(
    OPEN_KEY,
    JSON.stringify({
      v: OPEN_VERSION,
      open: Object.fromEntries(next.slice(-MAX_PROJECTS)),
    }),
  );
}

// ---------------------------------------------------------------------------
// O estado

/** O estado das perspectivas mais o que a sessão e as actions precisam por dentro. */
export interface PerspectiveStateHandle extends PerspectiveState {
  /** Troca o conjunto das "Só eu" (a sessão, depois de uma recarga externa). */
  setLocalIds(ids: ReadonlySet<string>): void;
  /** Marca/desmarca uma perspectiva como "Só eu". */
  setLocal(id: string, local: boolean): void;
  /** Para de observar o projeto (fechar a sessão). */
  dispose(): void;
}

export interface PerspectiveStateDeps {
  readonly store: ProjectStore;
  /** `project.id` do projeto aberto: chaveia a escolha guardada. */
  readonly projectId: string;
  /** Há IndexedDB para as "Só eu". */
  readonly localAvailable: boolean;
  /** Ids das "Só eu" que a sessão já juntou ao projeto ao abrir. */
  readonly localIds?: ReadonlySet<string>;
}

/** O nome da perspectiva `id` em `p`, ou `null` se `p` não a tem. */
function nameOf(p: Project | null, id: string): string | null {
  return p?.perspectives.find((x) => x.id === id)?.name ?? null;
}

/**
 * Cria o estado das perspectivas de uma sessão. A aberta nasce da escolha guardada para o
 * `project.id` (se a perspectiva sumiu, abre a Principal com o aviso `removed`); um `effect`
 * sobre o projeto confirmado leva à Principal, com o aviso, quem estava numa perspectiva que
 * deixou de existir (apagada aqui, desfeita ou numa recarga externa).
 */
export function createPerspectiveState(
  deps: PerspectiveStateDeps,
): PerspectiveStateHandle {
  const { store, projectId } = deps;
  const openId = signal<string | null>(null);
  const locked = signal(false);
  const notice = signal<PerspectiveNotice | null>(null);
  const arrivals = signal<readonly ArrivalInfo[]>([]);
  const localIds = signal<ReadonlySet<string>>(deps.localIds ?? new Set());
  /** O nome da aberta na última vez que o projeto a teve (para o aviso `removed`). */
  let knownName = '';

  const saved = readOpenBlob()[projectId];
  if (saved !== undefined) {
    const name = nameOf(store.committed.peek(), saved.id);
    if (name !== null) {
      openId.value = saved.id;
      knownName = name;
    } else {
      notice.value = { kind: 'removed', name: saved.name };
      writeOpen(projectId, null);
    }
  }

  const stop = effect(() => {
    const p = store.committed.value;
    const id = openId.peek();
    if (p === null || id === null) return;
    const name = nameOf(p, id);
    if (name === null) {
      batch(() => {
        openId.value = null;
        notice.value = { kind: 'removed', name: knownName };
      });
      writeOpen(projectId, null);
    } else if (name !== knownName) {
      knownName = name;
      writeOpen(projectId, { id, name });
    }
  });

  return {
    id: openId,
    openId: () => openId.peek(),
    open(id) {
      if (locked.peek()) return false;
      if (id !== null) {
        const name = nameOf(store.committed.peek(), id);
        if (name === null) return false;
        knownName = name;
        openId.value = id;
        writeOpen(projectId, { id, name });
        return true;
      }
      openId.value = null;
      knownName = '';
      writeOpen(projectId, null);
      return true;
    },
    locked,
    setLocked(value) {
      batch(() => {
        locked.value = value;
        // Só a escolha em memória muda: a guardada volta quando a revisão acaba e a app reabre.
        if (value && openId.peek() !== null) {
          openId.value = null;
          notice.value = { kind: 'review' };
        }
      });
    },
    notice,
    arrivals,
    localIds,
    localAvailable: deps.localAvailable,
    setLocalIds(ids) {
      localIds.value = ids;
    },
    setLocal(id, local) {
      const next = new Set(localIds.peek());
      if (local) next.add(id);
      else next.delete(id);
      localIds.value = next;
    },
    dispose: stop,
  };
}
