// Hit-test e redimensionamento proporcional de imagens, em unidades do canvas.
// Funções puras, testadas em `tests/canvas/`.
import {
  boundingBox,
  imageCanvasRect,
  type Placement,
  type ProjectImage,
  type Rect,
} from '../model';
import type { Point } from './viewport';

export type Corner = 'nw' | 'ne' | 'sw' | 'se';
export const CORNERS: readonly Corner[] = ['nw', 'ne', 'sw', 'se'];

/** Menor lado maior de uma imagem redimensionada, em unidades do canvas. */
export const MIN_IMAGE_CANVAS_SIZE = 50;

export function pointInRect(p: Point, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

export function cornerPoint(r: Rect, corner: Corner): Point {
  return {
    x: corner === 'nw' || corner === 'sw' ? r.x : r.x + r.width,
    y: corner === 'nw' || corner === 'ne' ? r.y : r.y + r.height,
  };
}

function opposite(corner: Corner): Corner {
  const map: Record<Corner, Corner> = { nw: 'se', ne: 'sw', sw: 'ne', se: 'nw' };
  return map[corner];
}

/** Imagem sob o ponto (a última da lista, que é desenhada por cima). */
export function imageAt(images: readonly ProjectImage[], p: Point): ProjectImage | null {
  for (let i = images.length - 1; i >= 0; i--) {
    const image = images[i];
    if (image && pointInRect(p, imageCanvasRect(image, image.placement))) return image;
  }
  return null;
}

/** Canto de `rect` a até `radius` (canvas) do ponto; o mais próximo vence. */
export function cornerAt(rect: Rect, p: Point, radius: number): Corner | null {
  let best: Corner | null = null;
  let bestDistance = Infinity;
  for (const corner of CORNERS) {
    const c = cornerPoint(rect, corner);
    const d = Math.max(Math.abs(c.x - p.x), Math.abs(c.y - p.y));
    if (d <= radius && d < bestDistance) {
      best = corner;
      bestDistance = d;
    }
  }
  return best;
}

/**
 * Redimensionamento proporcional pelo canto `corner`: o canto oposto fica fixo
 * e a escala segue o ponteiro no eixo em que ele mais se afastou.
 */
export function resizeFromCorner(
  image: Pick<ProjectImage, 'width' | 'height'>,
  start: Placement,
  corner: Corner,
  pointer: Point,
  minSize = MIN_IMAGE_CANVAS_SIZE,
): Placement {
  const rect = imageCanvasRect(image, start);
  const anchor = cornerPoint(rect, opposite(corner));
  const signX = corner === 'ne' || corner === 'se' ? 1 : -1;
  const signY = corner === 'sw' || corner === 'se' ? 1 : -1;
  const dx = (pointer.x - anchor.x) * signX;
  const dy = (pointer.y - anchor.y) * signY;
  const minScale = minSize / Math.max(image.width, image.height);
  const scale = Math.max(minScale, dx / image.width, dy / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    x: signX > 0 ? anchor.x : anchor.x - width,
    y: signY > 0 ? anchor.y : anchor.y - height,
    scale,
  };
}

/** Caixa que envolve todas as imagens no canvas, ou `null` se não houver imagens. */
export function imagesBounds(images: readonly ProjectImage[]): Rect | null {
  return boundingBox(images.map((i) => imageCanvasRect(i, i.placement)));
}
