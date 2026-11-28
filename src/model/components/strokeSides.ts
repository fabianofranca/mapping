import type { CornerRadius, Point, Stroke } from './scene';

/** A straight stroke segment, in the box's local space. */
export interface SideSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/**
 * The radius of a corner moved away by `by` px (`stroke.offset`, like CSS `outline-offset`): a
 * square corner stays square; a rounded one grows by `by`.
 */
export function growRadius(radius: CornerRadius, by: number): CornerRadius {
  if (by === 0) return radius;
  const grow = (r: number): number => (r > 0 ? r + by : 0);
  return typeof radius === 'number'
    ? grow(radius)
    : [grow(radius[0]), grow(radius[1]), grow(radius[2]), grow(radius[3])];
}

/**
 * How far the stroke line enters the box by `align`: inside, half the width; outside, half the
 * width outward (negative); centered, 0.
 */
export function strokeAlignInset(stroke: Stroke): number {
  switch (stroke.align) {
    case 'inside':
      return stroke.width / 2;
    case 'outside':
      return -stroke.width / 2;
    default:
      return 0;
  }
}

/** The radius of a shadow corner: the node's plus `spread`, never below 0 (a square corner stays square). */
export function spreadRadius(radius: CornerRadius, spread: number): CornerRadius {
  const grow = (r: number): number => (r > 0 ? Math.max(0, r + spread) : 0);
  return typeof radius === 'number'
    ? grow(radius)
    : [grow(radius[0]), grow(radius[1]), grow(radius[2]), grow(radius[3])];
}

/**
 * The stroke segments of `stroke.sides` in a `width` × `height` box: one per requested side,
 * straight end to end (no corner arc), with the line shifted by `align` (inside, half the width
 * inward; outside, outward) and moved outward by `offset`. Without `sides`, returns an empty list:
 * the stroke is the outline. `sideStrokes` decides when the sides follow the corner arcs instead.
 */
export function sideSegments(
  stroke: Stroke,
  width: number,
  height: number,
): SideSegment[] {
  const { sides } = stroke;
  if (!sides) return [];
  const inset = strokeAlignInset(stroke) - (stroke.offset ?? 0);
  return sides.map((side) => {
    switch (side) {
      case 'top':
        return { x1: 0, y1: inset, x2: width, y2: inset };
      case 'bottom':
        return { x1: 0, y1: height - inset, x2: width, y2: height - inset };
      case 'left':
        return { x1: inset, y1: 0, x2: inset, y2: height };
      case 'right':
        return { x1: width - inset, y1: 0, x2: width - inset, y2: height };
    }
  });
}

/**
 * The radius of the outline the stroke is drawn on: `stroke.cornerRadius` when present, else the
 * node's own radius grown by `offset` (a square corner stays square).
 */
export function strokeRadius(stroke: Stroke, radius: CornerRadius): CornerRadius {
  return stroke.cornerRadius ?? growRadius(radius, stroke.offset ?? 0);
}

/** The rectangle the stroke's center line runs along and the radius of each corner of that line. */
export interface StrokeContour {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly tl: number;
  readonly tr: number;
  readonly br: number;
  readonly bl: number;
}

/**
 * The center line of the stroke in a `width` × `height` box: `align` and `offset` move the
 * rectangle, and each corner takes the radius of the outline (`strokeRadius`) moved by `align`
 * (never beyond half the shorter side). Shared by the gap outline and the side bands.
 */
export function strokeContour(
  stroke: Stroke,
  width: number,
  height: number,
  radius: CornerRadius,
): StrokeContour {
  const align = strokeAlignInset(stroke);
  const d = align - (stroke.offset ?? 0);
  const w = Math.max(0.01, width - 2 * d);
  const h = Math.max(0.01, height - 2 * d);
  const base = strokeRadius(stroke, radius);
  const list = typeof base === 'number' ? [base, base, base, base] : [...base];
  const limit = Math.min(w, h) / 2;
  const [tl, tr, br, bl] = list.map((r) =>
    r > 0 ? Math.min(Math.max(0, r - align), limit) : 0,
  ) as [number, number, number, number];
  return { x0: d, y0: d, x1: d + w, y1: d + h, tl, tr, br, bl };
}

