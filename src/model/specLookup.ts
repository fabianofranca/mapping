import type { Spec, SpecAnnotationType, SpecField, SpecLayer } from './spec';
import type {
  Annotation,
  AnnotationTypeRef,
  Layer,
  Project,
  ProjectSpecialization,
} from './types';

// Consultas às especializações aplicadas ao projeto (conteúdo em memória).

export function getSpecialization(
  p: Project,
  specId: string,
): ProjectSpecialization | null {
  return p.specializations.find((s) => s.id === specId) ?? null;
}

/** Conteúdo da especialização aplicada; `null` se não aplicada ou arquivo ausente. */
export function getSpec(p: Project, specId: string): Spec | null {
  return getSpecialization(p, specId)?.spec ?? null;
}

export interface ResolvedType {
  readonly spec: Spec;
  readonly layer: SpecLayer;
  readonly type: SpecAnnotationType;
}

/** Tipo na especialização inteira (os ids de tipo são únicos nela). */
export function findTypeInSpec(spec: Spec, typeId: string): ResolvedType | null {
  for (const layer of spec.layers) {
    const type = layer.annotationTypes.find((t) => t.id === typeId);
    if (type) return { spec, layer, type };
  }
  return null;
}

export function findSpecType(p: Project, ref: AnnotationTypeRef): ResolvedType | null {
  const spec = getSpec(p, ref.specId);
  return spec ? findTypeInSpec(spec, ref.typeId) : null;
}

/** Tipo da anotação; `null` se ela é livre ou o tipo não existe mais. */
export function typeOfAnnotation(p: Project, a: Annotation): ResolvedType | null {
  return a.type ? findSpecType(p, a.type) : null;
}

/** Camada de origem da camada do projeto; `null` para camada livre ou spec ausente. */
export function specLayerOf(p: Project, layer: Layer): SpecLayer | null {
  if (!layer.spec) return null;
  const { layerId } = layer.spec;
  return getSpec(p, layer.spec.specId)?.layers.find((l) => l.id === layerId) ?? null;
}

/** Tipos que podem ser criados na camada do projeto (vazio para camada livre). */
export function layerAnnotationTypes(
  p: Project,
  layerId: string,
): readonly SpecAnnotationType[] {
  const layer = p.layers.find((l) => l.id === layerId);
  return (layer && specLayerOf(p, layer)?.annotationTypes) ?? [];
}

/** Camada do projeto criada a partir da camada `specLayerId` da especialização. */
export function projectLayerFor(
  p: Project,
  specId: string,
  specLayerId: string,
): Layer | null {
  return (
    p.layers.find((l) => l.spec?.specId === specId && l.spec.layerId === specLayerId) ??
    null
  );
}

export function fieldOf(type: SpecAnnotationType, key: string): SpecField | null {
  return type.fields.find((f) => f.key === key) ?? null;
}

/** `true` se as duas listas de etiquetas têm alguma em comum. */
export function sharesTag(
  a: readonly string[] | undefined,
  b: readonly string[] | undefined,
): boolean {
  return (a ?? []).some((tag) => (b ?? []).includes(tag));
}

/** `true` se `owner` pode ser dono de uma anotação do tipo `child` (`allowedChildren`). */
export function isAllowedOwner(
  p: Project,
  child: AnnotationTypeRef,
  owner: Annotation,
): boolean {
  if (owner.type?.specId !== child.specId) return false;
  const ownerType = typeOfAnnotation(p, owner)?.type;
  return (ownerType?.allowedChildren ?? []).includes(child.typeId);
}
