import type {
  ComponentFile,
  ComponentNodeTemplate,
  ResolvedComponent,
  ResolvedComponentField,
  TemplateNode,
} from './componentFormat';

// Nesting of `component` nodes (formatVersion 4): where they are in a template and which types
// end up drawing themselves. Pure; no DOM. The walk and the cycle detection serve the library
// validator (level 2); `attachResolvedComponents` serves the loaders (decision 8 of #2093).

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

/** Most cycles listed by the enumeration, and steps it may take (a dense group must not blow up). */
const MAX_CYCLES = 1000;
const DEFAULT_BUDGET = 100_000;

type Graph = ReadonlyMap<string, readonly string[]>;

/** The distinct successors of `id` that are nodes of the graph, sorted. */
function successors(graph: Graph, id: string): string[] {
  return [...new Set(graph.get(id) ?? [])].sort();
}

/**
 * Strongly connected components (Tarjan, iterative): node id → component number. Only the nodes
 * that are keys of the graph are visited; an id with no entry has no outgoing edges.
 */
function components(graph: Graph): Map<string, number> {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const result = new Map<string, number>();
  let counter = 0;
  let count = 0;
  for (const root of [...graph.keys()].sort()) {
    if (index.has(root)) continue;
    const work: { id: string; next: string[]; at: number }[] = [];
    const open = (id: string): void => {
      index.set(id, counter);
      low.set(id, counter++);
      stack.push(id);
      onStack.add(id);
      work.push({ id, next: successors(graph, id), at: 0 });
    };
    open(root);
    while (work.length > 0) {
      const frame = work[work.length - 1] as (typeof work)[number];
      const to = frame.next[frame.at++];
      if (to !== undefined) {
        if (!index.has(to)) open(to);
        else if (onStack.has(to))
          low.set(
            frame.id,
            Math.min(low.get(frame.id) as number, index.get(to) as number),
          );
        continue;
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent !== undefined)
        low.set(
          parent.id,
          Math.min(low.get(parent.id) as number, low.get(frame.id) as number),
        );
      if (low.get(frame.id) !== index.get(frame.id)) continue;
      let member: string | undefined;
      do {
        member = stack.pop() as string;
        onStack.delete(member);
        result.set(member, count);
      } while (member !== frame.id);
      count++;
    }
  }
  return result;
}

/** The cycle written starting at its smallest id and closing on it. */
function canonical(nodes: readonly string[]): string[] {
  const first = nodes.reduce(
    (best, id, i) => (id < (nodes[best] as string) ? i : best),
    0,
  );
  const rotated = [...nodes.slice(first), ...nodes.slice(0, first)];
  return [...rotated, rotated[0] as string];
}

/** The shortest cycle through `start` inside its component (breadth first), canonical. */
function shortestCycle(
  graph: Graph,
  start: string,
  inside: (id: string) => boolean,
): string[] {
  const before = new Map<string, string>();
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const from = queue[head] as string;
    for (const to of successors(graph, from)) {
      if (!inside(to)) continue;
      if (to === start) {
        const path = [from];
        while (path[0] !== start) path.unshift(before.get(path[0] as string) as string);
        return canonical(path);
      }
      if (before.has(to)) continue;
      before.set(to, from);
      queue.push(to);
    }
  }
  return [start, start];
}

/**
 * The cycles of the nesting graph (type id → ids of the types its `component` nodes draw): the
 * simple cycle starts at its smallest id and closes on it (`['a', 'b', 'a']`; a type that nests
 * itself is `['a', 'a']`). Sorted, so the output is deterministic. Only the strongly connected
 * groups with a cycle are searched, so an acyclic graph costs nothing however dense it is. The
 * enumeration of simple cycles has a step `budget`; when it runs out, every node that lies on a
 * cycle still gets one (its shortest), so no cyclic type goes unreported.
 */
export function findComponentCycles(
  graph: Graph,
  budget: number = DEFAULT_BUDGET,
): string[][] {
  const group = components(graph);
  const size = new Map<number, number>();
  for (const g of group.values()) size.set(g, (size.get(g) ?? 0) + 1);
  const cyclic = (id: string): boolean =>
    (size.get(group.get(id) as number) as number) > 1 ||
    successors(graph, id).includes(id);
  const found = new Map<string, string[]>();
  let steps = 0;
  for (const start of [...graph.keys()].sort().filter(cyclic)) {
    const here = group.get(start);
    const path = [start];
    const walk = (from: string): void => {
      for (const to of successors(graph, from)) {
        if (steps++ >= budget || found.size >= MAX_CYCLES) return;
        if (to === start) found.set([...path, start].join('\u0000'), [...path, start]);
        else if (to > start && group.get(to) === here && !path.includes(to)) {
          path.push(to);
          walk(to);
          path.pop();
        }
      }
    };
    walk(start);
  }
  const covered = new Set([...found.values()].flat());
  for (const id of [...graph.keys()].sort().filter(cyclic)) {
    if (covered.has(id)) continue;
    const cycle = shortestCycle(graph, id, (to) => group.get(to) === group.get(id));
    found.set(cycle.join('\u0000'), cycle);
    for (const member of cycle) covered.add(member);
  }
  return [...found.values()].sort(compareCycles);
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

/**
 * The components of a specialization with `resolvedComponents` attached (decision 8 of #2093): for
 * each type that has `component` nodes, the inner components they draw (type id → the inner
 * component, itself resolved, with its type's fields). A type in a nesting cycle gets no entry in
 * anyone's table, so the node that draws it is unavailable (`component not available`); the types
 * outside the cycles resolve normally. A type without nodes keeps its own object; a type with
 * them comes out as a new one, so the drawing caches (which compare components by identity)
 * redraw it when an inner file changes. `fieldsOf` gives a type's fields (`undefined` = unknown type).
 */
export function attachResolvedComponents(
  components: ReadonlyMap<string, ComponentFile>,
  fieldsOf: (typeId: string) => readonly ResolvedComponentField[] | undefined,
): Map<string, ComponentFile> {
  const refs = new Map<string, string[]>();
  for (const [id, component] of components)
    refs.set(id, [
      ...new Set(componentNodes(component.template).map((ref) => ref.node.id)),
    ]);
  const cyclic = new Set(findComponentCycles(refs).flat());
  const resolved = new Map<string, ComponentFile>();
  const resolve = (id: string): ComponentFile => {
    const known = resolved.get(id);
    if (known !== undefined) return known;
    const own = components.get(id) as ComponentFile;
    const table: Record<string, ResolvedComponent> = {};
    for (const ref of refs.get(id) ?? []) {
      const fields = fieldsOf(ref);
      if (!components.has(ref) || cyclic.has(ref) || fields === undefined) continue;
      table[ref] = { component: resolve(ref), fields };
    }
    const done: ComponentFile =
      Object.keys(table).length === 0 ? own : { ...own, resolvedComponents: table };
    resolved.set(id, done);
    return done;
  };
  for (const id of components.keys()) resolve(id);
  return resolved;
}

/** The fields of an annotation type as a `component` node needs them (`SpecField` and the library's `FieldDef` both fit). */
export function resolvedFields(
  fields: readonly {
    readonly key: string;
    readonly type: ResolvedComponentField['type'];
    readonly required?: boolean;
    readonly default?: unknown;
  }[],
): ResolvedComponentField[] {
  return fields.map((field) => ({
    key: field.key,
    type: field.type,
    required: field.required === true,
    ...(typeof field.default === 'string' || typeof field.default === 'number'
      ? { default: field.default }
      : {}),
  }));
}
