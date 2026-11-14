import { fail, type RectTooSmallData } from './errors';
import type { ArrowPoint, Placement, ProjectContainer, Rect } from './types';

/**
 * Minimum size of each side of a **plain** marking (no component) in gestures and in the MCP,
 * in image pixels.
 */
export const MIN_MARKING_SIZE = 8;

/**
 * Minimum of each side of a marking with an annotation of a type **with a component** (the
 * component's `minSize`, if any, takes precedence) and of any marking when reading `mapping.json`.
 */
export const MIN_STORED_MARKING_SIZE = 1;

/** Base of the minimum: 1 px when there is a component minimum (`componentMin`), 8 px (`MIN_MARKING_SIZE`) without it. */
export function markingMinBase(componentMin?: Size | null): number {
  return componentMin ? MIN_STORED_MARKING_SIZE : MIN_MARKING_SIZE;
}

/** Effective minimum per side: the base (1 or 8) or, when larger, the component's `minSize`. */
export function effectiveMinSize(componentMin?: Size | null): Size {
  const base = markingMinBase(componentMin);
  return {
    width: Math.max(base, componentMin?.width ?? 0),
    height: Math.max(base, componentMin?.height ?? 0),
  };
}

/**
 * Fails with `rect-too-small` if any side of the rectangle falls below the minimum: 8 px on a
 * plain marking, 1 px (or the component's `minSize`, if larger) when `componentMin` is given,
 * that is, when the marking draws a component. The error's `data` gives the received size, the
 * minimum that applied and where it came from (`component` when `componentMin` was given).
 */
export function checkRectSize(
  rect: Pick<Rect, 'width' | 'height'>,
  componentMin?: Size | null,
): void {
  const min = effectiveMinSize(componentMin);
  if (rect.width >= min.width && rect.height >= min.height) return;
  const data: RectTooSmallData = {
    received: { width: rect.width, height: rect.height },
    min,
    source: componentMin ? 'component' : 'marking',
  };
  fail('rect-too-small', undefined, data);
}

/** Tolerance for comparing canvas coordinates (floating point). */
export const EPSILON = 1e-6;

/**
 * Removes floating-point noise: near an integer (within `eps`) returns the integer,
 * never `-0`; a real fraction (`1868.13`, `0.5`) stays as it is. A non-finite value passes through.
 */
export function snapNearInteger(v: number, eps: number = EPSILON): number {
  if (!Number.isFinite(v)) return v;
  const rounded = Math.round(v);
  if (Math.abs(v - rounded) >= eps) return v;
  return rounded || 0;
}

/**
 * Stored position (`x`, `y`): near an integer becomes the integer (`274.9999999` → `275`); otherwise
 * the fraction is cut to 6 places (`-739.6551724137931` → `-739.655172`). Never returns `-0`. The deviation
 * (up to 5e-7) stays below the model's `EPSILON` slack, so no touching becomes an overlap.
 * A non-finite value passes through as is (`checkPlacement` refuses it later).
 */
export function snapCoordinate(v: number): number {
  if (!Number.isFinite(v)) return v;
  const near = snapNearInteger(v);
  if (Number.isInteger(near)) return near;
  return Number(v.toFixed(6)) || 0;
}

/**
 * Stored scale: near an integer >= 1 becomes the integer (the usual rule); otherwise it keeps 12
 * significant digits (`17.24137931034483` → `17.2413793103`), a relative deviation of 5e-13.
 * A small scale never becomes 0. A non-finite value passes through as is.
 */
export function snapScale(v: number): number {
  if (!Number.isFinite(v)) return v;
  const near = snapNearInteger(v);
  if (Number.isInteger(near) && near >= 1) return near;
  return Number(v.toPrecision(12));
}

