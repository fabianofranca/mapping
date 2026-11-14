import { fail } from './errors';
import { ancestorsOf } from './hierarchy';
import { projectIndex } from './projectIndex';
import { findById, updateById } from './project';
import type { Marking, Placement, Project } from './types';

// Lock (stage 2.5): `locked` on markings and images blocks moving, resizing and deleting
// **the item itself**. Selecting, renaming and annotating stay free. Locking a parent locks
// the geometry of its descendants without touching their `locked`. A locked descendant never
// blocks the parent: moving the parent takes the locked descendants along (the relative
// position is kept) and deleting the parent deletes the locked descendants (the confirmation
// says how many). In v13 the lock also goes down from the canvas marking to the containers
// inside it: their `placement` does not change (`canEditImagePlacement`,
// `containerLockStates`). The arrow (v13) has a lock of its own: it does not inherit from its
// ends (`canEditArrow`).

/** The marking or some ancestor is locked: its geometry cannot change. */
export function isMarkingGeometryLocked(p: Project, markingId: string): boolean {
  const marking = projectIndex(p).markings.get(markingId) ?? fail('not-found', markingId);
  return marking.locked || ancestorsOf(p, markingId).some((a) => a.locked);
}

/** Why the marking's geometry is locked: its own lock or one inherited from an ancestor. */
export type MarkingLockState = 'self' | 'inherited';

/**
 * Lock state of each marking with locked geometry (the free ones do not appear),
 * in a single pass: serves the Tree and the canvas without climbing the hierarchy on each row.
 */
export function markingLockStates(p: Project): Map<string, MarkingLockState> {
  const children = projectIndex(p).children;
  const states = new Map<string, MarkingLockState>();
  // Explicit stack (a deep hierarchy does not overflow the call stack), in pre-order: the
  // first child comes out first, as in the recursion.
  const stack: { readonly parentLocked: boolean; readonly marking: Marking }[] = [];
  const pushAll = (parentLocked: boolean, markings: readonly Marking[] | undefined) => {
    for (let i = (markings?.length ?? 0) - 1; i >= 0; i--) {
      stack.push({
        parentLocked,
        marking: (markings as readonly Marking[])[i] as Marking,
      });
    }
  };
  pushAll(false, children.get(null));
  for (let top = stack.pop(); top !== undefined; top = stack.pop()) {
    const { parentLocked, marking: m } = top;
    if (m.locked) states.set(m.id, 'self');
    else if (parentLocked) states.set(m.id, 'inherited');
    pushAll(parentLocked || m.locked, children.get(m.id));
  }
  return states;
}

/**
 * Lock state of each container with a locked `placement` (the free ones do not appear), in a
 * single pass: `self` = the container itself is locked; `inherited` = a canvas marking that
 * contains it (its parent, or an ancestor of it) is locked.
 */
export function containerLockStates(p: Project): Map<string, MarkingLockState> {
  const markingStates = markingLockStates(p);
  const states = new Map<string, MarkingLockState>();
  for (const c of p.containers) {
    if (c.locked) states.set(c.id, 'self');
    else if (c.parentId !== null && markingStates.has(c.parentId)) {
      states.set(c.id, 'inherited');
    }
  }
  return states;
}

/**
 * Moving or resizing the marking: only the item or a locked ancestor blocks. Locked descendants
 * do not count: moving the parent takes them along, and resizing the parent does not move them.
 */
export function canEditMarkingGeometry(p: Project, markingId: string): boolean {
  return !isMarkingGeometryLocked(p, markingId);
}

/**
 * Deleting (takes the descendants): only the marking's own lock blocks. An ancestor's lock is
 * about geometry, and locked descendants are deleted along with the parent.
 */
export function canDeleteMarking(p: Project, markingId: string): boolean {
  return !(projectIndex(p).markings.get(markingId) ?? fail('not-found', markingId))
    .locked;
}

/**
 * Touching the arrow's route, ends, sides or style, or deleting it: only the arrow's own lock
 * prevents it. The lock of the end markings does not count, and renaming and annotating stay free.
 */
export function canEditArrow(p: Project, arrowId: string): boolean {
  return !(projectIndex(p).arrows.get(arrowId) ?? fail('not-found', arrowId)).locked;
}

/**
 * Moving or resizing the image on the canvas: blocked by the locked image itself and, climbing
 * the chain (the container's `parentId` and then the markings'), by some canvas marking that
 * contains it, locked or with a locked ancestor. Entering a locked marking is not editing its
 * `placement`, but moving what is inside it is.
 */
export function canEditImagePlacement(p: Project, containerId: string): boolean {
  const index = projectIndex(p);
  const container = index.containers.get(containerId) ?? fail('not-found', containerId);
  if (container.locked) return false;
  if (container.parentId === null) return true;
  // Nonexistent parent (invalid project): the repair resolves it; here it does not lock.
  if (!index.markings.has(container.parentId)) return true;
  return !isMarkingGeometryLocked(p, container.parentId);
}

/** Deleting the image takes the markings, locked or not: only the locked image blocks. */
export function canDeleteImage(p: Project, containerId: string): boolean {
  return !(projectIndex(p).containers.get(containerId) ?? fail('not-found', containerId))
    .locked;
}

/**
 * Replacing the file rescales the markings when the dimensions change: it blocks if the
 * image or any of its markings is locked (the swap would touch the geometry of reviewed
 * markings). Repointing a file of the same size does not change the geometry and stays free.
 * With `placement` (what `replaceContainer` will write), an image that changes place or scale
 * must also be movable on the canvas (`canEditImagePlacement`: locked image or under a locked
 * marking).
 */
export function canReplaceImage(
  p: Project,
  containerId: string,
  next: {
    readonly width: number;
    readonly height: number;
    readonly placement?: Placement;
  },
): boolean {
  const image =
    projectIndex(p).containers.get(containerId) ?? fail('not-found', containerId);
  const moves =
    next.placement !== undefined && !samePlacement(image.placement, next.placement);
  if (moves && !canEditImagePlacement(p, containerId)) return false;
  if (image.width === next.width && image.height === next.height) return true;
  return (
    !image.locked && !p.markings.some((m) => m.containerId === containerId && m.locked)
  );
}

function samePlacement(a: Placement, b: Placement): boolean {
  return a.x === b.x && a.y === b.y && a.scale === b.scale;
}

export function setMarkingLocked(
  p: Project,
  markingId: string,
  locked: boolean,
): Project {
  if (findById(p.markings, markingId).locked === locked) return p;
  return {
    ...p,
    markings: updateById(p.markings, markingId, (m) => ({ ...m, locked })),
  };
}

export function setImageLocked(
  p: Project,
  containerId: string,
  locked: boolean,
): Project {
  if (findById(p.containers, containerId).locked === locked) return p;
  return {
    ...p,
    containers: updateById(p.containers, containerId, (i) => ({ ...i, locked })),
  };
}

/** Locks (or unlocks) all the image's markings at once: one operation, one history entry. */
export function setImageMarkingsLocked(
  p: Project,
  containerId: string,
  locked: boolean,
): Project {
  findById(p.containers, containerId);
  if (!p.markings.some((m) => m.containerId === containerId && m.locked !== locked))
    return p;
  return {
    ...p,
    markings: p.markings.map((m) =>
      m.containerId === containerId && m.locked !== locked ? { ...m, locked } : m,
    ),
  };
}

/** Throws `locked` if the permission condition does not hold. */
export function requireUnlocked(allowed: boolean): void {
  if (!allowed) fail('locked');
}
