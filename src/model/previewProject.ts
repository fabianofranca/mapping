import { projectIndex } from './projectIndex';
import type { Project } from './types';

// The read-only preview of a reference to another page (stage #883, PG3, decision 13): the project
// reduced to the root group of one item (its containers, markings and the arrows with both ends
// inside), so the renderers draw only that group. Everything else (layers, specializations, pages,
// perspectives, annotations...) stays as in the project, so they still resolve.

const cache = new WeakMap<Project, Map<string, Project | null>>();

/**
 * `itemId` is a marking, a container or an arrow (an arrow belongs to the group of its origin).
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
  const rootId = index.rootOf.get(arrow ? arrow.from : itemId);
  const group = rootId === undefined ? undefined : index.rootMembers.get(rootId);
  if (!group) return null;
  const inside = new Set<string>([
    ...group.containers.map((c) => c.id),
    ...group.markings.map((m) => m.id),
  ]);
  return {
    ...p,
    containers: group.containers,
    markings: group.markings,
    arrows: p.arrows.filter((a) => inside.has(a.from) && inside.has(a.to)),
  };
}
