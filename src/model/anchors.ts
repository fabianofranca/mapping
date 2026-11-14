import { fail } from './errors';
import { descendantsOf } from './hierarchy';
import { findById, updateById } from './project';
import { projectIndex } from './projectIndex';
import type { Marking, MarkingAnchor, Project } from './types';

// Marking anchor (schema v20, stage "direction and anchor", R3). The anchor links a marking to
// another in the same space; it does not take part in containment (`settleHierarchy` does not
// read it). Here live the checking, the writing and the set that moves along when the anchor
// moves.

/**
 * Closing the anchor of `id` on `to` would make `to` move along with `id` (anchor-chain cycle:
 * a descendant of `id` or a follower, direct or indirect, of a descendant): `withAnchoredFollowers`
 * is what moves with it, and moving the target along would shift the marking endlessly on each
 * snap.
 */
function wouldCycle(p: Project, id: string, to: string): boolean {
  return withAnchoredFollowers(p, [id]).has(to);
}

/**
 * Checks the new anchor of `id` (which is in `containerId`, or does not exist yet) and fails
 * with the code of the broken invariant; returns the target marking. It also serves creation,
 * before the marking exists (without it no cycle is possible).
 */
export function checkAnchorTarget(
  p: Project,
  id: string,
  containerId: string | null,
  anchor: MarkingAnchor,
): Marking {
  if (anchor.to === id) fail('anchor-self', id);
  const target = projectIndex(p).markings.get(anchor.to);
  if (target === undefined) return fail('anchor-missing', anchor.to);
  if (target.containerId !== containerId) fail('anchor-other-space', anchor.to);
  if (wouldCycle(p, id, anchor.to)) fail('anchor-cycle', id);
  return target;
}

/**
 * Would `setMarkingAnchor` accept anchoring `markingId` to `targetId`? The target exists, is
 * not the marking itself, is in the same space and does not depend on it through the anchor
 * chain. This is what the Anchor section's list offers, without trying and catching the
 * error.
 */
export function canAnchorTo(p: Project, markingId: string, targetId: string): boolean {
  if (targetId === markingId) return false;
  const { markings } = projectIndex(p);
  const marking = markings.get(markingId);
  const target = markings.get(targetId);
  if (marking === undefined || target === undefined) return false;
  return (
    target.containerId === marking.containerId && !wouldCycle(p, markingId, targetId)
  );
}

/**
 * The markings of `pool` (those in the marking's space, in their order) to which `canAnchorTo`
 * would let `markingId` be anchored, in a single sweep: `canAnchorTo` per item rebuilds the set
 * that moves along on each call (quadratic when the marking owns many).
 */
export function anchorCandidates(
  p: Project,
  markingId: string,
  pool: readonly Marking[],
): Marking[] {
  const marking = projectIndex(p).markings.get(markingId);
  if (marking === undefined) return [];
  const blocked = withAnchoredFollowers(p, [markingId]);
  return pool.filter((m) => m.containerId === marking.containerId && !blocked.has(m.id));
}

function sameOffset(a: MarkingAnchor['offset'], b: MarkingAnchor['offset']): boolean {
  return a?.main === b?.main && a?.cross === b?.cross;
}

function sameAnchor(
  a: MarkingAnchor | null | undefined,
  b: MarkingAnchor | null,
): boolean {
  if (a == null || b === null) return (a ?? null) === b;
  return (
    a.to === b.to &&
    a.side === b.side &&
    a.align === b.align &&
    sameOffset(a.offset, b.offset)
  );
}

/**
 * Writes (or, with `null`, removes) the marking's anchor. Checks the invariants: the target
 * exists (`anchor-missing`), is not the marking itself (`anchor-self`), is in the same space
 * (`anchor-other-space`) and does not close a cycle (`anchor-cycle`). It moves nothing (the
 * snap is `snapToAnchor`) and is not geometry: the lock does not prevent it. The same anchor
 * returns `p`.
 */
export function setMarkingAnchor(
  p: Project,
  markingId: string,
  anchor: MarkingAnchor | null,
): Project {
  const marking = findById(p.markings, markingId);
  if (sameAnchor(marking.anchor, anchor)) return p;
  if (anchor !== null) checkAnchorTarget(p, markingId, marking.containerId, anchor);
  return {
    ...p,
    markings: updateById(p.markings, markingId, (m) => ({ ...m, anchor })),
  };
}

/**
 * Writes the anchor of a NEWLY CREATED marking after the settle: like `setMarkingAnchor`, but
 * if the settle left the marking and the target in different spaces (e.g. a canvas marking
 * snapped to a canvas target falls entirely inside a container and becomes its child), the
 * anchor is released instead of failing (the usual rule: the settle releases the relation,
 * `releaseStrandedAnchors`); returns `p` as is. The anchor must have gone through
 * `checkAnchorTarget` before creation (the other errors, nonexistent target and the marking
 * itself, still fail here).
 */
export function setNewMarkingAnchor(
  p: Project,
  markingId: string,
  anchor: MarkingAnchor,
): Project {
  const marking = findById(p.markings, markingId);
  const target = projectIndex(p).markings.get(anchor.to);
  if (target !== undefined && target.containerId !== marking.containerId) return p;
  return setMarkingAnchor(p, markingId, anchor);
}

/**
 * What moves along when `ids` move: the markings anchored to any of them, their descendants
 * (inside a container; on the canvas a marking is a lens and moves alone) and those anchored
 * to those, transitively. Without duplicates: an id that is already in `ids` or that several
 * chains reach enters once. Returns a new set including `ids`.
 */
export function withAnchoredFollowers(p: Project, ids: Iterable<string>): Set<string> {
  const { anchoredBy, markings } = projectIndex(p);
  const result = new Set<string>(ids);
  const queue = [...result];
  const add = (id: string): void => {
    if (!result.has(id)) {
      result.add(id);
      queue.push(id);
    }
  };
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i] as string;
    for (const m of anchoredBy.get(id) ?? []) add(m.id);
    if (markings.get(id)?.containerId == null) continue;
    for (const d of descendantsOf(p, id)) add(d.id);
  }
  return result;
}
