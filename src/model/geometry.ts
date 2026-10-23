import type { ArrowPoint, Placement, ProjectContainer, Rect } from './types';

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
export function imagePixelRect(image: Pick<ProjectContainer, 'width' | 'height'>): Rect {
  return { x: 0, y: 0, width: image.width, height: image.height };
}

/** Retângulo ocupado pela imagem no canvas, em unidades do canvas. */
export function imageCanvasRect(
  image: Pick<ProjectContainer, 'width' | 'height'>,
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

// ---------------------------------------------------------------------------
// Espaços de coordenadas (v13): o de cada container (pixels inteiros dele) e o do canvas
// (unidades inteiras do canvas). Uma marcação vive num só espaço; o assentar
// (`hierarchySettle.ts`) decide qual e converte o `rect`.

/** `placement` do espaço do canvas: unidades do canvas são os "pixels" dele. */
export const IDENTITY_PLACEMENT: Placement = { x: 0, y: 0, scale: 1 };

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Retângulo de um espaço (`placement` do container ou identidade) em unidades do canvas (decimal). */
export function toCanvasRect(placement: Placement, rect: Rect): Rect {
  return {
    x: placement.x + rect.x * placement.scale,
    y: placement.y + rect.y * placement.scale,
    width: rect.width * placement.scale,
    height: rect.height * placement.scale,
  };
}

/** Ponto de um espaço (pixels do container, ou o canvas com `placement` identidade) em unidades do canvas. */
export function toCanvasPoint(placement: Placement, point: ArrowPoint): ArrowPoint {
  return {
    x: placement.x + point.x * placement.scale,
    y: placement.y + point.y * placement.scale,
  };
}

/** Ponto do canvas no espaço de `placement`: o inverso de `toCanvasPoint` (sem arredondar). */
export function fromCanvasPoint(placement: Placement, point: ArrowPoint): ArrowPoint {
  return {
    x: (point.x - placement.x) / placement.scale,
    y: (point.y - placement.y) / placement.scale,
  };
}

/** `containsRect` com folga de ponto flutuante (coordenadas do canvas, decimais). */
export function containsRectApprox(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x - EPSILON &&
    inner.y >= outer.y - EPSILON &&
    right(inner) <= right(outer) + EPSILON &&
    bottom(inner) <= bottom(outer) + EPSILON
  );
}

/** Arredonda um intervalo pelas bordas e garante o mínimo, preso a [min, max) se houver. */
function roundSpan(
  start: number,
  size: number,
  minimum: number,
  lo: number,
  hi: number,
): [number, number] {
  const a = Math.round(start);
  const width = Math.max(Math.round(start + size) - a, minimum);
  if (width >= hi - lo) return [lo, Math.min(width, hi - lo)];
  return [clamp(a, lo, hi - width), width];
}

/**
 * Converte um retângulo do canvas (decimal) para o espaço de `placement`, em inteiros:
 * as bordas são arredondadas (o tamanho é o que a pessoa via na tela), cada lado fica com
 * pelo menos `MIN_MARKING_SIZE` (e `min`, o mínimo do componente) e, com `bounds`, o
 * retângulo fica dentro dele (o container; o canvas não tem limite).
 */
export function fromCanvasRect(
  placement: Placement,
  canvas: Rect,
  bounds: Rect | null,
  min?: Size | null,
): Rect {
  const s = placement.scale;
  const [x, width] = roundSpan(
    (canvas.x - placement.x) / s,
    canvas.width / s,
    Math.max(MIN_MARKING_SIZE, min?.width ?? 0),
    bounds ? bounds.x : -Infinity,
    bounds ? right(bounds) : Infinity,
  );
  const [y, height] = roundSpan(
    (canvas.y - placement.y) / s,
    canvas.height / s,
    Math.max(MIN_MARKING_SIZE, min?.height ?? 0),
    bounds ? bounds.y : -Infinity,
    bounds ? bottom(bounds) : Infinity,
  );
  return { x, y, width, height };
}
