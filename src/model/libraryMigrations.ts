import { annotationWithLinked } from './links';
import { isRecord, parseRefValue } from './refs';
import type { Spec, SpecMigrationStep, SpecSimpleColumn } from './spec';
import { findTypeInSpec } from './specLookup';
import { migrationChain } from './specVersions';
import {
  checkSimpleValue,
  freeVersionOf,
  isEmptyValue,
  type ConvertOptions,
} from './typed';
import type { Annotation, JsonValue, Project, TypedValues } from './types';

// Execution of the `migrations` declared by a new version of the library (Library stage, B4).
// See docs/SPEC-FORMAT.md ("Version contract"). Pure and free of browser APIs (reused by the
// MCP): it receives the project, the NEW specialization and the version the project applied, and returns the
// project with the annotations migrated plus a report per step. Whoever swaps the applied copy, the
// layers and the version is `updateSpecialization` (`specializations.ts`); here the applied
// specialization remains the old one.
//
// Rules:
// - The chain is `migrationChain(next, from)`: the `migrations` entries linked by `from → to`,
//   and the steps of each one in order. Each step operates on the result of the previous one, and identifies
//   the type by the annotation's CURRENT `typeId` at that point (after the earlier renames). A broken
//   chain (or without `migrations`): nothing runs. Only the annotations of `next.id` are touched.
// - A step that finds nothing is a no-op: it stays in the report, with zeros.
// - A step's field key is `key` (top level) or `table.column`; on a column the step
//   applies to each row of the table. `rename-field` between different shapes (field × column, or
//   different tables) has no way to move the value: the `from` ones are deleted (`removed-field`).
// - A loss is a NON-empty value that the step deleted or overwrote (empty: `isEmptyValue`, and a table
//   without rows). `map-values` and `fill-field` prefer the pending item to the loss: a value outside the options
//   stays as it is (`unknown-option`); only what is worth NOTHING in the field's type (`invalid-value`)
//   is replaced by the `default` of `fill-field`, and that is a loss.
// - `rename-field` of a top-level field rewrites the references (`ref`) of the whole project
//   (of any specialization) that point to the field or to a row of its table, in the
//   annotations of the renamed type: the format of the value is what identifies a `ref`, without depending
//   on the specialization (the applied one is still the old one). It applies to the `ref` field and to the cell
//   of a table `ref` column. `refs` counts the rewrites.
// - `remove-type` with `delete` deletes the annotation and the ones linked to it (`annotationWithLinked`),
//   including those of other types and free ones. Each deleted annotation generates a `removed-type` loss,
//   with its `typeId` (`''` if free). `annotations` counts only those of the step's type;
//   `deleted`, all the deleted ones. References that break show up in the impact's `countBrokenRefs`.
// - `remove-type` with `convert` uses `freeVersionOf` on the current project (the old specialization
//   still resolves the type; if it does not, its fallback serves). The converted annotation stays
//   in the layer it was in: if it belongs to the specialization, it becomes the `layer-mismatch` pending item.
// - `rename-type` does not change the annotation's layer (outside the contract: it becomes `layer-mismatch`).
// - Link-role steps (`rename-role`, `remove-role`, `set-role`; `type` is the OWNER's type):
//   the step's children are the annotations whose `parentAnnotationId` points to an annotation of the
//   specialization whose CURRENT `typeId` is the step's `type`. The child can be of any type, of
//   another specialization or free. `annotations` counts the changed children.
//   - `rename-role`: the child with `parentRole === from` becomes `to` (if `to` was already the role of
//     other children, they are merged); no loss.
//   - `remove-role` with `clear`: the child with the role is left without a role and stays linked (loss
//     `cleared-role`). With `unlink`: it leaves the link, without an owner and without a role (loss `unlinked`,
//     also counted in the report's `unlinked`). The loss carries the lost role in `role`.
//   - `set-role`: the child without a role (and of the `childType` type, when given; without `childType`, any
//     one, free or of another specialization) receives the role. Whoever already has a role is not touched;
//     it never generates a loss.
//   - Invariant: a non-null `parentRole` requires a non-null `parentAnnotationId`.
// - Immutable; ids untouched; the other `values` keys stay as they were.

