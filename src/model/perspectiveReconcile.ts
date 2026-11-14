import { snapCoordinate } from './geometry';
import { rootPosition } from './perspective';
import { projectIndex } from './projectIndex';
import type { SettleDelta } from './settleDelta';
import type { Arrival, Marking, Perspective, PerspectiveItem, Project } from './types';

// Reconciliation of the perspectives with the project (v16, decision 4): after any operation
// that changes the geometry (`settleHierarchy`), the roots of each perspective and the "Came from…"
// marks become valid again without anything moving on screen. Pure functions; with nothing to
// change they return the same object.

type Becoming = ReadonlyMap<string, readonly string[]>;

const EMPTY: Becoming = new Map();

/**
 * For each root from before, the items that belonged to it and are now roots (they existed before,
 * without being roots). Built in one pass over the roots from after.
 */
function becameRoots(before: Project, after: Project): Becoming {
  if (before === after) return EMPTY;
  const was = projectIndex(before).rootOf;
  const out = new Map<string, string[]>();
  for (const id of projectIndex(after).roots) {
    const old = was.get(id);
    if (old === undefined || old === id) continue;
    const list = out.get(old);
    if (list) list.push(id);
    else out.set(old, [id]);
  }
  return out;
}

/**
 * The item of `id` that sits where `item` (the root `anchorId`) was on screen: the item's position
 * plus the offset of `id` relative to `anchorId` in `p`. `null` if either does not exist.
 */
function shiftedItem(
  p: Project,
  id: string,
  item: PerspectiveItem,
  anchorId: string,
): PerspectiveItem | null {
  const at = rootPosition(p, id);
  const base = rootPosition(p, anchorId);
  if (!at || !base) return null;
  return {
    root: id,
    x: snapCoordinate(item.x + at.x - base.x),
    y: snapCoordinate(item.y + at.y - base.y),
  };
}

/** The item that replaces `item` in `after`, or `null` if it leaves. */
function survivor(
  after: Project,
  item: PerspectiveItem,
  present: ReadonlySet<string>,
): PerspectiveItem | null {
  const root = projectIndex(after).rootOf.get(item.root);
  if (root === undefined) return null;
  if (root === item.root) return item;
  // It stopped being a root: the new root comes in so that the item stays where it was on screen.
  if (present.has(root)) return null;
  return shiftedItem(after, root, item, item.root);
}

/** The position of a root that is a marking is whole. */
function wholeIfMarking(after: Project, item: PerspectiveItem): PerspectiveItem {
  const index = projectIndex(after);
  if (index.containers.has(item.root) || !index.markings.has(item.root)) return item;
  const x = Math.round(item.x);
  const y = Math.round(item.y);
  return x === item.x && y === item.y ? item : { root: item.root, x, y };
}

function reconcileItems(
  before: Project,
  after: Project,
  items: readonly PerspectiveItem[],
  becoming: Becoming,
): readonly PerspectiveItem[] {
  const present = new Set(items.map((item) => item.root));
  const seen = new Set<string>();
  const out: PerspectiveItem[] = [];
  const add = (item: PerspectiveItem | null) => {
    if (item === null || seen.has(item.root)) return;
    seen.add(item.root);
    out.push(wholeIfMarking(after, item));
  };
  for (const item of items) {
    add(survivor(after, item, present));
    // Items that belonged to this root and are now roots come in where they were.
    for (const id of becoming.get(item.root) ?? []) {
      if (!present.has(id)) {
        add(shiftedItem(before, id, item, item.root));
      }
    }
  }
  const same =
    out.length === items.length &&
    out.every((item, i) => {
      const old = items[i] as PerspectiveItem;
      return item.root === old.root && item.x === old.x && item.y === old.y;
    });
  return same ? items : out;
}

function reconcileWith(
  before: Project,
  after: Project,
  perspective: Perspective,
  becoming: Becoming,
): Perspective {
  const items = reconcileItems(before, after, perspective.items, becoming);
  const layers = projectIndex(after).layers;
  const kept = new Set(perspective.hiddenLayers.filter((id) => layers.has(id)));
  const hidden =
    kept.size === perspective.hiddenLayers.length
      ? perspective.hiddenLayers
      : perspective.hiddenLayers.filter(
          (id, i, all) => kept.has(id) && all.indexOf(id) === i,
        );
  return items === perspective.items && hidden === perspective.hiddenLayers
    ? perspective
    : { ...perspective, items, hiddenLayers: hidden };
}

