// Arrow geometry on the canvas (v13, ME4): the drawn polyline/curve, the stroke hit-test, the
// handles of the selected arrow and a marking's link handle. Pure functions (no DOM or Konva),
// tested in `tests/canvas/arrowGeometry.test.ts`. Everything in canvas units; touch distances
// come in screen px and are divided by the zoom.
import {
  arrowRoute,
  fromCanvasPoint,
  projectIndex,
  type Arrow,
  type ArrowEnd,
  type ArrowPoint,
  type ArrowRoute,
  type ArrowSide,
  type Marking,
  type MarkingVisibility,
  type Placement,
  type Project,
  type ProjectContainer,
  type Rect,
} from '../model';
import type { Point } from './viewport';

/** Distance (screen px) from the stroke at which a touch still catches the arrow. */
export const ARROW_HIT_TOLERANCE = 7;
/** Touch radius (screen px) of the selected arrow's handles and the link handle. */
export const ARROW_HANDLE_HIT_RADIUS = 10;
/** A section too short (screen px) gets no middle handle: it would fall on its neighbors. */
export const ARROW_MID_HANDLE_MIN = 3 * ARROW_HANDLE_HIT_RADIUS;
/** Distance (screen px) from the link handle to the marking's right edge. */
export const LINK_HANDLE_OFFSET = 14;
/** Samples per section of a curve (even, so the middle falls on a sample). */
const CURVE_SAMPLES = 16;
/** The tangent at a through point is this fraction of the chord between neighbors (Catmull-Rom). */
const TANGENT_FACTOR = 0.5;

/** The arrow ready to draw and touch. */
export interface ArrowShape {
  readonly arrow: Arrow;
  /** Anchors and through points (canvas), with the effective sides. */
  readonly route: ArrowRoute;
  /**
   * The stroke: the route points in `straight` and `elbow`; in `curve`, the sampled curve (the
   * same drawing and the same touch target).
   */
  readonly path: readonly Point[];
  /** The middle of the stroke of each route section (one fewer than `route.points`). */
  readonly mids: readonly Point[];
  /** The middle of the stroke by length: where the label goes. */
  readonly label: Point;
  /** Stroke box (without the thickness or the head). */
  readonly bounds: Rect;
}

// ---------------------------------------------------------------------------
// Stroke

function normalOf(side: ArrowSide): Point {
  switch (side) {
    case 'top':
      return { x: 0, y: -1 };
    case 'bottom':
      return { x: 0, y: 1 };
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
  }
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * The curve through the route points: cubic Hermite per section (like Konva's smoothing, with
 * Catmull-Rom tangents at the through points). At the ends the tangent leaves perpendicular to the
 * marking's side, so even an arrow with no through points makes an S between the sides.
 */
export function curvePath(
  points: readonly Point[],
  fromSide: ArrowSide,
  toSide: ArrowSide,
): { readonly path: Point[]; readonly mids: Point[] } {
  const n = points.length;
  const path: Point[] = [];
  const mids: Point[] = [];
  const first = points[0];
  if (!first || n < 2) return { path: first ? [first] : [], mids };
  const tangent = (i: number): Point => {
    const at = points[i] as Point;
    if (i === 0) {
      const d = dist(at, points[1] as Point);
      const u = normalOf(fromSide);
      return { x: u.x * d, y: u.y * d };
    }
    if (i === n - 1) {
      const d = dist(at, points[n - 2] as Point);
      const u = normalOf(toSide);
      return { x: -u.x * d, y: -u.y * d };
    }
    const prev = points[i - 1] as Point;
    const next = points[i + 1] as Point;
    return {
      x: (next.x - prev.x) * TANGENT_FACTOR,
      y: (next.y - prev.y) * TANGENT_FACTOR,
    };
  };
  path.push(first);
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i] as Point;
    const p3 = points[i + 1] as Point;
    const t0 = tangent(i);
    const t1 = tangent(i + 1);
    const p1 = { x: p0.x + t0.x / 3, y: p0.y + t0.y / 3 };
    const p2 = { x: p3.x - t1.x / 3, y: p3.y - t1.y / 3 };
    const at = (t: number): Point => {
      const u = 1 - t;
      const a = u * u * u;
      const b = 3 * u * u * t;
      const c = 3 * u * t * t;
      const d = t * t * t;
      return {
        x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
        y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
      };
    };
    for (let k = 1; k <= CURVE_SAMPLES; k++) path.push(at(k / CURVE_SAMPLES));
    mids.push(at(0.5));
  }
  return { path, mids };
}

