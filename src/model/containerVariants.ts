import { fail } from './errors';
import { containerClassIn } from './containerClasses';
import { findById } from './project';
import { projectIndex, typeKey } from './projectIndex';
import {
  MAX_VARIANT_GROUP_LENGTH,
  type AnnotationTypeRef,
  type Project,
  type ProjectContainer,
} from './types';

// Variants of a screen (schema v26, stage #2034 VR1, decisions 1 to 8): containers that are the same
// screen in another size share `variantGroup`. The link is symmetric (no main container) and says nothing
// about the container class or the page: those come from #1901 and #883. A group no other container shares
// (a group of one) is not an error and means no link: it is read and kept, gives no variant, and the
// operations below drop it whenever they leave one. No browser APIs: the MCP server reuses this.

/** A group id checked: a non-empty string of at most `MAX_VARIANT_GROUP_LENGTH` characters (else `invalid-value`). */
export function checkVariantGroup(group: string): string {
  if (group.length === 0 || group.length > MAX_VARIANT_GROUP_LENGTH) {
    return fail('invalid-value', 'variantGroup');
  }
  return group;
}

/** The container without its `variantGroup` key (the file never keeps `null`). */
function withoutGroup(c: ProjectContainer): ProjectContainer {
  const { variantGroup, ...rest } = c;
  void variantGroup;
  return rest;
}

/** How many containers each group has. */
function groupSizes(containers: readonly ProjectContainer[]): Map<string, number> {
  const sizes = new Map<string, number>();
  for (const c of containers) {
    if (c.variantGroup != null)
      sizes.set(c.variantGroup, (sizes.get(c.variantGroup) ?? 0) + 1);
  }
  return sizes;
}

/**
 * Drops the `variantGroup` of every container whose group has no other member (decision 2). With `only`,
 * just those groups are looked at: a removal path passes the groups of what it removed, so a group of one
 * that was already there and was not touched stays. Returns `p` itself when nothing changes.
 */
export function pruneLoneVariantGroups(p: Project, only?: ReadonlySet<string>): Project {
  if (only !== undefined && only.size === 0) return p;
  const sizes = groupSizes(p.containers);
  const lone = (c: ProjectContainer): boolean =>
    c.variantGroup != null &&
    sizes.get(c.variantGroup) === 1 &&
    (only === undefined || only.has(c.variantGroup));
  if (!p.containers.some(lone)) return p;
  return { ...p, containers: p.containers.map((c) => (lone(c) ? withoutGroup(c) : c)) };
}

/** The groups of the containers with these ids (the ones a removal could leave with a single member). */
export function variantGroupsOf(
  p: Pick<Project, 'containers'>,
  containerIds: ReadonlySet<string>,
): Set<string> {
  const groups = new Set<string>();
  for (const c of p.containers) {
    if (containerIds.has(c.id) && c.variantGroup != null) groups.add(c.variantGroup);
  }
  return groups;
}

/**
 * Links `containerId` and `otherId` as variants (decision 4). Neither has a group: a new id goes to both;
 * one has: the other joins it; both have different groups: the two groups **merge** into `otherId`'s.
 * A container linked to itself is refused (`variant-self`) and so is one already in the same group
 * (`variant-already-linked`); an unknown id fails with `not-found`. A lock does not prevent it.
 */
export function linkVariant(p: Project, containerId: string, otherId: string): Project {
  const container = findById(p.containers, containerId);
  const other = findById(p.containers, otherId);
  if (containerId === otherId) return fail('variant-self', containerId);
  const mine = container.variantGroup ?? null;
  const theirs = other.variantGroup ?? null;
  if (mine !== null && mine === theirs) {
    return fail('variant-already-linked', `${containerId}, ${otherId}`);
  }
  const group = theirs ?? mine ?? crypto.randomUUID();
  const joins = (c: ProjectContainer): boolean =>
    c.id === containerId ||
    c.id === otherId ||
    (mine !== null && c.variantGroup === mine) ||
    (theirs !== null && c.variantGroup === theirs);
  return {
    ...p,
    containers: p.containers.map((c) => (joins(c) ? { ...c, variantGroup: group } : c)),
  };
}

