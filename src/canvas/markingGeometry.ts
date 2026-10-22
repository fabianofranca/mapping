// Geometria das marcações no canvas: conversões imagem ↔ canvas, hit-test,
// desenho e redimensionamento. Funções puras, testadas em `tests/canvas/`.
import {
  IDENTITY_PLACEMENT,
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

/**
 * Posição do espaço de uma marcação no quadro: a do container (com a prévia de um gesto de
 * imagem aplicada) ou a identidade, no canvas (`containerId` nulo). `undefined` se o container
 * não está no mapa.
 */
export function placementOfSpace(
  placements: ReadonlyMap<string, Placement>,
  containerId: string | null,
): Placement | undefined {
  return containerId === null ? IDENTITY_PLACEMENT : placements.get(containerId);
}

/** Ponto do canvas em pixels da imagem (sem arredondar). */
export function canvasToImagePixel(placement: Placement, p: Point): Point {
  return {
    x: (p.x - placement.x) / placement.scale,
    y: (p.y - placement.y) / placement.scale,
  };
}

/**
 * Retângulo (inteiro) entre dois pontos do desenho, limitado às bordas da imagem (pixels da
 * imagem). Sem `image` é o desenho no canvas (v13): unidades do canvas, sem limite. Pode ficar
 * menor que o mínimo: ver `isDrawableRect`.
 */
export function rectFromPoints(
  a: Point,
  b: Point,
  image: { readonly width: number; readonly height: number } | null,
): Rect {
  const lo = (v: number, size: number) => (image ? clamp(v, 0, size) : v);
  const x0 = Math.round(lo(Math.min(a.x, b.x), image?.width ?? 0));
  const x1 = Math.round(lo(Math.max(a.x, b.x), image?.width ?? 0));
  const y0 = Math.round(lo(Math.min(a.y, b.y), image?.height ?? 0));
  const y1 = Math.round(lo(Math.max(a.y, b.y), image?.height ?? 0));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export function isDrawableRect(rect: Rect): boolean {
  return rect.width >= MIN_MARKING_SIZE && rect.height >= MIN_MARKING_SIZE;
}

/**
 * Marcações do espaço sob o ponto (pixels do container, ou unidades do canvas com
 * `containerId` nulo): a mais interna primeiro, seguida dos ancestrais até a raiz. A mais
 * interna é a mais funda na hierarquia; no empate, a de menor área e, depois, a última do array.
 * As flutuantes ficam de fora (têm a vez antes, em `floatingAt`): não pertencem à cadeia.
 */
export function markingChainAt(
  markings: readonly Marking[],
  containerId: string | null,
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
    if (m.floating || m.containerId !== containerId || !pointInRect(p, m.rect)) continue;
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
 * Marcações flutuantes sob o ponto do canvas (unidades do canvas), a de cima primeiro (a última
 * do array é a desenhada por cima). A flutuante é a primeira a receber o toque onde estiver.
 */
export function floatingAt(markings: readonly Marking[], p: Point): Marking[] {
  const hits: Marking[] = [];
  for (let i = markings.length - 1; i >= 0; i--) {
    const m = markings[i];
    if (m?.floating && pointInRect(p, m.rect)) hits.push(m);
  }
  return hits;
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
  /**
   * Área em que a marcação precisa ficar: o container dela (pixels dele); `null` na marcação do
   * canvas (sem limite). As filhas não limitam: redimensionar é livre e não as move.
   */
  readonly outer: Rect | null;
}

/**
 * Redimensiona pelo canto `corner` (o canto oposto fica fixo), seguindo o
 * ponteiro no espaço da marcação (pixels do container ou unidades do canvas). O resultado é
 * inteiro, tem o tamanho mínimo e fica dentro de `outer`, se houver.
 */
export function resizeMarkingRect(
  start: Rect,
  corner: Corner,
  pointer: Point,
  limits: RectLimits,
  min = MIN_MARKING_SIZE,
): Rect {
  const { outer } = limits;
  const lowX = outer ? outer.x : -Infinity;
  const highX = outer ? right(outer) : Infinity;
  const lowY = outer ? outer.y : -Infinity;
  const highY = outer ? bottom(outer) : Infinity;
  const px = Math.round(pointer.x);
  const py = Math.round(pointer.y);
  let x0 = start.x;
  let x1 = right(start);
  let y0 = start.y;
  let y1 = bottom(start);
  if (corner === 'ne' || corner === 'se') {
    x1 = clamp(px, x0 + min, highX);
  } else {
    x0 = clamp(px, lowX, x1 - min);
  }
  if (corner === 'sw' || corner === 'se') {
    y1 = clamp(py, y0 + min, highY);
  } else {
    y0 = clamp(py, lowY, y1 - min);
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
