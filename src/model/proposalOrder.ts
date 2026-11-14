import type { Change } from './proposal';
import type { Marking } from './types';

// Where the created marking goes in the `markings` array (proposal formatVersion 4,
// `insertBefore`). The same rule serves the computation of the changes (`computeChanges`) and
// the application (`patchProject`), so that the applied project has the proposed project's order.

/**
 * Starting anchor of each marking created in the proposed project: the id of the first marking
 * **after** it that already existed in the base (it stays in the proposed one, so the proposal
 * does not remove it). Without one, the created marking goes to the end and does not appear in
 * the map. The map comes out in array order (ascending). The final anchor, which respects ties,
 * is the one from `proposalAnchors`.
 */
export function insertAnchors(
  baseIds: ReadonlySet<string>,
  afterMarkings: readonly Marking[],
): Map<string, string> {
  const found: [string, string][] = [];
  let next: string | undefined;
  for (let i = afterMarkings.length - 1; i >= 0; i--) {
    const m = afterMarkings[i] as Marking;
    if (baseIds.has(m.id)) next = m.id;
    else if (next !== undefined) found.push([m.id, next]);
  }
  return new Map(found.reverse());
}

/**
 * Puts each created marking (which `markings` carries at the end, in the order of the changes)
 * before its anchor, if the anchor is in the list; without an anchor, or with it outside the
 * list, the created marking stays at the end. `anchors` is read in order: those created with the
 * same anchor enter in the map's order, which is the proposed project's (the changes, in
 * `anchorsOfChanges`, and the array, in `insertAnchors` and `proposalAnchors`).
 */
export function placeCreatedMarkings(
  markings: readonly Marking[],
  anchors: ReadonlyMap<string, string>,
): Marking[] {
  // Linked list by id: each move is O(1), instead of `findIndex`/`splice` per anchor.
  const list = new LinkedMarkings(markings);
  // An anchor equal to the id itself moves nothing.
  for (const [id, anchor] of anchors) if (id !== anchor) list.moveBefore(id, anchor);
  return list.toArray();
}

interface Node {
  readonly marking: Marking;
  prev: Node | null;
  next: Node | null;
}

class LinkedMarkings {
  private head: Node | null = null;
  private readonly nodes = new Map<string, Node>();

  constructor(markings: readonly Marking[]) {
    let tail: Node | null = null;
    for (const marking of markings) {
      const node: Node = { marking, prev: tail, next: null };
      if (tail) tail.next = node;
      else this.head = node;
      tail = node;
      if (!this.nodes.has(marking.id)) this.nodes.set(marking.id, node);
    }
  }

  /** Moves `id` before `anchor`; if either is missing from the list, does nothing. */
  moveBefore(id: string, anchor: string): void {
    const node = this.nodes.get(id);
    const target = this.nodes.get(anchor);
    if (!node || !target) return;
    if (node.prev) node.prev.next = node.next;
    else this.head = node.next;
    if (node.next) node.next.prev = node.prev;
    node.prev = target.prev;
    node.next = target;
    if (target.prev) target.prev.next = node;
    else this.head = node;
    target.prev = node;
  }

  toArray(): Marking[] {
    const out: Marking[] = [];
    for (let n = this.head; n; n = n.next) out.push(n.marking);
    return out;
  }
}

/** The anchors that the marking-creation changes carry (`insertBefore`), in their order. */
export function anchorsOfChanges(
  changes: readonly Change[],
  baseIds: ReadonlySet<string>,
): Map<string, string> {
  const anchors = new Map<string, string>();
  for (const c of changes) {
    if (c.kind !== 'create' || c.entity !== 'marking') continue;
    if (typeof c.insertBefore === 'string' && !baseIds.has(c.entityId)) {
      anchors.set(c.entityId, c.insertBefore);
    }
  }
  return anchors;
}
