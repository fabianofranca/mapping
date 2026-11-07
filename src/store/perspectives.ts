import type { ReadonlySignal, Signal } from '@preact/signals';
import type { Perspective, Project } from '../model';
import type { RootPlacement } from '../model/perspectivePlace';

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
