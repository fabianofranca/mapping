import { layerAnnotationTypes, type Project, type SpecAnnotationType } from '../model';

/** Quem recebe a anotação: uma marcação ou uma seta (os dois guardam anotações por camada). */
export type AnnotationOwnerKind = 'marking' | 'arrow';

/**
 * Os tipos de anotação que a camada oferece para a dona. Ponto único da escolha: hoje todos os
 * tipos valem para as duas.
 */
export function offeredTypes(
  project: Project,
  layerId: string,
  kind: AnnotationOwnerKind,
): readonly SpecAnnotationType[] {
  // ME4: filtrar por typeAppliesTo(type, kind) quando o `appliesTo` da especialização chegar.
  void kind;
  return layerAnnotationTypes(project, layerId);
}
