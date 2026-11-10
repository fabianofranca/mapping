import {
  projectIndex,
  specLayerOf,
  typeAppliesTo,
  type Project,
  type SpecAnnotationType,
} from '../model';

/** Quem recebe a anotação: uma marcação ou uma seta (os dois guardam anotações por camada). */
export type AnnotationOwnerKind = 'marking' | 'arrow';

/** A dona da anotação: o tipo dela e se é uma marcação flutuante (a Nota). */
export interface OfferedOwner {
  readonly kind: AnnotationOwnerKind;
  readonly floating: boolean;
}

/** Por que a lista do + ficou vazia (etapa #1280, decisão 5). */
export type OfferedTypesEmpty =
  'unavailable' | 'no-types' | 'floating' | 'not-for-arrow' | 'not-for-marking';

export interface OfferedTypeChoice {
  readonly types: readonly SpecAnnotationType[];
  readonly empty: OfferedTypesEmpty | null;
}

const isFloating = (type: SpecAnnotationType) => type.floating === true;

function emptyReason(
  all: readonly SpecAnnotationType[],
  applicable: readonly SpecAnnotationType[],
  kind: AnnotationOwnerKind,
): OfferedTypesEmpty {
  if (all.length === 0) return 'no-types';
  if (all.every(isFloating) || (applicable.length > 0 && applicable.every(isFloating))) {
    return 'floating';
  }
  return kind === 'arrow' ? 'not-for-arrow' : 'not-for-marking';
}

/**
 * Os tipos de anotação que a camada oferece à dona: só os que se aplicam a ela (`appliesTo`;
 * padrão, marcação) e, para marcação comum e seta, sem os flutuantes (a Nota nasce pela
 * Paleta). Sem tipo, `empty` diz o motivo.
 */
export function offeredTypeChoice(
  project: Project,
  layerId: string,
  owner: OfferedOwner,
): OfferedTypeChoice {
  const layer = projectIndex(project).layers.get(layerId);
  const specLayer = layer ? specLayerOf(project, layer) : null;
  if (!specLayer) return { types: [], empty: 'unavailable' };
  const all = specLayer.annotationTypes;
  const applicable = all.filter((type) => typeAppliesTo(type, owner.kind));
  const types =
    owner.floating && owner.kind === 'marking'
      ? applicable
      : applicable.filter((type) => !isFloating(type));
  if (types.length > 0) return { types, empty: null };
  return { types, empty: emptyReason(all, applicable, owner.kind) };
}
