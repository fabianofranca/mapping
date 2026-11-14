import type { Spec, SpecLayer } from './spec';
import type { ResolvedType } from './specLookup';
import type {
  Annotation,
  Arrow,
  Entry,
  Layer,
  Marking,
  Perspective,
  Project,
  ProjectContainer,
  ProjectSpecialization,
} from './types';

// Project index (docs/ARCHITECTURE.md, "Performance"): maps by id and groupings built once
// per project version. Since the project is immutable, the version is the object itself:
// the `WeakMap` returns the same index while it exists and releases it along with
// it. It works the same in the browser and in Node.

/** A root's group (v16): it and everything whose membership chain ends in it. */
export interface RootMembers {
  readonly markings: readonly Marking[];
  readonly containers: readonly ProjectContainer[];
}

export interface ProjectIndex {
  readonly layers: ReadonlyMap<string, Layer>;
  readonly containers: ReadonlyMap<string, ProjectContainer>;
  readonly markings: ReadonlyMap<string, Marking>;
  /** Arrows by id (v13). Ids share the same space as the markings'. */
  readonly arrows: ReadonlyMap<string, Arrow>;
  /**
   * Arrows attached to each marking, in array order: each arrow appears under the origin (`from`)
   * and under the destination (`to`); an arrow from a marking to itself (invalid project) appears once.
   */
  readonly arrowsByMarking: ReadonlyMap<string, readonly Arrow[]>;
  /**
   * Markings anchored to each target (v20, `anchor.to`), in array order. Only those with an anchor;
   * the target may not even exist (invalid project).
   */
  readonly anchoredBy: ReadonlyMap<string, readonly Marking[]>;
  /** Anchor target of each anchored marking (`anchor.to`); those without an anchor have no entry. */
  readonly anchorOf: ReadonlyMap<string, string>;
  readonly annotations: ReadonlyMap<string, Annotation>;
  /** Tuples of each annotation, by id. */
  readonly entries: ReadonlyMap<string, ReadonlyMap<string, Entry>>;
  /** Direct children of each marking (key `null` = no parent), in array order. */
  readonly children: ReadonlyMap<string | null, readonly Marking[]>;
  /**
   * Containers of each canvas marking (v13; key `null` = containers with no parent), in array
   * order. Together with `children`, they are the members of a marking (`membersOf`).
   */
  readonly containersByParent: ReadonlyMap<string | null, readonly ProjectContainer[]>;
  /** Canvas markings with no parent (floating ones included), in array order. */
  readonly canvasRoots: readonly Marking[];
  /**
   * Root of each container and marking (v16, perspectives): the container or the canvas marking
   * with no parent (floating included) where the membership chain ends. A container with no parent,
   * a floating one and a canvas marking with no parent are their own root. Container and marking
   * ids share the map. In a cycle (invalid project) everything in the chain gets the node where
   * it closes.
   */
  readonly rootOf: ReadonlyMap<string, string>;
  /**
   * Everything that has a root (it included), by root id, in array order. Every root
   * has an entry, even with nobody else.
   */
  readonly rootMembers: ReadonlyMap<string, RootMembers>;
  /** Root ids: containers with no parent (array order), then `canvasRoots`. */
  readonly roots: readonly string[];
  /** "For everyone" perspectives that have each root, in `perspectives` order. */
  readonly perspectivesByRoot: ReadonlyMap<string, readonly Perspective[]>;
  /** Annotations of each marking, in project order. */
  readonly annotationsByMarking: ReadonlyMap<string, readonly Annotation[]>;
  /** Annotations linked directly to each owner, in project order. */
  readonly annotationsByOwner: ReadonlyMap<string, readonly Annotation[]>;
  readonly specializations: ReadonlyMap<string, ProjectSpecialization>;
  /** Types of the loaded specializations, by `typeKey(specId, typeId)`. */
  readonly types: ReadonlyMap<string, ResolvedType>;
  /** Layers of the loaded specializations, by `typeKey(specId, layerId)`. */
  readonly specLayers: ReadonlyMap<string, SpecLayer>;
  /** Project layer created from each specialization layer, by `typeKey(specId, layerId)`. */
  readonly layersBySpecLayer: ReadonlyMap<string, Layer>;
}

