import { requireAnnotationOwner } from './arrows';
import { fail } from './errors';
import { annotationWithLinked, checkRole } from './links';
import { findById, moveItem, normalizeOptionalName, updateById } from './project';
import { projectIndex } from './projectIndex';
import {
  DEFAULT_LABEL_TEXTS,
  isRecord,
  isRefAccepted,
  parseRefValue,
  refLabel,
  instanceLabel,
  type LabelTexts,
} from './refs';
import {
  isIsoDate,
  typeAppliesTo,
  type SpecAnnotationType,
  type SpecColumn,
  type SpecField,
  type SpecRefAccepts,
  type SpecSimpleColumn,
} from './spec';
import {
  childTypeIds,
  fieldOf,
  findSpecType,
  isAllowedOwner,
  projectLayerFor,
  typeOfAnnotation,
  type ResolvedType,
  ownerRolesOf,
} from './specLookup';
import type {
  Annotation,
  AnnotationTypeRef,
  Entry,
  JsonValue,
  Layer,
  Project,
  TableRow,
  TypedValues,
} from './types';

// Typed annotations: creation with defaults, value editing, table rows,
// links with `allowedChildren`/`requiresOwner` and conversion to a free annotation. See
// docs/SPEC-FORMAT.md and docs/ARCHITECTURE.md, "Specializations in the project and typed annotations".

/** Empty field: `null`, absent or empty text. */
export function isEmptyValue(value: JsonValue | undefined): boolean {
  return value === undefined || value === null || value === '';
}

export type ValueProblem = 'invalid-value' | 'unknown-option';

/** Checks a non-empty value against a simple field (or column). */
export function checkSimpleValue(
  field: SpecSimpleColumn,
  value: JsonValue,
): ValueProblem | null {
  switch (field.type) {
    case 'string':
      return typeof value === 'string' ? null : 'invalid-value';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? null : 'invalid-value';
    case 'date':
      return typeof value === 'string' && isIsoDate(value) ? null : 'invalid-value';
    case 'enum':
      if (typeof value !== 'string') return 'invalid-value';
      return field.options.includes(value) ? null : 'unknown-option';
  }
}

/** Initial value of the field: the `default`, `[]` for `table` and `null` for the rest. */
export function defaultFieldValue(field: SpecField): JsonValue {
  if (field.type === 'table') return [];
  if (field.type === 'ref') return null;
  return field.default ?? null;
}

/** Initial values of an annotation of the type: all the fields, in the type's order. */
export function defaultValues(type: SpecAnnotationType): TypedValues {
  return Object.fromEntries(type.fields.map((f) => [f.key, defaultFieldValue(f)]));
}

/** Initial value of a cell: the column's `default`; `null` in a `ref` column and with no default. */
export function defaultColumnValue(column: SpecColumn): JsonValue {
  return column.type === 'ref' ? null : (column.default ?? null);
}

function newRow(columns: readonly SpecColumn[], rowId: string): TableRow {
  return {
    _id: rowId,
    ...Object.fromEntries(columns.map((c) => [c.key, defaultColumnValue(c)])),
  };
}

/** Possible owners for a new annotation of the type on the marking (same marking). */
export function validTypedOwners(
  p: Project,
  markingId: string,
  type: AnnotationTypeRef,
): Annotation[] {
  return (projectIndex(p).annotationsByMarking.get(markingId) ?? []).filter((a) =>
    isAllowedOwner(p, type, a),
  );
}

export interface ChildType {
  readonly type: AnnotationTypeRef;
  readonly definition: SpecAnnotationType;
  /** Project layer where the child is created (the child type's). */
  readonly layer: Layer | null;
}

/** Types that can be linked to the annotation ("+ onClick", "+ onHold"… buttons). */
export function childTypesOf(p: Project, annotationId: string): ChildType[] {
  const owner = findById(p.annotations, annotationId);
  const resolved = typeOfAnnotation(p, owner);
  if (!resolved || !owner.type) return [];
  const specId = owner.type.specId;
  const result: ChildType[] = [];
  for (const typeId of childTypeIds(resolved.spec, resolved.type.id)) {
    const child = findSpecType(p, { specId, typeId });
    if (!child) continue;
    result.push({
      type: { specId, typeId },
      definition: child.type,
      layer: projectLayerFor(p, specId, child.layer.id),
    });
  }
  return result;
}

