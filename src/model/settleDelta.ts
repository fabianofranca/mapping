import type { Marking, Project, ProjectContainer } from './types';

// What an operation touched between `before` and `next`, for the clipped settle (#882, decision 5).
// It compares objects (`!==`), never values: the project is immutable, and what the operation
// did not touch remains the same object. Pure and with no browser API.

export interface SettleDelta {
  /** Indices in `next.markings` of the markings that are new or have a different object. */
  readonly changed: readonly number[];
  /** Markings of `before` that were deleted or replaced by another object. */
  readonly old: readonly Marking[];
  /**
   * Spaces (`null` = the canvas) to settle in full: that of every container that is new, deleted
   * or replaced, and the canvas; the space whose relative order of markings changed; the canvas
   * if one of its markings changed.
   */
  readonly full: ReadonlySet<string | null>;
  /**
   * The markings that did not change are in the same positions as before (the operation only
   * swapped objects or appended at the end): the index positions of `before` hold for `next`.
   */
  readonly stable: boolean;
}

interface MarkingDelta {
  readonly changed: number[];
  readonly old: Marking[];
  readonly reordered: Set<string | null>;
  stable: boolean;
}

/**
 * Compares `before` and `next`. `null` when clipping does not pay off (more than half of the
 * markings changed, or the project has repeated ids): the whole project is settled.
 */
export function settleDelta(before: Project, next: Project): SettleDelta | null {
  const markings = markingDelta(before.markings, next.markings);
  if (markings === null) return null;
  const full = new Set<string | null>(markings.reordered);
  addContainerSpaces(before.containers, next.containers, full);
  const touched = [...markings.old, ...markings.changed.map((i) => next.markings[i])];
  if (touched.some((m) => m?.containerId === null)) full.add(null);
  return { changed: markings.changed, old: markings.old, full, stable: markings.stable };
}

function markingDelta(
  was: readonly Marking[],
  now: readonly Marking[],
): MarkingDelta | null {
  const delta: MarkingDelta = {
    changed: [],
    old: [],
    reordered: new Set(),
    stable: true,
  };
  if (was === now) return delta;
  // Same markings in the same order (the operation only swapped objects): compare position by
  // position.
  if (was.length === now.length && sameOrder(was, now)) {
    for (let i = 0; i < now.length; i++) {
      if (was[i] === now[i]) continue;
      delta.changed.push(i);
      delta.old.push(was[i] as Marking);
    }
  } else if (!diffMiddle(was, now, delta)) {
    return null;
  }
  return delta.changed.length + delta.old.length > now.length / 2 ? null : delta;
}

function sameOrder(was: readonly Marking[], now: readonly Marking[]): boolean {
  for (let i = 0; i < now.length; i++) {
    if ((was[i] as Marking).id !== (now[i] as Marking).id) return false;
  }
  return true;
}

/**
 * Created, deleted or reordered: drops the prefix and suffix of identical objects and compares
 * only the middle. `false` if the middle exceeds half or there is a repeated id (when in doubt,
 * the whole project).
 */
function diffMiddle(
  was: readonly Marking[],
  now: readonly Marking[],
  delta: MarkingDelta,
): boolean {
  let start = 0;
  const shortest = Math.min(was.length, now.length);
  while (start < shortest && was[start] === now[start]) start++;
  let endWas = was.length;
  let endNow = now.length;
  while (endWas > start && endNow > start && was[endWas - 1] === now[endNow - 1]) {
    endWas--;
    endNow--;
  }
  // Only appended at the end: what already existed stays in the same position.
  delta.stable = start === was.length;
  const middleWas = was.slice(start, endWas);
  const middleNow = now.slice(start, endNow);
  if (middleWas.length + middleNow.length > now.length) return false;
  const byId = new Map(middleWas.map((m) => [m.id, m]));
  if (byId.size !== middleWas.length) return false;
  const unchanged = collectChanges(byId, middleNow, start, delta);
  if (unchanged === null) return false;
  delta.old.push(...byId.values());
  addReordered(middleWas, middleNow, unchanged, delta.reordered);
  return true;
}

/**
 * Records the new or replaced markings of the middle (and removes from `byId` those that remain,
 * leaving only the deleted and the replaced). Returns the ids that keep the same object, or
 * `null` on a repeated id.
 */
function collectChanges(
  byId: Map<string, Marking>,
  middleNow: readonly Marking[],
  offset: number,
  delta: MarkingDelta,
): Set<string> | null {
  const unchanged = new Set<string>();
  const seen = new Set<string>();
  for (let j = 0; j < middleNow.length; j++) {
    const m = middleNow[j] as Marking;
    if (seen.has(m.id)) return null;
    seen.add(m.id);
    const old = byId.get(m.id);
    if (old === m) {
      unchanged.add(m.id);
      byId.delete(m.id);
      continue;
    }
    delta.changed.push(offset + j);
    // The replaced one stays in `byId` until the end: it goes into `old` with the deleted ones.
  }
  return unchanged;
}

/** Adds the spaces where the sequence of unchanged ids, in the middle, differs from before. */
function addReordered(
  was: readonly Marking[],
  now: readonly Marking[],
  unchanged: ReadonlySet<string>,
  spaces: Set<string | null>,
): void {
  const sequences = (list: readonly Marking[]) => {
    const bySpace = new Map<string | null, string[]>();
    for (const m of list) {
      if (!unchanged.has(m.id)) continue;
      const ids = bySpace.get(m.containerId);
      if (ids) ids.push(m.id);
      else bySpace.set(m.containerId, [m.id]);
    }
    return bySpace;
  };
  const after = sequences(now);
  for (const [space, ids] of sequences(was)) {
    if (after.get(space)?.join('\u0000') !== ids.join('\u0000')) spaces.add(space);
  }
}

/** Adds the space of each new, deleted or replaced container, and the canvas (where their parents live). */
function addContainerSpaces(
  was: readonly ProjectContainer[],
  now: readonly ProjectContainer[],
  spaces: Set<string | null>,
): void {
  if (was === now) return;
  const byId = new Map(was.map((c) => [c.id, c]));
  const touch = (c: ProjectContainer) => {
    spaces.add(c.id);
    spaces.add(null);
  };
  for (const c of now) {
    if (byId.get(c.id) !== c) touch(c);
    byId.delete(c.id);
  }
  for (const c of byId.values()) touch(c);
  // Same containers in another order: the container of a canvas rectangle may change.
  if (
    was.length === now.length &&
    now.some((c, i) => (was[i] as ProjectContainer).id !== c.id)
  ) {
    spaces.add(null);
  }
}
