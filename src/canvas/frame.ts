// Entradas de um quadro do canvas e o estado de interação que a entrada de
// ponteiro escreve e os renderers leem. Sem Konva: só tipos e funções puras.
import type { Signal } from '@preact/signals';
import type {
  Layer,
  LayerDot,
  Marking,
  MarkingVisibility,
  Placement,
  Project,
  Rect,
} from '../model';
import type { DisplayImage } from '../store/displayImages';
import type { Locale } from '../store/settings';
import type { EditorMode, Selection } from '../store/ui';
import type { MarkingCard } from './renderers/cards';
import type { ReviewCanvas } from './reviewMarks';
import type { CanvasTokens } from './theme';
import type { Size, Viewport } from './viewport';

/** Posição exibida durante um gesto de imagem (segue o dedo, mesmo se inválida). */
export interface ImagePreview {
  readonly imageId: string;
  readonly placement: Placement;
  readonly valid: boolean;
}

/** Alvo de um arrastar-e-soltar de arquivos: área vazia ou uma imagem (será trocada). */
export type DropTarget = { readonly imageId: string | null } | null;

/** Item "pego" pelo segurar-e-mover: recebe o sinal visual até soltar. */
export interface Grabbed {
  readonly kind: 'image' | 'marking';
  readonly id: string;
}

/** Item trancado sob o mouse: recebe o emblema do cadeado enquanto o cursor está nele. */
export type HoverLock = Grabbed;

/** Retângulo sendo desenhado (modo Desenhar), em pixels da imagem. */
export interface Draft {
  readonly imageId: string;
  readonly rect: Rect;
}

/** Estado passageiro dos gestos: escrito pela entrada, desenhado nas sobreposições. */
export interface InteractionState {
  readonly preview: Signal<ImagePreview | null>;
  readonly draft: Signal<Draft | null>;
  readonly grabbed: Signal<Grabbed | null>;
  /** Marcação (ou imagem) com a geometria travada sob o mouse; `null` se não há nenhum ou se ele é livre. */
  readonly hoverLock: Signal<HoverLock | null>;
}

/** Tudo o que um quadro desenha. Mudar qualquer item agenda um novo quadro. */
export interface Frame {
  readonly project: Project | null;
  readonly readOnly: boolean;
  readonly bitmaps: ReadonlyMap<string, DisplayImage<ImageBitmap>>;
  readonly preview: ImagePreview | null;
  readonly draft: Draft | null;
  readonly dropTarget: DropTarget;
  readonly grabbed: Grabbed | null;
  readonly hoverLock: HoverLock | null;
  readonly tokens: CanvasTokens;
  readonly size: Size;
  readonly viewport: Viewport;
  readonly selection: Selection;
  readonly mode: EditorMode;
  readonly semantic: boolean;
  readonly locale: Locale;
  readonly shown: readonly Layer[];
  readonly dots: ReadonlyMap<string, readonly LayerDot[]>;
  readonly incomplete: ReadonlySet<string>;
  readonly visibility: ReadonlyMap<string, MarkingVisibility>;
  readonly card: (marking: Marking) => MarkingCard;
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
/** O que muda as sobreposições (seleção, alças, rascunho, alvo de soltar). */
export const OVERLAY_KEYS = [
  'project',
  'readOnly',
  'preview',
  'draft',
  'dropTarget',
  'grabbed',
  'hoverLock',
  'tokens',
  'selection',
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
