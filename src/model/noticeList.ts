import { noticeUsage, NOTICE_KINDS, type NoticeUsage } from './notices';
import { memoByProject, projectIndex } from './projectIndex';
import { VALUES_FIELD_PREFIX, type Change } from './proposal';
import { tableRows } from './refs';
import type { SpecNoticeKind } from './spec';
import { groupRootsByContainer } from './listing';
import { isEmptyValue } from './typed';
import type { Annotation, Arrow, JsonValue, Layer, Marking, Project } from './types';

// List of the Notices window (stage #486, AV3): each specialization notice with the project
// annotations it affects, and the counts of the tab and the status bar. Pure and without
// browser APIs; the reactive derivation lives in `store/derived.ts`.

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

/** An annotation affected by a notice, with the context to find it and the value in the field. */
export interface NoticeRow {
  readonly annotation: Annotation;
  /** The marking; for an arrow annotation, the arrow's source marking. */
  readonly marking: Marking;
  /** From the root marking down to itself (the last item is `marking`). */
  readonly path: readonly Marking[];
  readonly layer: Layer;
  readonly arrow?: Arrow;
  /**
   * The annotation value the notice applies to: the field's (field notice); the non-empty cells
   * of the column (column notice); `undefined` for a type notice.
   */
  readonly value: JsonValue | undefined;
}

/** A notice (window group) with the annotations it affects. */
export interface NoticeGroup {
  readonly usage: NoticeUsage;
  /** How many annotations the notice affects (the rows that pass the filters). */
  readonly count: number;
  readonly rows: readonly NoticeRow[];
}

export interface NoticeFilters {
  /** Only notices of this kind; without it, all. */
  readonly kind?: SpecNoticeKind | null;
  /** Only notices with an affected annotation (default `true`); `false` includes those no annotation uses. */
  readonly inUseOnly?: boolean;
  /** Only the annotations of these layers (the visible ones); without it, all. */
  readonly onlyLayers?: readonly Layer[];
}

function usageValue(usage: NoticeUsage, a: Annotation): JsonValue | undefined {
  if (usage.scope === 'field') return a.values?.[usage.key ?? ''];
  if (usage.scope !== 'column') return undefined;
  const cells = tableRows(a.values?.[usage.key ?? ''])
    .map((row) => row[usage.column ?? ''])
    .filter((cell): cell is JsonValue => cell !== undefined && !isEmptyValue(cell));
  return cells;
}

/** Places of the annotations the notice affects (and that pass the layer filter), in window order. */
function placesOf(
  usage: NoticeUsage,
  places: ReadonlyMap<string, Place>,
  allowed?: Set<string>,
): Place[] {
  const found: Place[] = [];
  for (const id of usage.annotationIds) {
    const place = places.get(id);
    if (!place || (allowed && !allowed.has(place.layer.id))) continue;
    found.push(place);
  }
  return found.sort((a, b) => a.order - b.order);
}

function rowsOf(
  usage: NoticeUsage,
  places: ReadonlyMap<string, Place>,
  allowed?: Set<string>,
): NoticeRow[] {
  return placesOf(usage, places, allowed).map(
    ({ annotation, marking, path, layer, arrow }) => ({
      annotation,
      marking,
      path,
      layer,
      arrow,
      value: usageValue(usage, annotation),
    }),
  );
}

/** Prefers severity; within the `kind`, file order (the sort is stable). */
function byKind(a: NoticeUsage, b: NoticeUsage): number {
  return NOTICE_KINDS.indexOf(a.notice.kind) - NOTICE_KINDS.indexOf(b.notice.kind);
}

/**
 * The groups of the Notices window: one per notice, from most to least severe (`removed`,
 * `deprecated`, `diverges`, `pending`) and, within the same `kind`, in the order of
 * specializations, layers and types. The rows follow Incomplete order (containers, markings
 * depth-first).
 */
export function buildNoticeList(p: Project, filters: NoticeFilters): NoticeGroup[] {
  const { kind = null, inUseOnly = true, onlyLayers } = filters;
  const places = annotationPlaces(p);
  const allowed = onlyLayers && new Set(onlyLayers.map((l) => l.id));
  const groups: NoticeGroup[] = [];
  for (const usage of [...noticeUsage(p)].sort(byKind)) {
    if (kind && usage.notice.kind !== kind) continue;
    const rows = rowsOf(usage, places, allowed);
    if (inUseOnly && rows.length === 0) continue;
    groups.push({ usage, count: rows.length, rows });
  }
  return groups;
}

export interface NoticeCounts {
  /** What the numbers count: annotations with a notice, or listed notices (`inUseOnly` unchecked). */
  readonly unit: 'annotations' | 'notices';
  /** Total of `unit` (does not depend on the `kind` filter). */
  readonly total: number;
  /** The same, for each `kind`. */
  readonly byKind: Readonly<Record<SpecNoticeKind, number>>;
  /** The `kind`s that have a notice in the specialization (with an annotation or not, per `inUseOnly`). */
  readonly present: readonly SpecNoticeKind[];
}

/**
 * Counts by `kind` and in total, with the same filters as `buildNoticeList` (the `kind` does not
 * count: the `Segmented` buttons show all of them). With `inUseOnly` checked, annotations with a
 * notice are counted; unchecked, the list brings one group per notice (even without an
 * annotation), and the button counts those groups.
 */
export function noticeCounts(p: Project, filters: NoticeFilters): NoticeCounts {
  const inUseOnly = filters.inUseOnly ?? true;
  const tally = tallyNotices(p, filters);
  const count = (k: SpecNoticeKind) =>
    (inUseOnly ? tally.annotationsByKind.get(k)?.size : tally.groupsByKind.get(k)) ?? 0;
  return {
    unit: inUseOnly ? 'annotations' : 'notices',
    total: inUseOnly ? tally.annotations.size : tally.groups,
    byKind: {
      removed: count('removed'),
      deprecated: count('deprecated'),
      diverges: count('diverges'),
      pending: count('pending'),
    },
    present: NOTICE_KINDS.filter((k) => tally.annotationsByKind.has(k)),
  };
}

interface Tally {
  readonly annotations: Set<string>;
  readonly annotationsByKind: Map<SpecNoticeKind, Set<string>>;
  readonly groupsByKind: Map<SpecNoticeKind, number>;
  groups: number;
}

/** The annotations and groups (listed notices) that pass the filters, in total and by `kind`. */
function tallyNotices(p: Project, filters: NoticeFilters): Tally {
  const { inUseOnly = true, onlyLayers } = filters;
  const places = annotationPlaces(p);
  const allowed = onlyLayers && new Set(onlyLayers.map((l) => l.id));
  const tally: Tally = {
    annotations: new Set(),
    annotationsByKind: new Map(),
    groupsByKind: new Map(),
    groups: 0,
  };
  for (const usage of noticeUsage(p)) {
    const found = placesOf(usage, places, allowed);
    if (inUseOnly && found.length === 0) continue;
    const kind = usage.notice.kind;
    const set = tally.annotationsByKind.get(kind) ?? new Set<string>();
    for (const place of found) {
      set.add(place.annotation.id);
      tally.annotations.add(place.annotation.id);
    }
    tally.annotationsByKind.set(kind, set);
    tally.groupsByKind.set(kind, (tally.groupsByKind.get(kind) ?? 0) + 1);
    tally.groups += 1;
  }
  return tally;
}

/** How many project annotations have some notice (window tab and status bar). */
export function noticedCount(p: Project): number {
  return noticesByAnnotation(p).size;
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
