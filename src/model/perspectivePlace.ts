import { IMAGE_GAP, nearestFreeSpot } from './containers';
import { fail } from './errors';
import {
  bottom,
  boundingBox,
  imageCanvasRect,
  rectsOverlap,
  right,
  snapCoordinate,
} from './geometry';
import { markingCanvasRectOf, settleHierarchy } from './hierarchySettle';
import { floatingSpotNear } from './markings';
import {
  isMarkingRoot,
  perspectiveView,
  rootFootprint,
  rootPosition,
  type CanvasPosition,
} from './perspective';
import { projectIndex } from './projectIndex';
import type { Arrival, Arrow, Marking, Perspective, Project, Rect } from './types';

// Spot search for a root in a view and arrival in Main (v16, decision 8). A "view" is a project:
// Main (the project itself) or the project as seen through a perspective (`perspectiveView`).
// The positions are canvas ones.

/** Where the root ends up in the target view and why. */
export interface RootPlacement {
  readonly x: number;
  readonly y: number;
  /**
   * `near`: at the same distance it had from the reference; `occupied`: the spot was taken, it
   * went to the nearest free one; `arrival-area`: with no reference, it went to the arrival area.
   */
  readonly kind: 'near' | 'occupied' | 'arrival-area';
  /** Reference root (the other end of the arrow), or `null` in the arrival area. */
  readonly referenceId: string | null;
}

/** The reference root of a search and its marking where the arrow ends. */
interface Reference {
  readonly rootId: string;
  readonly endId: string;
}

/** Ids of the root and of everything that belongs to it in the view (containers and markings). */
function memberIds(view: Project, rootId: string): string[] {
  const group = projectIndex(view).rootMembers.get(rootId);
  if (!group) return [];
  return [...group.containers.map((c) => c.id), ...group.markings.map((m) => m.id)];
}

/**
 * Obstacles of a spot search: the footprints of the containers, of the floating markings and of
 * the non-floating canvas markings (a root never lands inside one of them), minus the root's own
 * members.
 */
function obstaclesOf(view: Project, exclude: ReadonlySet<string>): Rect[] {
  const obstacles: Rect[] = [];
  for (const c of view.containers) {
    if (!exclude.has(c.id)) obstacles.push(imageCanvasRect(c, c.placement));
  }
  for (const m of view.markings) {
    if (m.containerId === null && !exclude.has(m.id)) obstacles.push(m.rect);
  }
  return obstacles;
}

/** The other end of `arrow` when it links root `rootId` to another root; otherwise `null`. */
function otherEnd(
  arrow: Arrow,
  roots: ReadonlyMap<string, string>,
  rootId: string,
): Reference | null {
  const from = roots.get(arrow.from);
  const to = roots.get(arrow.to);
  if (from === rootId && to !== undefined && to !== rootId) {
    return { rootId: to, endId: arrow.to };
  }
  if (to === rootId && from !== undefined && from !== rootId) {
    return { rootId: from, endId: arrow.from };
  }
  return null;
}

/**
 * The first arrow of the source (in array order) that links the root to another root also present
 * in the target: the other root and its marking where the arrow ends.
 */
function findReference(
  target: Project,
  source: Project,
  rootId: string,
): Reference | null {
  const sourceRoots = projectIndex(source).rootOf;
  const targetRoots = projectIndex(target).rootOf;
  for (const arrow of source.arrows) {
    const ref = otherEnd(arrow, sourceRoots, rootId);
    if (ref && targetRoots.get(ref.rootId) === ref.rootId) return ref;
  }
  return null;
}

/**
 * The root `rootId` of Main `p` has a reference: an arrow links one of its members to a member of
 * another root (the same rule as the spot search; an arrow between members of the root itself
 * does not count). It reads the current arrows, writing nothing: it is how the interface deduces,
 * even after a reload, whether the root with an arrival mark went next to a reference or to the
 * arrival area.
 */
export function arrivalHasReference(p: Project, rootId: string): boolean {
  return findReference(p, p, rootId) !== null;
}

function overlapsAny(rect: Rect, obstacles: readonly Rect[]): Rect | undefined {
  return obstacles.find((o) => rectsOverlap(rect, o));
}

interface Seek {
  readonly obstacles: readonly Rect[];
  readonly width: number;
  readonly height: number;
  /** Marking: whole position (`ceil`/`round`). */
  readonly whole: boolean;
  readonly floating: boolean;
}

/** The point of the arrow's other end, in the target, to anchor a floating marking. */
function anchorOf(target: Project, endId: string): { anchor: Rect; start: Rect } {
  const index = projectIndex(target);
  const end = index.markings.get(endId) as Marking;
  const start = markingCanvasRectOf(target, end);
  const container =
    end.containerId === null ? undefined : index.containers.get(end.containerId);
  return {
    anchor: container ? imageCanvasRect(container, container.placement) : start,
    start,
  };
}