/**
 * Removes only this container's `variantGroup`; if one container is left alone in the group, its key goes
 * too (decision 4). A container with no group returns `p` as is. A lock does not prevent it.
 */
export function unlinkVariant(p: Project, containerId: string): Project {
  const container = findById(p.containers, containerId);
  const group = container.variantGroup;
  if (group == null) return p;
  const without = {
    ...p,
    containers: p.containers.map((c) => (c.id === containerId ? withoutGroup(c) : c)),
  };
  return pruneLoneVariantGroups(without, new Set([group]));
}

/**
 * The other containers of the same group, in project order (read from `projectIndex`): `[]` without a
 * group, in a group of one or for an unknown id.
 */
export function variantsOf(p: Project, containerId: string): readonly ProjectContainer[] {
  return projectIndex(p).variantsOf.get(containerId) ?? [];
}

/** A type that other variants map and this container does not (decision 6). */
export interface MissingVariantType {
  readonly type: AnnotationTypeRef;
  /** The variants (container ids, in project order) that have a marking with the type. */
  readonly variants: readonly string[];
}

/**
 * The annotation types (`spec/type`) on a marking of **another** variant and on no marking of this
 * container (decision 6): an informative check, not a pending item. Only typed annotations on markings
 * count (free annotations, arrows and canvas markings do not). A type whose `appliesIn` excludes this
 * container's class in some set (the container has a class in the type's own set and it is not in the
 * list) is skipped: the variant lacks it on purpose; a set that gives the container no class excludes
 * nothing. Types come in the order the variants and their markings list them.
 */
export function missingVariantTypes(
  p: Project,
  containerId: string,
): readonly MissingVariantType[] {
  const index = projectIndex(p);
  const container = index.containers.get(containerId);
  const variants = variantsOf(p, containerId);
  if (container === undefined || variants.length === 0) return [];
  const typesOf = typesByContainer(
    p,
    new Set([containerId, ...variants.map((v) => v.id)]),
  );
  const here = typesOf.get(containerId) ?? new Map<string, AnnotationTypeRef>();
  const missing = new Map<string, { type: AnnotationTypeRef; variants: string[] }>();
  for (const variant of variants) {
    const theirs = typesOf.get(variant.id) ?? new Map<string, AnnotationTypeRef>();
    for (const [key, type] of theirs) {
      if (here.has(key) || excludedHere(p, container, type)) continue;
      const found = missing.get(key);
      if (found) found.variants.push(variant.id);
      else missing.set(key, { type, variants: [variant.id] });
    }
  }
  return [...missing.values()];
}

/** The typed annotations on the markings of each wanted container: `typeKey` → type, in project order. */
function typesByContainer(
  p: Project,
  wanted: ReadonlySet<string>,
): Map<string, Map<string, AnnotationTypeRef>> {
  const index = projectIndex(p);
  const result = new Map<string, Map<string, AnnotationTypeRef>>();
  for (const m of p.markings) {
    if (m.containerId === null || !wanted.has(m.containerId)) continue;
    for (const a of index.annotationsByMarking.get(m.id) ?? []) {
      if (a.type == null) continue;
      let types = result.get(m.containerId);
      if (types === undefined) result.set(m.containerId, (types = new Map()));
      const key = typeKey(a.type.specId, a.type.typeId);
      if (!types.has(key)) types.set(key, a.type);
    }
  }
  return result;
}

/** Does the type's `appliesIn` exclude the class this container has in one of the type's sets? */
function excludedHere(
  p: Project,
  container: ProjectContainer,
  type: AnnotationTypeRef,
): boolean {
  const resolved = projectIndex(p).types.get(typeKey(type.specId, type.typeId));
  const { appliesIn } = resolved?.type ?? {};
  if (resolved === undefined || appliesIn === undefined) return false;
  const sets = resolved.spec.containerClasses ?? [];
  return Object.entries(appliesIn).some(([setId, allowedIds]) => {
    const set = sets.find((s) => s.id === setId);
    const found = set && containerClassIn(p, container, set);
    return found !== undefined && !allowedIds.includes(found.id);
  });
}
