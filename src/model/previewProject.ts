import { projectIndex } from './projectIndex';
import type { Marking, Project, ProjectContainer } from './types';

// The read-only preview of a reference to another page (stage #883, PG3, decision 13): the project
// reduced to the root group of one item (its containers, markings and the arrows with both ends
// inside), so the renderers draw only that group. Everything else (layers, specializations, pages,
// perspectives, annotations...) stays as in the project, so they still resolve.

const cache = new WeakMap<Project, Map<string, Project | null>>();

/**
 * `itemId` is a marking, a container or an arrow (an arrow keeps itself and the groups of both its ends).
 * `null` when the id does not exist.
 */
export function refPreviewProject(p: Project, itemId: string): Project | null {
  let byItem = cache.get(p);
  if (!byItem) {
    byItem = new Map();
    cache.set(p, byItem);
  }
  if (byItem.has(itemId)) return byItem.get(itemId) ?? null;
  const result = build(p, itemId);
  byItem.set(itemId, result);
  return result;
}

function build(p: Project, itemId: string): Project | null {
  const index = projectIndex(p);
  const arrow = index.arrows.get(itemId);
  // An arrow normally points between different roots: the cut keeps both groups and the arrow.
  const ends = arrow ? [arrow.from, arrow.to] : [itemId];
  const rootIds = new Set<string>();
  for (const end of ends) {
    const rootId = index.rootOf.get(end);
    if (rootId !== undefined) rootIds.add(rootId);
  }
  const containers: ProjectContainer[] = [];
  const markings: Marking[] = [];
  for (const rootId of rootIds) {
    const group = index.rootMembers.get(rootId);
    if (!group) continue;
    containers.push(...group.containers);
    markings.push(...group.markings);
  }
  if (containers.length === 0 && markings.length === 0) return null;
  const inside = new Set<string>([
    ...containers.map((c) => c.id),
    ...markings.map((m) => m.id),
  ]);
  return {
    ...p,
    containers,
    markings,
    arrows: p.arrows.filter(
      (a) => (inside.has(a.from) && inside.has(a.to)) || a.id === itemId,
    ),
  };
}
