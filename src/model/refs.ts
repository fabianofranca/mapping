import { fail, ModelError } from './errors';
import { isRecord } from './isRecord';
import { memoByProject, projectIndex } from './projectIndex';
import type {
  Spec,
  SpecAnnotationType,
  SpecField,
  SpecRefAccepts,
  SpecRefColumn,
} from './spec';
import { resolveTypeItems } from './specChildren';
import { fieldOf, getSpec, sharesTag, typeOfAnnotation } from './specLookup';
import type {
  Annotation,
  Entry,
  FieldRef,
  JsonValue,
  Project,
  RefValue,
  RowRef,
  TableRow,
} from './types';

// Strong references (`ref`) between annotations. See docs/FORMAT.md, "Referências (`ref`)".

/** Texts used in the labels; the interface passes the translated ones. */
export interface LabelTexts {
  /** Label of a free annotation with no name. */
  readonly untitled: string;
  /** Label of a reference whose target no longer exists. */
  readonly broken: string;
}

export const DEFAULT_LABEL_TEXTS: LabelTexts = {
  untitled: 'Anotação',
  broken: '(referência quebrada)',
};

/** Valid rows (objects with a text `_id`) of a `table` value. */
export function tableRows(value: JsonValue | undefined): TableRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is TableRow => isRecord(row) && typeof row._id === 'string',
  );
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

/** Keys besides `annotationId` of each `ref` shape (the keys sorted and joined). */
const REF_SHAPES: ReadonlyMap<string, readonly ('entryId' | 'key' | 'rowId')[]> = new Map(
  [
    ['annotationId', []],
    ['annotationId,entryId', ['entryId']],
    ['annotationId,key', ['key']],
    ['annotationId,key,rowId', ['key', 'rowId']],
  ],
);

/** Interprets a value as a reference; `null` if it does not have one of the four shapes. */
export function parseRefValue(value: JsonValue | undefined): RefValue | null {
  if (!isRecord(value) || !nonEmptyString(value.annotationId)) return null;
  const extra = REF_SHAPES.get(Object.keys(value).sort().join(','));
  if (!extra) return null;
  const parsed: { [key: string]: string } = { annotationId: value.annotationId };
  for (const name of extra) {
    const part = value[name];
    if (!nonEmptyString(part)) return null;
    parsed[name] = part;
  }
  return parsed as unknown as RefValue;
}

export type ResolvedRef =
  | { readonly kind: 'annotation'; readonly annotation: Annotation }
  | { readonly kind: 'entry'; readonly annotation: Annotation; readonly entry: Entry }
  | {
      readonly kind: 'row';
      readonly annotation: Annotation;
      readonly key: string;
      readonly row: TableRow;
      readonly index: number;
      /** `table` field in the type; `null` if the type no longer exists. */
      readonly field: SpecField | null;
    }
  | {
      readonly kind: 'field';
      readonly annotation: Annotation;
      readonly key: string;
      readonly field: SpecField | null;
    };

/**
 * Finds the reference's target; `null` = broken reference. The resolution follows
 * the data (does the target exist?); whether the target is still accepted is another question
 * (`isRefAccepted`).
 */
export function resolveRef(p: Project, ref: RefValue): ResolvedRef | null {
  const index = projectIndex(p);
  const annotation = index.annotations.get(ref.annotationId);
  if (!annotation) return null;
  if ('entryId' in ref) {
    const entry = index.entries.get(annotation.id)?.get(ref.entryId);
    return entry && annotation.type === null
      ? { kind: 'entry', annotation, entry }
      : null;
  }
  if (!('key' in ref)) return { kind: 'annotation', annotation };
  return resolveValueRef(p, annotation, ref);
}

/** Row or field target (`key`, with or without `rowId`) in an annotation with values. */
function resolveValueRef(
  p: Project,
  annotation: Annotation,
  ref: RowRef | FieldRef,
): ResolvedRef | null {
  if (!annotation.values) return null;
  const type = typeOfAnnotation(p, annotation)?.type ?? null;
  const field = type ? fieldOf(type, ref.key) : null;
  if (type && !field) return null;
  if ('rowId' in ref) {
    if (field && field.type !== 'table') return null;
    const rows = tableRows(annotation.values[ref.key]);
    const index = rows.findIndex((r) => r._id === ref.rowId);
    const row = rows[index];
    return row ? { kind: 'row', annotation, key: ref.key, row, index, field } : null;
  }
  if (!field && !Object.hasOwn(annotation.values, ref.key)) return null;
  return { kind: 'field', annotation, key: ref.key, field };
}

/**
 * Text that represents the target to be written in a text field (`linkedRef`): the name of the
 * declaration, not the "Owner.Field" label of `refLabel`. Simple field: the value (non-empty
 * text; number and date become text); `table` row: the value of the `rowLabel` column; free
 * entry: the `key`. `null` if the target does not resolve or has no text.
 */