/** Composite specialization + id (type or layer) key of the index maps. */
export function typeKey(specId: string, id: string): string {
  return `${specId}\u0000${id}`;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Map by id; with repeated ids the first wins, as in `find`. */
function byId<T extends { readonly id: string }>(list: readonly T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of list) if (!map.has(item.id)) map.set(item.id, item);
  return map;
}

function indexSpec(
  specId: string,
  spec: Spec,
  types: Map<string, ResolvedType>,
  specLayers: Map<string, SpecLayer>,
): void {
  for (const layer of spec.layers) {
    // Ids are unique in the specialization; if they repeat, the first wins (as in `find`).
    const layerKey = typeKey(specId, layer.id);
    if (!specLayers.has(layerKey)) specLayers.set(layerKey, layer);
    for (const type of layer.annotationTypes) {
      const key = typeKey(specId, type.id);
      if (!types.has(key)) types.set(key, { spec, layer, type });
    }
  }
}

/**
 * The node above `id` in the membership chain, or `null` if `id` is a root (container with no
 * parent, canvas marking with no parent, floating) or the node above does not exist (invalid
 * project). Above a container marking is the container; above a container, its parent marking.
 */
function upperNode(
  id: string,
  containers: ReadonlyMap<string, ProjectContainer>,
  markings: ReadonlyMap<string, Marking>,
): string | null {
  const c = containers.get(id);
  const m = c ? undefined : markings.get(id);
  const up = c ? c.parentId : m && !m.floating ? (m.containerId ?? m.parentId) : null;
  if (up === null) return null;
  return containers.has(up) || markings.has(up) ? up : null;
}

/** Root of each node, without recursion (deep chains) and without hanging on a cycle. */
function computeRootOf(
  ids: Iterable<string>,
  upper: (id: string) => string | null,
): Map<string, string> {
  const rootOf = new Map<string, string>();
  for (const start of ids) {
    if (rootOf.has(start)) continue;
    const path = new Set<string>();
    let current = start;
    let root: string | undefined;
    while (root === undefined) {
      const known = rootOf.get(current);
      if (known !== undefined || path.has(current)) {
        root = known ?? current;
        continue;
      }
      path.add(current);
      const up = upper(current);
      if (up === null) root = current;
      else current = up;
    }
    for (const id of path) rootOf.set(id, root);
  }
  return rootOf;
}

function rootGroups(
  p: Project,
  containers: ReadonlyMap<string, ProjectContainer>,
  markings: ReadonlyMap<string, Marking>,
  canvasRoots: readonly Marking[],
): Pick<ProjectIndex, 'rootOf' | 'rootMembers' | 'roots' | 'perspectivesByRoot'> {
  const upper = (id: string) => upperNode(id, containers, markings);
  const rootOf = computeRootOf(
    [...p.containers.map((c) => c.id), ...p.markings.map((m) => m.id)],
    upper,
  );
  const groups = new Map<
    string,
    { markings: Marking[]; containers: ProjectContainer[] }
  >();
  const groupOf = (id: string) => {
    const root = rootOf.get(id) as string;
    let group = groups.get(root);
    if (!group) groups.set(root, (group = { markings: [], containers: [] }));
    return group;
  };
  for (const c of p.containers) groupOf(c.id).containers.push(c);
  for (const m of p.markings) groupOf(m.id).markings.push(m);

  const roots = [
    ...p.containers.filter((c) => c.parentId === null).map((c) => c.id),
    ...canvasRoots.map((m) => m.id),
  ];
  const perspectivesByRoot = new Map<string, Perspective[]>();
  for (const perspective of p.perspectives) {
    for (const root of new Set(perspective.items.map((item) => item.root))) {
      push(perspectivesByRoot, root, perspective);
    }
  }
  return { rootOf, rootMembers: groups, roots, perspectivesByRoot };
}

