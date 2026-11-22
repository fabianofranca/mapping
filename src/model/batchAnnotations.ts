import {
  addAnnotation,
  renameAnnotation,
  setEntries,
  type EntryInput,
} from './annotations';
import { createArrow } from './arrows';
import { BatchRuleError, quotedLabel as quoted } from './batchMarkings';
import { ModelError } from './errors';
import { isRecord } from './isRecord';
import { setAnnotationParent, setAnnotationRole } from './links';
import { projectIndex, typeKey } from './projectIndex';
import { tableRows } from './refs';
import { fieldOf, projectLayerFor, roleNameOf, typeOfAnnotation } from './specLookup';
import type { SpecField } from './spec';
import {
  addTableRow,
  addTypedAnnotation,
  moveTableRow,
  removeTableRow,
  setFieldValue,
  setTableCell,
} from './typed';
import { annotationShortLabel } from './typedDisplay';
import type {
  Annotation,
  AnnotationTypeRef,
  JsonValue,
  Layer,
  Project,
  RefValue,
} from './types';

// The annotation and arrow rules of the MCP batch: `create_annotation`, `update_annotation` (values, `table`
// rows with their aliases, `ref` values, owner and role) and `create_arrow`. Like `batchMarkings.ts`, they are
// pure functions over the project and a resolver the caller provides (references, aliases, layers and types
// are the caller's: the batch has its own aliases and the plugin-result applier has its local ones). A rule
// that breaks throws a `BatchRuleError` with the batch's code and English message, which the batch rethrows
// as its `ToolError` unchanged.

/** A table row cited by alias (`_as`): the annotation, the table's key and the row. */
export interface RowAliasTarget {
  readonly kind: 'row';
  readonly annotationId: string;
  readonly key: string;
  readonly rowId: string;
}

/** The row aliases a call defines, in order (the caller registers them after the step). */
export type RowAliases = [string, RowAliasTarget][];

/** What these rules need from the caller to turn references into items (it throws its own errors). */
export interface AnnotationResolver {
  /** Id of a marking (or arrow): alias, reference or id. */
  marking(ref: string): string;
  /** Id of an annotation of `p`: alias, reference or id. */
  annotation(ref: string, p: Project): string;
  layer(ref: string, p: Project): Layer;
  type(ref: string, p: Project): AnnotationTypeRef;
  /** The row an alias (`$name`) names; throws the caller's error for an unknown alias or another kind. */
  rowAlias(name: string): RowAliasTarget;
  /** The alias is already taken (by the caller's aliases). */
  aliasTaken(name: string): boolean;
  /** `Container › Name` of a marking, as the caller's summaries write it. */
  markingLabel(p: Project, id: string): string;
}

function refuse(
  code: BatchRuleError['code'],
  message: string,
  details?: Readonly<Record<string, unknown>>,
): never {
  throw new BatchRuleError(code, message, details);
}

/** `Annotation › on "Container › Marking"`, the label the summaries and the cleared role use. */
export function annotationLabelOf(
  res: Pick<AnnotationResolver, 'markingLabel'>,
  p: Project,
  id: string,
): string {
  const a = projectIndex(p).annotations.get(id);
  return a
    ? `${annotationShortLabel(p, a)} on "${res.markingLabel(p, a.markingId)}"`
    : id;
}

// ---------------------------------------------------------------------------
// ref values

/** Reference of a `ref` field in the agent's format → the model's `RefValue`. */
export function batchRefValue(
  res: AnnotationResolver,
  input: JsonValue,
  key: string,
  p: Project,
): JsonValue {
  if (input === null || (typeof input === 'string' && input === '')) return null;
  if (!isRecord(input)) {
    return refuse(
      'invalid-ref-value',
      `field ${key}: the reference is an object with "annotation" (see the description of values)`,
    );
  }
  const target = input.annotation ?? input.annotationId;
  if (typeof target !== 'string') {
    return refuse('invalid-ref-value', `field ${key}: "annotation" is missing`);
  }
  const annotationId = res.annotation(target, p);
  const annotation = projectIndex(p).annotations.get(annotationId)!;
  return { ...refInside(res, annotation, input, key) };
}