export function refTargetText(p: Project, ref: RefValue): string | null {
  const target = resolveRef(p, ref);
  if (!target) return null;
  const text = (value: JsonValue | undefined): string | null =>
    nonEmptyString(value) ? value : typeof value === 'number' ? String(value) : null;
  switch (target.kind) {
    case 'annotation':
      return target.annotation.type
        ? annotationRefLabel(p, target.annotation)
        : instanceLabel(p, target.annotation);
    case 'entry':
      return nonEmptyString(target.entry.key) ? target.entry.key : null;
    case 'row': {
      const rowLabel = target.field?.type === 'table' ? target.field.rowLabel : undefined;
      return rowLabel ? text(target.row[rowLabel]) : null;
    }
    case 'field':
      return text(target.annotation.values?.[target.key]);
  }
}

/** Label of the instance: `name`; if empty, the value of the type's `labelField`. */
export function instanceLabel(p: Project, a: Annotation): string | null {
  if (a.name) return a.name;
  const labelField = typeOfAnnotation(p, a)?.type.labelField;
  const value = labelField ? a.values?.[labelField] : null;
  return nonEmptyString(value) ? value : null;
}

/**
 * Label of the annotation in the references' text: `name`; otherwise the `labelField`;
 * otherwise the type name; on a free annotation with no name, `texts.untitled`.
 */
export function annotationRefLabel(
  p: Project,
  a: Annotation,
  texts: LabelTexts = DEFAULT_LABEL_TEXTS,
): string {
  return instanceLabel(p, a) ?? typeOfAnnotation(p, a)?.type.name ?? texts.untitled;
}

/** Text of the target, e.g.: `User.name`, `Contato.email`, `Contato.nome`. */
export function refLabel(
  p: Project,
  ref: RefValue,
  texts: LabelTexts = DEFAULT_LABEL_TEXTS,
): string {
  const target = resolveRef(p, ref);
  if (!target) return texts.broken;
  const owner = annotationRefLabel(p, target.annotation, texts);
  switch (target.kind) {
    case 'annotation':
      return owner;
    case 'entry':
      return `${owner}.${target.entry.key}`;
    case 'row': {
      const rowLabel = target.field?.type === 'table' ? target.field.rowLabel : undefined;
      const value = rowLabel ? target.row[rowLabel] : null;
      // Row with no label: position (1, 2…) in the table.
      return `${owner}.${nonEmptyString(value) ? value : `#${target.index + 1}`}`;
    }
    case 'field':
      return `${owner}.${target.field?.label ?? target.key}`;
  }
}

const SIMPLE_TYPES: ReadonlySet<string> = new Set(['string', 'number', 'date', 'enum']);

/** The specialization of a reference's source annotation (resolves `accepts.annotations`). */
export interface AcceptContext {
  readonly specId: string;
  readonly spec: Spec;
}

/** Context of the source annotation; `null` if it is free or the specialization is not applied. */
export function acceptContextOf(
  p: Project,
  sourceAnnotationId: string,
): AcceptContext | null {
  const source = projectIndex(p).annotations.get(sourceAnnotationId);
  if (!source?.type) return null;
  const spec = getSpec(p, source.type.specId);
  return spec ? { specId: source.type.specId, spec } : null;
}

/**
 * Decides whether a whole annotation is an accepted target: typed, of the SAME specialization as
 * the source and of a type covered by `accepts.annotations`. The covered ids are resolved once.
 */
function annotationMatcher(
  accepts: SpecRefAccepts,
  context: AcceptContext | null,
): (a: Annotation) => boolean {
  if (!context || !accepts.annotations) return () => false;
  const covered = new Set(resolveTypeItems(context.spec, accepts.annotations));
  return (a) =>
    a.type !== null && a.type.specId === context.specId && covered.has(a.type.typeId);
}

/**
 * Types covered by `accepts.annotations`, in the order of the source annotation's specialization
 * (empty if `accepts` does not accept annotations or the source is free).
 */
export function acceptedAnnotationTypes(
  p: Project,
  sourceAnnotationId: string,
  accepts: SpecRefAccepts,
): SpecAnnotationType[] {
  const context = acceptContextOf(p, sourceAnnotationId);
  if (!context || !accepts.annotations) return [];
  const covered = new Set(resolveTypeItems(context.spec, accepts.annotations));
  return context.spec.layers
    .flatMap((layer) => layer.annotationTypes)
    .filter((type) => covered.has(type.id));
}

/**
 * `true` if the target exists and is accepted by `accepts`: a free entry with `free`, a `table`
 * row or simple field with one of the tags, or the whole annotation of a type in
 * `accepts.annotations`. Never the annotation itself.
 */
