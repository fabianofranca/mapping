import { childrenIndex } from './hierarchy';
import type { Annotation, Layer, Marking, Project, ProjectImage } from './types';

/** Anotações de uma marcação numa camada. */
export interface LayerAnnotations {
  readonly layer: Layer;
  readonly annotations: readonly Annotation[];
}

/** Anotações agrupadas por marcação, cada lista na ordem do projeto. */
export function annotationsByMarking(p: Project): Map<string, Annotation[]> {
  const index = new Map<string, Annotation[]>();
  for (const a of p.annotations) {
    const list = index.get(a.markingId);
    if (list) list.push(a);
    else index.set(a.markingId, [a]);
  }
  return index;
}

/**
 * Anotações da marcação por camada, só nas `layers` dadas (as visíveis), na
 * ordem delas. Camadas sem anotação na marcação não aparecem.
 */
export function layerSections(
  byMarking: ReadonlyMap<string, readonly Annotation[]>,
  markingId: string,
  layers: readonly Layer[],
): LayerAnnotations[] {
  const all = byMarking.get(markingId);
  if (!all) return [];
  const sections: LayerAnnotations[] = [];
  for (const layer of layers) {
    const annotations = all.filter((a) => a.layerId === layer.id);
    if (annotations.length > 0) sections.push({ layer, annotations });
  }
  return sections;
}

export interface ListedMarking {
  readonly marking: Marking;
  /** Da marcação raiz até ela mesma (o último item é `marking`). */
  readonly path: readonly Marking[];
  readonly sections: readonly LayerAnnotations[];
}

export interface ListedImage {
  readonly image: ProjectImage;
  readonly markings: readonly ListedMarking[];
}

export interface ListingOptions {
  /** Inclui marcações (e imagens) sem anotação nas camadas visíveis. */
  readonly showEmpty: boolean;
}

/**
 * Dados da Visão de Lista: Imagem → Marcação → Camada → Anotações.
 * As marcações de cada imagem vêm em profundidade (o pai antes das filhas).
 * Respeita as camadas visíveis: sem `showEmpty`, só entram marcações com
 * anotação nelas, e imagens sem nenhuma marcação assim ficam de fora.
 */
export function buildListing(
  p: Project,
  layers: readonly Layer[],
  options: ListingOptions,
): ListedImage[] {
  const children = childrenIndex(p.markings);
  const byMarking = annotationsByMarking(p);
  const roots = children.get(null) ?? [];
  const result: ListedImage[] = [];

  for (const image of p.images) {
    const markings: ListedMarking[] = [];
    const visit = (marking: Marking, parents: readonly Marking[]) => {
      const path = [...parents, marking];
      const sections = layerSections(byMarking, marking.id, layers);
      if (options.showEmpty || sections.length > 0) {
        markings.push({ marking, path, sections });
      }
      for (const child of children.get(marking.id) ?? []) visit(child, path);
    };
    for (const root of roots) if (root.imageId === image.id) visit(root, []);
    if (options.showEmpty || markings.length > 0) result.push({ image, markings });
  }
  return result;
}
