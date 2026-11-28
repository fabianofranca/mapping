import type { Marking } from './types';

// The stored structure of the materialized markings inside a settle (stage #3087, decision 3): a materialized
// marking keeps its stored `parentId`, and only an invalid one is dropped to `null`. Who is valid is read
// from the markings as the operation left them, before the settle moves anything. Pure.

/** What the settle reads about the stored parents. */
export interface Structure {
  /**
   * The materialized markings whose stored parent is valid, with that parent: they live in their parent's
   * space and travel with it. Their parents are other markings of the same space.
   */
  readonly followers: ReadonlyMap<string, string>;
  /** Positions of the materialized markings whose stored parent is invalid (it becomes `null`). */
  readonly invalid: readonly number[];
}

/** The marking without its `slot` (a stored slot only means something with a stored parent). */
export function withoutSlot(m: Marking): Marking {
  const { slot, ...rest } = m;
  void slot;
  return rest;
}

/**
 * The marking with the parent the settle computed for it. A computed parent is never a stored one, so a slot
 * (which names a place in a stored parent) goes with it.
 */
export function reparented(m: Marking, parentId: string | null): Marking {
  return { ...withoutSlot(m), parentId };
}

/** Does the settle have to write this parent: it differs, or a slot is left over from a stored one. */
export const needsReparent = (m: Marking, parentId: string | null): boolean =>
  parentId !== m.parentId || m.slot !== undefined;

export const NO_STRUCTURE: Structure = { followers: new Map(), invalid: [] };

/** Can `parent` be the stored parent of `m`: another marking of the same space and page, a solid one. */
function validEdge(m: Marking, parent: Marking | undefined): parent is Marking {
  return (
    parent !== undefined &&
    parent.id !== m.id &&
    parent.containerId === m.containerId &&
    parent.pageId === m.pageId &&
    !parent.floating &&
    !parent.decorative
  );
}

/**
 * The members of a cycle among the edges: following `edges` (child → parent) from each node, a node
 * reached again on the same walk closes a cycle, and every node from there on belongs to it.
 */
function cycleMembers(edges: ReadonlyMap<string, string>): Set<string> {
  const done = new Set<string>();
  const cyclic = new Set<string>();
  for (const start of edges.keys()) {
    if (done.has(start)) continue;
    const path: string[] = [];
    const onPath = new Set<string>();
    let at: string | undefined = start;
    while (at !== undefined && !done.has(at) && !onPath.has(at)) {
      path.push(at);
      onPath.add(at);
      at = edges.get(at);
    }
    if (at !== undefined && onPath.has(at)) {
      for (const id of path.slice(path.indexOf(at))) cyclic.add(id);
    }
    for (const id of path) done.add(id);
  }
  return cyclic;
}

/**
 * Reads the stored parents of the materialized markings of `list`: the valid ones (a parent that exists, is
 * another marking of the same container or page, is not floating or decorative, and is not in a cycle)
 * and the positions of the invalid ones. A floating marking never has a parent and is left to the settle.
 */
export function storedStructure(
  list: readonly Marking[],
  materialized: ReadonlySet<string>,
): Structure {
  if (materialized.size === 0) return NO_STRUCTURE;
  const byId = new Map<string, Marking>();
  for (const m of list) if (!byId.has(m.id)) byId.set(m.id, m);
  const edges = new Map<string, string>();
  const withParent: number[] = [];
  list.forEach((m, i) => {
    if (m.parentId === null || m.floating || !materialized.has(m.id)) return;
    withParent.push(i);
    if (validEdge(m, byId.get(m.parentId))) edges.set(m.id, m.parentId);
  });
  if (withParent.length === 0) return NO_STRUCTURE;
  // A cycle runs only through materialized markings: an observation parent has none above it.
  const among = new Map([...edges].filter(([, parent]) => edges.has(parent)));
  const cyclic = cycleMembers(among);
  const followers = new Map<string, string>();
  const invalid: number[] = [];
  for (const i of withParent) {
    const m = list[i] as Marking;
    const parent = edges.get(m.id);
    if (parent === undefined || cyclic.has(m.id)) invalid.push(i);
    else followers.set(m.id, parent);
  }
  return { followers, invalid };
}

/** The marking that decides the space of `id`: up the stored parents, the first one that is not a follower. */
export function anchorOf(structure: Structure, id: string): string {
  let at = id;
  for (let parent = structure.followers.get(at); parent !== undefined;) {
    at = parent;
    parent = structure.followers.get(at);
  }
  return at;
}
