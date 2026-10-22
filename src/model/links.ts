import { fail } from './errors';
import { findById, updateById } from './project';
import { projectIndex } from './projectIndex';
import { isAllowedOwner, typeOfAnnotation } from './specLookup';
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
 * Donas possíveis para a anotação: mesma marcação, outra camada e sem ciclo
 * (a anotação e suas vinculadas ficam de fora). Anotação tipada: só donas cujo
 * tipo a liste em `allowedChildren`.
 */
export function validAnnotationOwners(p: Project, annotationId: string): Annotation[] {
  const annotation = findById(p.annotations, annotationId);
  const descendants = annotationWithLinked(p, annotationId);
  const type = annotation.type;
  return (projectIndex(p).annotationsByMarking.get(annotation.markingId) ?? []).filter(
    (a) =>
      a.layerId !== annotation.layerId &&
      !descendants.has(a.id) &&
      (type === null || isAllowedOwner(p, type, a)),
  );
}

/** Define (ou, com `null`, remove) a dona da anotação, respeitando os invariantes. */
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
  return {
    ...p,
    annotations: updateById(p.annotations, annotationId, (a) => ({
      ...a,
      parentAnnotationId: ownerId,
    })),
  };
}