/**
 * Cleans the floating-point tail of a container's `placement` (`snapCoordinate` on `x` and `y`,
 * `snapScale` on the scale). All the doors that store a container's position or scale go through here:
 * - `setContainerPlacement` (move, resize, `update_container`), `moveContainer` and
 *   `resizeContainer`;
 * - `moveItems` (joint drag);
 * - `placementNear` and `placementAtRight` (create: `addContainer`, `addBackgroundContainer` with and
 *   without `center`, the **Selection size** and `add_container`);
 * - `replaceContainer` (replace the image, which changes the scale);
 * - the `images-overlap` repair (`repair.ts`);
 * - the perspectives' positions (`items[].x/y`, the same as `placement.x/y`), through
 *   `snapCoordinate`: `movedItem`, the reconciled item, `placeCreatedRoot`, the relative position and
 *   `placeInArrivalArea`, and the resize `base` in `perspectiveGestures.ts`.
 * A root that is a marking stays whole (`Math.round` or `Math.ceil` beforehand).
 */
export function snapPlacement(p: Placement): Placement {
  return { x: snapCoordinate(p.x), y: snapCoordinate(p.y), scale: snapScale(p.scale) };
}

export function right(r: Rect): number {
  return r.x + r.width;
}

export function bottom(r: Rect): number {
  return r.y + r.height;
}

export function area(r: Rect): number {
  return r.width * r.height;
}

/** Are the two rectangles exactly equal (same corner and same size)? */
export function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/** `inner` entirely inside `outer` (coinciding edges count as inside). */
export function containsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    right(inner) <= right(outer) &&
    bottom(inner) <= bottom(outer)
  );
}

/** Overlap with positive area. Rectangles that only touch do not overlap. */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < right(b) - EPSILON &&
    b.x < right(a) - EPSILON &&
    a.y < bottom(b) - EPSILON &&
    b.y < bottom(a) - EPSILON
  );
}

/**
 * The largest displacement of `moving` (rectangles that move together) up to `dx`, `dy` without overlapping
 * `fixed`: if the requested destination does not overlap a fixed one, it comes back as is; otherwise it touches and slides,
 * axis by axis (first x, against the fixed ones the current y crosses; then y, with x already
 * applied). The movement touches the obstacle (same edge, distance 0) and slides along it
 * on the other axis. Whoever already overlaps does not limit (there is no "passing through" to avoid).
 */
export function slideToTouch(
  moving: readonly Rect[],
  fixed: readonly Rect[],
  dx: number,
  dy: number,
): { readonly dx: number; readonly dy: number } {
  const lands = moving.map((r) => ({ ...r, x: r.x + dx, y: r.y + dy }));
  // Free destination: stays as is (including "passing over" a container in the way).
  if (!lands.some((m) => fixed.some((f) => rectsOverlap(m, f)))) return { dx, dy };
  const limitedX = limitX(moving, fixed, dx);
  const flip = (r: Rect): Rect => ({ x: r.y, y: r.x, width: r.height, height: r.width });
  const limitedY = limitX(
    moving.map((r) => flip({ ...r, x: r.x + limitedX })),
    fixed.map(flip),
    dy,
  );
  return { dx: limitedX, dy: limitedY };
}

/** The largest displacement in x, up to `delta`, without passing a fixed one that the current y crosses. */
function limitX(moving: readonly Rect[], fixed: readonly Rect[], delta: number): number {
  let limit = Math.abs(delta);
  for (const m of moving) {
    for (const f of fixed) {
      if (m.y >= bottom(f) - EPSILON || f.y >= bottom(m) - EPSILON) continue;
      const gap = delta > 0 ? f.x - right(m) : m.x - right(f);
      if (gap >= -EPSILON) limit = Math.min(limit, Math.max(0, gap));
    }
  }
  return Math.sign(delta) * limit || 0;
}

/**
 * A gesture's displacement after touching: with `whole` (there is a canvas marking in the selection)
 * it rounds the request; filters `fixed` by the swept box (the envelope of `moving` and of `moving`
 * displaced by `dx`, `dy`, with `EPSILON` slack: a fixed one outside it limits no axis, so the
 * result is that of the unfiltered calculation); calls `slideToTouch` and, with `whole`, truncates the result.
 */
