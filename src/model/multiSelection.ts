import { releasedAnchors } from './anchorRelease';
import { withAnchoredFollowers } from './anchors';
import { arrowIdsAttachedTo, withoutArrows } from './arrows';
import { fail } from './errors';
import {
  MIN_MARKING_SIZE,
  boundingBox,
  checkRectSize,
  containsRect,
  imageCanvasRect,
  imagePixelRect,
  isIntegerRect,
  rectsOverlap,
  snapNearInteger,
  snapPlacement,
  touchDelta,
  translateRect,
} from './geometry';
import { ancestorsOf, descendantsOf } from './hierarchy';
import {
  enclosingAmong,
  markingCanvasRectOf,
  settleFrom,
  spaceOf,
  type SettleOptions,
} from './hierarchySettle';
import {
  canDeleteImage,
  canDeleteMarking,
  canEditArrow,
  canEditImagePlacement,
  canEditMarkingGeometry,
  requireUnlocked,
} from './locks';
import { findById } from './project';
import { projectIndex, idInUse } from './projectIndex';
import { countBrokenRefs } from './refs';
import type { Arrow, Marking, Placement, Project, ProjectContainer, Rect } from './types';

// Multiple selection (rules in docs/ARCHITECTURE.md, "Spaces, containment and gestures"). Pure
// operations over a list of items: move together, select with content, delete and lock. The
// interface keeps the selection as `{ kind, id }`; the model only knows this minimal shape,
// without depending on the UI state.

/**
 * A selection item: `image` = container (the UI's name), `marking` = marking, `arrow` = arrow
 * (v13). The arrow takes part in deleting and locking; moving does not apply to it (the route
 * belongs to the person and follows the ends), so `moveItems` ignores it.
 */
export interface ItemRef {
  readonly kind: 'image' | 'marking' | 'arrow';
  readonly id: string;
}

/** Existing items of the selection, without repeats, in the order they came. */
interface ResolvedItems {
  readonly list: readonly ItemRef[];
  readonly markings: ReadonlyMap<string, Marking>;
  readonly containers: ReadonlyMap<string, ProjectContainer>;
  readonly arrows: ReadonlyMap<string, Arrow>;
}

function resolveItems(p: Project, items: readonly ItemRef[]): ResolvedItems {
  const index = projectIndex(p);
  const list: ItemRef[] = [];
  const markings = new Map<string, Marking>();
  const containers = new Map<string, ProjectContainer>();
  const arrows = new Map<string, Arrow>();
  for (const item of items) {
    if (item.kind === 'image') {
      const container = index.containers.get(item.id);
      if (!container || containers.has(item.id)) continue;
      containers.set(item.id, container);
    } else if (item.kind === 'arrow') {
      const arrow = index.arrows.get(item.id);
      if (!arrow || arrows.has(item.id)) continue;
      arrows.set(item.id, arrow);
    } else {
      const marking = index.markings.get(item.id);
      if (!marking || markings.has(item.id)) continue;
      markings.set(item.id, marking);
    }
    list.push(item);
  }
  return { list, markings, containers, arrows };
}

// ---------------------------------------------------------------------------
// Move

/**
 * The items that receive their own offset in the joint drag: discards the nonexistent ones,
 * the repeated ones and the markings that already go with another selected item. A container
 * marking goes with its selected container (the coordinates are relative to it) and with a
 * selected ancestor (`moveMarking` inside the container takes the descendants). On the canvas
 * nothing is discarded: moving a canvas marking (floating included) takes nothing along
 * (decision 2), so it always moves on its own. The arrow never moves (the route belongs to the
 * person and follows the ends). Order: that of the items.
 */
export function movingItems(p: Project, items: readonly ItemRef[]): ItemRef[] {
  const selected = resolveItems(p, items);
  return selected.list.filter((item) => {
    if (item.kind === 'arrow') return false;
    if (item.kind === 'image') return true;
    const marking = selected.markings.get(item.id);
    if (!marking || marking.containerId === null) return true;
    if (selected.containers.has(marking.containerId)) return false;
    return !ancestorsOf(p, marking.id).some((a) => selected.markings.has(a.id));
  });
}

