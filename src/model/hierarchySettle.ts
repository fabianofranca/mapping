import { releaseStrandedAnchors } from './anchorRelease';
import {
  EPSILON,
  IDENTITY_PLACEMENT,
  containsRect,
  containsRectApprox,
  fromCanvasRect,
  imageCanvasRect,
  imagePixelRect,
  toCanvasRect,
  type Size,
} from './geometry';
import { reconcilePerspectives, reconcilePerspectivesFrom } from './perspectiveReconcile';
import { projectIndex } from './projectIndex';
import { settleDelta, type SettleDelta } from './settleDelta';
import { localParents, type Dirty } from './settleLocal';
import { canContain, equalRectRanks, pickParent, type Entry } from './settleParent';
import {
  advancePositions,
  knownPositions,
  rememberPositions,
  scanSpaceEntry,
  type PositionTable,
  type SpaceEntry,
} from './settlePositions';
import { buildRectIndex, type RectIndex } from './spaceIndex';
import type { Marking, Placement, Project, ProjectContainer, Rect } from './types';

// Containment by geometry (rules in docs/ARCHITECTURE.md, "Spaces, containment and gestures" and
// in docs/FORMAT.md, "Fields of v13 (containment)"). Who contains whom is decided by the tool and
// written to the JSON: the agent reads `parentId` (of the marking and of the container) and
// never computes intersections. "Inside" always means fully contained; the tolerance lives in
// the interaction (`src/canvas/`), never here.

/**
 * Options of the operations that touch geometry. `settle: false` only in gesture previews
 * (containment frozen while the pointer moves); every other call settles. `minSizeOf` gives the
 * minimum size of the component that draws the marking (the model knows no components): it applies
 * when converting the `rect` to another space. `before` is the project from before the
 * operation: the perspectives and the arrival marks are reconciled by comparing the two
 * (`reconcilePerspectives`); without it, the project that enters the settle applies.
 */
export interface SettleOptions {
  readonly settle?: boolean;
  readonly minSizeOf?: (markingId: string) => Size | null;
  readonly before?: Project;
}

/** Coordinate space of a marking: its container or the canvas. */
export interface Space {
  /** `null` = the canvas. */
  readonly containerId: string | null;
  /** The container's, or the identity on the canvas. */
  readonly placement: Placement;
  /** Container rectangle in its own pixels; `null` on the canvas (no limit). */
  readonly bounds: Rect | null;
}

export const CANVAS_SPACE: Space = {
  containerId: null,
  placement: IDENTITY_PLACEMENT,
  bounds: null,
};

/** Space of the container. */
export function containerSpace(container: ProjectContainer): Space {
  return {
    containerId: container.id,
    placement: container.placement,
    bounds: imagePixelRect(container),
  };
}

/**
 * Space of the marking. A marking of a nonexistent container (invalid project) falls on the
 * canvas, so that whoever draws does not break; the repair is what resolves it.
 */
export function spaceOf(p: Project, marking: Pick<Marking, 'containerId'>): Space {
  if (marking.containerId === null) return CANVAS_SPACE;
  const container = projectIndex(p).containers.get(marking.containerId);
  return container ? containerSpace(container) : CANVAS_SPACE;
}

/** Rectangle of the marking in canvas units (decimal on a container marking). */
export function markingCanvasRectOf(p: Project, marking: Marking): Rect {
  return toCanvasRect(spaceOf(p, marking).placement, marking.rect);
}

/**
 * The container that fully contains the `canvas` rectangle (canvas units). Since containers do
 * not overlap, there is at most one; `null` = none (the space is the canvas).
 */
export function containerContaining(p: Project, canvas: Rect): ProjectContainer | null {
  for (const c of p.containers) {
    if (containsRectApprox(imageCanvasRect(c, c.placement), canvas)) return c;
  }
  return null;
}

/**
 * The parent that the settle would choose among the `candidates` markings of space
 * `containerId` (all already valid by geometry: they contain what is to be put inside): of the
 * smallest area, the innermost of each chain of equal rectangles (`equalRectRanks`), and the
 * `current`, if it is one of them. Wrap uses this to find the set's current parent through the
 * chain, never through the array.
 */