/** The part of the annotation a reference object points at: a pair, a field, a row or the whole annotation. */
function refInside(
  res: AnnotationResolver,
  annotation: Annotation,
  input: Readonly<Record<string, JsonValue>>,
  key: string,
): RefValue {
  const annotationId = annotation.id;
  const entry = input.entry ?? input.entryId;
  const field = input.key;
  const row = input.row ?? input.rowId;
  if (entry !== undefined) return entryRef(annotation, entry, key);
  if (typeof field === 'string') {
    return row === undefined
      ? { annotationId, key: field }
      : { annotationId, key: field, rowId: batchRowId(res, annotation, field, row, key) };
  }
  // Without `entry`, `key` or `row`: the whole annotation (fourth format).
  if (row === undefined) return { annotationId };
  return refuse(
    'invalid-ref-value',
    `field ${key}: "row" requires "key" (the table); without "entry", "key" or "row", the reference is the whole annotation`,
  );
}

function entryRef(annotation: Annotation, entry: JsonValue, key: string): RefValue {
  if (typeof entry !== 'string') {
    return refuse(
      'invalid-ref-value',
      `field ${key}: "entry" is the key or the id of the pair`,
    );
  }
  const found =
    annotation.entries.find((e) => e.id === entry) ??
    annotation.entries.find((e) => e.key === entry.trim());
  if (!found) {
    return refuse('not-found', `field ${key}: the annotation has no pair "${entry}"`, {
      entries: annotation.entries.map((e) => e.key),
    });
  }
  return { annotationId: annotation.id, entryId: found.id };
}

function batchRowId(
  res: AnnotationResolver,
  annotation: Annotation,
  field: string,
  row: JsonValue,
  key: string,
): string {
  const rows = tableRows(annotation.values?.[field]);
  if (typeof row === 'number') {
    const found = rows[row];
    if (!found) {
      return refuse('not-found', `field ${key}: the table ${field} has no row ${row}`);
    }
    return found._id;
  }
  if (typeof row !== 'string') {
    return refuse(
      'invalid-ref-value',
      `field ${key}: "row" is the id, the alias or the index of the row`,
    );
  }
  if (row.startsWith('$')) {
    const target = res.rowAlias(row);
    if (target.annotationId !== annotation.id || target.key !== field) {
      return refuse(
        'invalid-ref-value',
        `field ${key}: row ${row} belongs to another table`,
      );
    }
    return target.rowId;
  }
  return row;
}

// ---------------------------------------------------------------------------
// values

/** Sets the values of a typed annotation, field by field, through the model's operations. */
export function setBatchValues(
  res: AnnotationResolver,
  p: Project,
  annotationId: string,
  values: Readonly<Record<string, JsonValue>>,
  rowAliases: RowAliases,
): Project {
  const entries = Object.entries(values);
  if (entries.length === 0) return p;
  // The annotation's type does not change when setting the values: resolved once, not per field.
  const annotation = projectIndex(p).annotations.get(annotationId)!;
  const resolved = typeOfAnnotation(p, annotation);
  let next = p;
  for (const [key, value] of entries) {
    const field: SpecField | null = resolved ? fieldOf(resolved.type, key) : null;
    if (field?.type === 'table') {
      next = setBatchTable(res, next, annotationId, field, value, rowAliases);
    } else if (field?.type === 'ref') {
      next = setFieldValue(next, annotationId, key, batchRefValue(res, value, key, next));
    } else {
      // Simple fields; a nonexistent type or an unknown field: the model says why.
      next = setFieldValue(next, annotationId, key, value);
    }
  }
  return next;
}

/** The rows of a table value, each an object (`invalid-value` otherwise). */
function tableInput(key: string, value: JsonValue): Record<string, JsonValue>[] {
  if (value !== null && !Array.isArray(value)) {
    return refuse('invalid-value', `field ${key}: a table is a list of rows`);
  }
  return (value ?? []).map((row, i) => {
    if (!isRecord(row)) {
      return refuse('invalid-value', `field ${key}: row ${i} is not an object`);
    }
    return row as Record<string, JsonValue>;
  });
}

/** Defines the row's alias (`_as`): a name like `$row`, free in the caller's aliases and in this call's. */
function defineRowAlias(
  res: AnnotationResolver,
  rowAliases: RowAliases,
  alias: JsonValue | undefined,
  target: Omit<RowAliasTarget, 'kind'>,
): void {
  if (alias === undefined) return;
  if (typeof alias !== 'string' || !/^\$[A-Za-z0-9_-]+$/.test(alias)) {
    refuse('invalid-alias', `field ${target.key}: "_as" is an alias like "$row"`);
  }
  if (res.aliasTaken(alias) || rowAliases.some(([name]) => name === alias)) {
    refuse('duplicate-alias', `alias repeated in the batch: ${alias}`);
  }
  rowAliases.push([alias, { kind: 'row', ...target }]);
}

