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

// Vínculos (anotação → anotação dona).

/** Anotações vinculadas diretamente à dona, na ordem do array. */
function directLinked(p: Project, annotationId: string): Annotation[] {
  return [...(projectIndex(p).annotationsByOwner.get(annotationId) ?? [])];
}

/** Vinculadas a `annotationId`, em qualquer profundidade (sem incluir a própria). */
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

/** Ids da anotação e de todas as vinculadas a ela, recursivamente. */
export function annotationWithLinked(p: Project, annotationId: string): Set<string> {
  const ids = new Set<string>([annotationId]);
  for (const a of getLinkedAnnotations(p, annotationId, { deep: true })) ids.add(a.id);
  return ids;
}

/**
 * Donas possíveis para a anotação: mesma marcação e sem ciclo (a anotação e suas vinculadas ficam
 * de fora). Anotação livre: só donas de outra camada. Anotação tipada: só donas cujo tipo a liste
 * em `allowedChildren`, de qualquer camada (a da própria, desde a `formatVersion` 13).
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
 * Confere um papel (v14) contra o que o dono oferece: sem dono, `role-without-owner`; papel que o
 * dono não oferece (inclusive dono sem `childRoles`), `unknown-role`.
 */
export function checkRole(
  offered: OwnerRoles | null,
  role: string,
  hasOwner: boolean,
): void {
  if (!hasOwner) fail('role-without-owner', role);
  if (!offered?.roles.some((r) => r.id === role)) fail('unknown-role', role);
}

/** Papel que sobrevive à troca de dono: o atual, se o novo dono o oferece; senão `null`. */
function roleAfterOwnerChange(p: Project, role: string | null, ownerId: string | null) {
  if (role === null || ownerId === null) return null;
  const offered = ownerRolesOf(p, findById(p.annotations, ownerId));
  return offered?.roles.some((r) => r.id === role) ? role : null;
}

/**
 * Define (ou, com `null`, remove) a dona da anotação, respeitando os invariantes. O papel atual
 * fica só se a nova dona o oferece; tirar a dona limpa o papel (tudo na mesma operação). A dona
 * que não muda não é mudança: devolve `p` como está.
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
 * Troca o papel da anotação no dono (`null` limpa). O papel precisa existir no dono; sem dono,
 * só `null` vale.
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