function buildIndex(p: Project): ProjectIndex {
  const entries = new Map<string, ReadonlyMap<string, Entry>>();
  const children = new Map<string | null, Marking[]>();
  const containersByParent = new Map<string | null, ProjectContainer[]>();
  const canvasRoots: Marking[] = [];
  const arrowsByMarking = new Map<string, Arrow[]>();
  const annotationsByMarking = new Map<string, Annotation[]>();
  const anchoredBy = new Map<string, Marking[]>();
  const anchorOf = new Map<string, string>();
  const annotationsByOwner = new Map<string, Annotation[]>();
  const types = new Map<string, ResolvedType>();
  const specLayers = new Map<string, SpecLayer>();
  const layersBySpecLayer = new Map<string, Layer>();
  for (const l of p.layers) {
    if (!l.spec) continue;
    const key = typeKey(l.spec.specId, l.spec.layerId);
    if (!layersBySpecLayer.has(key)) layersBySpecLayer.set(key, l);
  }
  const containersById = byId(p.containers);
  const markingsById = byId(p.markings);

  for (const m of p.markings) {
    push(children, m.parentId, m);
    if (m.containerId === null && m.parentId === null) canvasRoots.push(m);
    if (m.anchor != null) {
      push(anchoredBy, m.anchor.to, m);
      anchorOf.set(m.id, m.anchor.to);
    }
  }
  for (const c of p.containers) push(containersByParent, c.parentId, c);
  for (const a of p.arrows) {
    push(arrowsByMarking, a.from, a);
    if (a.to !== a.from) push(arrowsByMarking, a.to, a);
  }
  for (const a of p.annotations) {
    if (!entries.has(a.id)) entries.set(a.id, byId(a.entries));
    push(annotationsByMarking, a.markingId, a);
    if (a.parentAnnotationId !== null) push(annotationsByOwner, a.parentAnnotationId, a);
  }
  for (const s of p.specializations) {
    // The applied specialization's id is the one layers and annotations use.
    if (s.spec) indexSpec(s.id, s.spec, types, specLayers);
  }
  return {
    layers: byId(p.layers),
    containers: containersById,
    markings: markingsById,
    arrows: byId(p.arrows),
    arrowsByMarking,
    anchoredBy,
    anchorOf,
    annotations: byId(p.annotations),
    entries,
    children,
    containersByParent,
    canvasRoots,
    ...rootGroups(p, containersById, markingsById, canvasRoots),
    annotationsByMarking,
    annotationsByOwner,
    specializations: byId(p.specializations),
    types,
    specLayers,
    layersBySpecLayer,
  };
}

/**
 * Memoizes `fn` by project version: the same version returns the same result
 * (and the same object). It serves derived data that depends on nothing else.
 */
export function memoByProject<T>(fn: (p: Project) => T): (p: Project) => T {
  const cache = new WeakMap<Project, T>();
  return (p) => {
    if (cache.has(p)) return cache.get(p) as T;
    const value = fn(p);
    cache.set(p, value);
    return value;
  };
}

/** Project index, built on the first query of each version. */
export const projectIndex: (p: Project) => ProjectIndex = memoByProject(buildIndex);

/**
 * The id already belongs to a marking, an arrow or a container (`projectIndex` treats them as a
 * single space). It scans the arrays instead of using the index: whoever creates an item at each
 * project version cannot pay for building the index per creation.

 */
export function idInUse(p: Project, id: string): boolean {
  return (
    p.markings.some((m) => m.id === id) ||
    p.arrows.some((a) => a.id === id) ||
    p.containers.some((c) => c.id === id)
  );
}