export type MigrationLossReason =
  /** `remove-field` (or an impossible `rename-field`) deleted a non-empty value. */
  | 'removed-field'
  /** `remove-type` with `delete`: the annotation was deleted (the linked ones too). */
  | 'removed-type'
  /** `fill-field` replaced a value that is no longer valid in the field's type. */
  | 'replaced-value'
  /** `rename-field`: the destination field already had a non-empty value and was overwritten. */
  | 'overwritten-value'
  /** `remove-role` with `clear`: the child lost the role (`role`) and stays linked. */
  | 'cleared-role'
  /** `remove-role` with `unlink`: the child left the link with the owner (`role` was the role). */
  | 'unlinked';

export interface MigrationLoss {
  readonly reason: MigrationLossReason;
  readonly annotationId: string;
  readonly markingId: string;
  /** Type of the annotation at the time of the step (`''` on a deleted free linked one). */
  readonly typeId: string;
  /** Key of the field, or `table.column`. Absent in `removed-type`. */
  readonly field?: string;
  /** Row of the table, when the loss is in a cell. */
  readonly rowId?: string;
  /** The lost value. Absent in `removed-type`. */
  readonly value?: JsonValue;
  /** The role the child had, in `cleared-role` and `unlinked`. */
  readonly role?: string;
}

export interface MigrationStepReport {
  /** The `migrations` entry (versions) and the step's position in it. */
  readonly from: number;
  readonly to: number;
  readonly index: number;
  readonly step: SpecMigrationStep;
  /** Annotations of the step's type that it changed, converted or deleted (in the role steps, the changed children). */
  readonly annotations: number;
  /** Values changed (each table cell counts once). */
  readonly values: number;
  /** Annotations converted to free ones (`remove-type` with `convert`). */
  readonly converted: number;
  /** Annotations deleted (`remove-type` with `delete`), with the linked ones. */
  readonly deleted: number;
  /** References (`ref`) rewritten by `rename-field`. */
  readonly refs: number;
  /** Children that left the link with the owner (`remove-role` with `unlink`). */
  readonly unlinked: number;
  readonly losses: readonly MigrationLoss[];
}

export interface MigrationRun {
  /** The project with the annotations migrated; the applied specialization is still the old one. */
  readonly project: Project;
  readonly steps: readonly MigrationStepReport[];
  /** All the losses, in the order of the steps. */
  readonly losses: readonly MigrationLoss[];
}

type Counts = Omit<MigrationStepReport, 'from' | 'to' | 'index' | 'step'>;

interface StepResult {
  readonly project: Project;
  readonly counts: Counts;
}

const NO_COUNTS: Counts = {
  annotations: 0,
  values: 0,
  converted: 0,
  deleted: 0,
  refs: 0,
  unlinked: 0,
  losses: [],
};

/** Empty for the purpose of losses: `isEmptyValue` or a table without rows. */
function isNothingToLose(value: JsonValue | undefined): boolean {
  return isEmptyValue(value) || (Array.isArray(value) && value.length === 0);
}