/** The point halfway along the polyline's length. */
export function pathMidpoint(path: readonly Point[]): Point {
  const first = path[0];
  if (!first) return { x: 0, y: 0 };
  let total = 0;
  for (let i = 1; i < path.length; i++)
    total += dist(path[i - 1] as Point, path[i] as Point);
  if (total === 0) return first;
  let left = total / 2;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as Point;
    const b = path[i] as Point;
    const length = dist(a, b);
    if (left <= length && length > 0) {
      const t = left / length;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    left -= length;
  }
  return path[path.length - 1] as Point;
}

function boundsOf(path: readonly Point[]): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of path) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return Number.isFinite(x0)
    ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
    : { x: 0, y: 0, width: 0, height: 0 };
}

/** Builds the arrow drawing from the route (`arrowRoute`). */
export function shapeOf(arrow: Arrow, route: ArrowRoute): ArrowShape {
  const points = route.points;
  let path: readonly Point[] = points;
  let mids: readonly Point[];
  if (arrow.style === 'curve') {
    const curve = curvePath(points, route.fromSide, route.toSide);
    path = curve.path;
    mids = curve.mids;
  } else {
    mids = points.slice(1).map((p, i) => {
      const a = points[i] as Point;
      return { x: (a.x + p.x) / 2, y: (a.y + p.y) / 2 };
    });
  }
  return { arrow, route, path, mids, label: pathMidpoint(path), bounds: boundsOf(path) };
}

// ---------------------------------------------------------------------------
// From the project to the drawn arrows

interface ShapeEntry {
  readonly from: Marking;
  readonly to: Marking;
  readonly fromContainer: ProjectContainer | undefined;
  readonly toContainer: ProjectContainer | undefined;
  readonly shape: ArrowShape | null;
}

const shapeCache = new WeakMap<Arrow, ShapeEntry>();

/**
 * The arrow's drawing in the project, `null` if an end does not exist. Cached per arrow: the same
 * object while the arrow, its two markings and their containers are the same, so a gesture that
 * moves a marking redoes only the arrows attached to it.
 */
export function arrowShape(project: Project, arrow: Arrow): ArrowShape | null {
  const index = projectIndex(project);
  const from = index.markings.get(arrow.from);
  const to = index.markings.get(arrow.to);
  if (!from || !to) return null;
  const fromContainer =
    from.containerId === null ? undefined : index.containers.get(from.containerId);
  const toContainer =
    to.containerId === null ? undefined : index.containers.get(to.containerId);
  const cached = shapeCache.get(arrow);
  if (
    cached &&
    cached.from === from &&
    cached.to === to &&
    cached.fromContainer === fromContainer &&
    cached.toContainer === toContainer
  ) {
    return cached.shape;
  }
  const route = arrowRoute(project, arrow);
  const shape = route ? shapeOf(arrow, route) : null;
  shapeCache.set(arrow, { from, to, fromContainer, toContainer, shape });
  return shape;
}

const NO_SHAPES: readonly ArrowShape[] = [];
let lastVisible: {
  readonly project: Project;
  readonly visibility: ReadonlyMap<string, MarkingVisibility>;
  readonly result: readonly ArrowShape[];
} | null = null;

function sameShapes(a: readonly ArrowShape[], b: readonly ArrowShape[]): boolean {
  return a.length === b.length && a.every((shape, i) => shape === b[i]);
}

/**
 * The arrows that show: both ends exist and none is hidden by the display mode
 * (`visibility`; no entry, visible). In project order (the last one is on top). Cached by the
 * project and the visibility, and the same array while the drawn arrows are the same:
 * pan and zoom do not come through here, and editing what is not an arrow does not redraw the arrows.
 */
export function visibleArrowShapes(
  project: Project | null,
  visibility: ReadonlyMap<string, MarkingVisibility>,
): readonly ArrowShape[] {
  if (!project || project.arrows.length === 0) return NO_SHAPES;
  if (lastVisible?.project === project && lastVisible.visibility === visibility) {
    return lastVisible.result;
  }
  const shapes: ArrowShape[] = [];
  for (const arrow of project.arrows) {
    if (
      visibility.get(arrow.from) === 'hidden' ||
      visibility.get(arrow.to) === 'hidden'
    ) {
      continue;
    }
    const shape = arrowShape(project, arrow);
    if (shape) shapes.push(shape);
  }
  const previous = lastVisible?.result ?? NO_SHAPES;
  const result = sameShapes(previous, shapes) ? previous : shapes;
  lastVisible = { project, visibility, result };
  return result;
}

