// Geometria das marcações no canvas: conversões imagem ↔ canvas, hit-test,
// desenho e redimensionamento. Funções puras, testadas em `tests/canvas/`.
import {
  MIN_MARKING_SIZE,
  area,
  bottom,
  clamp,
  right,
  type Marking,
  type Placement,
  type Rect,
} from '../model';
import { pointInRect, type Corner } from './imageGeometry';
import type { Point } from './viewport';

/** Retângulo da marcação no canvas, dada a posição da imagem. */
export function markingCanvasRect(placement: Placement, rect: Rect): Rect {
  return {
    x: placement.x + rect.x * placement.scale,
    y: placement.y + rect.y * placement.scale,
    width: rect.width * placement.scale,
    height: rect.height * placement.scale,
  };
}

/** Ponto do canvas em pixels da imagem (sem arredondar). */
export function canvasToImagePixel(placement: Placement, p: Point): Point {
  return {
    x: (p.x - placement.x) / placement.scale,
    y: (p.y - placement.y) / placement.scale,
  };
}

/**
 * Retângulo (pixels inteiros) entre dois pontos do desenho, limitado às bordas
 * da imagem. Pode ficar menor que o mínimo: ver `isDrawableRect`.
 */
export function rectFromPoints(
  a: Point,
  b: Point,
  image: { readonly width: number; readonly height: number },
): Rect {
  const x0 = Math.round(clamp(Math.min(a.x, b.x), 0, image.width));
  const x1 = Math.round(clamp(Math.max(a.x, b.x), 0, image.width));
  const y0 = Math.round(clamp(Math.min(a.y, b.y), 0, image.height));
  const y1 = Math.round(clamp(Math.max(a.y, b.y), 0, image.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export function isDrawableRect(rect: Rect): boolean {
  return rect.width >= MIN_MARKING_SIZE && rect.height >= MIN_MARKING_SIZE;
}

/**
 * Marcações da imagem sob o ponto (pixels da imagem): a mais interna primeiro,
 * seguida dos ancestrais até a raiz. A mais interna é a mais funda na
 * hierarquia; no empate, a de menor área e, depois, a última do array.
 */
export function markingChainAt(
  markings: readonly Marking[],
  imageId: string,
  p: Point,
): Marking[] {
  const byId = new Map(markings.map((m) => [m.id, m]));
  const depth = (m: Marking) => {
    let d = 0;
    let parentId = m.parentId;
    while (parentId !== null && d <= byId.size) {
      d++;
      parentId = byId.get(parentId)?.parentId ?? null;
    }
    return d;
  };
  let best: Marking | null = null;
  let bestDepth = -1;
  for (const m of markings) {
    if (m.imageId !== imageId || !pointInRect(p, m.rect)) continue;
    const d = depth(m);
    if (!best || d > bestDepth || (d === bestDepth && area(m.rect) <= area(best.rect))) {
      best = m;
      bestDepth = d;
    }
  }
  const chain: Marking[] = [];
  for (let m: Marking | undefined = best ?? undefined; m;) {
    chain.push(m);
    if (chain.length > byId.size) break;
    m = m.parentId === null ? undefined : byId.get(m.parentId);
  }
  return chain;
}

/**
 * Seleção por toque: a mais interna da cadeia. Tocar de novo no mesmo ponto
 * (`repeat`) sobe para o pai e, depois da raiz, volta para a mais interna.
 */
export function nextInChain(
  chain: readonly string[],
  current: string | null,
  repeat: boolean,
): string | null {
  const first = chain[0];
  if (first === undefined) return null;
  const index = current === null ? -1 : chain.indexOf(current);
  if (repeat && index >= 0) return chain[(index + 1) % chain.length] ?? first;
  return first;
}

export interface RectLimits {
  /** Área em que a marcação precisa ficar (pai ou imagem). */
  readonly outer: Rect;
  /** Caixa das filhas, que a marcação precisa envolver (`null` sem filhas). */
  readonly inner: Rect | null;
}

/**
 * Redimensiona pelo canto `corner` (o canto oposto fica fixo), seguindo o
 * ponteiro em pixels da imagem. O resultado é inteiro, tem o tamanho mínimo,
 * fica dentro de `outer` e envolve `inner`.
 */
export function resizeMarkingRect(
  start: Rect,
  corner: Corner,
  pointer: Point,
  limits: RectLimits,
  min = MIN_MARKING_SIZE,
): Rect {
  const { outer, inner } = limits;
  const px = Math.round(pointer.x);
  const py = Math.round(pointer.y);
  let x0 = start.x;
  let x1 = right(start);
  let y0 = start.y;
  let y1 = bottom(start);
  if (corner === 'ne' || corner === 'se') {
    x1 = clamp(px, Math.max(x0 + min, inner ? right(inner) : -Infinity), right(outer));
  } else {
    x0 = clamp(px, outer.x, Math.min(x1 - min, inner ? inner.x : Infinity));
  }
  if (corner === 'sw' || corner === 'se') {
    y1 = clamp(py, Math.max(y0 + min, inner ? bottom(inner) : -Infinity), bottom(outer));
  } else {
    y0 = clamp(py, outer.y, Math.min(y1 - min, inner ? inner.y : Infinity));
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * Raio de toque das alças (px de tela) para um retângulo cujo menor lado mede
 * `minSide` px na tela: encolhe em marcações pequenas, para sobrar área de
 * mover, sem ficar abaixo de 12 (área de 24 px).
 */
export function handleHitRadius(minSide: number, max = 22): number {
  return clamp(minSide / 3, 12, max);
}
