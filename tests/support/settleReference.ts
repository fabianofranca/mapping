import {
  IDENTITY_PLACEMENT,
  area,
  containsRect,
  containsRectApprox,
  fromCanvasRect,
  imageCanvasRect,
  imagePixelRect,
  toCanvasRect,
} from '../../src/model/geometry';
import { clearArrowRoutes } from '../../src/model/hierarchySettle';
import { reconcilePerspectives } from '../../src/model/perspectiveReconcile';
import { projectIndex } from '../../src/model/projectIndex';
import type {
  Marking,
  Placement,
  Project,
  ProjectContainer,
  Rect,
} from '../../src/model/types';
import type { Size } from '../../src/model/geometry';

/**
 * FROZEN EQUIVALENCE REFERENCE (#882, decision 1). Literal copy of the settle of
 * `src/model/hierarchySettle.ts` as it was before the spatial index (commit c0365b0): it scans the whole
 * space for each marking (O(k²)). DO NOT EDIT: the equivalence test
 * (`tests/model/settleEquivalence.test.ts`) compares the new implementation with it, and that is what
 * proves the optimization changed no result, ties included. Only `settleIf`/`settleFrom`
 * and the public query functions are left out; `clearArrowRoutes` is imported because it did not change.
 */

interface SettleOptions {
  readonly settle?: boolean;
  readonly minSizeOf?: (markingId: string) => Size | null;
  readonly before?: Project;
}

interface Space {
  readonly containerId: string | null;
  readonly placement: Placement;
  readonly bounds: Rect | null;
}

const CANVAS_SPACE: Space = {
  containerId: null,
  placement: IDENTITY_PLACEMENT,
  bounds: null,
};

function containerSpace(container: ProjectContainer): Space {
  return {
    containerId: container.id,
    placement: container.placement,
    bounds: imagePixelRect(container),
  };
}

function containerContaining(p: Project, canvas: Rect): ProjectContainer | null {
  for (const c of p.containers) {
    if (containsRectApprox(imageCanvasRect(c, c.placement), canvas)) return c;
  }
  return null;
}

/** A marking of a space with its index in the `markings` array. */
interface Entry {
  readonly m: Marking;
  readonly i: number;
}

/**
 * Can `outer` (rank `ro`) be the parent of `inner` (rank `ri`)? It contains it and is bigger, or is equal and
 * comes first in the order of equal rectangles (`equalRectRanks`). A strict order: there is never a cycle.
 */
function canContain(outer: Rect, ro: number, inner: Rect, ri: number): boolean {
  if (!containsRect(outer, inner)) return false;
  const ao = area(outer);
  const ai = area(inner);
  return ao > ai || (ao === ai && ro < ri);
}

const rectKey = (r: Rect): string => `${r.x},${r.y},${r.width},${r.height}`;

/** Is the current parent of `e` one of the markings of `ids` that has not been put in the order yet? */
function waitsForParent(e: Entry, ids: ReadonlySet<string>, done: ReadonlySet<string>) {
  const parent = e.m.parentId;
  return parent !== null && ids.has(parent) && !done.has(parent);
}

/**
 * Outside-in order of a group of equal rectangles (in array order): the topological
 * sort of the current `parentId`s inside the group (the parent before the child) and, among those free
 * at the same time, the one that comes first in the array. Whoever has no parent in the group (new, or that just arrived
 * at the rectangle) enters by the array, as before. A `parentId` in a cycle (invalid file) is
 * broken by the first one of the array. Total and cycle-free.
 */
function chainOrder(bucket: readonly Entry[]): Entry[] {
  const ids = new Set(bucket.map((e) => e.m.id));
  const done = new Set<string>();
  const pending = [...bucket];
  const out: Entry[] = [];
  while (pending.length > 0) {
    const free = pending.findIndex((e) => !waitsForParent(e, ids, done));
    const [next] = pending.splice(Math.max(free, 0), 1) as [Entry];
    done.add(next.m.id);
    out.push(next);
  }
  return out;
}

/**
 * Rank of each marking of a space: the index in the array, except in the groups of equal
 * rectangles, where those of the group swap places among themselves in the order of `chainOrder`. This way
 * reordering siblings (which only swaps indices) does not change which one is the outer one.
 */
function equalRectRanks(group: readonly Entry[], ranks: Map<string, number>): void {
  const buckets = new Map<string, Entry[]>();
  for (const e of group) {
    ranks.set(e.m.id, e.i);
    const key = rectKey(e.m.rect);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(e);
    else buckets.set(key, [e]);
  }
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;
    chainOrder(bucket).forEach((e, k) => ranks.set(e.m.id, (bucket[k] as Entry).i));
  }
}

