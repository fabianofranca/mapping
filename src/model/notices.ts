import { memoByProject, projectIndex, typeKey } from './projectIndex';
import { tableRows } from './refs';
import {
  SPEC_NOTICE_KINDS,
  type SpecAnnotationType,
  type SpecNotice,
  type SpecNoticeKind,
} from './spec';
import { isEmptyValue } from './typed';
import type { Annotation, Project } from './types';

// Specialization notices (`formatVersion` 10, stage #486): `removed`, `deprecated`,
// `diverges` and `pending` on a type, field or `table` column. They only inform: they do not
// generate a pending item (`issues.ts`). Fixed severity: removed > deprecated = diverges > pending.
// Pure and with no browser APIs (reused by the MCP server).

/** Notice kinds in display order (from highest to lowest severity; tie: deprecated first). */
export const NOTICE_KINDS: readonly SpecNoticeKind[] = SPEC_NOTICE_KINDS;

/** Position of the notice kind in the display order. */
function displayOrder(kind: SpecNoticeKind): number {
  return NOTICE_KINDS.indexOf(kind);
}

/** Notice comparator: display order of the kinds (tie: file order, since the sort is stable). */
export function compareNotices(a: SpecNotice, b: SpecNotice): number {
  return displayOrder(a.kind) - displayOrder(b.kind);
}

/** Notices in display order; within the same kind, file order. Does not change the list. */
export function sortNotices(notices: readonly SpecNotice[]): SpecNotice[] {
  return [...notices].sort(compareNotices);
}

/** The type's notices, then the fields' and then the columns', in file order. */
export function typeNotices(type: SpecAnnotationType): SpecNotice[] {
  return placedTypeNotices(type).map((p) => p.notice);
}

/**
 * The highest-severity notice of the type, counting the type's own and those of the fields and
 * columns; `null` if there is none. Tie (including `deprecated` and `diverges`): the one that
 * comes first in the display order and, within the same notice kind, the first in the file
 * (type, fields, columns).
 */
export function highestNotice(type: SpecAnnotationType): SpecNotice | null {
  return sortNotices(typeNotices(type))[0] ?? null;
}

export type NoticeScope = 'type' | 'field' | 'column';

/** A specialization notice and the project annotations it affects. */
export interface NoticeUsage {
  readonly specId: string;
  readonly layerId: string;
  readonly typeId: string;
  readonly scope: NoticeScope;
  /** Key of the field (scope `field`) or of the table (scope `column`). */
  readonly key?: string;
  /** Key of the column (scope `column`). */
  readonly column?: string;
  readonly notice: SpecNotice;
  /** Ids of the affected annotations, in project order; empty if none uses the notice. */
  readonly annotationIds: readonly string[];
}

/** Typed annotations of each type, by `typeKey`, in project order. */
function annotationsByType(p: Project): Map<string, Annotation[]> {
  const map = new Map<string, Annotation[]>();
  for (const a of p.annotations) {
    if (!a.type || !a.values) continue;
    const key = typeKey(a.type.specId, a.type.typeId);
    const list = map.get(key);
    if (list) list.push(a);
    else map.set(key, [a]);
  }
  return map;
}

function hasValue(a: Annotation, key: string): boolean {
  return !isEmptyValue(a.values?.[key]);
}

function hasColumnValue(a: Annotation, key: string, column: string): boolean {
  return tableRows(a.values?.[key]).some((row) => !isEmptyValue(row[column]));
}

function ids(list: readonly Annotation[], keep: (a: Annotation) => boolean): string[] {
  return list.filter(keep).map((a) => a.id);
}

interface TypeContext {
  readonly specId: string;
  readonly layerId: string;
  readonly type: SpecAnnotationType;
  readonly annotations: readonly Annotation[];
}

/** A notice of the type with where it sits: the type, a field (`key`) or a `table` column. */
export interface PlacedNotice {
  readonly scope: NoticeScope;
  /** Key of the field (scope `field`) or of the table (scope `column`). */
  readonly key?: string;
  /** Key of the column (scope `column`). */
  readonly column?: string;
  readonly notice: SpecNotice;
}

/**
 * Each notice of the type with its place, in the order of `typeNotices`: the type's, then the
 * fields' and then the columns' (within each group, file order).
 */
export function placedTypeNotices(type: SpecAnnotationType): PlacedNotice[] {
  const own = (type.notices ?? []).map((notice): PlacedNotice => ({
    scope: 'type',
    notice,
  }));
  const fields: PlacedNotice[] = [];
  const columns: PlacedNotice[] = [];
  for (const field of type.fields) {
    for (const notice of field.notices ?? [])
      fields.push({ scope: 'field', key: field.key, notice });
    if (field.type !== 'table') continue;
    for (const column of field.columns)
      for (const notice of column.notices ?? [])
        columns.push({ scope: 'column', key: field.key, column: column.key, notice });
  }
  return [...own, ...fields, ...columns];
}

/** Ids of the annotations the notice affects, by scope (see `noticeUsage`). */
function affected(placed: PlacedNotice, annotations: readonly Annotation[]): string[] {
  const { scope, key, column } = placed;
  if (scope === 'type') return ids(annotations, () => true);
  if (scope === 'field') return ids(annotations, (a) => hasValue(a, key ?? ''));
  return ids(annotations, (a) => hasColumnValue(a, key ?? '', column ?? ''));
}

function typeUsages(ctx: TypeContext): NoticeUsage[] {
  const { specId, layerId, type, annotations } = ctx;
  return placedTypeNotices(type).map((placed): NoticeUsage => ({
    specId,
    layerId,
    typeId: type.id,
    ...placed,
    annotationIds: affected(placed, annotations),
  }));
}

/**
 * Each notice of the specializations loaded in the project, with the annotations it affects, in
 * file order (specialization, layer, type; within each type: notices of the type, of the fields
 * and of the columns). A type notice affects every annotation of the type; a field notice, the
 * annotation with a non-empty value in it; a column notice, the annotation with a non-empty
 * value in it in some row of the table. Free annotations and those of another type are left
 * out. Notices that no annotation uses come with an empty list (whoever displays filters).
 * Memoized by project version.
 */
export const noticeUsage: (p: Project) => readonly NoticeUsage[] = memoByProject((p) => {
  const byType = annotationsByType(p);
  const out: NoticeUsage[] = [];
  for (const { id: specId, spec } of projectIndex(p).specializations.values()) {
    if (!spec) continue;
    for (const layer of spec.layers) {
      for (const type of layer.annotationTypes) {
        const annotations = byType.get(typeKey(specId, type.id)) ?? [];
        out.push(...typeUsages({ specId, layerId: layer.id, type, annotations }));
      }
    }
  }
  return out;
});