/**
 * Takes a perspective from the before project (`before`) to the after one (`after`) without
 * moving anything on screen: a deleted root leaves; one that stopped being a root gives way to the
 * new root, placed so that it stays where it was; the item that became a root comes in where it
 * was (by its position from before); no repeated root (the first wins); `hiddenLayers` only with
 * layers that exist; whole marking position. With `before === after` (an "Only me" on open) it
 * only cleans up. With nothing to change it returns the perspective itself.
 */
export function reconcilePerspective(
  before: Project,
  after: Project,
  perspective: Perspective,
): Perspective {
  return reconcileWith(before, after, perspective, becameRoots(before, after));
}

/** The arrival that still holds: the root exists, is a root, does not repeat and did not move. */
function arrivalHolds(
  before: Project,
  after: Project,
  arrival: Arrival,
  seen: Set<string>,
): boolean {
  if (seen.has(arrival.root)) return false;
  seen.add(arrival.root);
  if (projectIndex(after).rootOf.get(arrival.root) !== arrival.root) return false;
  const was = rootPosition(before, arrival.root);
  const now = rootPosition(after, arrival.root);
  return !was || !now || (was.x === now.x && was.y === now.y);
}

/**
 * Reconciles the "For everyone" perspectives and the arrival marks of `after` with the geometry
 * (rules in `reconcilePerspective`). An arrival leaves when the root disappears, stops being a
 * root, repeats or changes position in the Main one ("moving the root removes the mark"). With no
 * perspective or arrival, or with nothing to change, it returns `after` (the same object).
 */
export function reconcilePerspectives(before: Project, after: Project): Project {
  if (after.perspectives.length === 0 && after.arrivals.length === 0) return after;
  const becoming = becameRoots(before, after);
  const perspectives = after.perspectives.map((x) =>
    reconcileWith(before, after, x, becoming),
  );
  const seen = new Set<string>();
  const arrivals = after.arrivals.filter((a) => arrivalHolds(before, after, a, seen));
  const samePerspectives = perspectives.every((x, i) => x === after.perspectives[i]);
  if (samePerspectives && arrivals.length === after.arrivals.length) return after;
  return {
    ...after,
    perspectives: samePerspectives ? after.perspectives : perspectives,
    arrivals: arrivals.length === after.arrivals.length ? after.arrivals : arrivals,
  };
}

/**
 * Like `reconcilePerspectives`, but without building the whole project's index (#882, decision 6):
 * `delta` is the difference between `before` and `after` (`settleDelta`). A perspective or arrival
 * mark root is a container or a canvas marking, and an item's root only changes if something in its
 * chain changed; so the same algorithm runs over a lean view of both projects, with only the
 * containers, the canvas markings and the markings the operation swapped (no annotations or arrows),
 * and the result is the same as the whole project's. The cost no longer follows the number of the
 * containers' markings.
 */
export function reconcilePerspectivesFrom(
  before: Project,
  after: Project,
  delta: SettleDelta,
): Project {
  if (after.perspectives.length === 0 && after.arrivals.length === 0) return after;
  const changed = new Set(delta.changed);
  const gone = new Set<Marking>(delta.old);
  const lean = (p: Project, keep: (m: Marking, i: number) => boolean): Project => ({
    ...p,
    markings: p.markings.filter(keep),
    annotations: [],
    arrows: [],
  });
  const leanBefore = lean(before, (m) => m.containerId === null || gone.has(m));
  const leanAfter = lean(after, (m, i) => m.containerId === null || changed.has(i));
  const result = reconcilePerspectives(leanBefore, leanAfter);
  if (result === leanAfter) return after;
  return { ...after, perspectives: result.perspectives, arrivals: result.arrivals };
}

/**
 * Removes from the perspectives' `hiddenLayers` the layers the project no longer has (deleting a
 * layer, removing a specialization). With nothing to remove it returns `p`.

 */
export function pruneHiddenLayers(p: Project): Project {
  if (p.perspectives.length === 0) return p;
  const layers = projectIndex(p).layers;
  let changed = false;
  const perspectives = p.perspectives.map((x) => {
    if (x.hiddenLayers.every((id) => layers.has(id))) return x;
    changed = true;
    return { ...x, hiddenLayers: x.hiddenLayers.filter((id) => layers.has(id)) };
  });
  return changed ? { ...p, perspectives } : p;
}
