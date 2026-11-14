// Single resolver of a type's children (`formatVersion` 11, decision 10 of stage #559): reads the
// `allowedChildren` of each type of the specialization, where each item is a type id or a
// `{ layer, groups? }` clause, and returns the set of child types. It is the only reader of
// `allowedChildren`: the validator (`requiresOwner`), `isAllowedOwner`, `childTypesOf` and
// `ownerTypesOf` go through here. Pure, no browser APIs and without importing `spec.ts` (the
// validator uses it): the format it reads is structural.
//
// Rule: the list is the union of the items in their order; inside a clause, the types come out in
// layer order (without `groups`, the whole layer; with `groups`, only the types that are in some
// of the groups); a repeated type stays in the first position. What does not resolve (nonexistent id
// or layer, or a malformed item of the not-yet-validated JSON) is ignored: the one that points
// out the error is the validator.

/** `allowedChildren` clause: the whole layer or the types of it that are in the groups. */
export interface ChildClauseLike {
  readonly layer: string;
  readonly groups?: readonly string[] | undefined;
}

/** What the resolver reads from a type. */
export interface ChildTypeLike {
  readonly id: string;
  readonly groups?: readonly string[] | undefined;
  readonly allowedChildren?: readonly (string | ChildClauseLike)[] | undefined;
}

/** What the resolver reads from a specialization. */
export interface ChildSourceLike {
  readonly layers: readonly {
    readonly id: string;
    readonly annotationTypes: readonly ChildTypeLike[];
  }[];
}

/** The resolved sets of a specialization. */
export interface ChildSets {
  /** owner id → child ids, in order; only owners with at least one child. */
  readonly children: ReadonlyMap<string, readonly string[]>;
  /** owner id → the same ids, for lookup by id. */
  readonly allowed: ReadonlyMap<string, ReadonlySet<string>>;
  /** child id → ids of the owners that accept it, in the specialization's order. */
  readonly owners: ReadonlyMap<string, readonly string[]>;
}

const NONE: readonly string[] = [];

/** Ids of the types of layer `clause.layer` that the clause covers, in layer order. */
function clauseIds(
  clause: ChildClauseLike,
  layers: ReadonlyMap<string, readonly ChildTypeLike[]>,
): string[] {
  const types = layers.get(clause.layer);
  if (types === undefined) return [];
  const wanted = Array.isArray(clause.groups) ? new Set(clause.groups) : null;
  const ids: string[] = [];
  for (const type of types) {
    if (wanted === null || inAnyGroup(type, wanted)) ids.push(type.id);
  }
  return ids;
}

function inAnyGroup(type: ChildTypeLike, wanted: ReadonlySet<string>): boolean {
  if (!Array.isArray(type.groups)) return false;
  for (const group of type.groups) {
    if (wanted.has(group)) return true;
  }
  return false;
}

/**
 * Type ids covered by a list of `id | { layer, groups? }` items, in the items' order and without
 * repeats. It is the resolver of `allowedChildren` and of `accepts.annotations`. What does not resolve
 * (nonexistent id or layer, malformed item) is ignored: the one that points out the error is the validator.
 */
function resolveItems(
  items: unknown,
  known: ReadonlySet<string>,
  layers: ReadonlyMap<string, readonly ChildTypeLike[]>,
): Set<string> {
  const ids = new Set<string>();
  for (const item of Array.isArray(items) ? (items as readonly unknown[]) : []) {
    if (typeof item === 'string') {
      if (known.has(item)) ids.add(item);
    } else if (typeof item === 'object' && item !== null) {
      for (const id of clauseIds(item as ChildClauseLike, layers)) ids.add(id);
    }
  }
  return ids;
}

/** The known type ids and the types by layer (the first layer of an id counts). */
interface Lookup {
  readonly known: ReadonlySet<string>;
  readonly layers: ReadonlyMap<string, readonly ChildTypeLike[]>;
}

const lookupCache = new WeakMap<object, Lookup>();

/** The resolver's common prefix, memoized per specialization (one object, one sweep). */
function lookupOf(source: ChildSourceLike): Lookup {
  const hit = lookupCache.get(source);
  if (hit !== undefined) return hit;
  const known = new Set<string>();
  const layers = new Map<string, readonly ChildTypeLike[]>();
  for (const layer of source.layers) {
    if (!layers.has(layer.id)) layers.set(layer.id, layer.annotationTypes);
    for (const type of layer.annotationTypes) known.add(type.id);
  }
  const lookup = { known, layers };
  lookupCache.set(source, lookup);
  return lookup;
}

function buildChildSets(source: ChildSourceLike): ChildSets {
  const { known, layers } = lookupOf(source);
  const children = new Map<string, readonly string[]>();
  const allowed = new Map<string, ReadonlySet<string>>();
  const owners = new Map<string, string[]>();
  for (const layer of source.layers) {
    for (const type of layer.annotationTypes) {
      if (allowed.has(type.id)) continue;
      const ids = resolveItems(type.allowedChildren, known, layers);
      if (ids.size === 0) continue;
      children.set(type.id, [...ids]);
      allowed.set(type.id, ids);
      for (const id of ids) {
        const list = owners.get(id);
        if (list === undefined) owners.set(id, [type.id]);
        else list.push(type.id);
      }
    }
  }
  return { children, allowed, owners };
}

const cache = new WeakMap<object, ChildSets>();

/** The resolved sets of the specialization, memoized per it (one object, one computation). */
export function childSets(source: ChildSourceLike): ChildSets {
  const hit = cache.get(source);
  if (hit !== undefined) return hit;
  const sets = buildChildSets(source);
  cache.set(source, sets);
  return sets;
}

/** Ids of the types that can be children of type `ownerTypeId`, in order (empty with no children). */
export function childTypeIds(
  source: ChildSourceLike,
  ownerTypeId: string,
): readonly string[] {
  return childSets(source).children.get(ownerTypeId) ?? NONE;
}

/** Ids of the types that accept `childTypeId` as a child, in the specialization's order. */
export function ownerTypeIds(
  source: ChildSourceLike,
  childTypeId: string,
): readonly string[] {
  return childSets(source).owners.get(childTypeId) ?? NONE;
}

/** `true` if type `ownerTypeId` accepts `childTypeId` as a child. */
export function isChildTypeAllowed(
  source: ChildSourceLike,
  ownerTypeId: string,
  childTypeId: string,
): boolean {
  return childSets(source).allowed.get(ownerTypeId)?.has(childTypeId) ?? false;
}

/**
 * Ids of the types of specialization `source` covered by `items` (each item is a type id or a
 * `{ layer, groups? }` clause), in the items' order and without repeats. It is the resolver of
 * `accepts.annotations`, the same as `allowedChildren`.
 */
export function resolveTypeItems(
  source: ChildSourceLike,
  items: readonly (string | ChildClauseLike)[] | undefined,
): readonly string[] {
  const { known, layers } = lookupOf(source);
  return [...resolveItems(items, known, layers)];
}