export function enclosingAmong(
  p: Project,
  containerId: string | null,
  candidates: ReadonlySet<string>,
  current: string | null,
): string | null {
  const group: Entry[] = [];
  p.markings.forEach((m, i) => {
    if (!m.floating && m.containerId === containerId) group.push({ m, i });
  });
  const ranks = new Map<string, number>();
  equalRectRanks(group, ranks);
  const inside = group.filter((e) => candidates.has(e.m.id));
  return pickParent(inside, current, (id) => ranks.get(id) ?? -1);
}

type ContainerLookup = (id: string) => ProjectContainer | undefined;

/**
 * Reconciles the perspectives only with what changed between `reference` and `settled`; when in
 * doubt, with everything.
 */
function reconcileSettled(reference: Project, settled: Project): Project {
  const delta = reference === settled ? null : settleDelta(reference, settled);
  return delta
    ? reconcilePerspectivesFrom(reference, settled, delta)
    : reconcilePerspectives(reference, settled);
}

/**
 * Stores the per-space positions of the result, so that the next operation does not scan the
 * project: those the settle built, or the previous ones plus what the operation created
 * (`advancePositions`).
 */
function rememberTable(
  before: Project,
  settled: Project,
  delta: SettleDelta | null,
  table: TableHolder,
): void {
  if (delta === null || !delta.stable) return;
  const advanced =
    table.known &&
    !table.moved &&
    advancePositions(table.known, delta, before.markings, settled.markings);
  if (!advanced && table.built.size === 0) return;
  rememberPositions(settled.markings, new Map([...(advanced || []), ...table.built]));
}

/**
 * The space and `rect` that the geometry gives the marking; the marking itself if nothing changes.
 */
function settleSpace(
  p: Project,
  m: Marking,
  containerOf: ContainerLookup,
  options: SettleOptions | undefined,
): Marking {
  let canvas: Rect;
  if (m.containerId === null) {
    canvas = m.rect;
  } else {
    const own = containerOf(m.containerId);
    // Nonexistent container: invalid project; the repair resolves it, the settle does not invent.
    if (!own) return m;
    if (!m.floating && containsRect(imagePixelRect(own), m.rect)) return m;
    canvas = toCanvasRect(own.placement, m.rect);
  }
  const target = m.floating ? null : containerContaining(p, canvas);
  if (target === null && m.containerId === null) return m;
  const min = options?.minSizeOf?.(m.id) ?? null;
  const space = target ? containerSpace(target) : CANVAS_SPACE;
  return {
    ...m,
    containerId: space.containerId,
    rect: fromCanvasRect(space.placement, canvas, space.bounds, min),
  };
}

/**
 * Settles containment: for each non-floating marking it decides the space (the container that
 * fully contains its rectangle on the canvas, otherwise the canvas) and, if it changed, converts
 * the `rect`; a floating one always goes to the canvas. Then it recomputes the `parentId` of
 * every marking (the smallest one in the same space that contains it) and of every container
 * (the smallest canvas marking that contains its rectangle), with the floating ones out of the
 * relation in both directions.
 *
 * Stable tie-break (stage #549): on ties the current relation holds, and the array only decides
 * a new tie. Equal rectangles follow the current chain of `parentId`s (`chainOrder`; whoever is
 * not in it enters by the array: the earlier one is the outer one). Among candidates of the same
 * area, of each group of equal rectangles the innermost counts, and the current parent stays if
 * it is one of them; otherwise, the one that comes later (`pickParent`). So reordering siblings
 * never changes parents, not even on the next settle. The result depends on the current
 * `parentId` only in those ties.
 *
 * It does not change the order of the arrays. Arrows are not in the relation; they only lose
 * their `points` when one of the endpoints changes space. At the end it reconciles the
 * perspectives and the arrival marks with the result (`options.before` ?? `p` is the project
 * from before). Deterministic and idempotent: with nothing to change it returns `p` as is (the
 * same object).
 *
 * Cost (#882): the parent comes from a spatial index per space (`spaceIndex.ts`), not from a scan
 * of the space; k well-distributed markings cost ~O(k). It stays quadratic only in the
 * degenerate case of many huge markings covering all the others (the index does not prune what
 * covers everything), of many equal rectangles (`chainOrder`) and of rectangles off the grid
 * (zero or tiny width or height).
 */
export function settleHierarchy(p: Project, options?: SettleOptions): Project {
  const settled = releaseStrandedAnchors(settleGeometry(p, options, null), null, p);
  return reconcilePerspectives(options?.before ?? p, settled);
}

