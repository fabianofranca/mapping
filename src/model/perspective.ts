import { imageCanvasRect, toCanvasRect } from './geometry';
import { projectIndex, type ProjectIndex } from './projectIndex';
import type {
  Annotation,
  Arrow,
  Marking,
  Perspective,
  Project,
  ProjectContainer,
  Rect,
} from './types';

// Perspectives (v16, stage #659): the project as seen through a perspective and the root queries.
// Main is the project itself (perspective `null` in the functions); a perspective only says which
// roots appear, where they sit on the canvas and which layers are hidden. The content is the
// project's. Root: container without a parent, canvas marking without a parent, or floating
// (`projectIndex(p).roots`).

/** Position on the canvas (top-left corner, in canvas units). */
export interface CanvasPosition {
  readonly x: number;
  readonly y: number;
}

/** Rectangle on the canvas of a marking (its container's converts the `rect`). */
function markingFootprint(index: ProjectIndex, marking: Marking): Rect {
  const container =
    marking.containerId === null ? undefined : index.containers.get(marking.containerId);
  return container ? toCanvasRect(container.placement, marking.rect) : marking.rect;
}

/**
 * The item's footprint on the canvas: the rectangle of the container's image, or the marking's in
 * canvas units. `null` for an id that is neither a container nor a marking.
 */
export function rootFootprint(p: Project, id: string): Rect | null {
  return footprintIn(projectIndex(p), id);
}

function footprintIn(index: ProjectIndex, id: string): Rect | null {
  const container = index.containers.get(id);
  if (container) return imageCanvasRect(container, container.placement);
  const marking = index.markings.get(id);
  return marking ? markingFootprint(index, marking) : null;
}

/**
 * Where the item sits on the canvas (the top-left corner of the footprint): `placement` of the
 * container; `rect` of the canvas marking; `placement + rect × scale` of the container marking.
 */
export function rootPosition(p: Project, id: string): CanvasPosition | null {
  const rect = rootFootprint(p, id);
  return rect ? { x: rect.x, y: rect.y } : null;
}

/** The root of the container or marking (`null` if the id does not exist). */
export function perspectiveRootOf(p: Project, id: string): string | null {
  return projectIndex(p).rootOf.get(id) ?? null;
}

/** `true` if `id` is a container or a marking that is a root. */
export function isRootId(p: Project, id: string): boolean {
  return projectIndex(p).rootOf.get(id) === id;
}

/** `true` if the root is a marking (and not a container): its position is whole. */
export function isMarkingRoot(p: Project, id: string): boolean {
  const index = projectIndex(p);
  return !index.containers.has(id) && index.markings.has(id);
}

// ---------------------------------------------------------------------------
// The project in view

/** Shift of each root present in the view (the first entry of each root wins). */
function viewShifts(
  index: ProjectIndex,
  perspective: Perspective,
): Map<string, CanvasPosition> {
  const shifts = new Map<string, CanvasPosition>();
  for (const item of perspective.items) {
    if (shifts.has(item.root) || index.rootOf.get(item.root) !== item.root) continue;
    const at = footprintIn(index, item.root) as Rect;
    // A marking's position is whole: so is the shift.
    const whole = !index.containers.has(item.root) && index.markings.has(item.root);
    const dx = item.x - at.x;
    const dy = item.y - at.y;
    shifts.set(
      item.root,
      whole ? { x: Math.round(dx) || 0, y: Math.round(dy) || 0 } : { x: dx, y: dy },
    );
  }
  return shifts;
}

const isStill = (d: CanvasPosition) => d.x === 0 && d.y === 0;

/**
 * The arrow in view: points kept, shifted or erased according to the space of the ends.
 * `sameRoot`: both ends have the same root (the caller already read both roots).
 */