/** The item's geometry can change (own lock or one inherited from the ancestors). */
function canEditItemGeometry(p: Project, item: ItemRef): boolean {
  if (item.kind === 'arrow') return canEditArrow(p, item.id);
  return item.kind === 'image'
    ? canEditImagePlacement(p, item.id)
    : canEditMarkingGeometry(p, item.id);
}

/**
 * The joint drag can start: there is something to move and no item that receives an offset has
 * locked geometry (all or nothing). An item discarded by `movingItems` does not count: whoever
 * takes it along decides, as in the drag of a single item.
 */
export function canMoveItems(p: Project, items: readonly ItemRef[]): boolean {
  const moving = movingItems(p, items);
  return moving.length > 0 && moving.every((item) => canEditItemGeometry(p, item));
}

/**
 * Moves the items by the offset `dx`, `dy`, in **canvas units** (finite, may be decimals).
 * Each item receives the offset in its own space:
 * - container: `placement` + `dx`, `dy` (its markings go along: relative coordinates);
 * - canvas marking, floating included: the `rect` by `round(dx)`, `round(dy)`, alone;
 * - container marking: `round(dx / scale)`, `round(dy / scale)` of the container's scale, for
 *   it and the descendants (locked included), like `moveMarking`. It must stay entirely
 *   inside the container: in the joint drag it does not change space (`rect-out-of-image`).
 *
 * When some item is a canvas marking, the canvas offset is rounded **once** and also applies to
 * the containers: the marking's rectangle is an integer and the container's is not, so each
 * with its own offset would leave a container flush with the marking's edge a few fractions
 * outside it and the settle would take it out of containment. Without a canvas marking the
 * container moves by the exact `dx`, `dy` (smooth drag with zoom); the `placement` goes through
 * `snapPlacement` (near an integer it becomes the integer; otherwise x and y keep 6 decimal
 * places and the scale 12 digits), so going back and forth leaves no floating-point tail in
 * `mapping.json`.
 *
 * All or nothing: with any item of `movingItems` locked it fails with `locked`; a moved
 * container that comes to overlap a container that does NOT move fails with `image-overlap`
 * (the moved ones keep their relative position among themselves and are not tested against each
 * other). A zero offset, or nothing to move, returns `p` as is, **without checking the lock**
 * (owner's decision, stage #1190): the snap that zeroes the offset is a no-op even with a
 * locked item, and the interface does not start that drag (intent `locked`); the MCP does not
 * use this function. At the end it settles once, over the whole result (unless
 * `settle: false`, from gesture previews): the settle is what redoes the `parentId` and what
 * makes a canvas marking that ended up entirely inside a container become the container's.
 */
export function moveItems(
  p: Project,
  items: readonly ItemRef[],
  dx: number,
  dy: number,
  options?: SettleOptions,
): Project {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) fail('invalid-placement');
  if (dx === 0 && dy === 0) return p;
  const moving = movingItems(p, items);
  if (moving.length === 0) return p;
  for (const item of moving) requireUnlocked(canEditItemGeometry(p, item));

  const index = projectIndex(p);
  const sharesCanvasDelta = hasCanvasMarking(p, moving);
  const canvasDx = sharesCanvasDelta ? Math.round(dx) : dx;
  const canvasDy = sharesCanvasDelta ? Math.round(dy) : dy;

  const placements = new Map<string, Placement>();
  const rects = new Map<string, Rect>();
  for (const item of moving) {
    if (item.kind === 'image') {
      const container = index.containers.get(item.id);
      if (!container || (canvasDx === 0 && canvasDy === 0)) continue;
      const { x, y, scale } = container.placement;
      placements.set(item.id, snapPlacement({ x: x + canvasDx, y: y + canvasDy, scale }));
      continue;
    }
    const marking = index.markings.get(item.id);
    if (!marking) continue;
    if (marking.containerId === null) {
      const cx = Math.round(dx);
      const cy = Math.round(dy);
      if (cx === 0 && cy === 0) continue;
      // With the anchored ones (v20), also from the canvas.
      for (const id of withAnchoredFollowers(p, [marking.id])) {
        const m = index.markings.get(id);
        if (m !== undefined) rects.set(id, translateRect(m.rect, cx, cy));
      }
      continue;
    }
    // Container marking: the canvas offset in the container's pixels, for it and the
    // descendants; nothing to change if the rounding zeroes both axes.
    const space = spaceOf(p, marking);
    const mx = Math.round(dx / space.placement.scale);
    const my = Math.round(dy / space.placement.scale);
    if (mx === 0 && my === 0) continue;
    // With the descendants and the anchored ones (v20), which move along.
    for (const id of withAnchoredFollowers(p, [marking.id])) {
      const m = index.markings.get(id);
      if (m === undefined) continue;
      const next = translateRect(m.rect, mx, my);
      if (space.bounds && !containsRect(space.bounds, next)) {
        fail('rect-out-of-image', m.id);
      }
      rects.set(m.id, next);
    }
  }

  return applyMoves(p, placements, rects, options);
}

