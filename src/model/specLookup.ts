import { projectIndex, typeKey } from './projectIndex';
import { isChildTypeAllowed } from './specChildren';
import type {
  Spec,
  SpecAnnotationType,
  SpecChildRole,
  SpecField,
  SpecLayer,
} from './spec';
import type {
  Annotation,
  AnnotationTypeRef,
  Layer,
  Project,
  ProjectSpecialization,
} from './types';

// Queries on the specializations applied to the project (in-memory content).

// The resolver of a type's children (`allowedChildren` with ids and clauses) lives in
// `specChildren.ts`, with no dependency on the project index, because the `spec.ts` validator uses it.
export {
  childTypeIds,
  isChildTypeAllowed,
  ownerTypeIds,
  type ChildSets,
} from './specChildren';

export function getSpecialization(
  p: Project,
  specId: string,
): ProjectSpecialization | null {
  return projectIndex(p).specializations.get(specId) ?? null;
}

/** Content of the applied specialization; `null` if not applied or the file is missing. */
export function getSpec(p: Project, specId: string): Spec | null {
  return getSpecialization(p, specId)?.spec ?? null;
}

export interface ResolvedType {
  readonly spec: Spec;
  readonly layer: SpecLayer;
  readonly type: SpecAnnotationType;
}

/** Type in the whole specialization (type ids are unique in it). */
export function findTypeInSpec(spec: Spec, typeId: string): ResolvedType | null {
  for (const layer of spec.layers) {
    const type = layer.annotationTypes.find((t) => t.id === typeId);
    if (type) return { spec, layer, type };
  }
  return null;
}

export function findSpecType(p: Project, ref: AnnotationTypeRef): ResolvedType | null {
  return projectIndex(p).types.get(typeKey(ref.specId, ref.typeId)) ?? null;
}

/** Type of the annotation; `null` if it is free or the type no longer exists. */
export function typeOfAnnotation(p: Project, a: Annotation): ResolvedType | null {
  return a.type ? findSpecType(p, a.type) : null;
}

/** Source layer of the project layer; `null` for a free layer or a missing spec. */
export function specLayerOf(p: Project, layer: Layer): SpecLayer | null {
  if (!layer.spec) return null;
  const { specId, layerId } = layer.spec;
  return projectIndex(p).specLayers.get(typeKey(specId, layerId)) ?? null;
}

/** Types that can be created in the project layer (empty for a free layer). */
export function layerAnnotationTypes(
  p: Project,
  layerId: string,
): readonly SpecAnnotationType[] {
  const layer = projectIndex(p).layers.get(layerId);
  return (layer && specLayerOf(p, layer)?.annotationTypes) ?? [];
}

/** Project layer created from the specialization's layer `specLayerId`. */
export function projectLayerFor(
  p: Project,
  specId: string,
  specLayerId: string,
): Layer | null {
  return projectIndex(p).layersBySpecLayer.get(typeKey(specId, specLayerId)) ?? null;
}

export function fieldOf(type: SpecAnnotationType, key: string): SpecField | null {
  return type.fields.find((f) => f.key === key) ?? null;
}

/** `true` if the two tag lists have any tag in common. */
export function sharesTag(
  a: readonly string[] | undefined,
  b: readonly string[] | undefined,
): boolean {
  return (a ?? []).some((tag) => (b ?? []).includes(tag));
}

/** `true` if `owner` can own an annotation of type `child` (`allowedChildren`). */
export function isAllowedOwner(
  p: Project,
  child: AnnotationTypeRef,
  owner: Annotation,
): boolean {
  if (owner.type?.specId !== child.specId) return false;
  const resolved = typeOfAnnotation(p, owner);
  return (
    resolved !== null && isChildTypeAllowed(resolved.spec, resolved.type.id, child.typeId)
  );
}

/** Roles that the owner's type offers and their label (v11, `childRoles`); `null` = owner without roles. */
export interface OwnerRoles {
  readonly label: string | null;
  readonly roles: readonly SpecChildRole[];
}

/**
 * The roles that the type of `owner` offers to the children. `null` when the owner is free, of an
 * unknown type or its type does not declare `childRoles`.
 */
export function ownerRolesOf(p: Project, owner: Annotation): OwnerRoles | null {
  const type = typeOfAnnotation(p, owner)?.type;
  const roles = type?.childRoles;
  if (!type || !roles || roles.length === 0) return null;
  return { label: type.childRolesLabel ?? null, roles };
}

/**
 * Name of the role `roleId` among those the type of `owner` offers (v11, `childRoles`); the
 * id itself when the owner does not offer it, has no roles or does not exist (a role the
 * specialization stopped declaring does not vanish from the text).
 */
export function roleNameOf(
  p: Project,
  owner: Annotation | undefined,
  roleId: string,
): string {
  const offered = owner ? ownerRolesOf(p, owner) : null;
  return offered?.roles.find((r) => r.id === roleId)?.name ?? roleId;
}

/**
 * The name of the role in which `a` links to the owner ("Click"), by the owner's type; the raw id if
 * the owner does not offer it; `null` without a role.
 */
export function roleLabelOf(p: Project, a: Annotation): string | null {
  if (a.parentRole === null) return null;
  const owner =
    a.parentAnnotationId === null
      ? undefined
      : projectIndex(p).annotations.get(a.parentAnnotationId);
  return roleNameOf(p, owner, a.parentRole);
}