function placeNear(
  target: Project,
  seek: Seek,
  desired: CanvasPosition,
  ref: Reference,
): RootPlacement {
  const spot = { x: desired.x, y: desired.y, width: seek.width, height: seek.height };
  const referenceId = ref.rootId;
  if (!overlapsAny(spot, seek.obstacles))
    return { x: spot.x, y: spot.y, kind: 'near', referenceId };
  if (seek.floating) {
    const { anchor, start } = anchorOf(target, ref.endId);
    const free = floatingSpotNear(seek.obstacles, anchor, start, spot);
    return { x: free.x, y: free.y, kind: 'occupied', referenceId };
  }
  const free = nearestFreeSpot(seek.obstacles, seek.width, seek.height, desired);
  const clean = (v: number) => (seek.whole ? Math.round(v) : snapCoordinate(v));
  return { x: clean(free.x), y: clean(free.y), kind: 'occupied', referenceId };
}

/** Footprints of the target's roots that pass `keep`. */
function rootRects(target: Project, keep: (id: string) => boolean): Rect[] {
  const rects: Rect[] = [];
  for (const id of projectIndex(target).roots) {
    const rect = keep(id) ? rootFootprint(target, id) : null;
    if (rect) rects.push(rect);
  }
  return rects;
}

/**
 * The arrival area column: to the right of the content (the roots with a mark do not count),
 * starting from its top. In Main (`from` given), grouped by origin: the same origin stacks
 * below the lowest of its own, another origin opens a new column to the right of all the roots.
 */
function arrivalColumn(
  target: Project,
  rootId: string,
  from: string | undefined,
): CanvasPosition {
  const index = projectIndex(target);
  const marked = new Map<string, Arrival>();
  if (from !== undefined) {
    for (const a of target.arrivals) {
      if (a.root !== rootId && index.rootOf.get(a.root) === a.root) marked.set(a.root, a);
    }
  }
  const content = rootRects(target, (id) => id !== rootId && !marked.has(id));
  const top = content.length > 0 ? Math.min(...content.map((r) => r.y)) : 0;
  const lowest = [...marked.values()]
    .filter((a) => a.from === from)
    .map((a) => rootFootprint(target, a.root) as Rect)
    .reduce<Rect | null>((a, b) => (a === null || bottom(b) > bottom(a) ? b : a), null);
  if (lowest) return { x: lowest.x, y: bottom(lowest) + IMAGE_GAP };
  const all = rootRects(target, (id) => id !== rootId);
  return { x: all.length > 0 ? Math.max(...all.map(right)) + IMAGE_GAP : 0, y: top };
}

function placeInArrivalArea(
  target: Project,
  seek: Seek,
  rootId: string,
  from: string | undefined,
): RootPlacement {
  const snap = seek.whole ? Math.ceil : snapCoordinate;
  const column = arrivalColumn(target, rootId, from);
  let rect: Rect = {
    x: snap(column.x),
    y: snap(column.y),
    width: seek.width,
    height: seek.height,
  };
  for (
    let o = overlapsAny(rect, seek.obstacles);
    o;
    o = overlapsAny(rect, seek.obstacles)
  ) {
    rect = { ...rect, y: snap(bottom(o) + IMAGE_GAP) };
  }
  return { x: rect.x, y: rect.y, kind: 'arrival-area', referenceId: null };
}

/**
 * Where the root `rootId` (which is in view `source`) ends up in view `target`, where it is not
 * yet (or is far away: its members do not count as an obstacle).
 *
 * With a reference (the first arrow, in array order, that links the root to another root present
 * in both views), it goes to the same distance it had from it: `near`; if that overlaps
 * something, it goes to the nearest free spot (`occupied`; a floating marking, to the margin of
 * the arrow's end). With no reference it goes to the arrival area: a column to the right of
 * everything, from the top (`arrival-area`); with `options.arrivalsFrom` (Main), grouped by
 * origin. It never lands inside a canvas marking. A marking position is whole.
 */
export function placeRootIn(
  target: Project,
  source: Project,
  rootId: string,
  options?: { readonly arrivalsFrom?: string },
): RootPlacement {
  const seek = seekFor(target, source, rootId);
  const ref = findReference(target, source, rootId);
  const desired = ref ? desiredNear(target, source, rootId, ref, seek.whole) : null;
  if (!ref || !desired)
    return placeInArrivalArea(target, seek, rootId, options?.arrivalsFrom);
  return placeNear(target, seek, desired, ref);
}

/** Size, kind and obstacles of the root's spot search. */
function seekFor(target: Project, source: Project, rootId: string): Seek {
  const size = rootFootprint(source, rootId) ?? rootFootprint(target, rootId);
  if (!size) fail('not-found', rootId);
  const exclude = new Set([...memberIds(source, rootId), ...memberIds(target, rootId)]);
  const marking =
    projectIndex(source).markings.get(rootId) ??
    projectIndex(target).markings.get(rootId);
  return {
    obstacles: obstaclesOf(target, exclude),
    width: size.width,
    height: size.height,
    whole: isMarkingRoot(source, rootId) || isMarkingRoot(target, rootId),
    floating: marking?.floating === true,
  };
}