function arrowInView(
  index: ProjectIndex,
  arrow: Arrow,
  shift: CanvasPosition,
  sameRoot: boolean,
): Arrow | null {
  const from = index.markings.get(arrow.from);
  const to = index.markings.get(arrow.to);
  if (!from || !to) return null;
  if (arrow.points.length === 0) return arrow;
  // Points in container pixels: ends in the same container move together with it.
  if (from.containerId !== null && from.containerId === to.containerId) return arrow;
  if (!sameRoot) return { ...arrow, points: [] };
  if (isStill(shift)) return arrow;
  const points = arrow.points.map((pt) => ({ x: pt.x + shift.x, y: pt.y + shift.y }));
  return { ...arrow, points };
}

function movedContainer(c: ProjectContainer, d: CanvasPosition): ProjectContainer {
  if (isStill(d)) return c;
  return {
    ...c,
    placement: { ...c.placement, x: c.placement.x + d.x, y: c.placement.y + d.y },
  };
}

function movedMarking(m: Marking, d: CanvasPosition): Marking {
  if (isStill(d) || m.containerId !== null) return m;
  return { ...m, rect: { ...m.rect, x: m.rect.x + d.x, y: m.rect.y + d.y } };
}

type Shifts = ReadonlyMap<string, CanvasPosition>;

/** What of `items` stays in the view, by the root of each position (`roots[i]` is the root of `items[i]`), moved by the shift of that root. */
function shiftedItems<T>(
  items: readonly T[],
  roots: readonly string[],
  shifts: Shifts,
  move: (item: T, d: CanvasPosition) => T,
): T[] {
  const kept: T[] = [];
  for (let i = 0; i < items.length; i++) {
    const d = shifts.get(roots[i]!);
    if (d) kept.push(move(items[i]!, d));
  }
  return kept;
}

/** The arrows with both ends in the view; their ids go in `keptArrows`. */
function arrowsInView(
  index: ProjectIndex,
  arrows: readonly Arrow[],
  shifts: Shifts,
  keptArrows: Set<string>,
): Arrow[] {
  const kept: Arrow[] = [];
  for (const a of arrows) {
    const fromRoot = index.rootOf.get(a.from) ?? '';
    const toRoot = index.rootOf.get(a.to) ?? '';
    const d = shifts.get(fromRoot);
    const next =
      d && shifts.has(toRoot) ? arrowInView(index, a, d, fromRoot === toRoot) : null;
    if (!next) continue;
    kept.push(next);
    keptArrows.add(next.id);
  }
  return kept;
}

/** A marking's annotation stays with its root; the object is read only for those on an arrow (or on nothing). */
function annotationsInView(
  p: Project,
  annotationRoots: readonly (string | null)[],
  shifts: Shifts,
  keptArrows: ReadonlySet<string>,
): Annotation[] {
  const kept: Annotation[] = [];
  for (let i = 0; i < p.annotations.length; i++) {
    const root = annotationRoots[i]!;
    const a = p.annotations[i]!;
    if (root !== null ? shifts.has(root) : keptArrows.has(a.markingId)) kept.push(a);
  }
  return kept;
}

function buildView(p: Project, perspective: Perspective): Project {
  const index = projectIndex(p);
  const shifts = viewShifts(index, perspective);
  // The roots come from the index by position: no hashing of each id, no reading of the annotations of what leaves.
  const containers = shiftedItems(
    p.containers,
    index.containerRoots,
    shifts,
    movedContainer,
  );
  const markings = shiftedItems(p.markings, index.markingRoots, shifts, movedMarking);
  const keptArrows = new Set<string>();
  const arrows = arrowsInView(index, p.arrows, shifts, keptArrows);
  const annotations = annotationsInView(p, index.annotationRoots, shifts, keptArrows);
  return { ...p, containers, markings, arrows, annotations };
}

const pageCache = new WeakMap<Project, Map<string, Project>>();

/**
 * The project cut down to one page (v21): the containers, markings, arrows and annotations of
 * `pageId` and nothing else (`pages`, layers, perspectives and arrivals stay as they are). Each
 * page is a canvas of its own, so whoever computes something on "the canvas" (the free spot of a
 * root, the area where an arrival goes, what a perspective shows) does it on this view. A page
 * that does not exist gives an empty view. Memoized per project and page.
 */