const lengthCache = new WeakMap<ArrowShape, number>();

/**
 * The stroke length (sum of the `path` sections, canvas units), cached per
 * `ArrowShape`: pan and zoom do not recompute it (the on-screen length is it × the zoom).
 */
export function arrowPathLength(shape: ArrowShape): number {
  const cached = lengthCache.get(shape);
  if (cached !== undefined) return cached;
  let total = 0;
  for (let i = 1; i < shape.path.length; i++) {
    total += dist(shape.path[i - 1] as Point, shape.path[i] as Point);
  }
  lengthCache.set(shape, total);
  return total;
}

// ---------------------------------------------------------------------------
// Touch

/** Distance from point `p` to segment `a`–`b`. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** Distance from the point to the stroke (the smallest among the segments). */
export function distanceToPath(p: Point, path: readonly Point[]): number {
  const only = path[0];
  if (!only) return Infinity;
  if (path.length === 1) return dist(p, only);
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    best = Math.min(best, distanceToSegment(p, path[i - 1] as Point, path[i] as Point));
  }
  return best;
}

/**
 * Arrows under point `c` (canvas): those whose stroke is within `tolerance` screen px, the closest
 * first; on a tie, the top one (the last in the array).
 */
export function arrowsAt(
  shapes: readonly ArrowShape[],
  c: Point,
  zoom: number,
  tolerance = ARROW_HIT_TOLERANCE,
): ArrowShape[] {
  const reach = tolerance / zoom;
  const hits: {
    readonly shape: ArrowShape;
    readonly distance: number;
    readonly order: number;
  }[] = [];
  shapes.forEach((shape, order) => {
    const b = shape.bounds;
    if (
      c.x < b.x - reach ||
      c.x > b.x + b.width + reach ||
      c.y < b.y - reach ||
      c.y > b.y + b.height + reach
    ) {
      return;
    }
    const distance = distanceToPath(c, shape.path);
    if (distance <= reach) hits.push({ shape, distance, order });
  });
  hits.sort((x, y) => x.distance - y.distance || y.order - x.order);
  return hits.map((hit) => hit.shape);
}

// ---------------------------------------------------------------------------
// Handles

/**
 * A handle of the selected arrow: the end (`end`, drag to another marking or another side), a
 * through point (`point`, `index` in `arrow.points`: move; double click removes), the middle of
 * a section (`mid`, `index` = where the new point enters `arrow.points`: dragging creates it) or, only
 * in `elbow`, a middle segment (`segment`, `index` = the lane in `arrow.points` and `route.lanes`;
 * `axis` = the coordinate it fixes: dragging moves it in parallel, and double click returns to the
 * default route). `elbow` has no `point` or `mid`: `points` there are the segments.
 */
export type ArrowHandle =
  | { readonly kind: 'end'; readonly end: ArrowEnd; readonly at: Point }
  | { readonly kind: 'point'; readonly index: number; readonly at: Point }
  | { readonly kind: 'mid'; readonly index: number; readonly at: Point }
  | {
      readonly kind: 'segment';
      readonly index: number;
      readonly axis: 'x' | 'y';
      readonly at: Point;
    };

/**
 * The arrow's handles, in touch priority order: the two ends, the through points, the
 * middles of the sections (only those `ARROW_MID_HANDLE_MIN` screen px or longer). In `elbow`, the
 * ends and the middle of each middle segment (with the same minimum length).
 */
export function arrowHandles(shape: ArrowShape, zoom: number): ArrowHandle[] {
  const points = shape.route.points;
  const handles: ArrowHandle[] = [];
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return handles;
  handles.push(
    { kind: 'end', end: 'from', at: first },
    { kind: 'end', end: 'to', at: last },
  );
  if (shape.arrow.style === 'elbow') {
    shape.route.lanes.forEach((lane, index) => {
      const a = points[index + 1] as Point;
      const b = points[index + 2] as Point;
      if (dist(a, b) * zoom >= ARROW_MID_HANDLE_MIN) {
        handles.push({
          kind: 'segment',
          index,
          axis: lane.axis,
          at: shape.mids[index + 1] as Point,
        });
      }
    });
    return handles;
  }
  for (let i = 1; i < points.length - 1; i++) {
    handles.push({ kind: 'point', index: i - 1, at: points[i] as Point });
  }
  shape.mids.forEach((at, i) => {
    const a = points[i] as Point;
    const b = points[i + 1] as Point;
    if (dist(a, b) * zoom >= ARROW_MID_HANDLE_MIN)
      handles.push({ kind: 'mid', index: i, at });
  });
  return handles;
}

