import { canContain, equalRectRanks, pickParent, type Entry } from './settleParent';
import type { SpaceEntry } from './settlePositions';
import type { Marking, Rect } from './types';

// Settling only what an operation touched inside a space (#882, phase 2). A marking's parent only
// depends on what contains it, on the ranks of equal rectangles and on the current parent; none of
// that changes for whatever does not fit (equal included) in any rectangle that changed. So only
// what fits in one of them is reviewed, instead of the whole space, with the same rule as the full
// settle (`settleParent.ts`). Pure.

/** Up to how many changed rectangles and markings to review the clipping holds before giving up. */
export const LOCAL_RECTS = 8;
const LOCAL_DIRTY = 24;

/** What changed in a space. */
export interface Dirty {
  /** Rectangles (before and after) of new, deleted or swapped markings. */
  readonly rects: Rect[];
  /** Positions of the space's markings that the operation created or swapped (always to review). */
  readonly seeds: number[];
}

/** Called per position with the marking's box `x, y, x2, y2`; `false` stops the scan. */
type Visitor = (i: number, x: number, y: number, x2: number, y2: number) => boolean;

/**
 * Visits the space's markings: those in the entry, minus the `skip` positions (increasing: the ones
 * the operation touched, with a stale box), and the `extras` (the touched ones that stayed in the space).
 */
function visitSpace(
  list: readonly Marking[],
  entry: SpaceEntry,
  skip: readonly number[],
  extras: readonly number[],
  visit: Visitor,
): boolean {
  const { positions, boxes } = entry;
  let s = 0;
  for (let t = 0; t < entry.count; t++) {
    const i = positions[t] as number;
    while (s < skip.length && (skip[s] as number) < i) s++;
    if (s < skip.length && skip[s] === i) continue;
    const q = t * 4;
    if (
      !visit(
        i,
        boxes[q] as number,
        boxes[q + 1] as number,
        boxes[q + 2] as number,
        boxes[q + 3] as number,
      )
    ) {
      return false;
    }
  }
  for (const i of extras) {
    const r = (list[i] as Marking).rect;
    if (!visit(i, r.x, r.y, r.x + r.width, r.y + r.height)) return false;
  }
  return true;
}

/** Boxes `[x, y, x2, y2, ...]` of the rectangles. */
function boxesOf(rects: readonly Rect[]): number[] {
  return rects.flatMap((r) => [r.x, r.y, r.x + r.width, r.y + r.height]);
}

/** Does the rectangle `(x, y, x2, y2)` contain (equal included) the box starting at `box[q]`? */
function coversBox(
  box: readonly number[],
  q: number,
  x: number,
  y: number,
  x2: number,
  y2: number,
): boolean {
  return (
    x <= (box[q] as number) &&
    y <= (box[q + 1] as number) &&
    x2 >= (box[q + 2] as number) &&
    y2 >= (box[q + 3] as number)
  );
}

/** Does the rectangle `(x, y, x2, y2)` fit (equal included) in any of the boxes `[x, y, x2, y2, ...]`? */
function insideAny(
  box: readonly number[],
  x: number,
  y: number,
  x2: number,
  y2: number,
): boolean {
  for (let q = 0; q < box.length; q += 4) {
    if (
      x >= (box[q] as number) &&
      y >= (box[q + 1] as number) &&
      x2 <= (box[q + 2] as number) &&
      y2 <= (box[q + 3] as number)
    ) {
      return true;
    }
  }
  return false;
}

interface Scan {
  /** The markings to review. */
  readonly entries: readonly Entry[];
  /** For each one, the space's markings that contain it (by geometry; the rank decides later). */
  readonly candidates: readonly (readonly Entry[])[];
}

/**
 * One scan finds the markings to review (those that fit in one of the rectangles that changed) and,
 * for the seeds, what contains them. If it found others to review (the new one contains old ones), a
 * second scan finds what contains those. `null` if there are too many.
 */
function scan(
  list: readonly Marking[],
  entry: SpaceEntry,
  dirty: Dirty,
  skip: readonly number[],
): Scan | null {
  const seeds = dirty.seeds;
  const box = boxesOf(dirty.rects);
  const seedBox = boxesOf(seeds.map((i) => (list[i] as Marking).rect));
  const entries: Entry[] = [];
  const seeded: Entry[][] = seeds.map(() => []);
  const complete = visitSpace(list, entry, skip, seeds, (i, x, y, x2, y2) => {
    if (insideAny(box, x, y, x2, y2)) {
      if (entries.length >= LOCAL_DIRTY) return false;
      entries.push({ m: list[i] as Marking, i });
    }
    for (let k = 0; k < seeds.length; k++) {
      if (seeds[k] !== i && coversBox(seedBox, k * 4, x, y, x2, y2)) {
        (seeded[k] as Entry[]).push({ m: list[i] as Marking, i });
      }
    }
    return true;
  });
  if (!complete) return null;
  const seedAt = new Map(seeds.map((i, k) => [i, seeded[k] as Entry[]]));
  const others = entries.filter((e) => !seedAt.has(e.i));
  const found = candidatesOf(list, entry, skip, seeds, others);
  const candidates = entries.map((e) => seedAt.get(e.i) ?? (found.shift() as Entry[]));
  return { entries, candidates };
}

/** For each marking in `dirty`, the space's markings that contain it. */
function candidatesOf(
  list: readonly Marking[],
  entry: SpaceEntry,
  skip: readonly number[],
  extras: readonly number[],
  dirty: readonly Entry[],
): Entry[][] {
  if (dirty.length === 0) return [];
  const out: Entry[][] = dirty.map(() => []);
  const dirtyBox = boxesOf(dirty.map((d) => d.m.rect));
  visitSpace(list, entry, skip, extras, (i, x, y, x2, y2) => {
    for (let k = 0; k < dirty.length; k++) {
      if ((dirty[k] as Entry).i !== i && coversBox(dirtyBox, k * 4, x, y, x2, y2)) {
        (out[k] as Entry[]).push({ m: list[i] as Marking, i });
      }
    }
    return true;
  });
  return out;
}

/**
 * The new parents (as markings already carrying the new `parentId`) of the space's markings that fit
 * in any of the `dirty.rects`, or `null` when there are too many: the space is then settled whole.
 * `entry` is what is known about the space and `skip`, the (increasing) positions touched by the
 * operation, with a stale box.

 */
export function localParents(
  list: readonly Marking[],
  entry: SpaceEntry,
  dirty: Dirty,
  skip: readonly number[],
): Entry[] | null {
  if (dirty.rects.length > LOCAL_RECTS) return null;
  const found = scan(list, entry, dirty, skip);
  if (found === null) return null;
  const { entries, candidates } = found;
  const involved = new Map<number, Entry>();
  for (const e of [...entries, ...candidates.flat()]) involved.set(e.i, e);
  const ranks = new Map<string, number>();
  equalRectRanks(
    [...involved.values()].sort((a, b) => a.i - b.i),
    ranks,
  );
  const rankOf = (id: string) => ranks.get(id) ?? -1;
  const patches: Entry[] = [];
  entries.forEach((d, k) => {
    const own = rankOf(d.m.id);
    const valid = (candidates[k] as Entry[]).filter((c) =>
      canContain(c.m.rect, rankOf(c.m.id), d.m.rect, own),
    );
    const parentId = pickParent(valid, d.m.parentId, rankOf);
    if (parentId !== d.m.parentId) patches.push({ m: { ...d.m, parentId }, i: d.i });
  });
  return patches;
}
