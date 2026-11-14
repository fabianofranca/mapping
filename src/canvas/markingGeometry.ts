// Geometry of the markings on the canvas: image ↔ canvas conversions, hit-test,
// drawing and resizing. Pure functions, tested in `tests/canvas/`.
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
  type Size,
} from '../model';
import { pointInRect, type Corner } from './imageGeometry';
import type { Point } from './viewport';

/** The marking's rectangle on the canvas, given the image position. */
export function markingCanvasRect(placement: Placement, rect: Rect): Rect {
  return {
    x: placement.x + rect.x * placement.scale,
    y: placement.y + rect.y * placement.scale,
    width: rect.width * placement.scale,
    height: rect.height * placement.scale,
  };
}

/**
 * Position of a marking's space in the frame: the container's (with the preview of an image
 * gesture applied) or the identity, on the canvas (`containerId` null). `undefined` if the
 * container is not in the map.
 */
export function placementOfSpace(
  placements: ReadonlyMap<string, Placement>,
  containerId: string | null,
): Placement | undefined {
  return containerId === null ? IDENTITY_PLACEMENT : placements.get(containerId);
}

/** Canvas point in image pixels (not rounded). */
export function canvasToImagePixel(placement: Placement, p: Point): Point {
  return {
    x: (p.x - placement.x) / placement.scale,
    y: (p.y - placement.y) / placement.scale,
  };
}

/**
 * (Integer) rectangle between two drawing points, limited to the image borders (image
 * pixels). Without `image` it is the drawing on the canvas (v13): canvas units, no limit. It may end up
 * smaller than the minimum: see `isDrawableRect`.
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
 * Markings of the space under the point (container pixels, or canvas units with
 * null `containerId`): the innermost first, followed by the ancestors up to the root. The
 * innermost is the deepest in the hierarchy; on a tie, the one with the smaller area and then the last in the array.
 * Floating ones are left out (they get their turn first, in `floatingAt`): they do not belong to the chain.
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
 * Floating markings under the canvas point (canvas units), the top one first (the last
 * in the array is drawn on top). The floating one is the first to receive the touch wherever it is.
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
 * Touch selection: the innermost in the chain. Touching the same point again
 * (`repeat`) goes up to the parent and, after the root, returns to the innermost.
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

/** Minimum of an ordinary marking in gestures (a component-drawing one passes its own, of 1 px or more). */
const DEFAULT_MIN_SIZE: Size = { width: MIN_MARKING_SIZE, height: MIN_MARKING_SIZE };

export interface RectLimits {
  /**
   * Area where the marking must stay: its container (its pixels); `null` for a canvas
   * marking (no limit). Children do not limit: resizing is free and does not move them.
   */
  readonly outer: Rect | null;
}

/**
 * Resizes by the `corner` (the opposite corner stays fixed), following the
 * pointer in the marking's space (container pixels or canvas units). The result is an
 * integer, has the minimum size and stays inside `outer`, if any.
 */
export function resizeMarkingRect(
  start: Rect,
  corner: Corner,
  pointer: Point,
  limits: RectLimits,
  min: Size = DEFAULT_MIN_SIZE,
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
    x1 = clamp(px, x0 + min.width, highX);
  } else {
    x0 = clamp(px, lowX, x1 - min.width);
  }
  if (corner === 'sw' || corner === 'se') {
    y1 = clamp(py, y0 + min.height, highY);
  } else {
    y0 = clamp(py, lowY, y1 - min.height);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * Touch radius of the handles (screen px) for a rectangle whose shortest side measures
 * `minSide` px on screen: it shrinks on small markings, so that move area is left over,
 * without going below 12 (24 px area).
 */
export function handleHitRadius(minSide: number, max = 22): number {
  return clamp(minSide / 3, 12, max);
}