/**
 * The smallest-area candidates, with only the inner one (highest rank) of each group of equal
 * rectangles.
 */
function innermostOfLeast(
  candidates: readonly Entry[],
  rankOf: (id: string) => number,
): Entry[] {
  let least = Infinity;
  for (const c of candidates) least = Math.min(least, area(c.m.rect));
  const innermost = new Map<string, Entry>();
  for (const c of candidates) {
    if (area(c.m.rect) !== least) continue;
    const key = rectKey(c.m.rect);
    const seen = innermost.get(key);
    if (!seen || rankOf(c.m.id) > rankOf(seen.m.id)) innermost.set(key, c);
  }
  return [...innermost.values()];
}

/**
 * Among the candidates that contain it (all valid by geometry), the parent: of those of smallest area
 * (`innermostOfLeast`), the current parent, if it is one of them; otherwise, the one of highest rank (the one that comes
 * later in the array).
 */
function pickParent(
  candidates: readonly Entry[],
  current: string | null,
  rankOf: (id: string) => number,
): string | null {
  let best: Entry | null = null;
  for (const c of innermostOfLeast(candidates, rankOf)) {
    if (c.m.id === current) return current;
    if (best === null || rankOf(c.m.id) > rankOf(best.m.id)) best = c;
  }
  return best?.m.id ?? null;
}

/**
 * The parent the settle would choose among the markings `candidates` of the space `containerId`
 * (all already valid by geometry: they contain what is to be put inside): of those of smallest area, the one
 * inside each chain of equal rectangles (`equalRectRanks`), and the `current`, if it is one of them.
 * Wrap uses this to find the current parent of the set by the chain, never by the array.
 */
export function referenceEnclosingAmong(
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

/** The space and the `rect` that geometry gives to the marking; itself if nothing changes. */
function settleSpace(
  p: Project,
  m: Marking,
  options: SettleOptions | undefined,
): Marking {
  let canvas: Rect;
  if (m.containerId === null) {
    canvas = m.rect;
  } else {
    const own = projectIndex(p).containers.get(m.containerId);
    // Nonexistent container: invalid project; the repair fixes it, the settle does not invent.
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

/** The settle of geometry and membership, without the perspectives. */
function referenceSettleGeometry(p: Project, options?: SettleOptions): Project {
  let changed = false;
  // Markings that changed space: the arrow attached to them loses its waypoints.
  const movedSpace = new Set<string>();
  const placed = p.markings.map((m) => {
    const next = settleSpace(p, m, options);
    if (next !== m) {
      changed = true;
      if (next.containerId !== m.containerId) movedSpace.add(m.id);
    }
    return next;
  });

  // Markings per space, with the index in the array; the rank breaks the tie of equal rectangles.
  const bySpace = new Map<string | null, Entry[]>();
  placed.forEach((m, i) => {
    if (m.floating) return;
    const group = bySpace.get(m.containerId);
    if (group) group.push({ m, i });
    else bySpace.set(m.containerId, [{ m, i }]);
  });
  const ranks = new Map<string, number>();
  for (const group of bySpace.values()) equalRectRanks(group, ranks);
  const rankOf = (id: string) => ranks.get(id) ?? -1;

  const markings = placed.map((m) => {
    const group = m.floating ? [] : (bySpace.get(m.containerId) ?? []);
    const own = rankOf(m.id);
    const candidates = group.filter((c) =>
      canContain(c.m.rect, rankOf(c.m.id), m.rect, own),
    );
    const parentId = pickParent(candidates, m.parentId, rankOf);
    if (parentId === m.parentId) return m;
    changed = true;
    return { ...m, parentId };
  });

  // Parent of a container: the smallest canvas marking (not floating) that contains its rectangle.
  const canvasGroup = bySpace.get(null) ?? [];
  const containers = p.containers.map((c) => {
    const rect = imageCanvasRect(c, c.placement);
    const candidates = canvasGroup.filter((e) => containsRectApprox(e.m.rect, rect));
    const parentId = pickParent(candidates, c.parentId, rankOf);
    if (parentId === c.parentId) return c;
    changed = true;
    return { ...c, parentId };
  });

  // Arrow (v13): outside the membership tree, the settle ignores it, except for one thing: if an
  // end changed space, the `points` (which stay in the space of the ends) go back to the default route.
  return changed ? clearArrowRoutes({ ...p, markings, containers }, movedSpace) : p;
}

/** The whole settle of before: geometry and then the perspectives (`settleHierarchy`). */
export function referenceSettleHierarchy(p: Project, options?: SettleOptions): Project {
  return reconcilePerspectives(options?.before ?? p, referenceSettleGeometry(p, options));
}
