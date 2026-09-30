import type { Marking, Project } from './types';

/** Filhas diretas de cada marcação (chave `null` = marcações sem pai), na ordem do array. */
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
  return p.markings.filter((m) => m.parentId === markingId);
}

/** Todos os descendentes (filhas, netas…), sem incluir a própria marcação. */
export function descendantsOf(p: Project, markingId: string): Marking[] {
  const index = childrenIndex(p.markings);
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

/** Profundidade na hierarquia: 0 para marcações sem pai. */
export function depthOf(p: Project, markingId: string): number {
  const byId = new Map(p.markings.map((m) => [m.id, m]));
  let depth = 0;
  let parentId = byId.get(markingId)?.parentId ?? null;
  while (parentId !== null && depth <= byId.size) {
    depth++;
    parentId = byId.get(parentId)?.parentId ?? null;
  }
  return depth;
}

/**
 * Marcações de uma imagem ordenadas de cima para baixo na hierarquia
 * (todo pai aparece antes das filhas).
 */
export function topDown(markings: readonly Marking[]): Marking[] {
  const ids = new Set(markings.map((m) => m.id));
  const index = childrenIndex(markings);
  const roots = markings.filter((m) => m.parentId === null || !ids.has(m.parentId));
  const result: Marking[] = [];
  const queue = [...roots];
  while (queue.length > 0) {
    const m = queue.shift() as Marking;
    result.push(m);
    queue.push(...(index.get(m.id) ?? []));
  }
  return result;
}
