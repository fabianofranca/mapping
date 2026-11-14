import type { AnnotationIssue } from './issues';
import { projectIndex, type ProjectIndex } from './projectIndex';
import type {
  Annotation,
  Arrow,
  Layer,
  Marking,
  Project,
  ProjectContainer,
} from './types';

/** Annotations of a marking on a layer. */
export interface LayerAnnotations {
  readonly layer: Layer;
  readonly annotations: readonly Annotation[];
}

/** Annotations grouped by marking, each list in project order. */
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
 * Annotations of the marking by layer, only in the given `layers` (the visible ones), in
 * their order. Layers with no annotation on the marking do not appear.
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

/** The markings without a parent per container (`null` = the canvas), in project order: one pass, not one per container. */
export function groupRootsByContainer(
  roots: readonly Marking[],
): Map<string | null, Marking[]> {
  const byContainer = new Map<string | null, Marking[]>();
  for (const root of roots) {
    const group = byContainer.get(root.containerId);
    if (group) group.push(root);
    else byContainer.set(root.containerId, [root]);
  }
  return byContainer;
}

export interface ListedMarking {
  /** The marking; in an arrow row (`arrow`), its source marking. */
  readonly marking: Marking;
  /** From the root marking to itself (the last item is `marking`). */
  readonly path: readonly Marking[];
  readonly sections: readonly LayerAnnotations[];
  /**
   * Row of an arrow (ME4): comes right after the source marking, with the annotations of the
   * arrow itself in `sections`.
   */
  readonly arrow?: Arrow;
}

export interface ListedImage {
  /** Container of the group; `null` = the Canvas group (canvas markings, v13). */
  readonly image: ProjectContainer | null;
  readonly markings: readonly ListedMarking[];
}

export interface ListingOptions {
  /** Includes markings (and images) without annotations in the visible layers. */
  readonly showEmpty: boolean;
  /**
   * Only the annotations with these ids ("Incomplete" filter): markings
   * with none of them are left out, and `showEmpty` is ignored.
   */
  readonly onlyAnnotations?: ReadonlySet<string>;
}

/**
 * Data for the List View: Image → Marking → Layer → Annotations.
 * The markings of each image come depth-first (the parent before the children).
 * Respects the visible layers: without `showEmpty`, only markings with an
 * annotation in them come in, and images with no such marking are left out.
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
  const rootsByContainer = groupRootsByContainer(children.get(null) ?? []);
  const result: ListedImage[] = [];

  // The Canvas group comes first (like the Tree's root), then one group per container.
  for (const image of [null, ...p.containers]) {
    const markings: ListedMarking[] = [];
    const visit = (marking: Marking, parents: readonly Marking[]) => {
      const path = [...parents, marking];
      const emit = (arrow?: Arrow) => {
        const sections = layerSections(byMarking, arrow?.id ?? marking.id, layers);
        if (showEmpty || sections.length > 0) {
          markings.push(
            arrow ? { marking, path, sections, arrow } : { marking, path, sections },
          );
        }
      };
      emit();
      // The arrows leaving the marking, right after it (the annotations belong to the arrow).
      for (const arrow of index.arrowsByMarking.get(marking.id) ?? []) {
        if (arrow.from === marking.id) emit(arrow);
      }
      for (const child of children.get(marking.id) ?? []) visit(child, path);
    };
    for (const root of rootsByContainer.get(image?.id ?? null) ?? []) visit(root, []);
    // The Canvas group with no marking at all does not appear, not even with `showEmpty`.
    if (markings.length > 0 || (showEmpty && image !== null)) {
      result.push({ image, markings });
    }
  }
  return result;
}

/** Incomplete annotation with the context to find it: where it is and why. */
export interface IncompleteItem {
  readonly annotation: Annotation;
  /** The marking; in an annotation of an arrow (`arrow`), its source marking. */
  readonly marking: Marking;
  /** From the root marking to itself (the last item is `marking`). */
  readonly path: readonly Marking[];
  readonly layer: Layer;
  readonly issues: readonly AnnotationIssue[];
  /** The annotation belongs to this arrow (ME4), not to the marking. */
  readonly arrow?: Arrow;
}

export interface IncompleteImage {
  /** Container of the group; `null` = the Canvas group (canvas markings, v13). */
  readonly image: ProjectContainer | null;
  readonly items: readonly IncompleteItem[];
}

/** Annotations with an owner's pending item (the marking, or the `arrow` leaving it), in project order. */
function collectPending(
  index: ProjectIndex,
  issues: ReadonlyMap<string, readonly AnnotationIssue[]>,
  allowed: ReadonlySet<string> | undefined,
  items: IncompleteItem[],
  marking: Marking,
  path: readonly Marking[],
  arrow?: Arrow,
): void {
  for (const annotation of index.annotationsByMarking.get(arrow?.id ?? marking.id) ??
    []) {
    const found = issues.get(annotation.id);
    const layer = layerOrOrphan(index.layers, annotation);
    if (!found || (allowed && !allowed.has(layer.id))) continue;
    items.push(
      arrow
        ? { annotation, marking, path, layer, issues: found, arrow }
        : { annotation, marking, path, layer, issues: found },
    );
  }
}

/**
 * The annotation's layer; if it does not exist (`missing-layer`), a made-up layer with the id, so the
 * pending item shows up in the list and the counter and the list agree.
 */
function layerOrOrphan(
  layers: ReadonlyMap<string, Layer>,
  annotation: Annotation,
): Layer {
  return (
    layers.get(annotation.layerId) ?? {
      id: annotation.layerId,
      name: annotation.layerId,
      color: 'currentColor',
      spec: null,
    }
  );
}

/**
 * Pending items grouped by image ("Incomplete" window): images in project order,
 * markings depth-first (the parent before the children) and, in each one, the annotations in
 * project order. With `onlyLayers`, only annotations of those layers come in (the
 * visible ones); without it, all. Images with no pending item are left out.
 */
export function buildIncompleteList(
  p: Project,
  issues: ReadonlyMap<string, readonly AnnotationIssue[]>,
  onlyLayers?: readonly Layer[],
): IncompleteImage[] {
  if (issues.size === 0) return [];
  const index = projectIndex(p);
  const allowed = onlyLayers && new Set(onlyLayers.map((l) => l.id));
  const rootsByContainer = groupRootsByContainer(index.children.get(null) ?? []);
  const result: IncompleteImage[] = [];

  for (const image of [null, ...p.containers]) {
    const items: IncompleteItem[] = [];
    const visit = (marking: Marking, parents: readonly Marking[]) => {
      const path = [...parents, marking];
      collectPending(index, issues, allowed, items, marking, path);
      for (const arrow of index.arrowsByMarking.get(marking.id) ?? []) {
        if (arrow.from !== marking.id) continue;
        collectPending(index, issues, allowed, items, marking, path, arrow);
      }
      for (const child of index.children.get(marking.id) ?? []) visit(child, path);
    };
    for (const root of rootsByContainer.get(image?.id ?? null) ?? []) visit(root, []);
    if (items.length > 0) result.push({ image, items });
  }
  return result;
}