/** Type of the typed annotation; fails if it is free or the type no longer exists. */
function requireType(p: Project, a: Annotation): ResolvedType {
  if (!a.type || !a.values) fail('not-typed', a.id);
  return (
    typeOfAnnotation(p, a) ?? fail('unknown-type', `${a.type.specId}/${a.type.typeId}`)
  );
}

export interface NewTypedAnnotationArgs {
  readonly id: string;
  readonly markingId: string;
  readonly layerId: string;
  readonly type: AnnotationTypeRef;
  readonly name?: string | null;
  /** Owner (required when the type has `requiresOwner`). */
  readonly parentAnnotationId?: string | null;
  /** Role in the owner (id of a `childRoles` of the owner's type); only with an owner. */
  readonly parentRole?: string | null;
}

/** Creates the typed annotation with the fields' `default`s. */
export function addTypedAnnotation(p: Project, args: NewTypedAnnotationArgs): Project {
  if (p.annotations.some((a) => a.id === args.id)) fail('duplicate-id', args.id);
  requireAnnotationOwner(p, args.markingId);
  const layer = findById(p.layers, args.layerId);
  const resolved =
    findSpecType(p, args.type) ??
    fail('unknown-type', `${args.type.specId}/${args.type.typeId}`);
  if (
    layer.spec?.specId !== args.type.specId ||
    layer.spec.layerId !== resolved.layer.id
  ) {
    fail('type-not-in-layer', args.type.typeId);
  }
  const ownerKind = projectIndex(p).arrows.has(args.markingId) ? 'arrow' : 'marking';
  if (!typeAppliesTo(resolved.type, ownerKind)) {
    fail('type-not-applicable', `${args.type.specId}/${args.type.typeId}`);
  }
  const ownerId = args.parentAnnotationId ?? null;
  if (ownerId === null) {
    if (resolved.type.requiresOwner) fail('owner-required', args.type.typeId);
  } else {
    const owner = findById(p.annotations, ownerId);
    if (owner.markingId !== args.markingId || !isAllowedOwner(p, args.type, owner)) {
      fail('invalid-annotation-parent', ownerId);
    }
  }
  const role = args.parentRole ?? null;
  if (role !== null) {
    const owner = ownerId === null ? null : findById(p.annotations, ownerId);
    checkRole(owner && ownerRolesOf(p, owner), role, ownerId !== null);
  }
  const annotation: Annotation = {
    id: args.id,
    markingId: args.markingId,
    layerId: args.layerId,
    name: normalizeOptionalName(args.name ?? null),
    parentAnnotationId: ownerId,
    parentRole: role,
    type: { specId: args.type.specId, typeId: args.type.typeId },
    values: defaultValues(resolved.type),
    entries: [],
  };
  return { ...p, annotations: [...p.annotations, annotation] };
}

function updateValues(
  p: Project,
  annotationId: string,
  update: (
    values: TypedValues,
    type: SpecAnnotationType,
    a: Annotation,
    resolved: ResolvedType,
  ) => TypedValues,
): Project {
  return {
    ...p,
    annotations: updateById(p.annotations, annotationId, (a) => {
      const resolved = requireType(p, a);
      return { ...a, values: update(a.values ?? {}, resolved.type, a, resolved) };
    }),
  };
}

/** Normalizes (empty text → `null`) and validates the value of a simple field. */
function checkedSimple(field: SpecSimpleColumn, value: JsonValue): JsonValue {
  if (isEmptyValue(value)) return null;
  const problem = checkSimpleValue(field, value);
  if (problem) fail(problem, field.key);
  return value;
}

/**
 * Value of a reference (`ref` field or `ref` column cell): `null` clears; otherwise it must be an
 * existing reference, other than the annotation itself, accepted by `accepts`.
 */
function checkedRef(
  p: Project,
  annotationId: string,
  accepts: SpecRefAccepts,
  key: string,
  value: JsonValue,
): JsonValue {
  if (isEmptyValue(value)) return null;
  const ref = parseRefValue(value) ?? fail('invalid-value', key);
  if (ref.annotationId === annotationId) fail('self-ref', key);
  if (!isRefAccepted(p, annotationId, accepts, ref)) fail('ref-not-accepted', key);
  return { ...ref };
}

/**
 * Sets the value of a simple or `ref` field (`null` clears). `table` uses the row operations.
 * The reference must exist and be accepted by the field. A key that is not a field of the type
 * fails with `unknown-field`.
 */