/** The cells of a row (`_id` and `_as` are not cells); a `ref` cell takes the same value as a `ref` field. */
function setRowCells(
  res: AnnotationResolver,
  p: Project,
  tableField: Extract<SpecField, { type: 'table' }>,
  annotationId: string,
  rowId: string,
  row: Record<string, JsonValue>,
): Project {
  let next = p;
  for (const [column, cell] of Object.entries(row)) {
    if (column === '_id' || column === '_as') continue;
    const isRef = tableField.columns.find((c) => c.key === column)?.type === 'ref';
    // `ref` cell: the same value as the `ref` field (aliases included) or the stored format.
    const cellValue = isRef ? batchRefValue(res, cell, column, next) : cell;
    next = setTableCell(next, annotationId, tableField.key, rowId, column, cellValue);
  }
  return next;
}

/** One row of the table: a new row or an existing one (`_id`), its cells in order, and its alias (`_as`). */
function setTableRow(
  res: AnnotationResolver,
  p: Project,
  tableField: Extract<SpecField, { type: 'table' }>,
  annotationId: string,
  row: Record<string, JsonValue>,
  position: number,
  ctx: { readonly existing: ReadonlySet<string>; readonly rowAliases: RowAliases },
): Project {
  const key = tableField.key;
  const given = row._id;
  if (given !== undefined && (typeof given !== 'string' || !ctx.existing.has(given))) {
    refuse('not-found', `field ${key}: row ${String(given)} does not exist`);
  }
  const rowId = (given as string | undefined) ?? crypto.randomUUID();
  let next = given === undefined ? addTableRow(p, annotationId, key, rowId) : p;
  next = setRowCells(res, next, tableField, annotationId, rowId, row);
  next = moveTableRow(next, annotationId, key, rowId, position);
  defineRowAlias(res, ctx.rowAliases, row._as, { annotationId, key, rowId });
  return next;
}

/** Replaces the table's rows: `_id` keeps an existing row, `_as` gives it an alias. */
function setBatchTable(
  res: AnnotationResolver,
  p: Project,
  annotationId: string,
  tableField: Extract<SpecField, { type: 'table' }>,
  value: JsonValue,
  rowAliases: RowAliases,
): Project {
  const key = tableField.key;
  const input = tableInput(key, value);
  const current = tableRows(projectIndex(p).annotations.get(annotationId)!.values?.[key]);
  const kept = new Set(
    input.map((row) => row._id).filter((id): id is string => typeof id === 'string'),
  );
  let next = p;
  for (const row of current) {
    if (!kept.has(row._id)) next = removeTableRow(next, annotationId, key, row._id);
  }
  const existing = new Set(current.map((row) => row._id));
  input.forEach((row, position) => {
    next = setTableRow(res, next, tableField, annotationId, row, position, {
      existing,
      rowAliases,
    });
  });
  return next;
}

/** New pairs with the same key as an existing one keep the id (and the references to it). */
export function batchEntries(
  p: Project,
  annotationId: string | null,
  entries: readonly { key: string; value: string; id?: string }[],
): EntryInput[] {
  const current = annotationId
    ? (projectIndex(p).annotations.get(annotationId)?.entries ?? [])
    : [];
  return entries.map((e) => {
    const id = e.id ?? current.find((c) => c.key === e.key.trim())?.id;
    return { key: e.key, value: e.value, ...(id ? { id } : {}) };
  });
}

// ---------------------------------------------------------------------------
// create_annotation

/** The arguments of a typed annotation: the type's layer (or the one given), owner and values. */
export interface TypedAnnotationArgs {
  readonly type: AnnotationTypeRef;
  readonly layer?: string | undefined;
  readonly name?: string | null | undefined;
  readonly values?: Readonly<Record<string, JsonValue>> | undefined;
  readonly ownerId: string | null;
}