/**
 * The middle-segment handle of an `elbow` arrow under `c`: the whole segment catches the touch (not
 * only the middle handle), the closest first; a zero-length segment does not catch it.
 */
function segmentHandleAt(shape: ArrowShape, c: Point, zoom: number): ArrowHandle | null {
  const points = shape.route.points;
  const reach = ARROW_HIT_TOLERANCE / zoom;
  let best: ArrowHandle | null = null;
  let bestDistance = Infinity;
  shape.route.lanes.forEach((lane, index) => {
    const a = points[index + 1] as Point;
    const b = points[index + 2] as Point;
    if (a.x === b.x && a.y === b.y) return;
    const distance = distanceToSegment(c, a, b);
    if (distance <= reach && distance < bestDistance) {
      best = {
        kind: 'segment',
        index,
        axis: lane.axis,
        at: shape.mids[index + 1] as Point,
      };
      bestDistance = distance;
    }
  });
  return best;
}

/**
 * The through points of an `elbow` arrow with one lane per middle segment, for the gesture that
 * moves a segment: the stored ones, if they match the route (`arrow.points`), or the middle of each
 * segment of the default route, in the points' space (`placement`), rounded to the pixel.
 */
export function elbowLanePoints(shape: ArrowShape, placement: Placement): ArrowPoint[] {
  const { arrow, route } = shape;
  if (arrow.points.length === route.lanes.length) return [...arrow.points];
  return route.lanes.map((_, index) => {
    const at = fromCanvasPoint(placement, shape.mids[index + 1] as Point);
    return { x: Math.round(at.x), y: Math.round(at.y) };
  });
}

/** The handle under `c`: the first in priority order, and among those of the same kind the closest. */
export function arrowHandleAt(
  shape: ArrowShape,
  c: Point,
  zoom: number,
  radius = ARROW_HANDLE_HIT_RADIUS,
): ArrowHandle | null {
  const reach = radius / zoom;
  let best: ArrowHandle | null = null;
  let bestDistance = Infinity;
  for (const handle of arrowHandles(shape, zoom)) {
    if (best && best.kind !== handle.kind) break;
    const distance = dist(c, handle.at);
    if (distance <= reach && distance < bestDistance) {
      best = handle;
      bestDistance = distance;
    }
  }
  if (!best && shape.arrow.style === 'elbow') return segmentHandleAt(shape, c, zoom);
  return best;
}

/** Center of the marking's link handle (canvas): outside the right edge, at the middle of the side. */
export function linkHandlePoint(rect: Rect, zoom: number): Point {
  return {
    x: rect.x + rect.width + LINK_HANDLE_OFFSET / zoom,
    y: rect.y + rect.height / 2,
  };
}

/** Is point `c` on the rectangle's link handle? */
export function isOnLinkHandle(rect: Rect, c: Point, zoom: number): boolean {
  return dist(c, linkHandlePoint(rect, zoom)) <= ARROW_HANDLE_HIT_RADIUS / zoom;
}

/**
 * The side of the rectangle closest to the point (distance to each side's segment; ties in the order
 * `top`, `right`, `bottom`, `left`). Inside the rectangle, the closest border side.
 */
export function nearestSide(rect: Rect, p: Point): ArrowSide {
  const x1 = rect.x + rect.width;
  const y1 = rect.y + rect.height;
  const sides: readonly [ArrowSide, number][] = [
    ['top', distanceToSegment(p, { x: rect.x, y: rect.y }, { x: x1, y: rect.y })],
    ['right', distanceToSegment(p, { x: x1, y: rect.y }, { x: x1, y: y1 })],
    ['bottom', distanceToSegment(p, { x: rect.x, y: y1 }, { x: x1, y: y1 })],
    ['left', distanceToSegment(p, { x: rect.x, y: rect.y }, { x: rect.x, y: y1 })],
  ];
  let best = sides[0] as [ArrowSide, number];
  for (const side of sides) if (side[1] < best[1]) best = side;
  return best[0];
}