function sameJson(a: JsonValue | undefined, b: JsonValue | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Where a step's field lives: at the top level or in a table column. */
type Target =
  | { readonly kind: 'field'; readonly key: string }
  | { readonly kind: 'column'; readonly table: string; readonly column: string };

function parseTarget(ref: string): Target {
  const dot = ref.indexOf('.');
  if (dot < 0) return { kind: 'field', key: ref };
  return { kind: 'column', table: ref.slice(0, dot), column: ref.slice(dot + 1) };
}

/** Text of the field in the losses: the `key` or `table.column`. */
const targetName = (t: Target): string =>
  t.kind === 'field' ? t.key : `${t.table}.${t.column}`;

/** What to do with a value: nothing (`undefined`), replace or delete the key. */
type Edit = { readonly set: JsonValue } | { readonly drop: true } | undefined;

interface CellsResult {
  readonly values: TypedValues;
  readonly changed: number;
}

/**
 * Applies `edit` to the field's value (top level) or to each cell of the column (one per row
 * of the table; rows without a text `_id` enter with an undefined `rowId` and items that are not an object
 * stay as they are). `drop` only counts if the key existed.
 */
function editCells(
  values: TypedValues,
  target: Target,
  edit: (value: JsonValue | undefined, rowId: string | undefined) => Edit,
): CellsResult {
  if (target.kind === 'field') {
    const result = applyEdit(values, target.key, edit(values[target.key], undefined));
    return result ?? { values, changed: 0 };
  }
  const rows = values[target.table];
  if (!Array.isArray(rows)) return { values, changed: 0 };
  let changed = 0;
  const next = rows.map((row): JsonValue => {
    if (!isRecord(row)) return row;
    const rowId = typeof row._id === 'string' ? row._id : undefined;
    const result = applyEdit(row, target.column, edit(row[target.column], rowId));
    if (!result) return row;
    changed += result.changed;
    return result.values;
  });
  return changed === 0
    ? { values, changed }
    : { values: { ...values, [target.table]: next }, changed };
}

function applyEdit(
  record: { readonly [key: string]: JsonValue },
  key: string,
  edit: Edit,
): CellsResult | null {
  if (edit === undefined) return null;
  if ('drop' in edit) {
    if (!(key in record)) return null;
    return {
      values: Object.fromEntries(Object.entries(record).filter(([k]) => k !== key)),
      changed: 1,
    };
  }
  return { values: { ...record, [key]: edit.set }, changed: 1 };
}

/** Annotations of `specId` whose current type is `typeId` (the ones a step sees). */
const isOfType = (a: Annotation, specId: string, typeId: string): boolean =>
  a.type?.specId === specId && a.type.typeId === typeId;

/** Rewrites `a.values` with `change`; an annotation without a change comes back the same. */
function withValues(a: Annotation, values: TypedValues): Annotation {
  return values === a.values ? a : { ...a, values };
}

function lossBase(a: Annotation, typeId: string) {
  return { annotationId: a.id, markingId: a.markingId, typeId };
}

// ---------------------------------------------------------------------------
// Steps

function renameType(
  p: Project,
  specId: string,
  step: Extract<SpecMigrationStep, { op: 'rename-type' }>,
): StepResult {
  let annotations = 0;
  const list = p.annotations.map((a) => {
    if (!a.type || !isOfType(a, specId, step.from)) return a;
    annotations++;
    return { ...a, type: { ...a.type, typeId: step.to } };
  });
  return {
    project: annotations === 0 ? p : { ...p, annotations: list },
    counts: { ...NO_COUNTS, annotations },
  };
}

function removeType(
  p: Project,
  specId: string,
  step: Extract<SpecMigrationStep, { op: 'remove-type' }>,
  options: ConvertOptions,
): StepResult {
  const hits = p.annotations.filter((a) => isOfType(a, specId, step.type));
  if (hits.length === 0) return { project: p, counts: NO_COUNTS };
  if (step.mode === 'convert') {
    const ids = new Set(hits.map((a) => a.id));
    return {
      project: {
        ...p,
        annotations: p.annotations.map((a) =>
          ids.has(a.id) ? freeVersionOf(p, a, options) : a,
        ),
      },
      counts: { ...NO_COUNTS, annotations: hits.length, converted: hits.length },
    };
  }
  const doomed = new Set<string>();
  for (const a of hits) for (const id of annotationWithLinked(p, a.id)) doomed.add(id);
  const losses: MigrationLoss[] = [];
  for (const a of p.annotations) {
    if (!doomed.has(a.id)) continue;
    losses.push({ reason: 'removed-type', ...lossBase(a, a.type?.typeId ?? '') });
  }
  return {
    project: { ...p, annotations: p.annotations.filter((a) => !doomed.has(a.id)) },
    counts: {
      ...NO_COUNTS,
      annotations: hits.length,
      deleted: doomed.size,
      losses,
    },
  };
}

/** The reference with the `key` swapped, if it points to a field or row of `ids` with `from`. */
function rewrittenRef(
  value: JsonValue | undefined,
  ids: ReadonlySet<string>,
  from: string,
  to: string,
): JsonValue | null {
  const ref = parseRefValue(value);
  if (!ref || !('key' in ref) || ref.key !== from || !ids.has(ref.annotationId)) {
    return null;
  }
  return { ...ref, key: to };
}

/**
 * Rewrites the `key` of the field and row references that point to `ids`: those of the
 * `ref` fields and those of the cells of `ref` columns of the tables.
 */
function rewriteRefs(
  values: TypedValues,
  ids: ReadonlySet<string>,
  from: string,
  to: string,
): { values: TypedValues; refs: number } {
  let refs = 0;
  let next: { [key: string]: JsonValue } | null = null;
  for (const [key, value] of Object.entries(values)) {
    const rewritten = rewrittenRef(value, ids, from, to);
    if (rewritten) {
      next ??= { ...values };
      next[key] = rewritten;
      refs++;
      continue;
    }
    if (!Array.isArray(value)) continue;
    let changedRows = false;
    const rows = value.map((row): JsonValue => {
      if (!isRecord(row)) return row;
      let newRow: { [key: string]: JsonValue } | null = null;
      for (const [column, cell] of Object.entries(row)) {
        const cellRewritten = column === '_id' ? null : rewrittenRef(cell, ids, from, to);
        if (!cellRewritten) continue;
        newRow ??= { ...row };
        newRow[column] = cellRewritten;
        refs++;
      }
      if (!newRow) return row;
      changedRows = true;
      return newRow;
    });
    if (changedRows) {
      next ??= { ...values };
      next[key] = rows;
    }
  }
  return { values: next ?? values, refs };
}

function renameField(
  p: Project,
  specId: string,
  step: Extract<SpecMigrationStep, { op: 'rename-field' }>,
): StepResult {
  // Renaming to the same name changes nothing (and counts neither values nor references).
  if (step.from === step.to) return { project: p, counts: NO_COUNTS };
  const from = parseTarget(step.from);
  const to = parseTarget(step.to);
  const topLevel = from.kind === 'field' && to.kind === 'field';
  const sameTable =
    from.kind === 'column' && to.kind === 'column' && from.table === to.table;
  // The ids of the type's annotations, before any rewrite, to find the references.
  const ids = new Set(
    topLevel
      ? p.annotations.filter((a) => isOfType(a, specId, step.type)).map((a) => a.id)
      : [],
  );
  const losses: MigrationLoss[] = [];
  let annotations = 0;
  let values = 0;
  let refs = 0;
  const list = p.annotations.map((a) => {
    let current = a;
    if (a.values && isOfType(a, specId, step.type)) {
      const base = lossBase(a, step.type);
      let result: CellsResult;
      if (topLevel || sameTable) {
        // Reads the destination of the same row (or of the top level) so as not to lose what is there.
        result = renameInPlace(a.values, from, to, (loss) =>
          losses.push({ ...base, ...loss }),
        );
      } else {
        result = editCells(a.values, from, (value, rowId) => {
          if (isNothingToLose(value)) return { drop: true };
          losses.push({
            reason: 'removed-field',
            ...base,
            field: targetName(from),
            ...(rowId !== undefined ? { rowId } : {}),
            value: value as JsonValue,
          });
          return { drop: true };
        });
      }
      if (result.changed > 0) {
        annotations++;
        values += result.changed;
        current = withValues(a, result.values);
      }
    }
    if (ids.size > 0 && current.values) {
      const rewritten = rewriteRefs(current.values, ids, step.from, step.to);
      if (rewritten.refs > 0) {
        refs += rewritten.refs;
        current = withValues(current, rewritten.values);
      }
    }
    return current;
  });
  return {
    project: annotations === 0 && refs === 0 ? p : { ...p, annotations: list },
    counts: { ...NO_COUNTS, annotations, values, refs, losses },
  };
}

type LossPart = Pick<MigrationLoss, 'reason' | 'field' | 'rowId' | 'value'>;

/**
 * Renames the key at the top level or, in the same table, in each row. An empty `from` value
 * does not overwrite a filled destination (the destination stays and `from` goes out without a loss);
 * a filled destination different from a filled `from` is overwritten, with a loss.
 */
function renameInPlace(
  values: TypedValues,
  from: Target,
  to: Target,
  loss: (part: LossPart) => void,
): CellsResult {
  const toKey = to.kind === 'field' ? to.key : to.column;
  const fromKey = from.kind === 'field' ? from.key : from.column;
  const rename = (
    record: { readonly [key: string]: JsonValue },
    rowId: string | undefined,
  ): { [key: string]: JsonValue } | null => {
    if (!(fromKey in record)) return null;
    const { [fromKey]: moved, ...rest } = record;
    const old = rest[toKey];
    if (isNothingToLose(moved) && !isNothingToLose(old)) return rest;
    if (!isNothingToLose(old) && !sameJson(old, moved)) {
      loss({
        reason: 'overwritten-value',
        field: targetName(to),
        ...(rowId !== undefined ? { rowId } : {}),
        value: old as JsonValue,
      });
    }
    return { ...rest, [toKey]: moved as JsonValue };
  };
  if (from.kind === 'field') {
    const next = rename(values, undefined);
    return next ? { values: next, changed: 1 } : { values, changed: 0 };
  }
  const rows = values[from.table];
  if (!Array.isArray(rows)) return { values, changed: 0 };
  let changed = 0;
  const list = rows.map((row): JsonValue => {
    if (!isRecord(row)) return row;
    const next = rename(row, typeof row._id === 'string' ? row._id : undefined);
    if (!next) return row;
    changed++;
    return next;
  });
  return changed === 0
    ? { values, changed }
    : { values: { ...values, [from.table]: list }, changed };
}

function removeField(
  p: Project,
  specId: string,
  step: Extract<SpecMigrationStep, { op: 'remove-field' }>,
): StepResult {
  const target = parseTarget(step.field);
  const losses: MigrationLoss[] = [];
  return mapAnnotations(p, specId, step.type, losses, (a) =>
    editCells(a.values ?? {}, target, (value, rowId) => {
      if (!isNothingToLose(value)) {
        losses.push({
          reason: 'removed-field',
          ...lossBase(a, step.type),
          field: targetName(target),
          ...(rowId !== undefined ? { rowId } : {}),
          value: value as JsonValue,
        });
      }
      return { drop: true };
    }),
  );
}

function mapValues(
  p: Project,
  specId: string,
  step: Extract<SpecMigrationStep, { op: 'map-values' }>,
): StepResult {
  const target = parseTarget(step.field);
  return mapAnnotations(p, specId, step.type, [], (a) =>
    editCells(a.values ?? {}, target, (value) =>
      typeof value === 'string' &&
      Object.hasOwn(step.values, value) &&
      step.values[value] !== value
        ? { set: step.values[value] as string }
        : undefined,
    ),
  );
}

/** The column or simple field `target` of the type in the new version, if it exists and is simple. */
function simpleFieldIn(
  next: Spec,
  typeId: string,
  target: Target,
): SpecSimpleColumn | null {
  const type = findTypeInSpec(next, typeId)?.type;
  if (!type) return null;
  if (target.kind === 'field') {
    const field = type.fields.find((f) => f.key === target.key);
    return field && field.type !== 'table' && field.type !== 'ref' ? field : null;
  }
  const table = type.fields.find((f) => f.key === target.table);
  if (table?.type !== 'table') return null;
  const column = table.columns.find((c) => c.key === target.column);
  return column && column.type !== 'ref' ? column : null;
}

function fillField(
  p: Project,
  specId: string,
  next: Spec,
  step: Extract<SpecMigrationStep, { op: 'fill-field' }>,
): StepResult {
  const target = parseTarget(step.field);
  const field = simpleFieldIn(next, step.type, target);
  const losses: MigrationLoss[] = [];
  return mapAnnotations(p, specId, step.type, losses, (a) =>
    editCells(a.values ?? {}, target, (value, rowId) => {
      if (isEmptyValue(value)) return { set: step.default };
      // Only what is worth nothing in the field's type is replaced; `unknown-option` stays pending.
      if (field && checkSimpleValue(field, value as JsonValue) === 'invalid-value') {
        losses.push({
          reason: 'replaced-value',
          ...lossBase(a, step.type),
          field: targetName(target),
          ...(rowId !== undefined ? { rowId } : {}),
          value: value as JsonValue,
        });
        return { set: step.default };
      }
      return undefined;
    }),
  );
}

/** Applies `change` to the annotations with `values` of the step's type and adds up what changed. */
function mapAnnotations(
  p: Project,
  specId: string,
  typeId: string,
  losses: readonly MigrationLoss[],
  change: (a: Annotation) => CellsResult,
): StepResult {
  let annotations = 0;
  let values = 0;
  const list = p.annotations.map((a) => {
    if (!a.values || !isOfType(a, specId, typeId)) return a;
    const result = change(a);
    if (result.changed === 0) return a;
    annotations++;
    values += result.changed;
    return withValues(a, result.values);
  });
  return {
    project: annotations === 0 ? p : { ...p, annotations: list },
    counts: { ...NO_COUNTS, annotations, values, losses },
  };
}

/**
 * Applies `change` to the children of the specialization's annotations whose current type is `ownerType`; the
 * child that `change` returns equal (or `null`) stays as it is. Counts the changed children.
 */
function changeChildren(
  p: Project,
  specId: string,
  ownerType: string,
  change: (child: Annotation) => Annotation | null,
  losses: readonly MigrationLoss[] = [],
): StepResult {
  const owners = new Set(
    p.annotations.filter((a) => isOfType(a, specId, ownerType)).map((a) => a.id),
  );
  let annotations = 0;
  let unlinked = 0;
  const list = p.annotations.map((a) => {
    if (a.parentAnnotationId === null || !owners.has(a.parentAnnotationId)) return a;
    const changed = change(a);
    if (!changed) return a;
    annotations++;
    if (changed.parentAnnotationId === null) unlinked++;
    return changed;
  });
  return {
    project: annotations === 0 ? p : { ...p, annotations: list },
    counts: { ...NO_COUNTS, annotations, unlinked, losses },
  };
}

function renameRole(
  p: Project,
  specId: string,
  step: Extract<SpecMigrationStep, { op: 'rename-role' }>,
): StepResult {
  return changeChildren(p, specId, step.type, (child) =>
    child.parentRole === step.from && step.from !== step.to
      ? { ...child, parentRole: step.to }
      : null,
  );
}

function removeRole(
  p: Project,
  specId: string,
  step: Extract<SpecMigrationStep, { op: 'remove-role' }>,
): StepResult {
  const unlink = step.mode === 'unlink';
  const losses: MigrationLoss[] = [];
  return changeChildren(
    p,
    specId,
    step.type,
    (child) => {
      if (child.parentRole !== step.role) return null;
      losses.push({
        reason: unlink ? 'unlinked' : 'cleared-role',
        ...lossBase(child, child.type?.typeId ?? ''),
        role: step.role,
      });
      return unlink
        ? { ...child, parentAnnotationId: null, parentRole: null }
        : { ...child, parentRole: null };
    },
    losses,
  );
}

function setRole(
  p: Project,
  specId: string,
  step: Extract<SpecMigrationStep, { op: 'set-role' }>,
): StepResult {
  const { childType } = step;
  return changeChildren(p, specId, step.type, (child) => {
    if (child.parentRole !== null) return null;
    if (childType !== undefined && !isOfType(child, specId, childType)) return null;
    return { ...child, parentRole: step.role };
  });
}

function runStep(
  p: Project,
  next: Spec,
  step: SpecMigrationStep,
  options: ConvertOptions,
): StepResult {
  switch (step.op) {
    case 'rename-type':
      return renameType(p, next.id, step);
    case 'remove-type':
      return removeType(p, next.id, step, options);
    case 'rename-field':
      return renameField(p, next.id, step);
    case 'remove-field':
      return removeField(p, next.id, step);
    case 'map-values':
      return mapValues(p, next.id, step);
    case 'fill-field':
      return fillField(p, next.id, next, step);
    case 'rename-role':
      return renameRole(p, next.id, step);
    case 'remove-role':
      return removeRole(p, next.id, step);
    case 'set-role':
      return setRole(p, next.id, step);
  }
}

/**
 * Runs the migrations declared by `next` for a project that applied version `from`:
 * the steps of the `from → next.version` chain, in order. Returns the migrated project and the report
 * per step. Does not swap the applied specialization or the layers (`updateSpecialization`).
 */
export function runLibraryMigrations(
  p: Project,
  next: Spec,
  from: number,
  options: ConvertOptions = {},
): MigrationRun {
  const reports: MigrationStepReport[] = [];
  let project = p;
  for (const migration of migrationChain(next, from) ?? []) {
    migration.steps.forEach((step, index) => {
      const result = runStep(project, next, step, options);
      project = result.project;
      reports.push({
        from: migration.from,
        to: migration.to,
        index,
        step,
        ...result.counts,
      });
    });
  }
  return { project, steps: reports, losses: reports.flatMap((r) => r.losses) };
}
