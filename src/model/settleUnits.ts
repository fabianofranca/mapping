import { EPSILON, type Size } from './geometry';
import type { Rect } from './types';

// Pure helpers of the "keep the size in units" rule of the settle (stage #2210, decisions 1 to 8,
// `docs/ARCHITECTURE.md`, "Spaces, containment and gestures"). A set of markings that goes from
// the space S to the space T and holds a marking that draws a component scales as a whole, so the
// component keeps its box and its content in the same unit. No DOM: Node-safe.

/** What a space contributes to the factor: the container's density and its placement scale (1 and 1 on the canvas). */
export interface SpaceUnits {
  readonly density: number;
  readonly scale: number;
}

/**
 * The density a space contributes: the container's, or 1 when it is missing, non-finite or not
 * positive (the 0.5 to 8 range is only an invariant, so a bad value must not make `k` infinite).
 */
export function spaceDensity(density: number | null | undefined): number {
  return typeof density === 'number' && Number.isFinite(density) && density > 0
    ? density
    : 1;
}

/** A point in canvas units. */
export interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * How many canvas units a component keeps per canvas unit when it goes from `from` to `to`:
 * `k = (d_T × s_T) ÷ (d_S × s_S)`. A size in units is `pixels ÷ density`, and a pixel is `scale`
 * canvas units, so this is the factor that keeps the size in units.
 */
export function unitsFactor(from: SpaceUnits, to: SpaceUnits): number {
  return (to.density * to.scale) / (from.density * from.scale);
}

/** Does the factor change anything? Within `EPSILON` of 1 the conversion is exactly today's. */
export function isScaled(k: number): boolean {
  return Math.abs(k - 1) > EPSILON;
}

/** Top-left corner of the bounding box of the rectangles (canvas units): the origin of the scaling. */
export function boundingOrigin(rects: readonly Rect[]): CanvasPoint {
  let x = Infinity;
  let y = Infinity;
  for (const r of rects) {
    x = Math.min(x, r.x);
    y = Math.min(y, r.y);
  }
  return { x, y };
}

/** `rect` scaled by `k` around `origin`, in position and size (a zoom of what moved). */
export function scaleAround(origin: CanvasPoint, rect: Rect, k: number): Rect {
  return {
    x: origin.x + (rect.x - origin.x) * k,
    y: origin.y + (rect.y - origin.y) * k,
    width: rect.width * k,
    height: rect.height * k,
  };
}

/**
 * The minimum of a marking in the target space: its minimum in the source space (in pixels of
 * the source density) times `ratio = d_T ÷ d_S`, rounded up on each axis. `null` stays `null`
 * (a plain marking keeps `effectiveMinSize`).
 */
export function minInTarget(min: Size | null, ratio: number): Size | null {
  if (min === null || ratio === 1) return min;
  const up = (v: number) => Math.ceil(v * ratio - 1e-9);
  return { width: up(min.width), height: up(min.height) };
}
