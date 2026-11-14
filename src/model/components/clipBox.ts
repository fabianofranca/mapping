/**
 * Extended clip of a frame (A3 of the "faithful components" stage): the `outside` stroke (and half of the
 * `center` one) and the shadow of the frame itself, and of children that go past the box only by stroke or shadow,
 * enter the clip. The content (shapes and text) stays clipped to the box: a child that goes past
 * the box by its content does not widen the clip beyond what its stroke and shadow reach.
 */
import {
  type ClipBox,
  type FrameNode,
  type SceneNode,
  type Stroke,
  nodeMatrix,
} from './scene';

interface Extent {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const NONE: Extent = { left: 0, top: 0, right: 0, bottom: 0 };

function maxExtent(a: Extent, b: Extent): Extent {
  return {
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  };
}

/** How far the stroke width goes past the outline: `outside` all of it, `center` half, `inside` none. */
function bandOf(stroke: Stroke): number {
  if (stroke.align === 'outside') return stroke.width;
  return stroke.align === 'center' ? stroke.width / 2 : 0;
}

/**
 * How far the stroke leaves the box: the `offset` (the outline moved away from the shape) plus `outside` the whole
 * stroke, `center` half, `inside` nothing.
 */
function strokeExtent(stroke: Stroke | undefined): Extent {
  if (!stroke || stroke.width <= 0) return NONE;
  const out = (stroke.offset ?? 0) + bandOf(stroke);
  if (out <= 0) return NONE;
  const has = (side: 'top' | 'right' | 'bottom' | 'left'): boolean =>
    !stroke.sides || stroke.sides.includes(side);
  return {
    left: has('left') ? out : 0,
    top: has('top') ? out : 0,
    right: has('right') ? out : 0,
    bottom: has('bottom') ? out : 0,
  };
}

/**
 * How far the outer shadows leave the box, per side: the `blur`, the `spread` (grows the shape, or
 * shrinks it, if negative) and the offset of each one; the one that goes furthest wins.
 */
function shadowExtent(node: SceneNode): Extent {
  let out = NONE;
  for (const shadow of node.effects) {
    if (shadow.inner) continue;
    const reach = shadow.blur + (shadow.spread ?? 0);
    const { offset } = shadow;
    out = maxExtent(out, {
      left: Math.max(0, reach - offset.x),
      right: Math.max(0, reach + offset.x),
      top: Math.max(0, reach - offset.y),
      bottom: Math.max(0, reach + offset.y),
    });
  }
  return out;
}

function extentOf(node: SceneNode): Extent {
  return maxExtent(strokeExtent(node.stroke), shadowExtent(node));
}

function isNone(e: Extent): boolean {
  return e.left <= 0 && e.top <= 0 && e.right <= 0 && e.bottom <= 0;
}

/** The box that contains the node's `local` rectangle after the `rotation` (and the scale and translation). */
function boxOfLocal(node: SceneNode, local: ClipBox, ox: number, oy: number): ClipBox {
  const [a, b, c, d, e, f] = nodeMatrix(node);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [x, y] of [
    [local.x, local.y],
    [local.x + local.width, local.y],
    [local.x + local.width, local.y + local.height],
    [local.x, local.y + local.height],
  ] as const) {
    xs.push(ox + a * x + c * y + e);
    ys.push(oy + b * x + d * y + f);
  }
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return { x: x0, y: y0, width: Math.max(...xs) - x0, height: Math.max(...ys) - y0 };
}

/** The same offset on the four sides (the largest): the extent of a rotated node, with no right side. */
function isotropic(e: Extent): Extent {
  const all = Math.max(e.left, e.top, e.right, e.bottom);
  return { left: all, top: all, right: all, bottom: all };
}

/**
 * What the descendants of a rotated frame reach only by stroke or shadow, with no side: the largest
 * offset in the subtree (frames with a clip enter through their own extended clip).
 */
function deepExtent(node: SceneNode): Extent {
  if (node.type !== 'frame' && node.type !== 'group') return NONE;
  let out = NONE;
  for (const child of node.children) {
    if (!child.visible) continue;
    let own = extentOf(child);
    if (child.type === 'frame' && child.clip && child.clipBox) {
      const c = child.clipBox;
      own = maxExtent(own, {
        left: Math.max(0, -c.x),
        top: Math.max(0, -c.y),
        right: Math.max(0, c.x + c.width - child.width),
        bottom: Math.max(0, c.y + c.height - child.height),
      });
    } else if (!(child.type === 'frame' && child.clip)) {
      own = maxExtent(own, deepExtent(child));
    }
    out = maxExtent(out, own);
  }
  return out;
}