export function isRefAccepted(
  p: Project,
  sourceAnnotationId: string,
  accepts: SpecRefAccepts,
  ref: RefValue,
): boolean {
  if (ref.annotationId === sourceAnnotationId) return false;
  const target = resolveRef(p, ref);
  return (
    target !== null &&
    isTargetAccepted(target, accepts, acceptContextOf(p, sourceAnnotationId))
  );
}

/**
 * `true` if the already-resolved target is accepted by `accepts` (see `isRefAccepted`). `context`
 * is the source annotation's specialization (`acceptContextOf`); without it, no whole annotation
 * is accepted.
 */
export function isTargetAccepted(
  target: ResolvedRef,
  accepts: SpecRefAccepts,
  context: AcceptContext | null = null,
): boolean {
  switch (target.kind) {
    case 'annotation':
      return annotationMatcher(accepts, context)(target.annotation);
    case 'entry':
      return accepts.free === true;
    case 'row':
      return target.field?.type === 'table' && sharesTag(target.field.tags, accepts.tags);
    case 'field':
      return (
        target.field !== null &&
        SIMPLE_TYPES.has(target.field.type) &&
        sharesTag(target.field.tags, accepts.tags)
      );
  }
}

/** `ref` field of the annotation's type; `null` if it does not exist. */
export function refFieldOf(
  p: Project,
  annotationId: string,
  key: string,
): Extract<SpecField, { type: 'ref' }> | null {
  const source =
    projectIndex(p).annotations.get(annotationId) ?? fail('not-found', annotationId);
  const type = typeOfAnnotation(p, source)?.type;
  const field = type ? fieldOf(type, key) : null;
  return field?.type === 'ref' ? field : null;
}

/** `ref` column of the table `tableKey` of the annotation's type; `null` if it does not exist. */
export function refColumnOf(
  p: Project,
  annotationId: string,
  tableKey: string,
  column: string,
): SpecRefColumn | null {
  const source =
    projectIndex(p).annotations.get(annotationId) ?? fail('not-found', annotationId);
  const type = typeOfAnnotation(p, source)?.type;
  const field = type ? fieldOf(type, tableKey) : null;
  if (field?.type !== 'table') return null;
  const col = field.columns.find((c) => c.key === column);
  return col?.type === 'ref' ? col : null;
}

export interface RefTarget {
  readonly ref: RefValue;
  /** Annotation that contains the target (to group and to show image › marking). */
  readonly annotation: Annotation;
  readonly label: string;
  /**
   * Why the target is accepted: the field's tags that the `ref` field accepts (table row or
   * simple field); empty for a free entry and for a whole annotation. It serves the picker's
   * filter.
   */
  readonly tags: readonly string[];
}

/** Field and row targets of a typed annotation, by the tags in `accepts.tags`. */
function fieldTargets(
  a: Annotation,
  type: SpecAnnotationType,
  accepts: SpecRefAccepts,
  push: (ref: RefValue, annotation: Annotation, tags?: readonly string[]) => void,
): void {
  if (!a.values) return;
  for (const f of type.fields) {
    if (!sharesTag(f.tags, accepts.tags)) continue;
    const tags = (f.tags ?? []).filter((tag) => accepts.tags?.includes(tag));
    if (f.type === 'table') {
      for (const row of tableRows(a.values[f.key])) {
        push({ annotationId: a.id, key: f.key, rowId: row._id }, a, tags);
      }
    } else if (SIMPLE_TYPES.has(f.type)) {
      push({ annotationId: a.id, key: f.key }, a, tags);
    }
  }
}

/**
 * Targets accepted by `accepts`, in project order, never the source annotation: of each
 * annotation, the whole annotation (if the type is covered by `accepts.annotations`) and then the
 * fields and rows with an accepted tag.
 */
function targetsAccepted(
  p: Project,
  sourceAnnotationId: string,
  accepts: SpecRefAccepts,
  texts: LabelTexts,
): RefTarget[] {
  const targets: RefTarget[] = [];
  const push = (ref: RefValue, annotation: Annotation, tags: readonly string[] = []) =>
    targets.push({ ref, annotation, label: refLabel(p, ref, texts), tags });
  const wholeAccepted = annotationMatcher(
    accepts,
    acceptContextOf(p, sourceAnnotationId),
  );

  for (const a of p.annotations) {
    if (a.id === sourceAnnotationId) continue;
    if (a.type === null) {
      if (!accepts.free) continue;
      for (const entry of a.entries) push({ annotationId: a.id, entryId: entry.id }, a);
      continue;
    }
    if (wholeAccepted(a)) push({ annotationId: a.id }, a);
    const type = typeOfAnnotation(p, a)?.type;
    if (type) fieldTargets(a, type, accepts, push);
  }
  return targets;
}

/**
 * Targets accepted by the annotation's `ref` field `key`, in project order: on any
 * marking and image, never the annotation itself. Empty if the field is not `ref`.
 */