/**
 * The markings of the settle: the list is only copied on the first swap (it almost never changes
 * entirely).
 */
interface MarkingList {
  readonly items: () => readonly Marking[];
  readonly at: (i: number) => Marking;
  readonly set: (i: number, m: Marking) => void;
  readonly copied: () => boolean;
}

function markingList(source: readonly Marking[]): MarkingList {
  let copy: Marking[] | null = null;
  return {
    items: () => copy ?? source,
    at: (i) => (copy ?? source)[i] as Marking,
    set: (i, m) => {
      copy ??= [...source];
      copy[i] = m;
    },
    copied: () => copy !== null,
  };
}

/** The state of a settle. */
interface Work {
  readonly p: Project;
  readonly options: SettleOptions | undefined;
  readonly list: MarkingList;
  /** Markings that changed space: the arrow attached to them loses its waypoints. */
  readonly moved: Set<string>;
  /** Indices of those that changed space (the new space needs to know they arrived). */
  readonly landed: number[];
  /** Spaces settled in full; `null` = all. */
  readonly full: Set<string | null> | null;
  /** What changed in each space settled only in what the change touches. */
  readonly dirty: Map<string | null, Dirty>;
  /** The positions and boxes of each space's markings (`settlePositions.ts`). */
  readonly table: TableHolder;
  /** Positions (ascending) of the markings the operation touched: their stored box is not valid. */
  touched: readonly number[];
}

/**
 * The position table of `before`, when it holds for `next`, and the spaces the settle found by
 * scanning.
 */
interface TableHolder {
  readonly known: PositionTable | undefined;
  readonly built: Map<string | null, SpaceEntry>;
  /**
   * Some marking changed space in the settle: the previous table no longer holds for the result.
   */
  moved?: boolean;
  /**
   * Positions of the markings the operation touched (changed or changed space), from the clipping.
   */
  touched?: readonly number[];
}

/**
 * The settle of geometry and containment, without the perspectives. With `delta` (`settleFrom`),
 * only what the operation touched: the whole spaces that `delta.full` lists and, in the others,
 * the markings that fit in a rectangle that changed (`settleLocal`); the rest keeps the same
 * objects. Without `delta`, the whole project.
 */
function settleGeometry(
  p: Project,
  options: SettleOptions | undefined,
  delta: SettleDelta | null,
  table: TableHolder = { known: undefined, built: new Map() },
): Project {
  if (delta !== null && delta.changed.length + delta.old.length + delta.full.size === 0) {
    return p;
  }
  const w: Work = {
    p,
    options,
    list: markingList(p.markings),
    moved: new Set(),
    landed: [],
    full: delta === null ? null : new Set(delta.full),
    dirty: new Map(),
    table,
    touched: [],
  };
  moveToSpaces(w, delta);
  if (delta !== null) {
    collectDirty(w, delta);
    table.touched = w.touched;
  }
  const containers = settleParents(w);
  if (!w.list.copied() && containers === p.containers) return p;
  const markings = w.list.items() as Marking[];
  return clearArrowRoutes({ ...p, markings, containers }, w.moved);
}

/**
 * Indices of the markings that need the space checked: those that changed and those of the whole
 * spaces.
 */
function spaceCandidates(w: Work, delta: SettleDelta | null): Iterable<number> {
  const list = w.list.items();
  if (delta === null) return list.keys();
  const out = new Set(delta.changed);
  if (delta.full.size > 0) {
    list.forEach((m, i) => {
      if (delta.full.has(m.containerId)) out.add(i);
    });
  }
  return out;
}

/**
 * Takes each marking to the space the geometry gives it (the container that contains it, otherwise
 * the canvas).
 */
function moveToSpaces(w: Work, delta: SettleDelta | null): void {
  const lookup = containerLookup(w.p.containers, delta === null);
  for (const i of spaceCandidates(w, delta)) {
    const m = w.list.at(i);
    const next = settleSpace(w.p, m, lookup, w.options);
    if (next === m) continue;
    w.list.set(i, next);
    if (next.containerId === m.containerId) continue;
    w.moved.add(m.id);
    w.landed.push(i);
    w.table.moved = true;
    // Those on the canvas live in the space that is settled in full because of the containers'
    // parents.
    if (next.containerId === null) w.full?.add(null);
  }
}

