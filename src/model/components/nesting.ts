import type { ComponentNodeTemplate, TemplateNode } from './componentFormat';

// Nesting of `component` nodes (formatVersion 4): where they are in a template and which types
// end up drawing themselves. Pure; no DOM. CC1 only provides the walk and the cycle detection that
// the library validator uses; CC2 adds the resolution of the inner components here.

/** A `component` node of a template and its path (`template.children[0]`). */
export interface ComponentNodeRef {
  readonly path: string;
  readonly node: ComponentNodeTemplate;
}

/**
 * The `component` nodes of a template, in document order, with their paths: through the frames'
 * `children`, the `repeat`'s `template` and a slot's `fallback` (same notation as the rest of the
 * format: `template.children[0]`, `…template`, `…fallback`).
 */
export function componentNodes(
  node: TemplateNode,
  path = 'template',
  out: ComponentNodeRef[] = [],
): ComponentNodeRef[] {
  if (node.type === 'component') out.push({ path, node });
  if (node.type === 'frame')
    (node.children ?? []).forEach((child, i) =>
      componentNodes(child, `${path}.children[${i}]`, out),
    );
  else if (node.type === 'repeat') componentNodes(node.template, `${path}.template`, out);
  else if (node.type === 'slot' && node.fallback !== undefined)
    componentNodes(node.fallback, `${path}.fallback`, out);
  return out;
}

/** Most cycles reported: a densely connected library does not blow up the search. */
const MAX_CYCLES = 1000;

/**
 * The cycles of the nesting graph (type id → ids of the types its `component` nodes draw), each
 * once: the simple cycle starts at its smallest id and closes on it (`['a', 'b', 'a']`; a type
 * that nests itself is `['a', 'a']`). Sorted by their ids, so the output is deterministic. Ids with
 * no entry have no outgoing edges.
 */
export function findComponentCycles(
  graph: ReadonlyMap<string, readonly string[]>,
): string[][] {
  const cycles: string[][] = [];
  const starts = [...graph.keys()].sort();
  for (const start of starts) {
    const path = [start];
    const walk = (from: string): void => {
      const next = [...new Set(graph.get(from) ?? [])].sort();
      for (const to of next) {
        if (cycles.length >= MAX_CYCLES) return;
        if (to === start) cycles.push([...path, start]);
        else if (to > start && !path.includes(to)) {
          path.push(to);
          walk(to);
          path.pop();
        }
      }
    };
    walk(start);
  }
  return cycles.sort(compareCycles);
}

function compareCycles(a: readonly string[], b: readonly string[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] as string;
    const y = b[i] as string;
    if (x !== y) return x < y ? -1 : 1;
  }
  return a.length - b.length;
}