/** Some item that moves is a canvas marking (the canvas offset is an integer). */
function hasCanvasMarking(p: Project, moving: readonly ItemRef[]): boolean {
  const { markings } = projectIndex(p);
  return moving.some(
    (item) => item.kind === 'marking' && markings.get(item.id)?.containerId === null,
  );
}

/**
 * The joint drag's offset after snapping (decision 4 of stage #764): when `dx`, `dy` would make
 * a container that moves overlap one that does NOT move, returns the largest offset without
 * overlap, axis by axis (the edges stay equal and it slides along the obstacle); an offset that
 * fits comes back as is. It is what the previews and the end of the gesture pass to
 * `moveItems`, which still refuses the overlap with `image-overlap`. With a canvas marking in
 * the selection the canvas offset is an integer (as in `moveItems`) and the limit is the
 * integer of smallest magnitude (less than 1 unit is left over with a fractional neighbor,
 * without overlapping). Only the containers that move enter the computation, against those that
 * stay (`touchDelta`, which filters out those the swept box does not even reach). The snap that
 * zeroes the offset is a no-op: `moveItems` returns the project as is, even with a locked item,
 * and the interface does not start that drag (intent `locked`).
 */
export function limitItemsMove(
  p: Project,
  items: readonly ItemRef[],
  dx: number,
  dy: number,
): { readonly dx: number; readonly dy: number } {
  const moving = movingItems(p, items);
  const ids = new Set(moving.filter((m) => m.kind === 'image').map((m) => m.id));
  if (ids.size === 0 || (dx === 0 && dy === 0)) return { dx, dy };
  const { containers } = projectIndex(p);
  const walking: Rect[] = [];
  for (const id of ids) {
    const c = containers.get(id);
    if (c) walking.push(imageCanvasRect(c, c.placement));
  }
  const fixed: Rect[] = [];
  for (const c of p.containers) {
    if (!ids.has(c.id)) fixed.push(imageCanvasRect(c, c.placement));
  }
  return touchDelta(walking, fixed, dx, dy, hasCanvasMarking(p, moving));
}

/**
 * Closes a movement: checks that no moved container comes to overlap one that does not move
 * (`image-overlap`), writes the new `placement`s and `rect`s and settles once (unless
 * `settle: false`). With nothing to write it returns `p` as is.
 */
function applyMoves(
  p: Project,
  placements: ReadonlyMap<string, Placement>,
  rects: ReadonlyMap<string, Rect>,
  options?: SettleOptions,
): Project {
  const index = projectIndex(p);
  if (placements.size > 0) {
    const fixed = p.containers
      .filter((c) => !placements.has(c.id))
      .map((c) => ({ id: c.id, rect: imageCanvasRect(c, c.placement) }));
    for (const [id, placement] of placements) {
      const container = index.containers.get(id);
      if (!container) continue;
      const moved = imageCanvasRect(container, placement);
      const other = fixed.find((f) => rectsOverlap(moved, f.rect));
      if (other) fail('image-overlap', undefined, { containerId: other.id });
    }
  }

  if (placements.size === 0 && rects.size === 0) return p;
  const next: Project = {
    ...p,
    containers:
      placements.size === 0
        ? p.containers
        : p.containers.map((c) => {
            const placement = placements.get(c.id);
            return placement ? { ...c, placement } : c;
          }),
    markings:
      rects.size === 0
        ? p.markings
        : p.markings.map((m) => {
            const rect = rects.get(m.id);
            return rect ? { ...m, rect } : m;
          }),
  };
  return settleFrom(p, next, options);
}