/**
 * Where the root ends up in the target to keep the distance it has from the reference root in
 * the source; `null` if any of the positions does not exist. A marking position is whole.
 */
function desiredNear(
  target: Project,
  source: Project,
  rootId: string,
  ref: Reference,
  whole: boolean,
): CanvasPosition | null {
  const own = rootPosition(source, rootId);
  const there = rootPosition(source, ref.rootId);
  const here = rootPosition(target, ref.rootId);
  if (!own || !there || !here) return null;
  const x = snapCoordinate(here.x + own.x - there.x);
  const y = snapCoordinate(here.y + own.y - there.y);
  return whole ? { x: Math.round(x), y: Math.round(y) } : { x, y };
}

/**
 * Where the newly created root `rootId` (which is in `p` at some position) ends up in the
 * perspective `perspective`: the position it has in `p`, or, if that overlaps something the
 * perspective shows, the nearest free spot to it. Containers and canvas markings of a view do not
 * overlap. The position comes out without floating-point noise; a marking's is whole.
 */
export function placeCreatedRoot(
  p: Project,
  perspective: Perspective,
  rootId: string,
): CanvasPosition {
  const size = rootFootprint(p, rootId) ?? fail('not-found', rootId);
  const own = rootPosition(p, rootId) ?? fail('not-found', rootId);
  const others = {
    ...perspective,
    items: perspective.items.filter((item) => item.root !== rootId),
  };
  const obstacles = obstaclesOf(perspectiveView(p, others), new Set());
  const whole = isMarkingRoot(p, rootId);
  const clean = (v: number) => snapCoordinate(whole ? Math.round(v) : v);
  const wanted = { x: clean(own.x), y: clean(own.y) };
  const spot = { ...wanted, width: size.width, height: size.height };
  if (!overlapsAny(spot, obstacles)) return wanted;
  const free = nearestFreeSpot(obstacles, size.width, size.height, wanted);
  return { x: clean(free.x), y: clean(free.y) };
}

/** Moves only the root to `at` (container: `placement`; marking: `rect`). */
function moveRootTo(p: Project, rootId: string, at: CanvasPosition): Project {
  if (projectIndex(p).containers.has(rootId)) {
    return {
      ...p,
      containers: p.containers.map((c) =>
        c.id === rootId ? { ...c, placement: { ...c.placement, x: at.x, y: at.y } } : c,
      ),
    };
  }
  return {
    ...p,
    markings: p.markings.map((m) =>
      m.id === rootId ? { ...m, rect: { ...m.rect, x: at.x, y: at.y } } : m,
    ),
  };
}

/**
 * A root created outside Main arrives in it (decision 8). The root already exists in `p` (the
 * store created it) and is in `from.items`. It computes the spot with
 * `placeRootIn(p, perspectiveView(p, from))`, moves the root (only it), settles and ONLY THEN adds
 * the `Came from…` mark (replacing the previous one of the same root): the settle removes the
 * mark from whoever changed place. `kind` and `referenceId` are for the interface to tell where
 * the root ended up; they are not stored.
 */
export function arriveInPrincipal(
  p: Project,
  rootId: string,
  from: Perspective,
): { project: Project; kind: RootPlacement['kind']; referenceId: string | null } {
  const roots = projectIndex(p).rootOf;
  if (!roots.has(rootId)) fail('not-found', rootId);
  if (roots.get(rootId) !== rootId || !from.items.some((item) => item.root === rootId)) {
    fail('not-root', rootId);
  }
  const place = placeRootIn(p, perspectiveView(p, from), rootId, {
    arrivalsFrom: from.id,
  });
  const settled = settleHierarchy(moveRootTo(p, rootId, place), { before: p });
  const arrival: Arrival = { root: rootId, from: from.id, fromName: from.name };
  const arrivals = [...settled.arrivals.filter((a) => a.root !== rootId), arrival];
  return {
    project: { ...settled, arrivals },
    kind: place.kind,
    referenceId: place.referenceId,
  };
}

/** Dismisses the root's `Came from…` mark. With no mark it returns `p`. */
export function dismissArrival(p: Project, rootId: string): Project {
  if (!p.arrivals.some((a) => a.root === rootId)) return p;
  return { ...p, arrivals: p.arrivals.filter((a) => a.root !== rootId) };
}

/** The box that wraps the roots with an arrival mark (the canvas band); `null` with no marks. */
export function arrivalArea(p: Project): Rect | null {
  const rects: Rect[] = [];
  for (const a of p.arrivals) {
    const rect = rootFootprint(p, a.root);
    if (rect) rects.push(rect);
  }
  return boundingBox(rects);
}