/** What `stroke.sides` draws: straight lines (no rounded corner involved) and/or filled bands. */
export interface SideStrokes {
  /** Straight segments, stroked with the stroke's width, `cap` and `dash`. */
  readonly lines: readonly SideSegment[];
  /** Closed polygons, filled with the stroke's paint: the band along the sides and corner arcs. */
  readonly bands: readonly (readonly Point[])[];
}

/** Segments per rounded corner (the same in Konva and in the raster, so the drawing matches). */
const ARC_STEPS = 16;
/** Segments of a round cap. */
const CAP_STEPS = 8;

type Side = 'top' | 'right' | 'bottom' | 'left';
const ORDER: readonly Side[] = ['top', 'right', 'bottom', 'left'];

/** A side's center line, from tangent point `a` to `b` (clockwise), with its direction and outward normal. */
interface SideFrame {
  readonly a: Point;
  readonly b: Point;
  readonly d: Point;
  readonly n: Point;
}

/** The corner that follows a side clockwise: its center, radius and the angle where the arc starts. */
interface Corner {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly a0: number;
}

function sideFrame(index: number, c: StrokeContour): SideFrame {
  const { x0, y0, x1, y1 } = c;
  switch (index) {
    case 0:
      return {
        a: { x: x0 + c.tl, y: y0 },
        b: { x: x1 - c.tr, y: y0 },
        d: pt(1, 0),
        n: pt(0, -1),
      };
    case 1:
      return {
        a: { x: x1, y: y0 + c.tr },
        b: { x: x1, y: y1 - c.br },
        d: pt(0, 1),
        n: pt(1, 0),
      };
    case 2:
      return {
        a: { x: x1 - c.br, y: y1 },
        b: { x: x0 + c.bl, y: y1 },
        d: pt(-1, 0),
        n: pt(0, 1),
      };
    default:
      return {
        a: { x: x0, y: y1 - c.bl },
        b: { x: x0, y: y0 + c.tl },
        d: pt(0, -1),
        n: pt(-1, 0),
      };
  }
}

function cornerAfter(index: number, c: StrokeContour): Corner {
  switch (((index % 4) + 4) % 4) {
    case 0:
      return { cx: c.x1 - c.tr, cy: c.y0 + c.tr, r: c.tr, a0: -Math.PI / 2 };
    case 1:
      return { cx: c.x1 - c.br, cy: c.y1 - c.br, r: c.br, a0: 0 };
    case 2:
      return { cx: c.x0 + c.bl, cy: c.y1 - c.bl, r: c.bl, a0: Math.PI / 2 };
    default:
      return { cx: c.x0 + c.tl, cy: c.y0 + c.tl, r: c.tl, a0: Math.PI };
  }
}

const pt = (x: number, y: number): Point => ({ x, y });
const at = (p: Point, v: Point, k: number): Point => pt(p.x + v.x * k, p.y + v.y * k);

/** How the band meets a corner arc: full width, or tapering to 0 toward the unrequested side. */
type ArcMode = 'full' | 'start' | 'end';

/**
 * The two edges of the band along a corner's arc, clockwise. The outer edge is the circle of radius
 * `r + h`; the inner one is an ellipse whose radius along the stroked side's normal is `r − h` and
 * along the other side's normal `r + h` (so it meets the outer edge there and the band tapers to 0,
 * like a CSS border next to a 0-width one). `start`: the arc follows an unrequested side; `end`:
 * it precedes one.
 */
