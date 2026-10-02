import { fail } from './errors';
import { ancestorsOf } from './hierarchy';
import { findById, updateById } from './project';
import { projectIndex } from './projectIndex';
import { isAllowedOwner, typeOfAnnotation } from './specLookup';
import type { Annotation, Project } from './types';

// Herança (marcação → descendentes) e vínculos (anotação → anotação dona).
// A herança nunca é materializada no JSON: é sempre calculada aqui.

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
 * Anotações herdadas pela marcação: as `inherit: true` de todos os ancestrais
 * (seguindo `parentId`), da raiz até o pai; dentro de cada ancestral, na ordem do array.
 */
export function getInheritedAnnotations(p: Project, markingId: string): Annotation[] {
  findById(p.markings, markingId);
  const ancestors = ancestorsOf(p, markingId).reverse();
  const byMarking = projectIndex(p).annotationsByMarking;
  return ancestors.flatMap((ancestor) =>
    (byMarking.get(ancestor.id) ?? []).filter((a) => a.inherit),
  );
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

export function setAnnotationInherit(
  p: Project,
  annotationId: string,
  inherit: boolean,
): Project {
  return {
    ...p,
    annotations: updateById(p.annotations, annotationId, (a) => ({ ...a, inherit })),
  };
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