/** New typed annotation: the type's layer (or the one given), owner and values field by field. */
export function addBatchTypedAnnotation(
  res: AnnotationResolver,
  p: Project,
  id: string,
  markingId: string,
  args: TypedAnnotationArgs,
  rowAliases: RowAliases,
): Project {
  const { type } = args;
  const typeLayer = projectIndex(p).types.get(typeKey(type.specId, type.typeId))!.layer;
  const layer =
    args.layer !== undefined
      ? res.layer(args.layer, p)
      : (projectLayerFor(p, type.specId, typeLayer.id) ??
        refuse(
          'not-found',
          `the specialization's layer "${typeLayer.name}" is not in the project`,
        ));
  let project = addTypedAnnotation(p, {
    id,
    markingId,
    layerId: layer.id,
    type,
    name: args.name ?? null,
    parentAnnotationId: args.ownerId,
  });
  if (args.values !== undefined) {
    project = setBatchValues(res, project, id, args.values, rowAliases);
  }
  return project;
}

export interface CreateAnnotationArgs {
  readonly marking: string;
  readonly type?: string | undefined;
  readonly layer?: string | undefined;
  readonly name?: string | null | undefined;
  readonly entries?: readonly { key: string; value: string; id?: string }[] | undefined;
  readonly values?: Readonly<Record<string, JsonValue>> | undefined;
  readonly owner?: string | null | undefined;
  readonly role?: string | null | undefined;
}

export interface CreatedBatchAnnotation {
  readonly project: Project;
  readonly annotationId: string;
  readonly ownerId: string | null;
  readonly rowAliases: RowAliases;
}

/** The free-form annotation: `layer` and pairs (`values` belong to a typed one). */
function addFreeAnnotation(
  res: AnnotationResolver,
  p: Project,
  id: string,
  markingId: string,
  args: CreateAnnotationArgs,
): Project {
  if (args.layer === undefined) {
    refuse(
      'layer-required',
      'free-form annotation: provide `layer` (or `type` for a typed annotation)',
    );
  }
  if (args.values !== undefined) throw new ModelError('not-typed');
  return addAnnotation(p, {
    id,
    markingId,
    layerId: res.layer(args.layer, p).id,
    name: args.name ?? null,
    entries: batchEntries(p, null, args.entries ?? []),
  });
}

/** `create_annotation`: typed (`type`, with `values`) or free-form (`layer`, with `entries`), owner and role. */
export function createBatchAnnotation(
  res: AnnotationResolver,
  p: Project,
  args: CreateAnnotationArgs,
): CreatedBatchAnnotation {
  const markingId = res.marking(args.marking);
  const annotationId = crypto.randomUUID();
  const ownerId =
    args.owner === undefined || args.owner === null
      ? null
      : res.annotation(args.owner, p);
  const rowAliases: RowAliases = [];
  let project: Project;
  if (args.type !== undefined) {
    if (args.entries !== undefined) throw new ModelError('typed-annotation');
    const typed = { ...args, type: res.type(args.type, p), ownerId };
    project = addBatchTypedAnnotation(res, p, annotationId, markingId, typed, rowAliases);
  } else {
    project = addFreeAnnotation(res, p, annotationId, markingId, args);
    if (ownerId !== null) project = setAnnotationParent(project, annotationId, ownerId);
  }
  if (args.role !== undefined && args.role !== null) {
    project = setAnnotationRole(project, annotationId, args.role);
  }
  return { project, annotationId, ownerId, rowAliases };
}

// ---------------------------------------------------------------------------
// update_annotation

export interface UpdateAnnotationArgs {
  readonly annotation: string;
  readonly name?: string | null | undefined;
  readonly entries?: readonly { key: string; value: string; id?: string }[] | undefined;
  readonly values?: Readonly<Record<string, JsonValue>> | undefined;
  /** `null` removes the owner. */
  readonly owner?: string | null | undefined;
  /** `null` removes the role. */
  readonly role?: string | null | undefined;
}

/** The role an owner change cleared: the batch reports it as a `role-cleared` warning. */
export interface RoleCleared {
  readonly annotationId: string;
  readonly role: string;
  readonly roleName: string;
  readonly message: string;
}

export interface UpdatedBatchAnnotation {
  readonly project: Project;
  readonly annotationId: string;
  /** What changed, for the step's description. */
  readonly changes: string[];
  readonly rowAliases: RowAliases;
  readonly roleCleared?: RoleCleared;
}

/** Name of the role the annotation holds in its owner, for the descriptions. */
export function annotationRoleName(p: Project, id: string): string {
  const a = projectIndex(p).annotations.get(id)!;
  const owner = a.parentAnnotationId
    ? projectIndex(p).annotations.get(a.parentAnnotationId)
    : undefined;
  return roleNameOf(p, owner, a.parentRole ?? '');
}

