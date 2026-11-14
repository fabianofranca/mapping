import {
  projectIndex,
  specLayerOf,
  typeAppliesTo,
  type Project,
  type SpecAnnotationType,
} from '../model';

/** Who receives the annotation: a marking or an arrow (both keep annotations per layer). */
export type AnnotationOwnerKind = 'marking' | 'arrow';

/** The annotation's owner: its type and whether it is a floating marking (the Note). */
export interface OfferedOwner {
  readonly kind: AnnotationOwnerKind;
  readonly floating: boolean;
}

/** Why the + list ended up empty (stage #1280, decision 5). */
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
 * The annotation types that the layer offers the owner: only those that apply to it (`appliesTo`;
 * default, marking) and, for a regular marking and an arrow, without the floating ones (the Note is born from the
 * Palette). With no type, `empty` gives the reason.
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
