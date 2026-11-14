import { imageCanvasRect, toCanvasRect } from './geometry';
import { projectIndex, type ProjectIndex } from './projectIndex';
import type {
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
  const index = projectIndex(p);
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
function viewShifts(p: Project, perspective: Perspective): Map<string, CanvasPosition> {
  const shifts = new Map<string, CanvasPosition>();
  for (const item of perspective.items) {
    if (shifts.has(item.root) || !isRootId(p, item.root)) continue;
    const at = rootPosition(p, item.root) as CanvasPosition;
    // A marking's position is whole: so is the shift.
    const whole = isMarkingRoot(p, item.root);
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

/** The arrow in view: points kept, shifted or erased according to the space of the ends. */
function arrowInView(
  index: ProjectIndex,
  arrow: Arrow,
  shift: CanvasPosition,
): Arrow | null {
  const from = index.markings.get(arrow.from);
  const to = index.markings.get(arrow.to);
  if (!from || !to) return null;
  if (arrow.points.length === 0) return arrow;
  // Points in container pixels: ends in the same container move together with it.
  if (from.containerId !== null && from.containerId === to.containerId) return arrow;
  if (index.rootOf.get(from.id) !== index.rootOf.get(to.id))
    return { ...arrow, points: [] };
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

function buildView(p: Project, perspective: Perspective): Project {
  const index = projectIndex(p);
  const shifts = viewShifts(p, perspective);
  const shiftOf = (id: string) => shifts.get(index.rootOf.get(id) ?? '');

  const containers = p.containers.flatMap((c) => {
    const d = shiftOf(c.id);
    return d ? [movedContainer(c, d)] : [];
  });
  const markings = p.markings.flatMap((m) => {
    const d = shiftOf(m.id);
    return d ? [movedMarking(m, d)] : [];
  });
  const arrows = p.arrows.flatMap((a) => {
    const d = shiftOf(a.from);
    const other = shiftOf(a.to);
    const next = d && other ? arrowInView(index, a, d) : null;
    return next ? [next] : [];
  });
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
 * Memoized: the same project and the same perspective object give the same result.
 */
export function perspectiveView(p: Project, perspective: Perspective | null): Project {
  if (perspective === null) return p;
  let byPerspective = viewCache.get(p);
  if (!byPerspective) viewCache.set(p, (byPerspective = new WeakMap()));
  let view = byPerspective.get(perspective);
  if (!view) byPerspective.set(perspective, (view = buildView(p, perspective)));
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
 * those that stopped being roots do not count). The text ("N screens · N tables") is the interface's.
 */
export function perspectiveContentCount(
  p: Project,
  perspective: Perspective,
): { readonly containers: number; readonly markings: number } {
  const index = projectIndex(p);
  let containers = 0;
  let markings = 0;
  for (const root of perspectiveRootSet(perspective)) {
    if (index.rootOf.get(root) !== root) continue;
    if (index.containers.has(root)) containers++;
    else markings++;
  }
  return { containers, markings };
}