/** Direction (unit vector) the arrow head points: second-to-last to last distinct stroke point. */
export function headDirection(path: readonly Point[]): Point {
  const last = path[path.length - 1];
  if (!last) return { x: 1, y: 0 };
  for (let i = path.length - 2; i >= 0; i--) {
    const prev = path[i] as Point;
    const d = dist(prev, last);
    if (d > 1e-6) return { x: (last.x - prev.x) / d, y: (last.y - prev.y) / d };
  }
  return { x: 1, y: 0 };
}

/**
 * The stroke without the last `length` of length (the head covers that stretch): the stroke does not
 * poke out of the head at the sides. Shorter than `length`, the first point remains.
 */
export function trimPathEnd(path: readonly Point[], length: number): Point[] {
  const out = [...path];
  let left = length;
  while (out.length > 1) {
    const last = out[out.length - 1] as Point;
    const prev = out[out.length - 2] as Point;
    const d = dist(prev, last);
    if (d > left) {
      const t = (d - left) / d;
      out[out.length - 1] = {
        x: prev.x + (last.x - prev.x) * t,
        y: prev.y + (last.y - prev.y) * t,
      };
      return out;
    }
    left -= d;
    out.pop();
  }
  return out;
}

/** Width of the head (side to side) as a fraction of its length. */
const HEAD_WIDTH_RATIO = 0.9;

/**
 * The arrow head: a triangle with its tip at `tip`, pointing in direction `dir` (unit vector), of
 * length `length`. Flat list of points for Konva.
 */
export function headPoints(tip: Point, dir: Point, length: number): number[] {
  const bx = tip.x - dir.x * length;
  const by = tip.y - dir.y * length;
  const half = (length * HEAD_WIDTH_RATIO) / 2;
  return [
    tip.x,
    tip.y,
    bx - dir.y * half,
    by + dir.x * half,
    bx + dir.y * half,
    by - dir.x * half,
  ];
}

/** The stroke points as Konva's flat list `[x0, y0, x1, y1, …]`. */
export function flatPoints(path: readonly Point[]): number[] {
  const flat: number[] = [];
  for (const p of path) flat.push(p.x, p.y);
  return flat;
}

/** What is drawn of all arrows at a zoom: the strokes (minus the end the head covers) and the heads. */
export interface ArrowStrokes {
  /** Flat list `[x0, y0, x1, y1, …]` of each arrow's stroke, minus the head stretch. */
  readonly bodies: readonly (readonly number[])[];
  /** The same for `elbow` arrows, which the drawing paints with sharp corners (square join). */
  readonly corners: readonly (readonly number[])[];
  /** Triangle of each head, flat list of three points. */
  readonly heads: readonly (readonly number[])[];
}

/** Fraction of the head length that the stroke leaves out (the head covers it). */
const HEAD_OVERLAP = 0.9;
/** Stroke points closer than this (screen px) to each other do not change what is seen. */
const DRAW_SPACING = 2;

/** The stroke without points within `spacing` of the previous kept one (first and last stay). */
export function thinPath(path: readonly Point[], spacing: number): Point[] {
  const first = path[0];
  if (!first) return [];
  const out: Point[] = [first];
  for (let i = 1; i < path.length - 1; i++) {
    const p = path[i] as Point;
    if (dist(p, out[out.length - 1] as Point) >= spacing) out.push(p);
  }
  if (path.length > 1) out.push(path[path.length - 1] as Point);
  return out;
}

/**
 * The drawing of the arrows at `zoom`, with a head of `headPx` screen px: its length in canvas units
 * is `headPx / zoom`. It only depends on the shapes and the zoom (pan does not recompute).
 */
export function arrowStrokes(
  shapes: readonly ArrowShape[],
  zoom: number,
  headPx: number,
): ArrowStrokes {
  const length = headPx / zoom;
  const bodies: number[][] = [];
  const corners: number[][] = [];
  const heads: number[][] = [];
  for (const shape of shapes) {
    const tip = shape.path[shape.path.length - 1];
    if (!tip) continue;
    // No head (`headPx` 0: the short arrow, only the stroke): the stroke goes to the end, no triangle.
    const trimmed =
      length > 0 ? trimPathEnd(shape.path, length * HEAD_OVERLAP) : shape.path;
    // The corner is not thinned: dropping a point near another would eat a short section's bend.
    const flat = flatPoints(
      shape.arrow.style === 'elbow' ? trimmed : thinPath(trimmed, DRAW_SPACING / zoom),
    );
    (shape.arrow.style === 'elbow' ? corners : bodies).push(flat);
    if (length > 0) heads.push(headPoints(tip, headDirection(shape.path), length));
  }
  return { bodies, corners, heads };
}
