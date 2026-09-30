import type { Placement, ProjectImage, Rect } from './types';

/** Tamanho mínimo de cada lado de uma marcação, em pixels da imagem. */
export const MIN_MARKING_SIZE = 8;

/** Tolerância para comparar coordenadas do canvas (ponto flutuante). */
const EPSILON = 1e-6;

export function right(r: Rect): number {
  return r.x + r.width;
}

export function bottom(r: Rect): number {
  return r.y + r.height;
}

export function area(r: Rect): number {
  return r.width * r.height;
}

/** `inner` totalmente dentro de `outer` (bordas coincidentes contam como dentro). */
export function containsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    right(inner) <= right(outer) &&
    bottom(inner) <= bottom(outer)
  );
}

/** Sobreposição com área positiva. Retângulos que só encostam não se sobrepõem. */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < right(b) - EPSILON &&
    b.x < right(a) - EPSILON &&
    a.y < bottom(b) - EPSILON &&
    b.y < bottom(a) - EPSILON
  );
}

export function boundingBox(rects: readonly Rect[]): Rect | null {
  const first = rects[0];
  if (!first) return null;
  let x0 = first.x;
  let y0 = first.y;
  let x1 = right(first);
  let y1 = bottom(first);
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, right(r));
    y1 = Math.max(y1, bottom(r));
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export function translateRect(r: Rect, dx: number, dy: number): Rect {
  return { x: r.x + dx, y: r.y + dy, width: r.width, height: r.height };
}

export function isIntegerRect(r: Rect): boolean {
  return [r.x, r.y, r.width, r.height].every(Number.isInteger);
}

/** Retângulo da imagem inteira, em pixels da imagem. */
export function imagePixelRect(image: Pick<ProjectImage, 'width' | 'height'>): Rect {
  return { x: 0, y: 0, width: image.width, height: image.height };
}

/** Retângulo ocupado pela imagem no canvas, em unidades do canvas. */
export function imageCanvasRect(
  image: Pick<ProjectImage, 'width' | 'height'>,
  placement: Placement,
): Rect {
  return {
    x: placement.x,
    y: placement.y,
    width: image.width * placement.scale,
    height: image.height * placement.scale,
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
