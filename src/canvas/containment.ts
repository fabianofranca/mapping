// Containment interaction by geometry (Spatial markings stage, ME1): snapping a moved
// marking into a container and absorbing whatever is almost inside a drawn or resized
// marking. The model only knows "inside = fully contained"; the tolerance
// lives here, in the interaction, with a single threshold and no user option (docs/ARCHITECTURE.md,
// "Spaces, containment and gestures").
// Pure functions, without DOM or Konva, tested in `tests/canvas/containment.test.ts`.
import {
  bottom,
  containsRect,
  containsRectApprox,
  imageCanvasRect,
  rectsOverlap,
  right,
  type Placement,
  type Project,
  type ProjectContainer,
  type Rect,
} from '../model';

/**
 * How much an outside part may measure (screen px) and still count as "inside": the snap
 * of a marking dropped almost whole into a container and the absorption of an item that crosses the
 * drawn or resized marking. Converted by the zoom and the container's scale at the
 * moment of dropping (`spaceTolerance`). No user option. The order of `TAP_REPEAT_DISTANCE`.
 */
export const ABSORB_TOLERANCE = 12;

/** Floating-point slack when rounding outward (canvas coordinates, decimals). */
const SLACK = 1e-6;

/** The tolerance in screen px, in units of the space (container pixels or canvas). */
export function spaceTolerance(zoom: number, scale: number): number {
  return ABSORB_TOLERANCE / (zoom * scale);
}

// ---------------------------------------------------------------------------
// Encaixe

/** Where the moved marking will end up and how much to shift for it to fit in that container. */
export interface SnapTarget {
  /** Container that will hold the marking (it contains it or receives it by snapping). */
  readonly containerId: string;
  /** Extra shift, whole, in the marking's origin space (zero if it is already inside). */
  readonly dx: number;
  readonly dy: number;
}

/**
 * Container that keeps the marking when dropped, and the shift that takes it inside.
 * `canvas`: its rectangle in canvas units, already with the pointer shift; `from`:
 * position of the space the `rect` is in (origin container or identity, where the shift
 * is measured); `tolerance`: `ABSORB_TOLERANCE` in canvas units (screen px / zoom).
 *
 * - Whole inside a container: it, with no shift.
 * - Almost whole (the outside part does not exceed `tolerance` on any side) and fitting in it: the
 *   shift takes it inside. The shift is computed in canvas units and
 *   converted back to the origin space rounding **inward** (`ceil` for what needs to
 *   go right/down, `floor` left/up); if even so it does not end up inside (a marking
 *   almost the size of the container), it does not snap.
 * - Bigger than the container, or far: nothing.
 *
 * With more than one candidate (side-by-side containers), the one with the smallest shift wins.
 */
export function snapTarget(
  canvas: Rect,
  from: Placement,
  containers: readonly ProjectContainer[],
  tolerance: number,
): SnapTarget | null {
  let best: (SnapTarget & { readonly cost: number }) | null = null;
  for (const c of containers) {
    const box = imageCanvasRect(c, c.placement);
    if (containsRectApprox(box, canvas)) return { containerId: c.id, dx: 0, dy: 0 };
    if (canvas.width > box.width + SLACK || canvas.height > box.height + SLACK) continue;
    const outLeft = box.x - canvas.x;
    const outRight = right(canvas) - right(box);
    const outTop = box.y - canvas.y;
    const outBottom = bottom(canvas) - bottom(box);
    if (Math.max(outLeft, outRight, outTop, outBottom) > tolerance) continue;
    // How much to shift (canvas) per axis: right if it passes on the left, and vice versa.
    const shiftX = outLeft > 0 ? outLeft : outRight > 0 ? -outRight : 0;
    const shiftY = outTop > 0 ? outTop : outBottom > 0 ? -outBottom : 0;
    const dx = toSpaceInside(shiftX, from.scale);
    const dy = toSpaceInside(shiftY, from.scale);
    const moved: Rect = {
      x: canvas.x + dx * from.scale,
      y: canvas.y + dy * from.scale,
      width: canvas.width,
      height: canvas.height,
    };
    if (!containsRectApprox(box, moved)) continue;
    const cost = Math.abs(dx) + Math.abs(dy);
    if (best === null || cost < best.cost) {
      best = { containerId: c.id, dx, dy, cost };
    }
  }
  return best && { containerId: best.containerId, dx: best.dx, dy: best.dy };
}

