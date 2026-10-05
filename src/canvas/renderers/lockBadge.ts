// Emblema do cadeado: um quadrado com o cadeado no canto superior direito de um item
// trancado (o selecionado e o que está sob o mouse). Tamanho fixo em px de tela, na
// escala inversa do zoom, como a etiqueta do nome.
import Konva from 'konva/lib/Core';
import { Path as KonvaPath } from 'konva/lib/shapes/Path';
import { Rect as KonvaRect } from 'konva/lib/shapes/Rect';
import type { Rect } from '../../model';
import { LOCK_PATHS } from '../../utils/lockGlyph';
import type { CanvasTokens } from '../theme';
import { HALO_WIDTH, LOCK_BADGE_GAP, LOCK_GLYPH_GRID, LOCK_GLYPH_RATIO } from './metrics';

/** Espessura do traço do cadeado, na grade de 16 unidades do ícone. */
const GLYPH_STROKE = 1.25;

/**
 * Onde o emblema fica (canto superior esquerdo, em unidades do canvas). Em itens
 * grandes, por dentro do canto superior direito, ancorado na parte visível; em itens
 * pequenos, por fora, acima do canto (ou abaixo, sem espaço acima na tela).
 */
export function lockBadgeSpot(
  rect: Rect,
  view: Rect,
  zoom: number,
  size: number,
): { readonly x: number; readonly y: number } {
  const side = size / zoom;
  const gap = LOCK_BADGE_GAP / zoom;
  const small = rect.width * zoom < 2 * size || rect.height * zoom < 2 * size;
  if (!small) {
    const right = Math.min(rect.x + rect.width, view.x + view.width);
    const top = Math.max(rect.y, view.y);
    return { x: right - side - gap, y: top + gap };
  }
  const above = rect.y - side - gap;
  return {
    x: rect.x + rect.width - side,
    y: above >= view.y ? above : rect.y + rect.height + gap,
  };
}

export class LockBadge {
  readonly group = new Konva.Group({ visible: false });
  private readonly box = new KonvaRect();
  private readonly glyph = new Konva.Group();

  constructor() {
    this.glyph.add(
      ...LOCK_PATHS.map(
        (data) => new KonvaPath({ data, lineCap: 'round', lineJoin: 'round' }),
      ),
    );
    this.group.add(this.box, this.glyph);
  }

  hide(): void {
    this.group.visible(false);
  }

  /** Mostra o emblema para o item em `rect` (canvas); `dimmed` esmaece o cadeado herdado do pai. */
  show(
    rect: Rect,
    view: Rect,
    zoom: number,
    tokens: CanvasTokens,
    dimmed: boolean,
  ): void {
    const { size, fill, glyph } = tokens.lock;
    const spot = lockBadgeSpot(rect, view, zoom, size);
    this.group.setAttrs({
      visible: true,
      x: spot.x,
      y: spot.y,
      scaleX: 1 / zoom,
      scaleY: 1 / zoom,
      opacity: dimmed ? tokens.opacity.inherited : 1,
    });
    this.box.setAttrs({
      width: size,
      height: size,
      fill,
      stroke: tokens.halo,
      strokeWidth: HALO_WIDTH,
      cornerRadius: tokens.radius.sm,
    });
    const scale = (size * LOCK_GLYPH_RATIO) / LOCK_GLYPH_GRID;
    const offset = (size * (1 - LOCK_GLYPH_RATIO)) / 2;
    this.glyph.setAttrs({ x: offset, y: offset, scaleX: scale, scaleY: scale });
    for (const path of this.glyph.getChildren()) {
      path.setAttrs({ stroke: glyph, strokeWidth: GLYPH_STROKE });
    }
  }
}
