import { fail } from './errors';
import { findById, updateById } from './project';
import { projectIndex } from './projectIndex';
import {
  isAllowedOwner,
  ownerRolesOf,
  typeOfAnnotation,
  type OwnerRoles,
} from './specLookup';
import type { Annotation, Project } from './types';

// Links (annotation → owner annotation).

/** Annotations linked directly to the owner, in array order. */
function directLinked(p: Project, annotationId: string): Annotation[] {
  return [...(projectIndex(p).annotationsByOwner.get(annotationId) ?? [])];
}

/** Linked to `annotationId`, at any depth (not including itself). */
export function getLinkedAnnotations(
  p: Project,
  annotationId: string,
  options: { readonly deep?: boolean } = {},
): Annotation[] {
  const result: Annotation[] = [];
  const seen = new Set<string>([annotationId]);
  let level = directLinked(p, annotationId);
  while (level.length > 0) {
    const next: Annotation[] = [];
    for (const a of level) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      result.push(a);
      if (options.deep) next.push(...directLinked(p, a.id));
    }
    level = next;
  }
  return result;
}

/** Ids of the annotation and of all those linked to it, recursively. */
export function annotationWithLinked(p: Project, annotationId: string): Set<string> {
  const ids = new Set<string>([annotationId]);
  for (const a of getLinkedAnnotations(p, annotationId, { deep: true })) ids.add(a.id);
  return ids;
}

/**
 * Possible owners for the annotation: same marking and no cycle (the annotation and those linked to it are
 * left out). Free annotation: only owners from another layer. Typed annotation: only owners whose type lists it
 * in `allowedChildren`, from any layer (including its own, since `formatVersion` 13).
 */
export function validAnnotationOwners(p: Project, annotationId: string): Annotation[] {
  const annotation = findById(p.annotations, annotationId);
  const descendants = annotationWithLinked(p, annotationId);
  const type = annotation.type;
  return (projectIndex(p).annotationsByMarking.get(annotation.markingId) ?? []).filter(
    (a) =>
      !descendants.has(a.id) &&
      (type === null ? a.layerId !== annotation.layerId : isAllowedOwner(p, type, a)),
  );
}

/**
 * Checks a role (v14) against what the owner offers: with no owner, `role-without-owner`; a role the
 * owner does not offer (including an owner without `childRoles`), `unknown-role`.
 */
export function checkRole(
  offered: OwnerRoles | null,
  role: string,
  hasOwner: boolean,
): void {
  if (!hasOwner) fail('role-without-owner', role);
  if (!offered?.roles.some((r) => r.id === role)) fail('unknown-role', role);
}

/** Role that survives an owner change: the current one, if the new owner offers it; otherwise `null`. */
function roleAfterOwnerChange(p: Project, role: string | null, ownerId: string | null) {
  if (role === null || ownerId === null) return null;
  const offered = ownerRolesOf(p, findById(p.annotations, ownerId));
  return offered?.roles.some((r) => r.id === role) ? role : null;
}

/**
 * Sets (or, with `null`, removes) the annotation's owner, respecting the invariants. The current role
 * stays only if the new owner offers it; removing the owner clears the role (all in the same operation). An owner
 * that does not change is not a change: returns `p` as is.
 */
export function setAnnotationParent(
  p: Project,
  annotationId: string,
  ownerId: string | null,
): Project {
  const annotation = findById(p.annotations, annotationId);
  if (ownerId !== null) {
    const owner = findById(p.annotations, ownerId);
    if (!validAnnotationOwners(p, annotationId).includes(owner)) {
      fail('invalid-annotation-parent', ownerId);
    }
  } else if (typeOfAnnotation(p, annotation)?.type.requiresOwner) {
    fail('owner-required', annotationId);
  }
  if (annotation.parentAnnotationId === ownerId) return p;
  return {
    ...p,
    annotations: updateById(p.annotations, annotationId, (a) => ({
      ...a,
      parentAnnotationId: ownerId,
      parentRole: roleAfterOwnerChange(p, a.parentRole, ownerId),
    })),
  };
}

/**
 * Changes the annotation's role on the owner (`null` clears). The role must exist on the owner; with no owner,
 * only `null` is valid.
 */
export function setAnnotationRole(
  p: Project,
  annotationId: string,
  role: string | null,
): Project {
  const annotation = findById(p.annotations, annotationId);
  if (role !== null) {
    const owner =
      annotation.parentAnnotationId === null
        ? null
        : findById(p.annotations, annotation.parentAnnotationId);
    checkRole(owner && ownerRolesOf(p, owner), role, owner !== null);
  }
  if (annotation.parentRole === role) return p;
  return {
    ...p,
    annotations: updateById(p.annotations, annotationId, (a) => ({
      ...a,
      parentRole: role,
    })),
  };
}
