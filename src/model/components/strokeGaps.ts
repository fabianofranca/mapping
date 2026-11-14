import { growRadius, strokeAlignInset } from './strokeSides';
import {
  absoluteBoxes,
  hasChildren,
  type CornerRadius,
  type FrameNode,
  type Point,
  type SceneNode,
  type Stroke,
  type StrokeGap,
} from './scene';

/** Segments per rounded corner (the same in Konva and in the raster, so the drawing matches). */
const ARC_STEPS = 16;

type Side = StrokeGap['side'];

/** A straight stretch of the outline, from `a` to `b` (clockwise), on one of the four sides. */
interface Run {
  readonly side: Side;
  readonly a: Point;
  readonly b: Point;
}

const same = (p: Point, q: Point): boolean =>
  Math.abs(p.x - q.x) < 1e-9 && Math.abs(p.y - q.y) < 1e-9;

/** The axis along which a gap's `from`/`to` run: x on top and bottom, y on the sides. */
const axisOf = (side: Side, p: Point): number =>
  side === 'top' || side === 'bottom' ? p.x : p.y;

/** The parts of side `run` that remain, as `[t0, t1]` intervals of the 0..1 parameter from `a` to `b`. */
function kept(run: Run, gaps: readonly StrokeGap[]): [number, number][] {
  const start = axisOf(run.side, run.a);
  const span = axisOf(run.side, run.b) - start;
  if (span === 0) return [];
  const cuts = gaps
    .filter((g) => g.side === run.side)
    .map((g): [number, number] => {
      const t0 = (g.from - start) / span;
      const t1 = (g.to - start) / span;
      return [Math.max(0, Math.min(t0, t1)), Math.min(1, Math.max(t0, t1))];
    })
    .filter(([t0, t1]) => t1 > t0)
    .sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  let at = 0;
  for (const [t0, t1] of cuts) {
    if (t0 > at) out.push([at, t0]);
    at = Math.max(at, t1);
  }
  if (at < 1) out.push([at, 1]);
  return out;
}

const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/** The arc of a corner, from angle `from` to `from` + 90°; radius 0 is the corner itself. */
function arc(cx: number, cy: number, r: number, from: number): Point[] {
  if (r <= 0) return [{ x: cx, y: cy }];
  return Array.from({ length: ARC_STEPS + 1 }, (_, i) => {
    const angle = from + (Math.PI / 2) * (i / ARC_STEPS);
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });
}

/** The rectangle the stroke runs along (`align` and `offset` move the line) and the radius of each corner in it. */
function contourOf(stroke: Stroke, width: number, height: number, radius: CornerRadius) {
  const offset = stroke.offset ?? 0;
  const align = strokeAlignInset(stroke);
  const d = align - offset;
  const w = Math.max(0.01, width - 2 * d);
  const h = Math.max(0.01, height - 2 * d);
  const base = growRadius(radius, offset);
  const list = typeof base === 'number' ? [base, base, base, base] : [...base];
  const limit = Math.min(w, h) / 2;
  const [tl, tr, br, bl] = list.map((r) =>
    r > 0 ? Math.min(Math.max(0, r - align), limit) : 0,
  ) as [number, number, number, number];
  return { x0: d, y0: d, x1: d + w, y1: d + h, tl, tr, br, bl };
}

/**
 * The outline of `stroke` in a `width` × `height` box interrupted at `stroke.gaps`: the same
 * outline as always (`align` and `offset` move the line, and each corner takes the radius), in
 * open lines clockwise. Corners are never cut: a gap only applies to the straight part of the
 * side. Returns empty when the stroke has no gap (the whole outline is the usual one).
 */
