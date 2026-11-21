import type { AccessibilityAudit, AuditFinding } from './accessibility';
import { noticeUsage, type NoticeUsage } from './notices';
import { memoByProject, projectIndex } from './projectIndex';
import { VALUES_FIELD_PREFIX, type Change } from './proposal';
import { groupRootsByContainer } from './listing';
import type { Annotation, Arrow, Layer, Marking, Project } from './types';

// Notices of the project's annotations (stage #486, AV3) and the Notices window's rows and count (stage
// #2085: the window shows only the accessibility audit). Pure and without browser APIs; the reactive
// derivation lives in `store/derived.ts`.

/** Where the annotation is: the marking (or the arrow's source one), the path to it and the layer. */
interface Place {
  readonly annotation: Annotation;
  readonly marking: Marking;
  readonly path: readonly Marking[];
  readonly layer: Layer;
  readonly arrow?: Arrow;
  /** Position in the window's order (containers, markings depth-first, annotations). */
  readonly order: number;
}

/** Place of each annotation (by id), in Incomplete order: the canvas, then each container. */
const annotationPlaces: (p: Project) => ReadonlyMap<string, Place> = memoByProject(
  (p) => {
    const index = projectIndex(p);
    const places = new Map<string, Place>();
    const add = (
      annotation: Annotation,
      marking: Marking,
      path: readonly Marking[],
      arrow?: Arrow,
    ) => {
      const layer = index.layers.get(annotation.layerId);
      if (!layer) return;
      places.set(annotation.id, {
        annotation,
        marking,
        path,
        layer,
        arrow,
        order: places.size,
      });
    };
    const visit = (marking: Marking, parents: readonly Marking[]) => {
      const path = [...parents, marking];
      const addAll = (ownerId: string, arrow?: Arrow) => {
        for (const a of index.annotationsByMarking.get(ownerId) ?? [])
          add(a, marking, path, arrow);
      };
      addAll(marking.id);
      for (const arrow of index.arrowsByMarking.get(marking.id) ?? []) {
        if (arrow.from === marking.id) addAll(arrow.id, arrow);
      }
      for (const child of index.children.get(marking.id) ?? []) visit(child, path);
    };
    const rootsByContainer = groupRootsByContainer(index.children.get(null) ?? []);
    for (const image of [null, ...p.containers]) {
      for (const root of rootsByContainer.get(image?.id ?? null) ?? []) visit(root, []);
    }
    return places;
  },
);

/** The notices that affect each project annotation (only those that have any), in file order. */
export const noticesByAnnotation: (
  p: Project,
) => ReadonlyMap<string, readonly NoticeUsage[]> = memoByProject((p) => {
  const map = new Map<string, NoticeUsage[]>();
  for (const usage of noticeUsage(p)) {
    for (const id of usage.annotationIds) {
      const list = map.get(id);
      if (list) list.push(usage);
      else map.set(id, [usage]);
    }
  }
  return map;
});

/** The notices that affect the annotation (empty if none). */
export function annotationNotices(
  p: Project,
  annotationId: string,
): readonly NoticeUsage[] {
  return noticesByAnnotation(p).get(annotationId) ?? [];
}

/**
 * How many annotations have an accessibility warning (stage #2085: the tab and the status bar of the
 * Notices window). An annotation with several warnings counts once; one with only a pending item
 * (no `findings`) does not count.
 */
export function auditedCount(audit: AccessibilityAudit): number {
  let count = 0;
  for (const entry of audit.values()) if (entry.findings.length > 0) count += 1;
  return count;
}

/** A warning of the accessibility audit with the context to find it (a row of the Accessibility section). */
export interface AuditRow {
  readonly annotation: Annotation;
  /** The marking; for an arrow annotation, the arrow's source marking. */
  readonly marking: Marking;
  /** From the root marking down to itself (the last item is `marking`). */
  readonly path: readonly Marking[];
  readonly layer: Layer;
  readonly arrow?: Arrow;
  readonly finding: AuditFinding;
}

/**
 * The rows of the Notices window's Accessibility section, in Incomplete order (containers, markings
 * depth-first, annotations). `onlyLayers` restricts them to the visible layers; the `kind` and "Only
 * notices in use" filters of the table do not apply.
 */
export function buildAuditRows(
  p: Project,
  audit: AccessibilityAudit,
  onlyLayers?: readonly Layer[],
): AuditRow[] {
  const places = annotationPlaces(p);
  const allowed = onlyLayers && new Set(onlyLayers.map((l) => l.id));
  const rows: { readonly order: number; readonly row: AuditRow }[] = [];
  for (const [id, entry] of audit) {
    const place = places.get(id);
    if (!place || (allowed && !allowed.has(place.layer.id))) continue;
    const { annotation, marking, path, layer, arrow } = place;
    for (const finding of entry.findings) {
      rows.push({
        order: place.order,
        row: { annotation, marking, path, layer, arrow, finding },
      });
    }
  }
  return rows.sort((a, b) => a.order - b.order).map(({ row }) => row);
}

/**
 * The notices that a proposal change brings (stage #486, decision 10), read from `p`, the
 * project with the change applied (the preview): creating the annotation (empty `field`) brings
 * all those it comes to have; changing the type (`type`), those of the type; a field's value
 * (`values.<key>`), those of the field and of its columns. Removals, other entities and other
 * fields bring none.
 */
export function changeNotices(
  p: Project,
  change: Pick<Change, 'entity' | 'kind' | 'entityId'>,
  field: string,
): readonly NoticeUsage[] {
  if (change.entity !== 'annotation' || change.kind === 'remove') return [];
  const all = annotationNotices(p, change.entityId);
  if (field === '') return all;
  if (field === 'type') return all.filter((u) => u.scope === 'type');
  if (!field.startsWith(VALUES_FIELD_PREFIX)) return [];
  const key = field.slice(VALUES_FIELD_PREFIX.length);
  return all.filter((u) => u.scope !== 'type' && u.key === key);
}