/** Rectangle of the node in the space of the clipping frame; with `rotation`, the box of the rotated rectangle. */
function rectOf(node: SceneNode, ox: number, oy: number): ClipBox {
  if (node.rotation)
    return boxOfLocal(
      node,
      { x: 0, y: 0, width: node.width, height: node.height },
      ox,
      oy,
    );
  const m = node.transform;
  return {
    x: ox + m[4],
    y: oy + m[5],
    width: node.width * Math.abs(m[0]),
    height: node.height * Math.abs(m[3]),
  };
}

function grow(box: ClipBox, e: Extent): ClipBox {
  return {
    x: box.x - e.left,
    y: box.y - e.top,
    width: box.width + e.left + e.right,
    height: box.height + e.top + e.bottom,
  };
}

function intersect(a: ClipBox, b: ClipBox): ClipBox | null {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
}

function union(a: ClipBox, b: ClipBox): ClipBox {
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x + a.width, b.x + b.width);
  const y1 = Math.max(a.y + a.height, b.y + b.height);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** The region a descendant reaches in the clipping frame's space and how far it can grow. */
function reach(
  child: SceneNode,
  ox: number,
  oy: number,
): { region: ClipBox; limit: Extent } | null {
  const rect = rectOf(child, ox, oy);
  if (child.type === 'frame' && child.clip && child.clipBox) {
    const c = child.clipBox;
    const overhang = {
      left: Math.max(0, -c.x),
      top: Math.max(0, -c.y),
      right: Math.max(0, c.x + c.width - child.width),
      bottom: Math.max(0, c.y + c.height - child.height),
    };
    // Rotated, the extended clip (in the frame's local space) becomes its box after the rotation.
    if (child.rotation)
      return { region: boxOfLocal(child, c, ox, oy), limit: isotropic(overhang) };
    return {
      region: { x: rect.x + c.x, y: rect.y + c.y, width: c.width, height: c.height },
      limit: overhang,
    };
  }
  const own = extentOf(child);
  // Rotated, the sides of the stroke and shadow rotate: the largest around counts, with what is inside it.
  const e = child.rotation ? isotropic(maxExtent(own, rotatedInside(child))) : own;
  return isNone(e) ? null : { region: grow(rect, e), limit: e };
}

/** What is inside a rotated child (a clipping frame does not count: the clip stands for it). */
function rotatedInside(child: SceneNode): Extent {
  return child.type === 'frame' && child.clip ? NONE : deepExtent(child);
}

/**
 * Adds to the clip what the descendants reach only by stroke or shadow: their region
 * (box + extent) limited to the frame's box + the same extent. Does not descend into a frame that
 * already clips: its extended clip (or the box) counts as the descendant itself.
 */
function addDescendants(
  node: FrameNode,
  box: ClipBox,
  ox: number,
  oy: number,
  acc: ClipBox,
): ClipBox {
  let out = acc;
  for (const child of node.children) {
    if (!child.visible) continue;
    // Rotated frame without a clip: what is inside it rotates and is not followed (only its box counts).
    if (child.type === 'frame' && !child.clip && !child.rotation) {
      const at = rectOf(child, ox, oy);
      out = addDescendants(child, box, at.x, at.y, out);
    }
    const hit = reach(child, ox, oy);
    const part = hit && intersect(hit.region, grow(box, hit.limit));
    if (part) out = union(out, part);
  }
  return out;
}

/**
 * The extended clip of a frame with `clip`, or `undefined` when the clip is the box
 * itself (nothing leaves it by stroke or shadow).
 */
export function clipBoxOf(frame: FrameNode): ClipBox | undefined {
  const box: ClipBox = { x: 0, y: 0, width: frame.width, height: frame.height };
  const own = grow(box, extentOf(frame));
  const total = addDescendants(frame, box, 0, 0, own);
  const same =
    total.x === box.x &&
    total.y === box.y &&
    total.width === box.width &&
    total.height === box.height;
  return same ? undefined : total;
}
