import type { SettleDelta } from './settleDelta';
import type { Marking, Rect } from './types';

// Positions (indices into `markings`) and boxes of the markings of each space, kept per settled
// markings array (#882): the clipped settle scans only the space the operation touched, in
// contiguous numbers, without looking at the whole project or at each object. The table is partial
// and fills on demand: a space with no entry is unknown (not empty) and is found by scanning once.
// An operation's table comes from the previous one when it only appended at the end or swapped
// objects (`SettleDelta.stable`); in the other cases the next one fills again. Pure.

/**
 * The (non-floating) markings of a space. The vectors are shared among the versions of a space
 * that only grows at the end: each entry sees the first `count` items, and appending copies
 * nothing (only the one at the tip appends in place; the one that is not, copies).
 */
export interface SpaceEntry {
  /** How many markings the entry sees. */
  readonly count: number;
  /** Increasing positions in the `markings` array; the prefix of `count` is what counts. */
  readonly positions: number[];
  /** `x, y, x2, y2` of each one, in the same order; the prefix of `4 × count` is what counts. */
  readonly boxes: Float64Array;
}

/** Entries of some spaces: the container id or `null` for the canvas. */
export type PositionTable = ReadonlyMap<string | null, SpaceEntry>;

const tables = new WeakMap<readonly Marking[], PositionTable>();

/** The array's table, if someone stored it. */
export function knownPositions(markings: readonly Marking[]): PositionTable | undefined {
  return tables.get(markings);
}

/** Stores the array's table. */
export function rememberPositions(
  markings: readonly Marking[],
  table: PositionTable,
): void {
  tables.set(markings, table);
}

function boxOf(rect: Rect): [number, number, number, number] {
  return [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height];
}

/** Scans the array and builds the space's entry (with room to grow). */
export function scanSpaceEntry(
  list: readonly Marking[],
  space: string | null,
): SpaceEntry {
  const positions: number[] = [];
  const found: Rect[] = [];
  for (let i = 0; i < list.length; i++) {
    const m = list[i] as Marking;
    if (m.containerId !== space || m.floating) continue;
    positions.push(i);
    found.push(m.rect);
  }
  const boxes = new Float64Array(Math.max(64, found.length * 8));
  found.forEach((rect, k) => boxes.set(boxOf(rect), k * 4));
  return { count: found.length, positions, boxes };
}

/** The entry with one more marking at the end. */
function appended(entry: SpaceEntry, i: number, rect: Rect): SpaceEntry {
  const { count } = entry;
  let { positions, boxes } = entry;
  if (positions.length !== count) {
    // Another branch (undo and redo) already appended after `count`: own copy.
    positions = positions.slice(0, count);
    boxes = boxes.slice(0, count * 4);
  }
  if (boxes.length < (count + 1) * 4) {
    const bigger = new Float64Array(Math.max(64, boxes.length * 2));
    bigger.set(boxes.subarray(0, count * 4));
    boxes = bigger;
  }
  positions.push(i);
  boxes.set(boxOf(rect), count * 4);
  return { count: count + 1, positions, boxes };
}

/**
 * The table of `now` from that of `was` (the operation only appended at the end or swapped objects
 * in place), with only the spaces `known` already had: the space of a swapped marking leaves the
 * table (becomes unknown again) and the appended ones go at the end of their space's entry.

 */
export function advancePositions(
  known: PositionTable,
  delta: SettleDelta,
  was: readonly Marking[],
  now: readonly Marking[],
): PositionTable {
  const table = new Map(known);
  for (const i of delta.changed) {
    const m = now[i] as Marking;
    if (i < was.length) {
      table.delete((was[i] as Marking).containerId);
      table.delete(m.containerId);
      continue;
    }
    const entry = table.get(m.containerId);
    if (entry && !m.floating) table.set(m.containerId, appended(entry, i, m.rect));
  }
  return table;
}