/**
 * Keyboard step (arrows): moves the items `dx`, `dy` (integers) **in each one's own space**:
 * container and canvas marking (floating included) move `dx`, `dy` canvas units; a container
 * marking moves `dx`, `dy` pixels of its image, whatever the scale (that is why it is not
 * `moveItems`, which divides by the scale and would zero a step of 1 with a scale above 2). What
 * moves and what goes along follows `movingItems`; the arrow does not move. All or nothing, like
 * `moveItems`: locked fails with `locked`, a marking that would leave the container with
 * `rect-out-of-image`, a container over another with `image-overlap`. A zero step or nothing to
 * move returns `p`. Settles at the end, unless `settle: false` (gesture preview).
 */
export function nudgeItems(
  p: Project,
  items: readonly ItemRef[],
  dx: number,
  dy: number,
  options?: SettleOptions,
): Project {
  if (!Number.isInteger(dx) || !Number.isInteger(dy)) fail('invalid-placement');
  if (dx === 0 && dy === 0) return p;
  const moving = movingItems(p, items);
  if (moving.length === 0) return p;
  for (const item of moving) requireUnlocked(canEditItemGeometry(p, item));

  const { placements, rects } = nudgedMoves(p, moving, dx, dy);
  return applyMoves(p, placements, rects, options);
}

/**
 * The new `placement`s (containers) and `rect`s (markings) of a step, each item in its own space.
 */
function nudgedMoves(
  p: Project,
  moving: readonly ItemRef[],
  dx: number,
  dy: number,
): { placements: Map<string, Placement>; rects: Map<string, Rect> } {
  const index = projectIndex(p);
  const placements = new Map<string, Placement>();
  const rects = new Map<string, Rect>();
  for (const item of moving) {
    if (item.kind === 'image') {
      const container = index.containers.get(item.id);
      if (!container) continue;
      const { x, y, scale } = container.placement;
      placements.set(item.id, { x: x + dx, y: y + dy, scale });
      continue;
    }
    const marking = index.markings.get(item.id);
    if (!marking) continue;
    for (const [id, rect] of nudgedMarkingRects(p, marking, dx, dy)) rects.set(id, rect);
  }
  return { placements, rects };
}

