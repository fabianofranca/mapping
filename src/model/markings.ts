import { fail } from './errors';
import {
  IDENTITY_PLACEMENT,
  effectiveMinSize,
  bottom,
  checkRectSize,
  clamp,
  containsRect,
  fromCanvasRect,
  imageCanvasRect,
  imagePixelRect,
  isIntegerRect,
  rectsOverlap,
  right,
  translateRect,
  type Size,
} from './geometry';
import { releasedAnchors } from './anchorRelease';
import { withAnchoredFollowers } from './anchors';
import { arrowIdsAttachedTo, withoutArrows } from './arrows';
import { descendantIds, descendantsOf } from './hierarchy';
import {
  clearArrowRoutes,
  markingCanvasRectOf,
  settleFrom,
  spaceOf,
  type SettleOptions,
} from './hierarchySettle';
import { canDeleteMarking, canEditMarkingGeometry, requireUnlocked } from './locks';
import { findById, normalizeOptionalName, updateById } from './project';
import { projectIndex, idInUse } from './projectIndex';
import { countBrokenRefs } from './refs';
import type { Marking, Project, Rect } from './types';

/**
 * Options of the operations that change the rectangle. `minSize` is the minimum size of the
 * component that draws the marking (Library stage): the caller reads it from the catalog and
 * passes it here; the model does not know components. Without the option nothing changes.
 * `settle` and `minSizeOf` belong to the settle (`SettleOptions`): `settle: false` only in
 * gesture previews; `minSizeOf` gives the minimum of any marking (the descendants that change
 * space along) and, when missing, the operation's own marking uses `minSize`.
 */
export interface RectOptions extends SettleOptions {
  readonly minSize?: Size;
}

function checkRectShape(rect: Rect, options?: RectOptions): void {
  if (!isIntegerRect(rect)) fail('rect-not-integer');
  checkRectSize(rect, options?.minSize);
}

/**
 * Settles at the end of the operation (unless `settle: false`). Without `minSizeOf`, `minSize`
 * applies to the operation's marking; with `minSizeOf`, `minSize` still applies to it and
 * `minSizeOf` to the others.
 */
function settled(
  before: Project,
  next: Project,
  markingId: string,
  options?: RectOptions,
): Project {
  const min = options?.minSize;
  if (min === undefined) return settleFrom(before, next, options);
  const minSizeOf = options?.minSizeOf;
  return settleFrom(before, next, {
    ...options,
    minSizeOf: (id) => (id === markingId ? min : (minSizeOf?.(id) ?? null)),
  });
}

/**
 * Limit where the marking can stay: its container's rectangle, in its pixels; `null` for a
 * canvas marking (no limit). The parent no longer limits: the parent is derived from geometry.
 */
export function markingBounds(p: Project, markingId: string): Rect | null {
  return spaceOf(p, findById(p.markings, markingId)).bounds;
}

export interface NewMarkingArgs {
  readonly id: string;
  /** Container of the marking (`rect` in its pixels) or `null`: canvas marking (canvas units). */
  readonly containerId: string | null;
  readonly rect: Rect;
  readonly name?: string | null;
  /** Floating (v13): only on the canvas (`containerId` null); default `false`. */
  readonly floating?: boolean;
}

/**
 * Creates a marking. With a container, the `rect` (in its pixels) must be entirely inside it;
 * on the canvas, any integer position works. It does not choose the parent or check the space:
 * it settles (the parent is the smallest marking in the same space that contains it, and a
 * canvas rectangle that fits entirely inside a container becomes the container's).
 */
export function createMarking(
  p: Project,
  args: NewMarkingArgs,
  options?: RectOptions,
): Project {
  // Markings, arrows and containers share the id space.
  if (idInUse(p, args.id)) fail('duplicate-id', args.id);
  const floating = args.floating ?? false;
  if (floating && args.containerId !== null) fail('invalid-space', args.id);
  const container =
    args.containerId === null ? null : findById(p.containers, args.containerId);
  checkRectShape(args.rect, options);
  if (container && !containsRect(imagePixelRect(container), args.rect)) {
    fail('rect-out-of-image');
  }
  const marking: Marking = {
    id: args.id,
    containerId: args.containerId,
    parentId: null,
    name: normalizeOptionalName(args.name ?? null),
    rect: {
      x: args.rect.x,
      y: args.rect.y,
      width: args.rect.width,
      height: args.rect.height,
    },
    needsReview: false,
    locked: false,
    floating,
    source: null,
  };
  return settled(p, { ...p, markings: [...p.markings, marking] }, args.id, options);
}