/**
 * Changes the owner (or removes it, with `null`). If the annotation's role goes with it and the step does not
 * carry `role` (`roleUnset`), the note goes into the step's text and the `role-cleared` warning is returned.
 */
function changeBatchOwner(
  res: AnnotationResolver,
  p: Project,
  id: string,
  owner: string | null,
  roleUnset: boolean,
): { project: Project; change: string; roleCleared?: RoleCleared } {
  const ownerId = owner === null ? null : res.annotation(owner, p);
  const roleId = projectIndex(p).annotations.get(id)!.parentRole;
  const roleName = roleId === null ? '' : annotationRoleName(p, id);
  const project = setAnnotationParent(p, id, ownerId);
  const where =
    ownerId === null
      ? 'no owner'
      : `owner ${annotationShortLabel(project, projectIndex(project).annotations.get(ownerId)!)}`;
  const cleared =
    roleId !== null &&
    roleUnset &&
    projectIndex(project).annotations.get(id)!.parentRole === null;
  if (!cleared) return { project, change: where };
  const reason =
    ownerId === null
      ? 'the annotation is left without an owner'
      : 'the new owner does not offer it';
  return {
    project,
    change: `${where}; role ${quoted(roleName)} cleared`,
    roleCleared: {
      annotationId: id,
      role: roleId,
      roleName,
      message: `the role ${quoted(roleName)} of ${annotationLabelOf(res, p, id)} is cleared: ${reason}`,
    },
  };
}

/** `update_annotation`: name, free-form pairs, typed values, owner and role. */
export function updateBatchAnnotation(
  res: AnnotationResolver,
  p: Project,
  args: UpdateAnnotationArgs,
): UpdatedBatchAnnotation {
  const id = res.annotation(args.annotation, p);
  const rowAliases: RowAliases = [];
  const changes: string[] = [];
  let project = p;
  if (args.name !== undefined) {
    project = renameAnnotation(project, id, args.name);
    changes.push(`name ${quoted(projectIndex(project).annotations.get(id)!.name)}`);
  }
  if (args.entries !== undefined) {
    project = setEntries(project, id, batchEntries(project, id, args.entries));
    changes.push(`${args.entries.length} pair(s)`);
  }
  if (args.values !== undefined) {
    project = setBatchValues(res, project, id, args.values, rowAliases);
    changes.push(`fields ${Object.keys(args.values).join(', ')}`);
  }
  let roleCleared: RoleCleared | undefined;
  if (args.owner !== undefined) {
    const moved = changeBatchOwner(res, project, id, args.owner, args.role === undefined);
    project = moved.project;
    changes.push(moved.change);
    roleCleared = moved.roleCleared;
  }
  if (args.role !== undefined) {
    project = setAnnotationRole(project, id, args.role);
    changes.push(
      args.role === null ? 'no role' : `role "${annotationRoleName(project, id)}"`,
    );
  }
  return {
    project,
    annotationId: id,
    changes,
    rowAliases,
    ...(roleCleared ? { roleCleared } : {}),
  };
}

// ---------------------------------------------------------------------------
// create_arrow

export interface CreateArrowArgs {
  readonly from: string;
  readonly to: string;
  readonly style?: Parameters<typeof createArrow>[1]['style'];
  readonly name?: string | null | undefined;
  /** Present only to be refused: the route of an arrow belongs to the person. */
  readonly points?: unknown;
}

/** The `points` of an arrow are never accepted from the batch or a plugin result. */
export function refuseArrowPoints(op: { readonly points?: unknown }): void {
  if (op.points !== undefined) {
    refuse(
      'invalid-arguments',
      "`points` is not accepted: the arrow's route belongs to the person (the server only provides the endpoints and the style)",
    );
  }
}

/** `create_arrow` between two markings. */
export function createBatchArrow(
  res: Pick<AnnotationResolver, 'marking'>,
  p: Project,
  args: CreateArrowArgs,
): {
  readonly project: Project;
  readonly id: string;
  readonly from: string;
  readonly to: string;
} {
  refuseArrowPoints(args);
  const from = res.marking(args.from);
  const to = res.marking(args.to);
  const id = crypto.randomUUID();
  const project = createArrow(p, {
    id,
    from,
    to,
    ...(args.style !== undefined ? { style: args.style } : {}),
    ...(args.name !== undefined ? { name: args.name } : {}),
  });
  return { project, id, from, to };
}