function arcEdges(
  corner: Corner,
  h: number,
  mode: ArcMode,
): { outer: Point[]; inner: Point[] } {
  const { cx, cy, r, a0 } = corner;
  const grown = r + h;
  const shrunk = Math.max(0, r - h);
  const rhoU = mode === 'start' ? grown : shrunk;
  const rhoV = mode === 'end' ? grown : shrunk;
  const u = pt(Math.cos(a0), Math.sin(a0));
  const v = pt(-Math.sin(a0), Math.cos(a0));
  const outer: Point[] = [];
  const inner: Point[] = [];
  for (let i = 0; i <= ARC_STEPS; i++) {
    const t = (Math.PI / 2) * (i / ARC_STEPS);
    const [cos, sin] = [Math.cos(t), Math.sin(t)];
    outer.push(
      pt(cx + grown * (cos * u.x + sin * v.x), cy + grown * (cos * u.y + sin * v.y)),
    );
    inner.push(
      pt(
        cx + rhoU * cos * u.x + rhoV * sin * v.x,
        cy + rhoU * cos * u.y + rhoV * sin * v.y,
      ),
    );
  }
  return { outer, inner };
}

/**
 * The points a `cap` adds past the end of a side that has no arc, between the band's two edges:
 * `butt` none, `square` two, `round` a half circle. At the start they go from the inner edge to the
 * outer one; at the end, from the outer edge to the inner one.
 */
function capPoints(
  p: Point,
  frame: SideFrame,
  h: number,
  cap: 'butt' | 'round' | 'square',
  atEnd: boolean,
): Point[] {
  const { d, n } = frame;
  const dir = atEnd ? d : pt(-d.x, -d.y);
  const first = atEnd ? n : pt(-n.x, -n.y);
  if (cap === 'square')
    return [at(at(p, dir, h), first, h), at(at(p, dir, h), first, -h)];
  if (cap !== 'round') return [];
  return Array.from({ length: CAP_STEPS - 1 }, (_, i) => {
    const t = (Math.PI * (i + 1)) / CAP_STEPS;
    return pt(
      p.x + h * (first.x * Math.cos(t) + dir.x * Math.sin(t)),
      p.y + h * (first.y * Math.cos(t) + dir.y * Math.sin(t)),
    );
  });
}

/** The pair of points of a side's tangent point: on the outer and on the inner edge. */
function edgePair(p: Point, n: Point, h: number): { outer: Point; inner: Point } {
  return { outer: at(p, n, h), inner: at(p, n, -h) };
}

interface Edges {
  readonly outer: Point[];
  readonly inner: Point[];
}

/** The corner between two requested sides of a run: the full-width arc, or a mitered square corner. */
function joinCorner(
  edges: Edges,
  corner: Corner,
  frame: SideFrame,
  next: SideFrame,
  h: number,
): void {
  if (corner.r > 0) {
    const arc = arcEdges(corner, h, 'full');
    edges.outer.push(...arc.outer);
    edges.inner.push(...arc.inner);
    return;
  }
  edges.outer.push(at(at(frame.b, frame.n, h), next.n, h));
  edges.inner.push(at(at(frame.b, frame.n, -h), next.n, -h));
}

/** `end` of a side moved along the side to the edge of the box (a square end ignores `align`/`offset`). */
function reachEdge(
  frame: SideFrame,
  end: 'a' | 'b',
  box: { readonly width: number; readonly height: number },
): SideFrame {
  const horizontal = frame.d.x !== 0;
  const forward = (horizontal ? frame.d.x : frame.d.y) > 0;
  const edge = (end === 'a') === forward ? 0 : horizontal ? box.width : box.height;
  const p = frame[end];
  return { ...frame, [end]: horizontal ? pt(edge, p.y) : pt(p.x, edge) };
}

const sameAs = (p: Point, q: Point): boolean =>
  Math.abs(p.x - q.x) < 1e-9 && Math.abs(p.y - q.y) < 1e-9;

/** Drops a point equal to the one before it (the tangent points repeat where a side meets an arc). */
function distinct(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || !sameAs(last, p)) out.push(p);
  }
  if (out.length > 1 && sameAs(out[0]!, out[out.length - 1]!)) out.pop();
  return out;
}

/**
 * The band of one run of consecutive requested sides (clockwise, `run` are side indexes): along the
 * sides and the corner arcs between them at full width, and at each end of the run either an arc
 * that tapers to 0 at the next side's tangent point (a rounded corner) or a straight end with the
 * stroke's `cap` (a square one).
 */
