import type { AnnotationIssue } from './issues';
import { projectIndex } from './projectIndex';
import type { Annotation, Layer, Marking, Project, ProjectContainer } from './types';

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
  readonly image: ProjectContainer;
  readonly markings: readonly ListedMarking[];
}

export interface ListingOptions {
  /** Inclui marcações (e imagens) sem anotação nas camadas visíveis. */
  readonly showEmpty: boolean;
  /**
   * Só as anotações com estes ids (filtro "Incompletas"): as marcações
   * sem nenhuma delas ficam de fora, e `showEmpty` é ignorado.
   */
  readonly onlyAnnotations?: ReadonlySet<string>;
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
  const index = projectIndex(p);
  const children = index.children;
  const only = options.onlyAnnotations;
  const byMarking = only
    ? annotationsByMarking({
        ...p,
        annotations: p.annotations.filter((a) => only.has(a.id)),
      })
    : index.annotationsByMarking;
  const showEmpty = options.showEmpty && !only;
  const roots = children.get(null) ?? [];
  const result: ListedImage[] = [];

  for (const image of p.containers) {
    const markings: ListedMarking[] = [];
    const visit = (marking: Marking, parents: readonly Marking[]) => {
      const path = [...parents, marking];
      const sections = layerSections(byMarking, marking.id, layers);
      if (showEmpty || sections.length > 0) {
        markings.push({ marking, path, sections });
      }
      for (const child of children.get(marking.id) ?? []) visit(child, path);
    };
    for (const root of roots) if (root.containerId === image.id) visit(root, []);
    if (showEmpty || markings.length > 0) result.push({ image, markings });
  }
  return result;
}

/** Anotação incompleta com o contexto para achá-la: onde está e por quê. */
export interface IncompleteItem {
  readonly annotation: Annotation;
  readonly marking: Marking;
  /** Da marcação raiz até ela mesma (o último item é `marking`). */
  readonly path: readonly Marking[];
  readonly layer: Layer;
  readonly issues: readonly AnnotationIssue[];
}

export interface IncompleteImage {
  readonly image: ProjectContainer;
  readonly items: readonly IncompleteItem[];
}

/**
 * Pendências agrupadas por imagem (janela "Incompletas"): imagens na ordem do projeto,
 * marcações em profundidade (o pai antes das filhas) e, em cada uma, as anotações na
 * ordem do projeto. Com `onlyLayers`, só entram anotações dessas camadas (as
 * visíveis); sem ele, todas. Imagens sem pendência ficam de fora.
 */
export function buildIncompleteList(
  p: Project,
  issues: ReadonlyMap<string, readonly AnnotationIssue[]>,
  onlyLayers?: readonly Layer[],
): IncompleteImage[] {
  if (issues.size === 0) return [];
  const index = projectIndex(p);
  const allowed = onlyLayers && new Set(onlyLayers.map((l) => l.id));
  const result: IncompleteImage[] = [];

  for (const image of p.containers) {
    const items: IncompleteItem[] = [];
    const visit = (marking: Marking, parents: readonly Marking[]) => {
      const path = [...parents, marking];
      for (const annotation of index.annotationsByMarking.get(marking.id) ?? []) {
        const found = issues.get(annotation.id);
        const layer = index.layers.get(annotation.layerId);
        if (!found || !layer || (allowed && !allowed.has(layer.id))) continue;
        items.push({ annotation, marking, path, layer, issues: found });
      }
      for (const child of index.children.get(marking.id) ?? []) visit(child, path);
    };
    for (const root of index.children.get(null) ?? []) {
      if (root.containerId === image.id) visit(root, []);
    }
    if (items.length > 0) result.push({ image, items });
  }
  return result;
}