export function setFieldValue(
  p: Project,
  annotationId: string,
  key: string,
  value: JsonValue,
): Project {
  return setFieldValues(p, annotationId, { [key]: value });
}

/** Already validated value of a simple or `ref` field of the type (`table` and an unknown key fail). */
function fieldValueOf(
  p: Project,
  type: SpecAnnotationType,
  annotationId: string,
  key: string,
  value: JsonValue,
): JsonValue {
  const field = fieldOf(type, key) ?? fail('unknown-field', key);
  if (field.type === 'table') fail('invalid-value', key);
  return field.type === 'ref'
    ? checkedRef(p, annotationId, field.accepts, key, value)
    : checkedSimple(field, value);
}

/**
 * Sets several fields at once (a single project update, one undo entry), with the same rules as
 * `setFieldValue` for each value. If any fails, nothing is written.
 */
export function setFieldValues(
  p: Project,
  annotationId: string,
  values: Readonly<Record<string, JsonValue>>,
): Project {
  return updateValues(p, annotationId, (current, type, a) => {
    const next: Record<string, JsonValue> = { ...current };
    for (const [key, value] of Object.entries(values)) {
      next[key] = fieldValueOf(p, type, a.id, key, value);
    }
    return next;
  });
}

function tableField(type: SpecAnnotationType, key: string) {
  const field = fieldOf(type, key) ?? fail('unknown-field', key);
  if (field.type !== 'table') fail('invalid-value', key);
  return field;
}

/** Items of the table value (keeps invalid items, so as not to lose data). */
function rawRows(values: TypedValues, key: string): readonly JsonValue[] {
  const value = values[key];
  return Array.isArray(value) ? value : [];
}

function rowIndex(rows: readonly JsonValue[], rowId: string): number {
  const index = rows.findIndex((r) => isRecord(r) && r._id === rowId);
  if (index < 0) fail('not-found', rowId);
  return index;
}

/** Adds a row (with the columns' `default`s) at the end of the table. */
export function addTableRow(
  p: Project,
  annotationId: string,
  key: string,
  rowId: string,
): Project {
  return updateValues(p, annotationId, (values, type) => {
    const field = tableField(type, key);
    const rows = rawRows(values, key);
    if (rows.some((r) => isRecord(r) && r._id === rowId)) fail('duplicate-id', rowId);
    return { ...values, [key]: [...rows, newRow(field.columns, rowId)] };
  });
}

/** Sets a cell of the row `rowId` (`null` clears). */
export function setTableCell(
  p: Project,
  annotationId: string,
  key: string,
  rowId: string,
  column: string,
  value: JsonValue,
): Project {
  return setTableCells(p, annotationId, key, rowId, { [column]: value });
}

/**
 * Sets several cells of the row `rowId` at once (a single project update), with the same rules as
 * `setTableCell` for each value. If any fails, nothing is written.
 */
export function setTableCells(
  p: Project,
  annotationId: string,
  key: string,
  rowId: string,
  cells: Readonly<Record<string, JsonValue>>,
): Project {
  return updateValues(p, annotationId, (values, type, a) => {
    const field = tableField(type, key);
    const checked: Record<string, JsonValue> = {};
    for (const [column, value] of Object.entries(cells)) {
      const col =
        field.columns.find((c) => c.key === column) ?? fail('unknown-field', column);
      checked[column] =
        col.type === 'ref'
          ? checkedRef(p, a.id, col.accepts, column, value)
          : checkedSimple(col, value);
    }
    const rows = rawRows(values, key);
    const index = rowIndex(rows, rowId);
    const next = rows.map((r, i) =>
      i === index && isRecord(r) ? { ...r, ...checked } : r,
    );
    return { ...values, [key]: next };
  });
}

export function removeTableRow(
  p: Project,
  annotationId: string,
  key: string,
  rowId: string,
): Project {
  return updateValues(p, annotationId, (values, type) => {
    tableField(type, key);
    const rows = rawRows(values, key);
    const index = rowIndex(rows, rowId);
    return { ...values, [key]: rows.filter((_, i) => i !== index) };
  });
}

/** Reorders the row `rowId` to the position `toIndex`. */
export function moveTableRow(
  p: Project,
  annotationId: string,
  key: string,
  rowId: string,
  toIndex: number,
): Project {
  return updateValues(p, annotationId, (values, type) => {
    tableField(type, key);
    const rows = rawRows(values, key);
    return { ...values, [key]: moveItem(rows, rowIndex(rows, rowId), toIndex) };
  });
}

