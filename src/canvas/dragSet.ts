// What a gesture moves (decision 5 of the canvas-scale stage): comparing the project drawn before the
// gesture with the preview's, the markings, containers and arrows that move come out. The canvas takes
// their nodes into the drag group; the rest of the stage is not redrawn until release. No Konva.
import {
  projectIndex,
  type Arrow,
  type Marking,
  type Project,
  type ProjectContainer,
} from '../model';

/** Ids of what moves in a gesture: markings, containers (images) and arrows. */
export interface DragSet {
  readonly markings: ReadonlySet<string>;
  readonly containers: ReadonlySet<string>;
  readonly arrows: ReadonlySet<string>;
}

const NONE: ReadonlySet<string> = new Set();

/** Nothing moves (outside a gesture, or before the first preview). Always the same object. */
export const EMPTY_DRAG: DragSet = { markings: NONE, containers: NONE, arrows: NONE };

export function isEmptyDrag(set: DragSet): boolean {
  return set.markings.size === 0 && set.containers.size === 0 && set.arrows.size === 0;
}

/**
 * What the preview moves relative to `base`:
 *  - the container whose object changed (or that the image preview follows, `previewContainerId`), with
 *    all its markings (they travel with the image without changing object);
 *  - the marking whose object changed (it and the descendants the preview moved along with it);
 *  - the arrow whose object changed (route, tip) or that touches any marking that moves.
 * None of them is decided by the canvas: it is only the difference between the two projects, which
 * the model already
 * produced. The ids are the drawn project's.
 */
export function dragSetOf(
  base: Project | null,
  current: Project | null,
  previewContainerId: string | null,
): DragSet {
  if (!base || !current) return EMPTY_DRAG;
  const before = projectIndex(base);
  const containers = movedContainers(before.containers, current, previewContainerId);
  const markings = movedMarkings(before.markings, current, containers);
  const arrows = movedArrows(before.arrows, current, markings);
  const set = { markings, containers, arrows };
  return isEmptyDrag(set) ? EMPTY_DRAG : set;
}

/** The containers of `current` whose object changed, or that the image preview follows. */
function movedContainers(
  before: ReadonlyMap<string, ProjectContainer>,
  current: Project,
  previewContainerId: string | null,
): Set<string> {
  const containers = new Set<string>();
  for (const container of current.containers) {
    if (container.id === previewContainerId || before.get(container.id) !== container) {
      containers.add(container.id);
    }
  }
  return containers;
}

/** The arrows of `current` whose object changed, or that touch a marking that moves. */
function movedArrows(
  before: ReadonlyMap<string, Arrow>,
  current: Project,
  markings: ReadonlySet<string>,
): Set<string> {
  const arrows = new Set<string>();
  for (const arrow of current.arrows) {
    const touches = markings.has(arrow.from) || markings.has(arrow.to);
    if (touches || before.get(arrow.id) !== arrow) arrows.add(arrow.id);
  }
  return arrows;
}

/** The markings of `current` whose object changed, or that are in a container that moves. */
function movedMarkings(
  before: ReadonlyMap<string, Marking>,
  current: Project,
  containers: ReadonlySet<string>,
): Set<string> {
  const markings = new Set<string>();
  for (const marking of current.markings) {
    const inMoving = marking.containerId !== null && containers.has(marking.containerId);
    if (inMoving || before.get(marking.id) !== marking) markings.add(marking.id);
  }
  return markings;
}

/** Joins two sets (what moves only grows during the gesture); the first if `b` brings nothing new. */
export function mergeDrag(a: DragSet, b: DragSet): DragSet {
  if (isEmptyDrag(b)) return a;
  if (isEmptyDrag(a)) return b;
  const markings = union(a.markings, b.markings);
  const containers = union(a.containers, b.containers);
  const arrows = union(a.arrows, b.arrows);
  if (markings === a.markings && containers === a.containers && arrows === a.arrows) {
    return a;
  }
  return { markings, containers, arrows };
}

/** `a` if `b` is entirely in `a`; otherwise a new set with both. */
function union(a: ReadonlySet<string>, b: ReadonlySet<string>): ReadonlySet<string> {
  let grown = false;
  for (const id of b) {
    if (!a.has(id)) {
      grown = true;
      break;
    }
  }
  return grown ? new Set([...a, ...b]) : a;
}