/**
 * Whoever finds the container by id. The whole project queries once per marking (map); the
 * clipping, a few times (linear search, which does not build a map on every operation).
 */
function containerLookup(
  list: readonly ProjectContainer[],
  many: boolean,
): ContainerLookup {
  if (!many) return (id) => list.find((c) => c.id === id);
  // With repeated ids (invalid project) the first one holds, as in the project index.
  const byId = new Map<string, ProjectContainer>();
  for (const c of list) if (!byId.has(c.id)) byId.set(c.id, c);
  return (id) => byId.get(id);
}

/**
 * Stores, per space settled only in part, what changed in it (rectangles from before and after).
 */
function collectDirty(w: Work, delta: SettleDelta): void {
  const dirtyOf = (m: Marking): Dirty | null => {
    if (m.floating || w.full?.has(m.containerId)) return null;
    let dirty = w.dirty.get(m.containerId);
    if (!dirty) w.dirty.set(m.containerId, (dirty = { rects: [], seeds: [] }));
    return dirty;
  };
  w.touched = [...new Set([...delta.changed, ...w.landed])].sort((a, b) => a - b);
  for (const m of delta.old) dirtyOf(m)?.rects.push(m.rect);
  for (const i of w.touched) {
    const m = w.list.at(i);
    const dirty = dirtyOf(m);
    dirty?.rects.push(m.rect);
    dirty?.seeds.push(i);
  }
}

/**
 * Decides the parents: the whole spaces (and the containers', if the canvas is one of them) and
 * the rest only in what was touched.
 */
function settleParents(w: Work): readonly ProjectContainer[] {
  if (w.full === null) return settleFullSpaces(w, null);
  const full = new Set(w.full);
  for (const [space, dirty] of w.dirty) {
    if (!settleLocal(w, space, dirty)) full.add(space);
  }
  return settleFullSpaces(w, full);
}

/**
 * Settles in full the spaces of `spaces` (`null` = all): each marking's parent comes from the
 * space's spatial index and, if the canvas is one of them, each container's parent too. A
 * floating one never has a parent.
 */
function settleFullSpaces(
  w: Work,
  spaces: ReadonlySet<string | null> | null,
): readonly ProjectContainer[] {
  if (spaces !== null && spaces.size === 0) return w.p.containers;
  const inSpaces = (id: string | null) => spaces === null || spaces.has(id);
  const list = w.list.items();
  // Markings per space, with the index in the array; the rank resolves the equal-rectangle tie.
  const bySpace = new Map<string | null, Entry[]>();
  const patches: Entry[] = [];
  list.forEach((m, i) => {
    if (!inSpaces(m.containerId)) return;
    if (m.floating) {
      if (m.parentId !== null) patches.push({ m: { ...m, parentId: null }, i });
      return;
    }
    const group = bySpace.get(m.containerId);
    if (group) group.push({ m, i });
    else bySpace.set(m.containerId, [{ m, i }]);
  });
  const ranks = new Map<string, number>();
  for (const group of bySpace.values()) equalRectRanks(group, ranks);
  const rankOf = (id: string) => ranks.get(id) ?? -1;

  // Spatial index of each space, built when someone asks (`docs/ARCHITECTURE.md`).
  const indexes = new Map<string | null, RectIndex<Entry>>();
  const indexOf = (containerId: string | null): RectIndex<Entry> => {
    let index = indexes.get(containerId);
    if (!index) {
      index = buildRectIndex(bySpace.get(containerId) ?? [], (e) => e.m.rect);
      indexes.set(containerId, index);
    }
    return index;
  };
  for (const [space, group] of bySpace) {
    for (const e of group) {
      const parentId = markingParent(indexOf(space), e.m, rankOf);
      if (parentId !== e.m.parentId) patches.push({ m: { ...e.m, parentId }, i: e.i });
    }
  }
  const containers = inSpaces(null)
    ? settleContainerParents(w.p.containers, indexOf(null), rankOf)
    : w.p.containers;
  for (const e of patches) w.list.set(e.i, e.m);
  return containers;
}

/**
 * Parent of a container: the smallest canvas marking (not floating) that contains its rectangle.
 */