// ---------------------------------------------------------------------------
// Conversion to a free annotation

export interface ConvertOptions {
  readonly newId?: () => string;
  readonly texts?: LabelTexts;
}

export function valueText(value: JsonValue): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/**
 * Pairs equivalent to the typed annotation's values (docs/ARCHITECTURE.md, "Specializations in the
 * project and typed annotations"): in field order; `number` and `date` as text; empties omitted;
 * `table` flattened as `parameters[1].name`; `ref` as `→ User.name`. Keys outside the type come last.
 */
export function typedValuesToPairs(
  p: Project,
  a: Annotation,
  texts: LabelTexts = DEFAULT_LABEL_TEXTS,
): { key: string; value: string }[] {
  const values = a.values ?? {};
  const type = typeOfAnnotation(p, a)?.type;
  const fields = new Map<string, SpecField>(type?.fields.map((f) => [f.key, f]) ?? []);
  const keys = [
    ...(type?.fields.map((f) => f.key) ?? []),
    ...Object.keys(values).filter((k) => !fields.has(k)),
  ];
  const pairs: { key: string; value: string }[] = [];
  for (const key of keys) {
    const value = values[key];
    if (value === undefined || isEmptyValue(value)) continue;
    const field = fields.get(key);
    const ref = field?.type === 'ref' || !field ? parseRefValue(value) : null;
    if (ref || field?.type === 'ref') {
      pairs.push({ key, value: `→ ${ref ? refLabel(p, ref, texts) : texts.broken}` });
    } else if (Array.isArray(value)) {
      const columns = field?.type === 'table' ? field.columns.map((c) => c.key) : null;
      const refColumns = new Set(
        field?.type === 'table'
          ? field.columns.filter((c) => c.type === 'ref').map((c) => c.key)
          : [],
      );
      value.forEach((row, i) => {
        if (!isRecord(row)) return;
        const cols = columns ?? Object.keys(row).filter((k) => k !== '_id');
        for (const col of cols) {
          const cell = row[col];
          if (cell === undefined || isEmptyValue(cell)) continue;
          // `ref` cell (or, with no type, in the reference format): `→ User.name`, like the field.
          const cellRef =
            refColumns.has(col) || columns === null ? parseRefValue(cell) : null;
          const text = cellRef
            ? `→ ${refLabel(p, cellRef, texts)}`
            : refColumns.has(col)
              ? `→ ${texts.broken}`
              : valueText(cell);
          pairs.push({ key: `${key}[${i + 1}].${col}`, value: text });
        }
      });
    } else {
      pairs.push({ key, value: valueText(value) });
    }
  }
  return pairs;
}

/**
 * Free version of the typed annotation: pairs from the values, empty `name`
 * filled with the instance label or the type name; link kept.
 */
export function freeVersionOf(
  p: Project,
  a: Annotation,
  options: ConvertOptions = {},
): Annotation {
  if (!a.type) return a;
  const newId = options.newId ?? (() => crypto.randomUUID());
  const entries: Entry[] = typedValuesToPairs(p, a, options.texts).map((pair) => ({
    id: newId(),
    ...pair,
  }));
  return {
    ...a,
    name: a.name ?? instanceLabel(p, a) ?? typeOfAnnotation(p, a)?.type.name ?? null,
    type: null,
    values: null,
    entries,
  };
}

/** Converts the typed annotation to a free one (e.g. type removed in an update). */
export function convertAnnotationToFree(
  p: Project,
  annotationId: string,
  options: ConvertOptions = {},
): Project {
  const a = findById(p.annotations, annotationId);
  if (!a.type) fail('not-typed', annotationId);
  const converted = freeVersionOf(p, a, options);
  return {
    ...p,
    annotations: p.annotations.map((x) => (x.id === annotationId ? converted : x)),
  };
}

/** Ids of the specialization's typed annotations plus those linked to them. */
export function annotationsOfSpec(p: Project, specId: string): Set<string> {
  const ids = new Set<string>();
  const layerIds = new Set(
    p.layers.filter((l) => l.spec?.specId === specId).map((l) => l.id),
  );
  for (const a of p.annotations) {
    if (a.type?.specId !== specId && !layerIds.has(a.layerId)) continue;
    if (ids.has(a.id)) continue; // already came in another one's subtree

    for (const id of annotationWithLinked(p, a.id)) ids.add(id);
  }
  return ids;
}