export function touchDelta(
  moving: readonly Rect[],
  fixed: readonly Rect[],
  dx: number,
  dy: number,
  whole: boolean,
): { readonly dx: number; readonly dy: number } {
  const wantedX = whole ? Math.round(dx) : dx;
  const wantedY = whole ? Math.round(dy) : dy;
  const swept = boundingBox([
    ...moving,
    ...moving.map((r) => translateRect(r, wantedX, wantedY)),
  ]);
  const near = swept
    ? fixed.filter(
        (f) =>
          f.x <= right(swept) + EPSILON &&
          right(f) >= swept.x - EPSILON &&
          f.y <= bottom(swept) + EPSILON &&
          bottom(f) >= swept.y - EPSILON,
      )
    : fixed;
  const limited = slideToTouch(moving, near, wantedX, wantedY);
  return whole ? { dx: Math.trunc(limited.dx), dy: Math.trunc(limited.dy) } : limited;
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

/** Rectangle of the whole image, in image pixels. */
export function imagePixelRect(image: Pick<ProjectContainer, 'width' | 'height'>): Rect {
  return { x: 0, y: 0, width: image.width, height: image.height };
}

/** Rectangle occupied by the image on the canvas, in canvas units. */
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
// Coordinate spaces (v13): that of each container (its integer pixels) and that of the canvas
// (integer canvas units). A marking lives in a single space; the settle
// (`hierarchySettle.ts`) decides which and converts the `rect`.

/** `placement` of the canvas space: canvas units are its "pixels". */
export const IDENTITY_PLACEMENT: Placement = { x: 0, y: 0, scale: 1 };

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Rectangle of a space (container `placement` or identity) in canvas units (decimal). */
export function toCanvasRect(placement: Placement, rect: Rect): Rect {
  return {
    x: placement.x + rect.x * placement.scale,
    y: placement.y + rect.y * placement.scale,
    width: rect.width * placement.scale,
    height: rect.height * placement.scale,
  };
}

/** Point of a space (container pixels, or the canvas with identity `placement`) in canvas units. */
export function toCanvasPoint(placement: Placement, point: ArrowPoint): ArrowPoint {
  return {
    x: placement.x + point.x * placement.scale,
    y: placement.y + point.y * placement.scale,
  };
}

/** Canvas point in the `placement` space: the inverse of `toCanvasPoint` (without rounding). */
export function fromCanvasPoint(placement: Placement, point: ArrowPoint): ArrowPoint {
  return {
    x: (point.x - placement.x) / placement.scale,
    y: (point.y - placement.y) / placement.scale,
  };
}

/** `containsRect` with floating-point slack (canvas coordinates, decimal). */
export function containsRectApprox(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x - EPSILON &&
    inner.y >= outer.y - EPSILON &&
    right(inner) <= right(outer) + EPSILON &&
    bottom(inner) <= bottom(outer) + EPSILON
  );
}

/** Rounds an interval by its edges and ensures the minimum, bounded to [min, max) if there is one. */
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
 * Converts a canvas rectangle (decimal) to the `placement` space, in integers:
 * the edges are rounded (the size is what the person saw on screen), each side keeps at
 * least the minimum (`MIN_MARKING_SIZE`, or 1 px and the component's `min` when there is a `min`) and, with `bounds`, the
 * rectangle stays inside it (the container; the canvas has no limit).
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
    effectiveMinSize(min).width,
    bounds ? bounds.x : -Infinity,
    bounds ? right(bounds) : Infinity,
  );
  const [y, height] = roundSpan(
    (canvas.y - placement.y) / s,
    canvas.height / s,
    effectiveMinSize(min).height,
    bounds ? bounds.y : -Infinity,
    bounds ? bottom(bounds) : Infinity,
  );
  return { x, y, width, height };
}