function settleContainerParents(
  list: readonly ProjectContainer[],
  canvasIndex: RectIndex<Entry>,
  rankOf: (id: string) => number,
): readonly ProjectContainer[] {
  let changed = false;
  const out = list.map((c) => {
    const rect = imageCanvasRect(c, c.placement);
    const candidates = canvasIndex
      .containing(rect, EPSILON)
      .filter((e) => containsRectApprox(e.m.rect, rect));
    const parentId = pickParent(candidates, c.parentId, rankOf);
    if (parentId === c.parentId) return c;
    changed = true;
    return { ...c, parentId };
  });
  return changed ? out : list;
}

/**
 * Settles only the markings of space `space` that fit in a rectangle that changed
 * (`localParents`). Returns `false`, touching nothing, when there are many: the space is then
 * settled in full.
 */
function settleLocal(w: Work, space: string | null, dirty: Dirty): boolean {
  const patches = localParents(w.list.items(), entryOf(w, space), dirty, w.touched);
  if (patches === null) return false;
  for (const e of patches) w.list.set(e.i, e.m);
  return true;
}

/**
 * What is known about the space: the previous one, if it holds, or a scan (done once per settle).
 */
function entryOf(w: Work, space: string | null): SpaceEntry {
  const hit = w.table.known?.get(space) ?? w.table.built.get(space);
  if (hit) return hit;
  const entry = scanSpaceEntry(w.list.items(), space);
  w.table.built.set(space, entry);
  return entry;
}

/**
 * The parent of `m` among the markings of its space (the index gives those that may contain it).
 */
function markingParent(
  index: RectIndex<Entry>,
  m: Marking,
  rankOf: (id: string) => number,
): string | null {
  const own = rankOf(m.id);
  const candidates = index
    .containing(m.rect)
    .filter((c) => canContain(c.m.rect, rankOf(c.m.id), m.rect, own));
  return pickParent(candidates, m.parentId, rankOf);
}

/**
 * Clears the waypoints of the arrows attached to any of the `markingIds` markings, which changed
 * space (decision (d): the `points` live in the space of the two endpoints, and converting the
 * route does not exist; the arrow goes back to the default edge-to-edge). With nothing to clear
 * it returns `p`.
 */
export function clearArrowRoutes(p: Project, markingIds: ReadonlySet<string>): Project {
  if (markingIds.size === 0) return p;
  let cleared = false;
  const arrows = p.arrows.map((a) => {
    if (a.points.length === 0 || !(markingIds.has(a.from) || markingIds.has(a.to))) {
      return a;
    }
    cleared = true;
    return { ...a, points: [] };
  });
  return cleared ? { ...p, arrows } : p;
}

/** Settles, unless the operation is a gesture preview (`settle: false`). */
export function settleIf(p: Project, options?: SettleOptions): Project {
  return options?.settle === false ? p : settleHierarchy(p, options);
}

/**
 * Settles the result `next` of an operation that started from `before` (except `settle: false`):
 * the perspectives are reconciled with the difference between the two. An explicit
 * `options.before` (the operation called by another, or the end of a gesture) takes precedence
 * over the `before` here.
 *
 * Only the spaces the operation affected are settled (`affectedSpaces`, #882): the rest of the
 * project keeps the same objects. The result is that of the full settle (`settleHierarchy(next)`)
 * of an already settled `before`, which is what every model operation receives.
 */
export function settleFrom(
  before: Project,
  next: Project,
  options?: SettleOptions,
): Project {
  if (options?.settle === false) return next;
  const merged = { before, ...options };
  const delta = settleDelta(before, next);
  const table: TableHolder = {
    known: delta?.stable ? knownPositions(before.markings) : undefined,
    built: new Map(),
  };
  const geometry = settleGeometry(next, merged, delta, table);
  rememberTable(before, geometry, delta, table);
  const touched = delta === null ? null : (table.touched ?? []);
  const settled = releaseStrandedAnchors(geometry, touched, before);
  return reconcileSettled(merged.before ?? next, settled);
}

/** Members of a marking: the markings and containers whose parent it is, in array order. */
export function membersOf(
  p: Project,
  markingId: string,
): {
  readonly markings: readonly Marking[];
  readonly containers: readonly ProjectContainer[];
} {
  const index = projectIndex(p);
  return {
    markings: index.children.get(markingId) ?? [],
    containers: index.containersByParent.get(markingId) ?? [],
  };
}
