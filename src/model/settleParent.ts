import { area, containsRect } from './geometry';
import type { Marking, Rect } from './types';

// Choosing the parent by geometry inside a space (rules in `hierarchySettle.ts`): who can be
// the parent of whom, the rank of markings with an equal rectangle (stable tie-break, stage #549) and the parent among
// the candidates. Pure functions, used by the settle of the whole space and by the clipped one.

/** A marking of a space with its index in the `markings` array. */
export interface Entry {
  readonly m: Marking;
  readonly i: number;
}

/**
 * Can `outer` (rank `ro`) be the parent of `inner` (rank `ri`)? It contains it and is larger, or is equal and
 * comes earlier in the order of equal rectangles (`equalRectRanks`). A strict order: there is never a cycle.
 */
export function canContain(outer: Rect, ro: number, inner: Rect, ri: number): boolean {
  if (!containsRect(outer, inner)) return false;
  const ao = area(outer);
  const ai = area(inner);
  return ao > ai || (ao === ai && ro < ri);
}

const rectKey = (r: Rect): string => `${r.x},${r.y},${r.width},${r.height}`;

/** Is the current parent of `e` one of the markings of `ids` that has not yet been placed in the order? */
function waitsForParent(e: Entry, ids: ReadonlySet<string>, done: ReadonlySet<string>) {
  const parent = e.m.parentId;
  return parent !== null && ids.has(parent) && !done.has(parent);
}

/**
 * Outside-in order of a group of equal rectangles (in array order): the topological
 * sort of the current `parentId`s inside the group (parent before child) and, among the ones free
 * at the same time, the one that comes first in the array. Whoever has no parent in the group (new, or just
 * arrived at the rectangle) enters by the array, as before. A `parentId` in a cycle (invalid file) is
 * broken by the first one in the array. Total and cycle-free.
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
 * Rank of each marking of a space: the index in the array, except in groups of equal
 * rectangles, where the group's members swap places among themselves in `chainOrder` order. This way
 * reordering siblings (which only swaps indices) does not change which one is the outer one.
 */
export function equalRectRanks(
  group: readonly Entry[],
  ranks: Map<string, number>,
): void {
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
 * The candidates of least area, with only the inner one (highest rank) of each group of equal
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
 * Among the candidates that contain it (all valid by geometry), the parent: of those of least area
 * (`innermostOfLeast`), the current parent, if it is one of them; otherwise, the one of highest rank (the one that comes
 * later in the array).
 */
export function pickParent(
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