export function findRefTargets(
  p: Project,
  sourceAnnotationId: string,
  key: string,
  texts: LabelTexts = DEFAULT_LABEL_TEXTS,
): RefTarget[] {
  const field = refFieldOf(p, sourceAnnotationId, key);
  return field ? targetsAccepted(p, sourceAnnotationId, field.accepts, texts) : [];
}

/**
 * Targets accepted by the `ref` column `column` of the annotation's table `tableKey` (the same
 * `accepts` as a `ref` field). Empty if the column does not exist or is not `ref`.
 */
export function findCellRefTargets(
  p: Project,
  sourceAnnotationId: string,
  tableKey: string,
  column: string,
  texts: LabelTexts = DEFAULT_LABEL_TEXTS,
): RefTarget[] {
  const col = refColumnOf(p, sourceAnnotationId, tableKey, column);
  return col ? targetsAccepted(p, sourceAnnotationId, col.accepts, texts) : [];
}

export interface AnnotationRef {
  /** Key of the `ref` field, or of the `table` when the reference is in a cell. */
  readonly key: string;
  readonly ref: RefValue;
  /** Cell of a `ref` column: the row's `_id`, the column and its position (from 0). */
  readonly rowId?: string;
  readonly column?: string;
  readonly rowIndex?: number;
}

/**
 * References made by the annotation: the filled `ref` fields of the type and the filled cells
 * of the tables' `ref` columns. If the type no longer exists, any value (or cell) in the
 * reference shape counts.
 */
export function refsOf(p: Project, a: Annotation): AnnotationRef[] {
  if (!a.values) return [];
  const values = a.values;
  const type = typeOfAnnotation(p, a)?.type;
  const result: AnnotationRef[] = [];
  const keys = type ? type.fields.map((f) => f.key) : Object.keys(values);
  for (const key of keys) {
    const field = type ? fieldOf(type, key) : null;
    if (type && !field) continue;
    if (field ? field.type === 'table' : Array.isArray(values[key])) {
      const refColumns =
        field?.type === 'table'
          ? new Set(field.columns.filter((c) => c.type === 'ref').map((c) => c.key))
          : null;
      tableRows(values[key]).forEach((row, rowIndex) => {
        for (const [column, cell] of Object.entries(row)) {
          if (column === '_id' || (refColumns && !refColumns.has(column))) continue;
          const ref = parseRefValue(cell);
          if (ref) result.push({ key, ref, rowId: row._id, column, rowIndex });
        }
      });
    } else if (!field || field.type === 'ref') {
      const ref = parseRefValue(values[key]);
      if (ref) result.push({ key, ref });
    }
  }
  return result;
}

/** The reference's field as read in the text: `field`, or `table[2].column` in a cell. */
export function refPathText(
  r: Pick<AnnotationRef, 'key' | 'column' | 'rowIndex'>,
): string {
  return r.column === undefined || r.rowIndex === undefined
    ? r.key
    : `${r.key}[${r.rowIndex + 1}].${r.column}`;
}

export interface Backlink extends AnnotationRef {
  /** Annotation that makes the reference. */
  readonly source: Annotation;
}

/**
 * References received by the annotation (on any of its entries, rows or fields),
 * in project order. To group by target, use `ref.entryId`/`ref.rowId`/`ref.key`.
 */
export function getBacklinks(p: Project, annotationId: string): Backlink[] {
  return [...(backlinkIndex(p).get(annotationId) ?? [])];
}

/** References received per target, built once per project version. */
const backlinkIndex = memoByProject((p) => {
  const result = new Map<string, Backlink[]>();
  for (const source of p.annotations) {
    for (const r of refsOf(p, source)) {
      if (r.ref.annotationId === source.id) continue;
      const list = result.get(r.ref.annotationId);
      if (list) list.push({ ...r, source });
      else result.set(r.ref.annotationId, [{ ...r, source }]);
    }
  }
  return result;
});

/**
 * How many references valid in `before` become broken in `after`, counting only
 * the source annotations that still exist. It serves the deletion and removal
 * confirmations ("1 reference will break").
 */
export function countBrokenRefs(before: Project, after: Project): number {
  const existed = new Set(before.annotations.map((a) => a.id));
  let count = 0;
  for (const source of after.annotations) {
    if (!existed.has(source.id)) continue;
    for (const { ref } of refsOf(after, source)) {
      if (resolveRef(before, ref) && !resolveRef(after, ref)) count++;
    }
  }
  return count;
}

/** References the operation would break (0 if it fails). */
export function refsBrokenBy(p: Project, op: (p: Project) => Project): number {
  try {
    return countBrokenRefs(p, op(p));
  } catch (e) {
    if (e instanceof ModelError) return 0;
    throw e;
  }
}

export { isRecord };
