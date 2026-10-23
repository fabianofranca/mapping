import {
  layerAnnotationTypes,
  typeAppliesTo,
  type Project,
  type SpecAnnotationType,
} from '../model';

/** Quem recebe a anotação: uma marcação ou uma seta (os dois guardam anotações por camada). */
export type AnnotationOwnerKind = 'marking' | 'arrow';

/**
 * Os tipos de anotação que a camada oferece para a dona: só os que se aplicam a ela
 * (`appliesTo` do tipo; padrão, marcação).
 */
export function offeredTypes(
  project: Project,
  layerId: string,
  kind: AnnotationOwnerKind,
): readonly SpecAnnotationType[] {
  return layerAnnotationTypes(project, layerId).filter((type) =>
    typeAppliesTo(type, kind),
  );
}