export function gapOutlines(
  stroke: Stroke,
  width: number,
  height: number,
  radius: CornerRadius,
): Point[][] {
  const gaps = stroke.gaps;
  if (!gaps || gaps.length === 0) return [];
  const { x0, y0, x1, y1, tl, tr, br, bl } = contourOf(stroke, width, height, radius);

  const out: Point[][] = [];
  let current: Point[] = [];
  let clean = true; // the outline started without a cut (the end joins the start)
  let started = false;
  const flush = (): void => {
    if (current.length > 1) out.push(current);
    current = [];
  };
  const add = (...points: Point[]): void => {
    started = true;
    for (const p of points) {
      const last = current[current.length - 1];
      if (!last || !same(last, p)) current.push(p);
    }
  };
  let cutAny = false;
  const cut = (): void => {
    cutAny = true;
    if (!started) clean = false;
    started = true;
    flush();
  };
  const straight = (run: Run): void => {
    if (same(run.a, run.b)) return add(run.a); // side without a straight part (pill): just passes
    const parts = kept(run, gaps);
    if (parts.length === 0) return cut();
    parts.forEach(([t0, t1], i) => {
      if (t0 > 0 || i > 0) cut();
      add(lerp(run.a, run.b, t0), lerp(run.a, run.b, t1));
      if (t1 < 1) cut();
    });
  };

  straight({ side: 'top', a: { x: x0 + tl, y: y0 }, b: { x: x1 - tr, y: y0 } });
  add(...arc(x1 - tr, y0 + tr, tr, -Math.PI / 2));
  straight({ side: 'right', a: { x: x1, y: y0 + tr }, b: { x: x1, y: y1 - br } });
  add(...arc(x1 - br, y1 - br, br, 0));
  straight({ side: 'bottom', a: { x: x1 - br, y: y1 }, b: { x: x0 + bl, y: y1 } });
  add(...arc(x0 + bl, y1 - bl, bl, Math.PI / 2));
  straight({ side: 'left', a: { x: x0, y: y1 - bl }, b: { x: x0, y: y0 + tl } });
  add(...arc(x0 + tl, y0 + tl, tl, Math.PI));

  if (!cutAny) return [];
  if (current.length > 1 && clean && out.length > 0) {
    const head = out[0]!;
    const join = same(current[current.length - 1]!, head[0]!) ? head.slice(1) : head;
    out[0] = [...current, ...join];
  } else flush();
  return out;
}

/** A gap request: node `id` opens a gap where the box of node `target` (absent: not built) crosses it. */
export interface GapRequest {
  readonly id: string;
  readonly target: string | undefined;
  readonly padding: number;
}

/** The radius of each corner (tl, tr, br, bl) of the box, never beyond half the shorter side. */
function cornerRadii(node: SceneNode): [number, number, number, number] {
  const r = 'cornerRadius' in node ? node.cornerRadius : 0;
  const list = typeof r === 'number' ? [r, r, r, r] : [...r];
  const limit = Math.min(node.width, node.height) / 2;
  return list.map((v) => Math.max(0, Math.min(v, limit))) as [
    number,
    number,
    number,
    number,
  ];
}

/** The gaps of `node` for box `box` (in the node's local space): one per side it crosses. */
function gapsOf(
  node: SceneNode,
  box: { x: number; y: number; width: number; height: number },
  padding: number,
): StrokeGap[] {
  const [tl, tr, br, bl] = cornerRadii(node);
  const { width: w, height: h } = node;
  const out: StrokeGap[] = [];
  const side = (
    name: Side,
    crosses: boolean,
    from: number,
    to: number,
    lo: number,
    hi: number,
  ): void => {
    const a = Math.max(lo, from - padding);
    const b = Math.min(hi, to + padding);
    if (crosses && b > a) out.push({ side: name, from: a, to: b });
  };
  const [x0, x1, y0, y1] = [box.x, box.x + box.width, box.y, box.y + box.height];
  side('top', y0 < 0 && y1 > 0, x0, x1, tl, w - tr);
  side('right', x0 < w && x1 > w, y0, y1, tr, h - br);
  side('bottom', y0 < h && y1 > h, x0, x1, bl, w - br);
  side('left', x0 < 0 && x1 > 0, y0, y1, tl, h - bl);
  return out;
}

/**
 * Puts the `Stroke.gaps` on the nodes that asked for a gap (`stroke.gap`): the target node's
 * box, in each one's space, comes from the layout already done. An absent target (invisible), or
 * one that crosses no side, opens no gap. Returns the same tree when nothing changes.
 */
export function applyGaps(root: FrameNode, requests: readonly GapRequest[]): FrameNode {
  if (requests.length === 0) return root;
  const boxes = absoluteBoxes(root);
  const byId = new Map(requests.map((r) => [r.id, r]));
  /** The node's gaps, or `undefined` when the node did not ask for them or the target box does not cross it. */
  const gapsFor = (node: SceneNode): StrokeGap[] | undefined => {
    const request = byId.get(node.id);
    const own = boxes.get(node.id);
    const target = request?.target === undefined ? undefined : boxes.get(request.target);
    if (!request || !own || !target || !node.stroke || request.target === node.id)
      return undefined;
    const box = { x: target.x - own.x, y: target.y - own.y };
    const gaps = gapsOf(node, { ...box, ...sizeOf(target) }, request.padding);
    return gaps.length > 0 ? gaps : undefined;
  };
  const visit = (node: SceneNode): SceneNode => {
    let next = node;
    if (hasChildren(node)) {
      const children = node.children.map(visit);
      if (children.some((c, i) => c !== node.children[i])) next = { ...node, children };
    }
    const gaps = gapsFor(node);
    return gaps && node.stroke ? { ...next, stroke: { ...node.stroke, gaps } } : next;
  };
  return visit(root) as FrameNode;
}

const sizeOf = (box: { width: number; height: number }) => ({
  width: box.width,
  height: box.height,
});