export function pageView(p: Project, pageId: string): Project {
  let byPage = pageCache.get(p);
  if (!byPage) pageCache.set(p, (byPage = new Map()));
  let view = byPage.get(pageId);
  if (!view) byPage.set(pageId, (view = buildPageView(p, pageId)));
  return view;
}

function buildPageView(p: Project, pageId: string): Project {
  const { pageOf } = projectIndex(p);
  const onPage = (id: string) => pageOf.get(id) === pageId;
  const containers = p.containers.filter((c) => c.pageId === pageId);
  const markings = p.markings.filter((m) => onPage(m.id));
  const arrows = p.arrows.filter((a) => onPage(a.id));
  const kept = new Set<string>([...markings, ...arrows].map((x) => x.id));
  const annotations = p.annotations.filter((a) => kept.has(a.markingId));
  return { ...p, containers, markings, arrows, annotations };
}

const viewCache = new WeakMap<Project, WeakMap<Perspective, Project>>();

/**
 * The project as the perspective shows it (decision 3): only the roots of `items` that exist and
 * are roots, each with its group, shifted to the item's position; the arrows with both ends in
 * the view (the waypoints follow); the annotations of what remains. Nothing about ownership
 * changes (`parentId`, `containerId`). Main (`null`) is the project itself.
 * With `pageId` (v21) the view is cut down to that page (`pageView`): the roots of the
 * perspective that live on other pages are not in it, and Main (`null`) is the page itself.
 * Memoized: the same project and the same perspective object give the same result.
 */
export function perspectiveView(
  p: Project,
  perspective: Perspective | null,
  pageId?: string,
): Project {
  const base = pageId === undefined ? p : pageView(p, pageId);
  if (perspective === null) return base;
  let byPerspective = viewCache.get(base);
  if (!byPerspective) viewCache.set(base, (byPerspective = new WeakMap()));
  let view = byPerspective.get(perspective);
  if (!view) byPerspective.set(perspective, (view = buildView(base, perspective)));
  return view;
}

const rootSetCache = new WeakMap<Perspective, ReadonlySet<string>>();

/** The roots of `items`, as a set (memoized per perspective). */
export function perspectiveRootSet(perspective: Perspective): ReadonlySet<string> {
  let set = rootSetCache.get(perspective);
  if (!set) {
    set = new Set(perspective.items.map((item) => item.root));
    rootSetCache.set(perspective, set);
  }
  return set;
}

/**
 * Does the arrow appear in the perspective? In Main always; otherwise, if the roots of both ends
 * are in `items` (decision 7). A nonexistent arrow does not appear.
 */
export function arrowShownIn(
  p: Project,
  perspective: Perspective | null,
  arrowId: string,
): boolean {
  const index = projectIndex(p);
  const arrow = index.arrows.get(arrowId);
  if (!arrow) return false;
  if (perspective === null) return true;
  const roots = perspectiveRootSet(perspective);
  const from = index.rootOf.get(arrow.from);
  const to = index.rootOf.get(arrow.to);
  return from !== undefined && to !== undefined && roots.has(from) && roots.has(to);
}

/**
 * How many root containers and how many root markings the perspective shows (nonexistent items or
 * those that stopped being roots do not count; with `pageId`, only those of that page). The text ("N screens · N tables") is the interface's.
 */
export function perspectiveContentCount(
  p: Project,
  perspective: Perspective,
  pageId?: string,
): { readonly containers: number; readonly markings: number } {
  const index = projectIndex(p);
  let containers = 0;
  let markings = 0;
  for (const root of perspectiveRootSet(perspective)) {
    if (index.rootOf.get(root) !== root) continue;
    if (pageId !== undefined && index.pageOf.get(root) !== pageId) continue;
    if (index.containers.has(root)) containers++;
    else markings++;
  }
  return { containers, markings };
}
