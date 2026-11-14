import { projectIndex } from './projectIndex';
import type { Marking, Project } from './types';

/** Direct children of each marking (key `null` = markings with no parent), in array order. */
export function childrenIndex(
  markings: readonly Marking[],
): Map<string | null, Marking[]> {
  const index = new Map<string | null, Marking[]>();
  for (const m of markings) {
    const siblings = index.get(m.parentId);
    if (siblings) siblings.push(m);
    else index.set(m.parentId, [m]);
  }
  return index;
}

export function childrenOf(p: Project, markingId: string): Marking[] {
  return [...(projectIndex(p).children.get(markingId) ?? [])];
}

/** All descendants (children, grandchildren…), not including the marking itself. */
export function descendantsOf(p: Project, markingId: string): Marking[] {
  const index = projectIndex(p).children;
  const result: Marking[] = [];
  const stack = [...(index.get(markingId) ?? [])];
  while (stack.length > 0) {
    const m = stack.pop() as Marking;
    result.push(m);
    stack.push(...(index.get(m.id) ?? []));
  }
  return result;
}

export function descendantIds(p: Project, markingId: string): Set<string> {
  return new Set(descendantsOf(p, markingId).map((m) => m.id));
}

/** Depth in the hierarchy: 0 for markings with no parent. */
export function depthOf(p: Project, markingId: string): number {
  const byId = projectIndex(p).markings;
  let depth = 0;
  let parentId = byId.get(markingId)?.parentId ?? null;
  while (parentId !== null && depth <= byId.size) {
    depth++;
    parentId = byId.get(parentId)?.parentId ?? null;
  }
  return depth;
}

/**
 * Markings of an image ordered top-down in the hierarchy
 * (every parent appears before its children).
 */
export function topDown(markings: readonly Marking[]): Marking[] {
  const ids = new Set(markings.map((m) => m.id));
  const index = childrenIndex(markings);
  const roots = markings.filter((m) => m.parentId === null || !ids.has(m.parentId));
  const result: Marking[] = [];
  // The queue is the result itself, read by an index (no `shift`, which would be O(n) per item).
  result.push(...roots);
  for (let read = 0; read < result.length; read++) {
    for (const child of index.get((result[read] as Marking).id) ?? []) result.push(child);
  }
  return result;
}

/** Ancestors of the marking, from the parent up to the root. */
export function ancestorsOf(p: Project, markingId: string): Marking[] {
  const byId = projectIndex(p).markings;
  const result: Marking[] = [];
  let parentId = byId.get(markingId)?.parentId ?? null;
  while (parentId !== null && result.length <= byId.size) {
    const parent = byId.get(parentId);
    if (!parent) break;
    result.push(parent);
    parentId = parent.parentId;
  }
  return result;
}