/** The new `rect`s of a marking, its descendants and those anchored to them (v20). */
function nudgedMarkingRects(
  p: Project,
  marking: Marking,
  dx: number,
  dy: number,
): Map<string, Rect> {
  const out = new Map<string, Rect>();
  if (marking.containerId === null) {
    // With the anchored ones (v20), also from the canvas.
    const { markings } = projectIndex(p);
    for (const id of withAnchoredFollowers(p, [marking.id])) {
      const m = markings.get(id);
      if (m !== undefined) out.set(id, translateRect(m.rect, dx, dy));
    }
    return out;
  }
  const space = spaceOf(p, marking);
  const { markings } = projectIndex(p);
  // The descendants and the anchored ones (v20) move along.
  for (const id of withAnchoredFollowers(p, [marking.id])) {
    const m = markings.get(id);
    if (m === undefined) continue;
    const next = translateRect(m.rect, dx, dy);
    if (space.bounds && !containsRect(space.bounds, next))
      fail('rect-out-of-image', m.id);
    out.set(m.id, next);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Select with content

/**
 * "Select with content": the marking and everything it covers, recursively, by the settled
 * containment (`parentId`). It covers the descendant markings and, on a canvas marking, the
 * member containers and all the markings of each of them. Floating markings are members of
 * nothing and never enter. Order: the content first (depth-first, each marking followed by what
 * it covers, in array order) and the marking itself last, which becomes the primary in the UI.
 * A nonexistent marking fails with `not-found`.
 */
export function selectionWithContents(p: Project, markingId: string): ItemRef[] {
  const root = findById(p.markings, markingId);
  const index = projectIndex(p);
  const out: ItemRef[] = [];
  const seen = new Set<string>([`marking:${root.id}`]);
  const push = (kind: ItemRef['kind'], id: string): boolean => {
    const key = `${kind}:${id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    out.push({ kind, id });
    return true;
  };

  // Markings of each container, built once and only if there is a member container.
  let byContainer: Map<string, Marking[]> | null = null;
  const markingsOf = (containerId: string): readonly Marking[] => {
    if (byContainer === null) {
      byContainer = new Map();
      for (const m of p.markings) {
        if (m.containerId === null) continue;
        const list = byContainer.get(m.containerId);
        if (list) list.push(m);
        else byContainer.set(m.containerId, [m]);
      }
    }
    return byContainer.get(containerId) ?? [];
  };

  // Explicit stack (a deep hierarchy does not overflow the call stack). Each frame reads the
  // children and then the containers of the same item, in the order of the recursion: the
  // `cursor` keeps where it stopped.
  const stack: { readonly id: string; cursor: number }[] = [{ id: root.id, cursor: 0 }];
  while (stack.length > 0) {
    const frame = stack[stack.length - 1] as { readonly id: string; cursor: number };
    const kids = index.children.get(frame.id) ?? [];
    if (frame.cursor < kids.length) {
      const child = kids[frame.cursor++] as Marking;
      if (push('marking', child.id)) stack.push({ id: child.id, cursor: 0 });
      continue;
    }
    stack.pop();
    for (const container of index.containersByParent.get(frame.id) ?? []) {
      if (!push('image', container.id)) continue;
      for (const m of markingsOf(container.id)) push('marking', m.id);
    }
  }
  out.push({ kind: 'marking', id: root.id });
  return out;
}

// ---------------------------------------------------------------------------
// Delete

/**
 * Markings that go away: the selected ones, their descendants and those of the selected containers.
 */
function removedMarkingIds(p: Project, selected: ResolvedItems): Set<string> {
  const ids = new Set<string>();
  for (const id of selected.markings.keys()) {
    ids.add(id);
    for (const d of descendantsOf(p, id)) ids.add(d.id);
  }
  if (selected.containers.size > 0) {
    for (const m of p.markings) {
      if (m.containerId !== null && selected.containers.has(m.containerId)) ids.add(m.id);
    }
  }
  return ids;
}

/** Arrows that go away: the selected ones and those attached to any marking that goes away. */
function removedArrowIds(
  p: Project,
  selected: ResolvedItems,
  markingIds: ReadonlySet<string>,
): Set<string> {
  const ids = arrowIdsAttachedTo(p, markingIds);
  for (const id of selected.arrows.keys()) ids.add(id);
  return ids;
}

/** The deletion itself, without the lock or the settle: also serves to count the impact. */
function cascadeRemoveItems(p: Project, selected: ResolvedItems): Project {
  const markingIds = removedMarkingIds(p, selected);
  return withoutArrows(
    {
      ...p,
      containers:
        selected.containers.size === 0
          ? p.containers
          : p.containers.filter((c) => !selected.containers.has(c.id)),
      markings: releasedAnchors(p, markingIds).filter((m) => !markingIds.has(m.id)),
      annotations: p.annotations.filter((a) => !markingIds.has(a.markingId)),
    },
    removedArrowIds(p, selected, markingIds),
  );
}

export interface ItemsDeletionImpact {
  /**
   * Markings that go away: the selected ones, their descendants and those of the selected
   * containers.
   */
  readonly markings: number;
  /** Selected containers, which go away. */
  readonly containers: number;
  /** Arrows that go away: the selected ones and those attached to any marking that goes away. */
  readonly arrows: number;
  /** Annotations that go away: those of all the markings and arrows that go away. */
  readonly annotations: number;
  /**
   * Of the markings that go away along (descendants, those of the containers and the selected ones
   * that go with the parent or the container), how many are locked.
   */
  readonly lockedMarkings: number;
  /** Containers that were inside a marking that goes away and were not selected: they stay. */
  readonly containersStay: number;
  /** References between annotations that the deletion would break. */
  readonly brokenRefs: number;
}

/**
 * Impact of deleting the whole selection, without counting anything twice (a marking and its
 * selected child, a container and one of its markings selected). `lockedMarkings` counts the
 * locked ones that go away along, selected or not: a selected locked marking that does not go
 * away with another selected one blocks the deletion (`canDeleteItems`) and the dialog does not
 * even open. Nonexistent items are ignored. The arrows attached to a marking that goes away
 * enter the count and take their annotations.
 */
export function itemsDeletionImpact(
  p: Project,
  items: readonly ItemRef[],
): ItemsDeletionImpact {
  const selected = resolveItems(p, items);
  const removed = removedMarkingIds(p, selected);
  const arrowIds = removedArrowIds(p, selected, removed);
  const index = projectIndex(p);
  let annotations = 0;
  for (const a of p.annotations) {
    if (removed.has(a.markingId) || arrowIds.has(a.markingId)) annotations++;
  }
  let lockedMarkings = 0;
  let containersStay = 0;
  for (const id of removed) {
    const locked = index.markings.get(id)?.locked === true;
    // The selected and locked one only gets here if it goes away with the selected parent or
    // container (otherwise `canDeleteItems` blocks): it counts like those that go away unselected.
    if (
      locked &&
      (!selected.markings.has(id) ||
        leavesWithSelection(p, { kind: 'marking', id }, selected, () => removed))
    ) {
      lockedMarkings++;
    }
    for (const c of index.containersByParent.get(id) ?? []) {
      if (!selected.containers.has(c.id)) containersStay++;
    }
  }
  return {
    markings: removed.size,
    containers: selected.containers.size,
    arrows: arrowIds.size,
    annotations,
    lockedMarkings,
    containersStay,
    brokenRefs: countBrokenRefs(p, cascadeRemoveItems(p, selected)),
  };
}

/**
 * The selected item goes away along with another selected item (and, because of that, its own
 * lock does not prevent the deletion): a container marking whose container is selected or that
 * has a selected ancestor, and an arrow attached to a marking that goes away. Canvas markings
 * and containers take nobody along.
 */
function leavesWithSelection(
  p: Project,
  item: ItemRef,
  selected: ResolvedItems,
  removedMarkings: () => ReadonlySet<string>,
): boolean {
  if (item.kind === 'image') return false;
  if (item.kind === 'arrow') {
    const arrow = selected.arrows.get(item.id);
    if (!arrow) return false;
    const removed = removedMarkings();
    return removed.has(arrow.from) || removed.has(arrow.to);
  }
  const marking = selected.markings.get(item.id);
  if (!marking || marking.containerId === null) return false;
  if (selected.containers.has(marking.containerId)) return true;
  return ancestorsOf(p, marking.id).some((a) => selected.markings.has(a.id));
}

/**
 * Deleting is allowed: there is something to delete and no selected locked item is left out of
 * the cascade (an ancestor's lock is about geometry and does not prevent it; the locked markings
 * that go away along do not block, as in `canDeleteMarking`/`canDeleteImage`; a selected locked
 * one that goes away together with the selected parent or container does not either; the
 * selected locked arrow only prevents it if neither end goes away).
 */
export function canDeleteItems(p: Project, items: readonly ItemRef[]): boolean {
  const selected = resolveItems(p, items);
  let removed: ReadonlySet<string> | null = null;
  const removedMarkings = () => (removed ??= removedMarkingIds(p, selected));
  return (
    selected.list.length > 0 &&
    selected.list.every(
      (item) =>
        leavesWithSelection(p, item, selected, removedMarkings) ||
        (item.kind === 'image'
          ? canDeleteImage(p, item.id)
          : item.kind === 'arrow'
            ? canEditArrow(p, item.id)
            : canDeleteMarking(p, item.id)),
    )
  );
}

/**
 * Deletes the whole selection in one operation: the selected markings (with the descendants
 * and the annotations, like `removeMarking`), the selected containers (with their markings and
 * annotations, like `removeContainer`) and the selected arrows; every arrow attached to a
 * marking that goes away goes along, with its annotations. It never deletes an unselected
 * container: those that were inside a marking that goes away move to its parent, or to none (the
 * settle redoes it). Some selected locked item that does not go away with another selected one
 * (`canDeleteItems`) fails with `locked`, deleting nothing; nonexistent items are ignored.
 * Settles once, at the end (unless `settle: false`).
 */
export function removeItems(
  p: Project,
  items: readonly ItemRef[],
  options?: SettleOptions,
): Project {
  const selected = resolveItems(p, items);
  if (selected.list.length === 0) return p;
  requireUnlocked(canDeleteItems(p, items));
  return settleFrom(p, cascadeRemoveItems(p, selected), options);
}

// ---------------------------------------------------------------------------
// Lock

/**
 * Locks or unlocks all the selected items (markings, containers and arrows) in one operation.
 * Nonexistent items are ignored; nothing to change returns `p` as is.
 */
export function setItemsLocked(
  p: Project,
  items: readonly ItemRef[],
  locked: boolean,
): Project {
  const selected = resolveItems(p, items);
  const markingChanges = [...selected.markings.values()].some((m) => m.locked !== locked);
  const containerChanges = [...selected.containers.values()].some(
    (c) => c.locked !== locked,
  );
  const arrowChanges = [...selected.arrows.values()].some((a) => a.locked !== locked);
  if (!markingChanges && !containerChanges && !arrowChanges) return p;
  return {
    ...p,
    containers: containerChanges
      ? p.containers.map((c) =>
          selected.containers.has(c.id) && c.locked !== locked ? { ...c, locked } : c,
        )
      : p.containers,
    markings: markingChanges
      ? p.markings.map((m) =>
          selected.markings.has(m.id) && m.locked !== locked ? { ...m, locked } : m,
        )
      : p.markings,
    arrows: arrowChanges
      ? p.arrows.map((a) =>
          selected.arrows.has(a.id) && a.locked !== locked ? { ...a, locked } : a,
        )
      : p.arrows,
  };
}

// ---------------------------------------------------------------------------
// Wrap

/** Margin, on each side, between the wrapped set and the new parent marking. */
export const WRAP_MARGIN = MIN_MARKING_SIZE;

/** Items that go into a parent marking: non-floating markings and existing containers. */
function wrappable(p: Project, items: readonly ItemRef[]) {
  const selected = resolveItems(p, items);
  const markings = [...selected.markings.values()].filter((m) => !m.floating);
  const containers = [...selected.containers.values()];
  return { selected, markings, containers };
}

/**
 * There is at least one item that goes into a parent marking (arrows and floating notes do not).
 */
export function canWrapItems(p: Project, items: readonly ItemRef[]): boolean {
  const { markings, containers } = wrappable(p, items);
  return markings.length + containers.length > 0;
}

interface WrapPlan {
  readonly containerId: string | null;
  readonly rect: Rect;
  /** The set's current parent (`currentEnclosing`), or `null`. */
  readonly parentId: string | null;
}

/**
 * The common parent of the selection's top-level items (those not inside another selected one);
 * `null` if there is not exactly one.
 */
function commonParent(selected: ResolvedItems): string | null {
  const parents = new Set<string | null>();
  const items = [
    // A floating marking has no containment parent (`wrappable` excludes it): it does not count.
    ...[...selected.markings.values()].filter((m) => !m.floating),
    ...selected.containers.values(),
  ];
  for (const item of items) {
    if (item.parentId === null || !selected.markings.has(item.parentId)) {
      parents.add(item.parentId);
    }
  }
  return parents.size === 1 ? ([...parents][0] as string | null) : null;
}

/**
 * Current parent of the set: among the markings of the same space that contain `bbox`, outside
 * the selection and its descendants, the one the settle would choose (`enclosingAmong`): the
 * common parent of the top-level selected ones, if it is one of those of smallest area;
 * otherwise, the innermost of the chain. Never the last in the array, which after reordering
 * equal rectangles can be the outer one (#549).
 */
function currentEnclosing(
  p: Project,
  selected: ResolvedItems,
  containerId: string | null,
  bbox: Rect,
): Marking | null {
  const excluded = new Set<string>();
  for (const m of selected.markings.values()) {
    excluded.add(m.id);
    for (const d of descendantsOf(p, m.id)) excluded.add(d.id);
  }
  const candidates = new Set(
    p.markings
      .filter(
        (m) =>
          !m.floating &&
          m.containerId === containerId &&
          !excluded.has(m.id) &&
          containsRect(m.rect, bbox),
      )
      .map((m) => m.id),
  );
  const id = enclosingAmong(p, containerId, candidates, commonParent(selected));
  return id === null ? null : (projectIndex(p).markings.get(id) ?? null);
}

function planWrap(p: Project, items: readonly ItemRef[]): WrapPlan | null {
  const { selected, markings, containers } = wrappable(p, items);
  if (markings.length + containers.length === 0) return null;
  const index = projectIndex(p);

  const first = markings[0]?.containerId ?? null;
  const inContainer =
    containers.length === 0 &&
    first !== null &&
    markings.every((m) => m.containerId === first);
  const containerId = inContainer ? first : null;

  let bbox: Rect;
  if (inContainer) {
    bbox = boundingBox(markings.map((m) => m.rect)) as Rect;
  } else {
    // On the canvas, a container marking counts by the whole container: only it can be a
    // child of a canvas marking.
    const raw = boundingBox([
      ...markings.map((m) => {
        const own = m.containerId === null ? null : index.containers.get(m.containerId);
        return own ? imageCanvasRect(own, own.placement) : markingCanvasRectOf(p, m);
      }),
      ...containers.map((c) => imageCanvasRect(c, c.placement)),
    ]) as Rect;
    // Drag noise (`-2.27e-13`) counts as an integer; a real fraction rounds outward.
    const x = Math.floor(snapNearInteger(raw.x));
    const y = Math.floor(snapNearInteger(raw.y));
    bbox = {
      x,
      y,
      width: Math.ceil(snapNearInteger(raw.x + raw.width)) - x,
      height: Math.ceil(snapNearInteger(raw.y + raw.height)) - y,
    };
  }

  const enclosing = currentEnclosing(p, selected, containerId, bbox);

  let limit: Rect | null = containerId
    ? imagePixelRect(index.containers.get(containerId) as ProjectContainer)
    : null;
  if (enclosing !== null) {
    const outer = enclosing.rect;
    if (limit === null) limit = outer;
    else {
      const x = Math.max(limit.x, outer.x);
      const y = Math.max(limit.y, outer.y);
      limit = {
        x,
        y,
        width: Math.min(limit.x + limit.width, outer.x + outer.width) - x,
        height: Math.min(limit.y + limit.height, outer.y + outer.height) - y,
      };
    }
  }

  const left = limit ? Math.max(bbox.x - WRAP_MARGIN, limit.x) : bbox.x - WRAP_MARGIN;
  const top = limit ? Math.max(bbox.y - WRAP_MARGIN, limit.y) : bbox.y - WRAP_MARGIN;
  const rightEdge = bbox.x + bbox.width + WRAP_MARGIN;
  const bottomEdge = bbox.y + bbox.height + WRAP_MARGIN;
  const rightLimited = limit ? Math.min(rightEdge, limit.x + limit.width) : rightEdge;
  const bottomLimited = limit ? Math.min(bottomEdge, limit.y + limit.height) : bottomEdge;
  return {
    containerId,
    rect: { x: left, y: top, width: rightLimited - left, height: bottomLimited - top },
    parentId: enclosing?.id ?? null,
  };
}

/**
 * Creates a parent marking that wraps the selection (docs/ARCHITECTURE.md, "Parent marking
 * (Wrap)"). Non-floating markings and containers enter; arrows and notes are ignored, and with
 * nothing that can enter it fails with `invalid-parent`. The space and the rectangle come from
 * `planWrap`. The new one enters the array before the first selected marking (or at the end, if
 * there are only containers): it has no relation with any selected one, so the tie of an equal
 * rectangle with one of them is new and the array decides (the earlier one is the outer one).
 * The new one is born with the set's current parent as `parentId` (`currentEnclosing`: the
 * common parent of the top-level selected ones, or the innermost of the chain, never the last
 * in the array): it fits in it and no smaller one contains it, and in the stable tie-break the
 * current relation wins, so it stays the parent even with an equal rectangle and coming later
 * in the array. Whoever becomes a child comes out of the settle, never chosen here. No existing
 * geometry changes, so the lock does not prevent it.
 */
export function wrapItems(
  p: Project,
  args: { readonly id: string; readonly items: readonly ItemRef[] },
  options?: SettleOptions,
): Project {
  if (idInUse(p, args.id)) fail('duplicate-id', args.id);
  const target = planWrap(p, args.items);
  if (!target) fail('invalid-parent');
  const { rect, containerId, parentId } = target;
  if (!isIntegerRect(rect)) fail('rect-not-integer');
  checkRectSize(rect);

  const { markings } = wrappable(p, args.items);
  const chosen = new Set(markings.map((m) => m.id));
  let position = p.markings.findIndex((m) => chosen.has(m.id));
  if (position < 0) position = p.markings.length;

  const marking: Marking = {
    id: args.id,
    containerId,
    parentId,
    name: null,
    rect,
    needsReview: false,
    locked: false,
    floating: false,
    source: null,
  };
  const list = [...p.markings];
  list.splice(position, 0, marking);
  return settleFrom(p, { ...p, markings: list }, options);
}
