// Entradas de um quadro do canvas e o estado de interação que a entrada de
// ponteiro escreve e os renderers leem. Sem Konva: só tipos e funções puras.
import { signal, type Signal } from '@preact/signals';
import type {
  ComponentDrawings,
  Layer,
  LayerDot,
  MarkingVisibility,
  Placement,
  Project,
  Rect,
} from '../model';
import type { DisplayImage } from '../store/displayImages';
import type { Locale } from '../store/settings';
import type { EditorMode, Selection, SelectionItem } from '../store/ui';
import type { ReviewCanvas } from './reviewMarks';
import type { CanvasTokens } from './theme';
import type { Size, Viewport } from './viewport';

/** Posição exibida durante um gesto de imagem (segue o dedo, mesmo se inválida). */
export interface ImagePreview {
  readonly containerId: string;
  readonly placement: Placement;
  readonly valid: boolean;
}

/** Alvo de um arrastar-e-soltar de arquivos: área vazia ou uma imagem (será trocada). */
export type DropTarget = {
  readonly containerId: string | null;
  /** Marcação (componente com slot) que receberia o item: acende o retângulo dela. */
  readonly markingId?: string;
} | null;

/** Item trancado sob o mouse: recebe o emblema do cadeado enquanto o cursor está nele. */
export interface HoverLock {
  readonly kind: 'image' | 'marking';
  readonly id: string;
}

/**
 * Retângulo sendo desenhado (modo Desenhar): em pixels do container, ou em unidades do canvas
 * (`containerId` nulo) quando o desenho começou no vazio.
 */
export interface Draft {
  readonly containerId: string | null;
  readonly rect: Rect;
}

/** Estado passageiro dos gestos: escrito pela entrada, desenhado nas sobreposições. */
export interface InteractionState {
  readonly preview: Signal<ImagePreview | null>;
  readonly draft: Signal<Draft | null>;
  /** Marcação (ou imagem) com a geometria travada sob o mouse; `null` se não há nenhum ou se ele é livre. */
  readonly hoverLock: Signal<HoverLock | null>;
  /**
   * Marcação desenhada (com componente visível) sob o mouse, para a borda aparecer; `null` se o
   * mouse está fora delas. Só é escrito quando muda e só enquanto há marcações desenhadas.
   */
  readonly hoverMarking: Signal<string | null>;
  /**
   * Container que fica com a marcação arrastada se ela fosse solta agora (a contém ou a recebe
   * pelo encaixe), quando é outro que o de origem: acende como o alvo de soltar um arquivo.
   */
  readonly moveTarget: Signal<string | null>;
  /**
   * Itens que seriam absorvidos se o desenho ou o redimensionamento terminasse agora (acendem),
   * em unidades do canvas. Escrito só quando muda.
   */
  readonly absorb: Signal<readonly Rect[]>;
}

/** Sinais de interação vazios (o canvas e os testes montam o estado por aqui). */
export function createInteractionState(): InteractionState {
  return {
    preview: signal<ImagePreview | null>(null),
    draft: signal<Draft | null>(null),
    hoverLock: signal<HoverLock | null>(null),
    hoverMarking: signal<string | null>(null),
    moveTarget: signal<string | null>(null),
    absorb: signal<readonly Rect[]>([]),
  };
}

/** Tudo o que um quadro desenha. Mudar qualquer item agenda um novo quadro. */
export interface Frame {
  readonly project: Project | null;
  readonly readOnly: boolean;
  readonly bitmaps: ReadonlyMap<string, DisplayImage<ImageBitmap>>;
  readonly preview: ImagePreview | null;
  readonly draft: Draft | null;
  readonly dropTarget: DropTarget;
  /** Itens que o desenho ou o redimensionamento em andamento absorveria (canvas). */
  readonly absorb: readonly Rect[];
  readonly hoverLock: HoverLock | null;
  /** Marcação desenhada sob o mouse (a borda dela aparece); `null` se nenhuma. */
  readonly hoverMarking: string | null;
  readonly tokens: CanvasTokens;
  readonly size: Size;
  readonly viewport: Viewport;
  readonly selection: Selection;
  /**
   * Todos os itens selecionados (seleção múltipla), o primário (`selection`) por último; vazio no
   * Ver limpo, como a seleção. As alças, o cadeado e a etiqueta de nome são só do primário; os
   * demais recebem o contorno de seleção secundário (`overlay.ts`). Mesmo objeto enquanto a
   * seleção não muda: o quadro compara por referência.
   */
  readonly items: readonly SelectionItem[];
  readonly mode: EditorMode;
  readonly locale: Locale;
  readonly shown: readonly Layer[];
  readonly dots: ReadonlyMap<string, readonly LayerDot[]>;
  readonly incomplete: ReadonlySet<string>;
  readonly visibility: ReadonlyMap<string, MarkingVisibility>;
  /**
   * Desenhos dos componentes do projeto desenhado (com a prévia do gesto), por marcação. O
   * canvas compara os objetos por identidade: só o que mudou é refeito.
   */
  readonly drawings: ComponentDrawings;
  /** Marcações cujo desenho está visível (têm borda só em hover e seleção, e sem cartão de texto). */
  readonly drawn: ReadonlySet<string>;
  /** Marcações flutuantes do projeto à vista: o desenho delas fica acima de tudo. */
  readonly floating: ReadonlySet<string>;
  /** Marcas da revisão de uma proposta (etapa 4); `null` fora da revisão. */
  readonly review: ReviewCanvas | null;
}

/** `true` se `a` e `b` têm os mesmos valores (por referência) nas chaves dadas. */
export function sameFrame(
  a: Frame | null,
  b: Frame,
  keys: readonly (keyof Frame)[],
): boolean {
  return a !== null && keys.every((key) => a[key] === b[key]);
}

/** O que muda o desenho das imagens (o deslocamento do viewport não muda). */
export const IMAGE_KEYS = ['project', 'bitmaps', 'preview', 'tokens', 'locale'] as const;
/** O que muda a camada de componentes (as posições das imagens também, comparadas à parte). */
export const COMPONENT_KEYS = ['drawings', 'drawn', 'floating', 'tokens'] as const;
/** O que muda as sobreposições (seleção, alças, rascunho, alvo de soltar). */
export const OVERLAY_KEYS = [
  'project',
  'readOnly',
  'preview',
  'draft',
  'dropTarget',
  'absorb',
  'hoverLock',
  'tokens',
  'selection',
  'items',
  'mode',
] as const;

/** Parte do canvas visível na tela, em coordenadas do canvas. */
export function visibleArea(size: Size, vp: Viewport): Rect {
  return {
    x: -vp.x / vp.scale,
    y: -vp.y / vp.scale,
    width: size.width / vp.scale,
    height: size.height / vp.scale,
  };
}

export const requestFrame: (callback: () => void) => number =
  typeof requestAnimationFrame === 'function'
    ? (callback) => requestAnimationFrame(callback)
    : (callback) => window.setTimeout(callback, 16);
export const cancelFrame: (id: number) => void =
  typeof cancelAnimationFrame === 'function'
    ? (id) => cancelAnimationFrame(id)
    : (id) => window.clearTimeout(id);
