import { signal, type Signal } from '@preact/signals';
import type { Rect } from '../model';
import type { Size, Viewport } from './viewport';

// Estado de visualização que a interface lê (barra de status, minimapa e campo de
// zoom): o `CanvasController` escreve aqui, e os componentes só leem. Fica fora do
// projeto e do desfazer, e o cursor é atualizado no máximo uma vez por quadro
// (docs/redesign/HANDOFF.md, seção 6).

/** Posição do ponteiro em pixels da imagem sob ele. */
export interface CanvasCursor {
  readonly imageId: string;
  readonly x: number;
  readonly y: number;
}

export interface CanvasViewState {
  readonly viewport: Signal<Viewport>;
  readonly size: Signal<Size>;
  /** Área ocupada por todas as imagens (unidades do canvas); `null` sem imagens. */
  readonly bounds: Signal<Rect | null>;
  /** Pixel da imagem sob o mouse; `null` fora de qualquer imagem (ou no toque). */
  readonly cursor: Signal<CanvasCursor | null>;
}

export function createCanvasViewState(): CanvasViewState {
  return {
    viewport: signal<Viewport>({ x: 0, y: 0, scale: 1 }),
    size: signal<Size>({ width: 0, height: 0 }),
    bounds: signal<Rect | null>(null),
    cursor: signal<CanvasCursor | null>(null),
  };
}

/** Mesmo cursor (evita escrever o signal a cada quadro parado). */
export function sameCursor(a: CanvasCursor | null, b: CanvasCursor | null): boolean {
  if (a === null || b === null) return a === b;
  return a.imageId === b.imageId && a.x === b.x && a.y === b.y;
}
