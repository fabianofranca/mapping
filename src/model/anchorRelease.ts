import { memoByProject, projectIndex, type ProjectIndex } from './projectIndex';
import type { Marking, Project } from './types';

// End of the settle: the anchor requires the same space (`anchor-other-space`). When the geometry
// leaves the anchored marking and the target in different spaces, the relation is released
// (`anchor: null`). It does not touch `parentId` (the anchor takes no part in membership) and
// returns the same project when nothing is released.

/** Ids of whoever is anchored to a target in another space, looking at `ids` and those anchored to them. */
function stranded(
  p: Project,
  ids: Iterable<string>,
  was: ProjectIndex | null,
): Set<string> {
  const index = projectIndex(p);
  const out = new Set<string>();
  const check = (id: string): void => {
    const m = index.markings.get(id);
    const to = m?.anchor?.to;
    if (m === undefined || to === undefined) return;
    const target = index.markings.get(to);
    if (target !== undefined && target.containerId !== m.containerId) out.add(id);
  };
  for (const id of ids) {
    check(id);
    for (const f of was?.anchoredBy.get(id) ?? []) check(f.id);
  }
  return out;
}

/**
 * Does any marking have an anchor? A cheap scan per version (without building the index): whoever
 * edits a project with no anchors does not pay for building the index on every operation.
 */
export const hasAnchors = memoByProject((p: Project): boolean =>
  p.markings.some((m) => m.anchor != null),
);

/** Touched ids (in `p`) that have an anchor relation: their own, or markings anchored to them in `before`. */
function touchedAnchorIds(
  p: Project,
  touched: readonly number[],
  idx: ProjectIndex | null,
): string[] {
  const list: string[] = [];
  for (const i of touched) {
    const m = p.markings[i];
    if (m === undefined) continue;
    if (m.anchor != null || idx?.anchorOf.has(m.id) || idx?.anchoredBy.has(m.id)) {
      list.push(m.id);
    }
  }
  return list;
}

/**
 * Releases the anchor of whoever ended up in a different space than the target. `touched` are the
 * positions (in `p.markings`) of the markings the operation touched; `null` checks the whole
 * project (only the anchored ones). With `touched`, the index of `before` gives the markings
 * anchored to each touched target, and it is only built when `before` has some anchor; without an
 * anchor in `before`, only the touched markings that are born with one matter. The index of `p`
 * is only built when some touched marking has an anchor relation.
 */
export function releaseStrandedAnchors(
  p: Project,
  touched: readonly number[] | null,
  before: Project,
): Project {
  let ids: Iterable<string>;
  let was: ProjectIndex | null = null;
  if (touched === null) {
    if (!hasAnchors(p)) return p;
    ids = projectIndex(p).anchorOf.keys();
  } else {
    const idx = hasAnchors(before) ? projectIndex(before) : null;
    const list = touchedAnchorIds(p, touched, idx);
    if (list.length === 0) return p;
    ids = list;
    was = idx;
  }
  const out = stranded(p, ids, was);
  if (out.size === 0) return p;
  const markings = p.markings.map((m): Marking =>
    out.has(m.id) ? { ...m, anchor: null } : m,
  );
  return { ...p, markings };
}

/**
 * The markings with the anchor removed from whoever pointed to one that leaves (`removed`): they
 * stay, with no anchor. Returns the same array when nothing points to whoever leaves. It serves
 * the deletion of one marking (`removeMarking`) and of the selection (`removeItems`).
 */
export function releasedAnchors(
  p: Project,
  removed: ReadonlySet<string>,
): readonly Marking[] {
  const { anchorOf } = projectIndex(p);
  if (anchorOf.size === 0) return p.markings;
  return p.markings.map((m) => {
    const to = anchorOf.get(m.id);
    return to !== undefined && removed.has(to) ? { ...m, anchor: null } : m;
  });
}