/** Canvas shift in whole units of the space, rounded to the side that goes in. */
function toSpaceInside(canvasShift: number, scale: number): number {
  const value = canvasShift / scale;
  return value > 0 ? Math.ceil(value - SLACK) : Math.floor(value + SLACK);
}

// ---------------------------------------------------------------------------
// Absorption

/** Item a marking can absorb: a marking of the space or, on the canvas, a container. */
export interface AbsorbCandidate {
  readonly kind: 'marking' | 'container';
  readonly id: string;
  /** In the marking's space (container pixels or canvas units). */
  readonly rect: Rect;
}

export interface Absorption {
  /** The rectangle after growing to wrap what it absorbed (whole). */
  readonly rect: Rect;
  /** What was absorbed, in order (from the smallest excess to the largest). */
  readonly absorbed: readonly AbsorbCandidate[];
}

/**
 * Items that a space's marking can absorb: the markings of the same space (minus the
 * floating ones and those in `exclude`: itself and its ancestors) and, on the canvas (`containerId`
 * null), also the containers (rectangle on the canvas). Those that already contain the rectangle
 * are left out in
 * `absorbInto`, which sees them at the moment.
 */
export function absorbCandidates(
  project: Project,
  containerId: string | null,
  exclude: ReadonlySet<string>,
): AbsorbCandidate[] {
  const out: AbsorbCandidate[] = [];
  for (const m of project.markings) {
    if (m.containerId !== containerId || m.floating || exclude.has(m.id)) continue;
    out.push({ kind: 'marking', id: m.id, rect: m.rect });
  }
  if (containerId === null) {
    for (const c of project.containers) {
      out.push({ kind: 'container', id: c.id, rect: imageCanvasRect(c, c.placement) });
    }
  }
  return out;
}

/** How much of the item passes on each side of the marking (zero when it does not pass). */
function overflowOf(rect: Rect, item: Rect) {
  return {
    left: Math.max(0, rect.x - item.x),
    right: Math.max(0, right(item) - right(rect)),
    top: Math.max(0, rect.y - item.y),
    bottom: Math.max(0, bottom(item) - bottom(rect)),
  };
}

/**
 * The rectangle that wraps `rect` and `item`, in integers: `floor` left/top, `ceil` right/bottom.
 */
function growToCover(rect: Rect, item: Rect): Rect {
  const x0 = Math.floor(Math.min(rect.x, item.x) + SLACK);
  const y0 = Math.floor(Math.min(rect.y, item.y) + SLACK);
  const x1 = Math.ceil(Math.max(right(rect), right(item)) - SLACK);
  const y1 = Math.ceil(Math.max(bottom(rect), bottom(item)) - SLACK);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * Absorption: the items that **cross** `rect` without being wholly inside or containing the
 * rectangle, and whose outside part does not exceed `tolerance` (units of the space) on any side,
 * are wrapped: the rectangle grows until it covers them. One by one, from the smallest excess to
 * the largest (the excess is the largest outside side; then, the sum), reevaluating at each growth.
 * With `limit` (the container, for a container marking) the growth does not leave it: an item that
 * does not fit is not absorbed. The caller removes the ancestors and the floating ones from
 * `candidates`; an item that **contains** the rectangle (a possible parent) is never absorbed, not
 * even on a tie. It never fails.
 */
export function absorbInto(
  rect: Rect,
  candidates: readonly AbsorbCandidate[],
  tolerance: number,
  limit: Rect | null,
): Absorption {
  let current = rect;
  const absorbed: AbsorbCandidate[] = [];
  const remaining = [...candidates];
  for (;;) {
    let best: {
      readonly index: number;
      readonly excess: number;
      readonly sum: number;
      readonly grown: Rect;
    } | null = null;
    for (const [index, candidate] of remaining.entries()) {
      const item = candidate.rect;
      if (containsRectApprox(item, current) || containsRectApprox(current, item))
        continue;
      if (!rectsOverlap(current, item)) continue;
      const o = overflowOf(current, item);
      const excess = Math.max(o.left, o.right, o.top, o.bottom);
      if (excess > tolerance) continue;
      const grown = growToCover(current, item);
      if (limit !== null && !containsRect(limit, grown)) continue;
      const sum = o.left + o.right + o.top + o.bottom;
      if (
        best === null ||
        excess < best.excess ||
        (excess === best.excess && sum < best.sum)
      ) {
        best = { index, excess, sum, grown };
      }
    }
    if (best === null) break;
    current = best.grown;
    absorbed.push(remaining[best.index] as AbsorbCandidate);
    remaining.splice(best.index, 1);
  }
  return { rect: current, absorbed };
}