export function renameMarking(
  p: Project,
  markingId: string,
  name: string | null,
): Project {
  const normalized = normalizeOptionalName(name);
  return {
    ...p,
    markings: updateById(p.markings, markingId, (m) => ({ ...m, name: normalized })),
  };
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/**
 * Changes the rectangle (resize or fine adjustment). Resizing is free and does not move the
 * children: whatever stops fitting in the rectangle stops being a member when settling. Only
 * the container limits (a container marking stays entirely inside it; on the canvas, no limit).
 * The current rectangle is not a change: it returns `p` as is, without checking the lock (the
 * complete re-export of a locked item goes through).
 */
export function setMarkingRect(
  p: Project,
  markingId: string,
  rect: Rect,
  options?: RectOptions,
): Project {
  const marking = findById(p.markings, markingId);
  if (sameRect(marking.rect, rect)) return p;
  checkRectShape(rect, options);
  requireUnlocked(canEditMarkingGeometry(p, markingId));
  const bounds = markingBounds(p, markingId);
  if (bounds && !containsRect(bounds, rect)) fail('rect-out-of-image');
  const copy: Rect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  return settled(
    p,
    {
      ...p,
      markings: updateById(p.markings, markingId, (m) => ({ ...m, rect: copy })),
    },
    markingId,
    options,
  );
}

/**
 * Changes the marking's space: `containerId` (new container, or `null` = the canvas) and the
 * `rect` in it, together (the same change as the proposals' composite `space` change). The
 * `rect` is in the new container's pixels (on the canvas, in canvas units) and must fit in it.
 * A floating marking only lives on the canvas. Settles at the end (the parent and the space of
 * the others come out of the geometry; a canvas rectangle that fits entirely in a container
 * becomes the container's). An attached arrow loses its waypoints when the space changes. It is
 * geometry: the lock prevents it.
 */
export function setMarkingSpace(
  p: Project,
  markingId: string,
  containerId: string | null,
  rect: Rect,
  options?: RectOptions,
): Project {
  const marking = findById(p.markings, markingId);
  if (marking.floating && containerId !== null) fail('invalid-space', markingId);
  const container = containerId === null ? null : findById(p.containers, containerId);
  // The current space and rectangle are not a change: returns `p` without checking the lock.
  if (marking.containerId === containerId && sameRect(marking.rect, rect)) return p;
  checkRectShape(rect, options);
  requireUnlocked(canEditMarkingGeometry(p, markingId));
  if (container && !containsRect(imagePixelRect(container), rect)) {
    fail('rect-out-of-image');
  }
  const copy: Rect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  const base = {
    ...p,
    markings: updateById(p.markings, markingId, (m) => ({
      ...m,
      containerId,
      parentId: null,
      rect: copy,
    })),
  };
  return settled(
    p,
    marking.containerId !== containerId
      ? clearArrowRoutes(base, new Set([markingId]))
      : base,
    markingId,
    options,
  );
}

/**
 * Moves the marking by the (integer) offset. Inside a container, it also takes all the
 * descendants along (locked ones included: the relative position between them and the marking
 * does not change); on the canvas, the marking is a lens and moves alone (floating included).
 * Nothing ties the marking to the container: it can leave it, and the settle decides the new
 * space, converting its `rect` and the descendants'. The markings anchored to it (v20) go along,
 * with the descendants and those anchored to them (the relative position is kept, locked ones
 * included). A zero offset is not a change: it returns `p` as is, without checking the lock.
 */
export function moveMarking(
  p: Project,
  markingId: string,
  dx: number,
  dy: number,
  options?: RectOptions,
): Project {
  if (!Number.isInteger(dx) || !Number.isInteger(dy)) fail('rect-not-integer');
  findById(p.markings, markingId);
  if (dx === 0 && dy === 0) return p;
  requireUnlocked(canEditMarkingGeometry(p, markingId));
  // Takes the descendants (in a container) and the anchored ones, with their descendants and anchored ones.
  const affected = withAnchoredFollowers(p, [markingId]);
  return settled(
    p,
    {
      ...p,
      markings: p.markings.map((m) =>
        affected.has(m.id) ? { ...m, rect: translateRect(m.rect, dx, dy) } : m,
      ),
    },
    markingId,
    options,
  );
}

/**
 * Fine adjustment of a rectangle field (details panel), with the value clamped to the rules
 * instead of rejected: `x`/`y` move the marking (with the descendants, inside a container, like
 * dragging) and, on a container marking, stop at the container's limit (the panel does not
 * eject; on the canvas they are free); `width`/`height` resize keeping the top-left corner,
 * from the minimum size to the container's limit (on the canvas, no maximum). With
 * `options.minSize` (component), the component's minimum also limits from below.
 */
export function adjustMarkingRect(
  p: Project,
  markingId: string,
  field: keyof Rect,
  value: number,
  options?: RectOptions,
): Project {
  if (!Number.isInteger(value)) fail('rect-not-integer');
  const { rect } = findById(p.markings, markingId);
  const bounds = markingBounds(p, markingId);
  if (field === 'x' || field === 'y') {
    const horizontal = field === 'x';
    const size = horizontal ? rect.width : rect.height;
    const low = bounds ? (horizontal ? bounds.x : bounds.y) : -Infinity;
    const high = bounds ? (horizontal ? right(bounds) : bottom(bounds)) - size : Infinity;
    const delta = clamp(value, low, high) - rect[field];
    if (delta === 0) return p;
    return moveMarking(
      p,
      markingId,
      horizontal ? delta : 0,
      horizontal ? 0 : delta,
      options,
    );
  }
  const minimum = effectiveMinSize(options?.minSize)[field];
  const maximum = bounds
    ? field === 'width'
      ? right(bounds) - rect.x
      : bottom(bounds) - rect.y
    : Infinity;
  const size = clamp(value, minimum, maximum);
  if (size === rect[field]) return p;
  return setMarkingRect(p, markingId, { ...rect, [field]: size }, options);
}

/**
 * Turns the floating marking on or off (v13): a comment over the canvas, outside the membership
 * tree in both directions. Turning on takes the marking out of the container (converts the
 * `rect` to canvas units, as the person sees it) and zeroes `containerId` and `parentId`; the
 * children stay where they are and the settle reparents them. Turning off only clears the flag:
 * the settle returns it to the container that fully contains it, if any. It is geometry: the
 * lock prevents it in both directions.
 */
export function setMarkingFloating(
  p: Project,
  markingId: string,
  floating: boolean,
  options?: RectOptions,
): Project {
  const marking = findById(p.markings, markingId);
  if (marking.floating === floating) return p;
  requireUnlocked(canEditMarkingGeometry(p, markingId));
  let next: Marking;
  if (floating) {
    const min = options?.minSize ?? options?.minSizeOf?.(markingId) ?? null;
    next = {
      ...marking,
      containerId: null,
      parentId: null,
      floating: true,
      rect: fromCanvasRect(
        IDENTITY_PLACEMENT,
        markingCanvasRectOf(p, marking),
        null,
        min,
      ),
    };
  } else {
    next = { ...marking, floating: false };
  }
  // Turning on the floating one takes the marking out of the container: attached arrows lose their waypoints.
  const moved = floating && marking.containerId !== null;
  const base = { ...p, markings: updateById(p.markings, markingId, () => next) };
  return settled(
    p,
    moved ? clearArrowRoutes(base, new Set([markingId])) : base,
    markingId,
    options,
  );
}

/** Clears the `needsReview` flag ("Confirm position"). */
export function confirmMarkingReview(p: Project, markingId: string): Project {
  return {
    ...p,
    markings: updateById(p.markings, markingId, (m) => ({ ...m, needsReview: false })),
  };
}

export function markingDeletionImpact(
  p: Project,
  markingId: string,
): {
  descendants: number;
  /** How many of the descendants are locked (they will be deleted along). */
  lockedDescendants: number;
  /** Annotations that go away: those of the markings that go and of the arrows attached to them. */
  annotations: number;
  /** Containers that have the marking (or a descendant) as parent: they stay, moving to its parent. */
  containers: number;
  /** Arrows attached to some marking that goes (as origin or destination): they go along. */
  arrows: number;
  brokenRefs: number;
} {
  findById(p.markings, markingId);
  const ids = descendantIds(p, markingId);
  const descendants = ids.size;
  const lockedDescendants = descendantsOf(p, markingId).filter((m) => m.locked).length;
  ids.add(markingId);
  const byParent = projectIndex(p).containersByParent;
  let containers = 0;
  for (const id of ids) containers += byParent.get(id)?.length ?? 0;
  const arrowIds = arrowIdsAttachedTo(p, ids);
  return {
    descendants,
    lockedDescendants,
    annotations: p.annotations.filter(
      (a) => ids.has(a.markingId) || arrowIds.has(a.markingId),
    ).length,
    containers,
    arrows: arrowIds.size,
    brokenRefs: countBrokenRefs(p, cascadeRemove(p, markingId)),
  };
}

/**
 * Deletes the marking, the descendants (locked or not), the arrows attached to any of them and
 * the annotations of all of them (arrows included); never a container: those that were inside
 * move to its parent, or to none (the settle redoes it). Fails only if the marking itself is
 * locked (the lock of an attached arrow does not prevent it).
 */
export function removeMarking(
  p: Project,
  markingId: string,
  options?: SettleOptions,
): Project {
  findById(p.markings, markingId);
  requireUnlocked(canDeleteMarking(p, markingId));
  return settleFrom(p, cascadeRemove(p, markingId), options);
}

/** The deletion itself, without the lock or the settle: also serves to count the impact. */
function cascadeRemove(p: Project, markingId: string): Project {
  const ids = descendantIds(p, markingId).add(markingId);
  return withoutArrows(
    {
      ...p,
      markings: releasedAnchors(p, ids).filter((m) => !ids.has(m.id)),
      annotations: p.annotations.filter((a) => !ids.has(a.markingId)),
    },
    arrowIdsAttachedTo(p, ids),
  );
}

// ---------------------------------------------------------------------------
// Order among siblings

/**
 * Siblings of the marking (same parent and same space, itself included), in array order: the
 * same `containerId`, and `null` with `null` (the canvas ones, floating included).
 */
function siblingsOf(p: Project, marking: Marking): readonly Marking[] {
  const group = projectIndex(p).children.get(marking.parentId) ?? [];
  return group.filter((m) => m.containerId === marking.containerId);
}

/**
 * Position of the marking among its siblings (0 = the first, drawn at the bottom) and how many
 * siblings there are, itself included. The order is that of the `markings` array.
 */
export function siblingPosition(
  p: Project,
  markingId: string,
): { index: number; count: number } {
  const marking = findById(p.markings, markingId);
  const siblings = siblingsOf(p, marking);
  return { index: siblings.findIndex((m) => m.id === markingId), count: siblings.length };
}

/**
 * Moves the marking to position `index` among its siblings (0 = at the bottom, the last = on
 * top). The siblings occupy the same slots of the array; the other markings do not change
 * place. It is not geometry: the lock does not prevent it. The same position returns `p` as is;
 * outside `[0, count - 1]` it fails with `invalid-index`.
 */
export function reorderMarking(p: Project, markingId: string, index: number): Project {
  const marking = findById(p.markings, markingId);
  const siblings = siblingsOf(p, marking);
  if (!Number.isInteger(index) || index < 0 || index >= siblings.length) {
    fail('invalid-index');
  }
  const from = siblings.findIndex((m) => m.id === markingId);
  if (from === index) return p;
  const order = siblings.filter((m) => m.id !== markingId);
  order.splice(index, 0, marking);
  const slots = new Set(siblings.map((m) => m.id));
  let next = 0;
  return {
    ...p,
    markings: p.markings.map((m) => (slots.has(m.id) ? (order[next++] as Marking) : m)),
  };
}

// ---------------------------------------------------------------------------
// Placement of a floating marking near a target (Spatial markings stage, ME4)

/** Constant gap, in canvas units, between the floating marking, the target and the other floating ones. */
export const FLOATING_GAP = 24;

/** Target of `near`: a container or a marking. */
export interface FloatingNearTarget {
  readonly kind: 'container' | 'marking';
  readonly id: string;
}

/**
 * Rectangle (canvas units) for a floating marking of `size` near `target`, in a free spot of
 * the margin. Deterministic: tries the **right** of the target (on a container marking, the
 * margin is that of its container, starting at the marking's height), stacking from top to
 * bottom with `FLOATING_GAP` without overlapping containers or other floating markings; if
 * the stacking would go past the target's height, it tries the **left**, then **below**
 * (stacking to the right) and **above**; if no side fits, it stays on the right, stacked until
 * a gap is found. The returned rectangle always has integer values (containers with a
 * fractional `placement` give fractional positions): `size` rises to the next integer and the
 * position is rounded away from the target (`ceil` on the right/below, `floor` on the
 * left/above) before the obstacle check, which runs on the already integer rectangle; this way
 * the rounding never shrinks the gap or overlaps an obstacle. A nonexistent target fails with
 * `not-found`.
 */
export function placeFloatingNear(
  p: Project,
  target: FloatingNearTarget,
  size: Size,
): Rect {
  const index = projectIndex(p);
  let anchor: Rect;
  let start: Rect;
  if (target.kind === 'container') {
    const container = index.containers.get(target.id) ?? fail('not-found', target.id);
    anchor = imageCanvasRect(container, container.placement);
    start = anchor;
  } else {
    const marking = index.markings.get(target.id) ?? fail('not-found', target.id);
    start = markingCanvasRectOf(p, marking);
    const container =
      marking.containerId === null
        ? undefined
        : index.containers.get(marking.containerId);
    anchor = container ? imageCanvasRect(container, container.placement) : start;
  }
  const obstacles: Rect[] = p.containers.map((c) => imageCanvasRect(c, c.placement));
  for (const m of p.markings) {
    if (m.floating && m.containerId === null && m.id !== target.id) {
      obstacles.push(markingCanvasRectOf(p, m));
    }
  }
  return floatingSpotNear(obstacles, anchor, start, size);
}

/**
 * The spot of `placeFloatingNear` for any set of obstacles (rectangles on the canvas): a
 * floating marking of `size` beside `anchor` (the container, or the canvas marking), starting
 * at the height of `start`. Tries the right, the left, below and above, stacking with
 * `FLOATING_GAP` without overlapping any obstacle; if no side fits, it stays on the right,
 * stacked until a gap is found. Integer, as in `placeFloatingNear`. It also serves the arrival
 * of perspectives.
 */
export function floatingSpotNear(
  obstacles: readonly Rect[],
  anchor: Rect,
  start: Rect,
  size: Size,
): Rect {
  const width = Math.ceil(size.width);
  const height = Math.ceil(size.height);
  const hit = (rect: Rect): Rect | undefined =>
    obstacles.find((o) => rectsOverlap(rect, o));

  // Stacks downward (fixed x) or to the right (fixed y) until a gap is found.
  const stackDown = (x: number, y: number): Rect => {
    let rect: Rect = { x, y, width, height };
    for (let o = hit(rect); o; o = hit(rect))
      rect = { ...rect, y: Math.ceil(bottom(o) + FLOATING_GAP) };
    return rect;
  };
  const stackRight = (x: number, y: number): Rect => {
    let rect: Rect = { x, y, width, height };
    for (let o = hit(rect); o; o = hit(rect))
      rect = { ...rect, x: Math.ceil(right(o) + FLOATING_GAP) };
    return rect;
  };

  // Rounds away from the target (right/below: `ceil`; left/above: `floor`) so the gap never
  // shrinks; along the side, `ceil`.
  const onRight = stackDown(Math.ceil(right(anchor) + FLOATING_GAP), Math.ceil(start.y));
  if (onRight.y <= bottom(anchor)) return onRight;
  const onLeft = stackDown(
    Math.floor(anchor.x - FLOATING_GAP - width),
    Math.ceil(start.y),
  );
  if (onLeft.y <= bottom(anchor)) return onLeft;
  const below = stackRight(Math.ceil(start.x), Math.ceil(bottom(anchor) + FLOATING_GAP));
  if (below.x <= right(anchor)) return below;
  const above = stackRight(
    Math.ceil(start.x),
    Math.floor(anchor.y - FLOATING_GAP - height),
  );
  if (above.x <= right(anchor)) return above;
  return onRight;
}