function runBand(
  run: readonly number[],
  c: StrokeContour,
  box: { readonly width: number; readonly height: number },
  stroke: Stroke,
): Point[] {
  const h = stroke.width / 2;
  const edges: Edges = { outer: [], inner: [] };
  const cap = stroke.cap ?? 'butt';
  const before = cornerAfter(run[0]! - 1, c);
  const after = cornerAfter(run[run.length - 1]!, c);
  const frames = run.map((i) => sideFrame(i, c));
  // A square end reaches the edge of the box, as the straight line always did.
  if (before.r === 0) frames[0] = reachEdge(frames[0]!, 'a', box);
  if (after.r === 0)
    frames[frames.length - 1] = reachEdge(frames[frames.length - 1]!, 'b', box);
  const first = frames[0]!;
  const last = frames[frames.length - 1]!;
  const startCap = before.r > 0 ? [] : capPoints(first.a, first, h, cap, false);
  const endCap = after.r > 0 ? [] : capPoints(last.b, last, h, cap, true);
  if (before.r > 0) {
    const arc = arcEdges(before, h, 'start');
    edges.outer.push(...arc.outer);
    edges.inner.push(...arc.inner);
  }
  frames.forEach((frame, i) => {
    const from = edgePair(frame.a, frame.n, h);
    const to = edgePair(frame.b, frame.n, h);
    edges.outer.push(from.outer, to.outer);
    edges.inner.push(from.inner, to.inner);
    const next = frames[i + 1];
    if (next) joinCorner(edges, cornerAfter(run[i]!, c), frame, next, h);
  });
  if (after.r > 0) {
    const arc = arcEdges(after, h, 'end');
    edges.outer.push(...arc.outer);
    edges.inner.push(...arc.inner);
  }
  return distinct([...edges.outer, ...endCap, ...edges.inner.reverse(), ...startCap]);
}

/** The runs of consecutive requested sides, clockwise, as side indexes (a run starts after a gap). */
function runsOf(sides: readonly Side[]): number[][] {
  const wanted = new Set(sides.map((s) => ORDER.indexOf(s)));
  const starts = [...wanted].filter((i) => !wanted.has((i + 3) % 4));
  return (starts.length > 0 ? starts : [0]).map((start) => {
    const run = [start];
    while (run.length < wanted.size && wanted.has((run[run.length - 1]! + 1) % 4))
      run.push((run[run.length - 1]! + 1) % 4);
    return run;
  });
}

/** Whether a requested side touches a corner with a radius (so its band must follow the arc). */
function touchesArc(runs: readonly number[][], c: StrokeContour): boolean {
  return runs.some((run) =>
    [run[0]! - 1, ...run].some((corner) => cornerAfter(corner, c).r > 0),
  );
}

/**
 * What `stroke.sides` draws in a `width` × `height` box whose own radius is `radius`. A side that
 * touches a corner with a radius follows the arc: the stroke becomes closed polygons (the band of
 * each run of sides, full width where both sides of a corner are requested, tapering to 0 at the
 * tangent point of a side that is not), moved by `align` and `offset`. `dash` and `scale: false`
 * keep the straight segments of `sideSegments`, and so does a box with no rounded corner.
 * Without `sides` the stroke is the outline and nothing is returned.
 */
export function sideStrokes(
  stroke: Stroke,
  width: number,
  height: number,
  radius: CornerRadius,
): SideStrokes {
  const { sides } = stroke;
  if (!sides || sides.length === 0) return { lines: [], bands: [] };
  const straight = (): SideStrokes => ({
    lines: sideSegments(stroke, width, height),
    bands: [],
  });
  if ((stroke.dash && stroke.dash.length > 0) || stroke.scale === false)
    return straight();
  const contour = strokeContour(stroke, width, height, radius);
  const runs = runsOf(sides);
  if (!touchesArc(runs, contour)) return straight();
  const box = { width, height };
  return { lines: [], bands: runs.map((run) => runBand(run, contour, box, stroke)) };
}
