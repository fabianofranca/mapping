import type { z } from 'zod';
import { addSpecIssue, specMsg, type SpecMsg } from './specIssueCode';
import type { RawField, SpecMigrationStep } from './spec';

// Checks of the `migrations` that a single file allows: versions, unique `from` and, in each step,
// the new side exists and the old side no longer exists. A step's field key is `key` (top-level
// field) or `table.column` (column of a `table` field, which also holds data). Whether the old
// side existed in the previous version is a matter for `diffSpecs`, which compares two versions.
//
// Each step is checked against the types **at its own `to`** (stage #2829, decision 9): the types
// of the file are those of the current `version`, and the ones before are rebuilt backwards by
// undoing the steps of each migration, last first (`add-field` takes the field out, `remove-field`
// puts a placeholder back, the renames go back). A placeholder passes the existence checks and its
// values are not checked: nothing is known of its shape. With a broken chain (no migration starts
// at the `to`), the migration is checked against the types of the file, as before.

type Path = (string | number)[];

/** Adds an error at `migrations[i].steps[j].<key>`. */
export type StepAdd = (key: string | Path, message: string | SpecMsg) => void;

/** The first `formatVersion` with the `add-field` step. */
export const ADD_FIELD_VERSION = 24;
/** The first `formatVersion` with the role steps. */
const ROLE_STEPS_VERSION = 12;
/** The first `formatVersion` with the `copy-field` step. */
const COPY_FIELD_VERSION = 19;

/** What the checks read from the specialization's code, which this module does not import. */
export interface MigrationHelpers {
  /** The column `key` of a `table` field, read like the fields; `undefined` if none. */
  readonly columnOf: (table: RawField, key: string) => RawField | undefined;
  /** Why `value` does not work as the value of a field of this type; `undefined` if it works. */
  readonly valueProblem: (
    type: RawField['type'],
    options: readonly string[] | undefined,
    value: unknown,
  ) => string | undefined;
  /** The field is of the removed type (`REMOVED_FIELD_TYPE`): it is not part of the types. */
  readonly isRemoved: (field: RawField) => boolean;
}

interface MigrationLike {
  readonly from: number;
  readonly to: number;
  readonly steps: readonly SpecMigrationStep[];
}

export interface MigrationSpec {
  readonly version: number;
  readonly formatVersion: number;
  readonly layers: readonly {
    readonly annotationTypes: readonly {
      readonly id: string;
      readonly fields: readonly RawField[];
      readonly childRoles?: readonly { readonly id: string }[] | undefined;
    }[];
  }[];
}

/** "only allowed with formatVersion N". */
function onlyFormat(version: number): SpecMsg {
  return specMsg('spec.onlyFormat', { version: String(version) });
}

// ─── The types at a version ───────────────────────────────────────────────────

/** A type as it was at a version: its fields by key and what is only a placeholder in them. */
interface TypeState {
  readonly fields: ReadonlyMap<string, RawField>;
  /** Keys (and `table.column`) put back by undoing a `remove-field`: they exist, their shape does not show. */
  readonly placeholders: ReadonlySet<string>;
  /** The whole type is a placeholder (undoing a `remove-type`): nothing is known of its fields. */
  readonly placeholder: boolean;
}
type Types = ReadonlyMap<string, TypeState>;
type MutableTypes = Map<string, TypeState>;

const PLACEHOLDER_TYPE: TypeState = {
  fields: new Map(),
  placeholders: new Set(),
  placeholder: true,
};

/** The field that stands for one whose shape is unknown (a placeholder): text. */
function unknownField(key: string): RawField {
  return { key, type: 'string' } as RawField;
}

/** type id → its fields (without the removed type) by key, in the file. */
function currentTypes(spec: MigrationSpec, h: MigrationHelpers): Types {
  const types: MutableTypes = new Map();
  for (const layer of spec.layers) {
    for (const type of layer.annotationTypes) {
      const live = type.fields.filter((f) => !h.isRemoved(f));
      types.set(type.id, {
        fields: new Map(live.map((f) => [f.key, f])),
        placeholders: new Set(),
        placeholder: false,
      });
    }
  }
  return types;
}

/** A step's field key: `key` (top level) or `table.column`. */
type FieldRef =
  | { kind: 'field' }
  | { kind: 'column'; table: string; column: string }
  | { kind: 'invalid'; message: SpecMsg };

function parseFieldRef(ref: string): FieldRef {
  const parts = ref.split('.');
  if (parts.length === 1) return { kind: 'field' };
  if (parts.length > 2) {
    return { kind: 'invalid', message: specMsg('spec.fieldRefManyDots', { ref }) };
  }
  const [table = '', column = ''] = parts;
  if (table === '' || column === '') {
    return { kind: 'invalid', message: specMsg('spec.fieldRefEmptyPart', { ref }) };
  }
  return { kind: 'column', table, column };
}

const hasKey = (raw: unknown, key: string): boolean =>
  typeof raw === 'object' && raw !== null && (raw as { key?: unknown }).key === key;

/** The `table` field with its raw columns changed by `change`. */
function withColumns(
  table: RawField,
  change: (columns: readonly unknown[]) => readonly unknown[],
): RawField {
  return table.type === 'table'
    ? { ...table, columns: [...change(table.columns ?? [])] }
    : table;
}

/** Clones the type's state, to change it. */
function clone(state: TypeState): {
  fields: Map<string, RawField>;
  placeholders: Set<string>;
  placeholder: boolean;
} {
  return {
    fields: new Map(state.fields),
    placeholders: new Set(state.placeholders),
    placeholder: state.placeholder,
  };
}

/** Undoes `add-field`: the field (or column) was not there before. */
function dropField(state: TypeState, key: string): TypeState {
  const ref = parseFieldRef(key);
  const next = clone(state);
  if (ref.kind === 'field') {
    next.fields.delete(key);
  } else if (ref.kind === 'column') {
    const table = next.fields.get(ref.table);
    if (table) {
      next.fields.set(
        ref.table,
        withColumns(table, (columns) => columns.filter((c) => !hasKey(c, ref.column))),
      );
    }
  }
  next.placeholders.delete(key);
  return next;
}

/** Undoes `remove-field`: the field (or column) was there before, with a shape that does not show. */
function putBackField(state: TypeState, key: string): TypeState {
  const ref = parseFieldRef(key);
  const next = clone(state);
  if (ref.kind === 'field') {
    if (!next.fields.has(key)) {
      next.fields.set(key, unknownField(key));
      next.placeholders.add(key);
    }
    return next;
  }
  if (ref.kind === 'invalid' || next.placeholders.has(ref.table)) return state;
  const table = next.fields.get(ref.table);
  if (table === undefined) {
    next.fields.set(ref.table, unknownField(ref.table));
    next.placeholders.add(ref.table);
  } else if (
    table.type === 'table' &&
    !(table.columns ?? []).some((c) => hasKey(c, ref.column))
  ) {
    next.fields.set(
      ref.table,
      withColumns(table, (columns) => [...columns, unknownField(ref.column)]),
    );
    next.placeholders.add(key);
  }
  return next;
}

/** Moves the field `to` back to the name `from`; a field that is not there comes back as a placeholder. */
function moveFieldBack(state: TypeState, from: string, to: string): TypeState {
  if (from === to) return state;
  const next = clone(state);
  const field = next.fields.get(to);
  const wasPlaceholder = next.placeholders.delete(to);
  next.fields.delete(to);
  if (field !== undefined) {
    next.fields.set(from, { ...field, key: from });
    if (wasPlaceholder) next.placeholders.add(from);
  } else if (!next.fields.has(from)) {
    next.fields.set(from, unknownField(from));
    next.placeholders.add(from);
  }
  return next;
}

/** Moves the column `to` of the table back to the name `from` (a missing one comes back as a placeholder). */
function moveColumnBack(
  state: TypeState,
  table: string,
  from: string,
  to: string,
): TypeState {
  const next = clone(state);
  const field = next.fields.get(table);
  if (field?.type !== 'table' || next.placeholders.has(table)) return state;
  const found = (field.columns ?? []).some((c) => hasKey(c, to));
  next.fields.set(
    table,
    withColumns(field, (columns) =>
      found
        ? columns.map((c) => (hasKey(c, to) ? { ...(c as object), key: from } : c))
        : [...columns, unknownField(from)],
    ),
  );
  const wasPlaceholder = next.placeholders.delete(`${table}.${to}`);
  if (wasPlaceholder || !found) next.placeholders.add(`${table}.${from}`);
  return next;
}

/** Undoes `rename-field from → to`. A rename that mixes a field with a column is already an error. */
function renameBack(state: TypeState, from: string, to: string): TypeState {
  const a = parseFieldRef(from);
  const b = parseFieldRef(to);
  if (a.kind === 'field' && b.kind === 'field') return moveFieldBack(state, from, to);
  if (a.kind === 'column' && b.kind === 'column' && a.table === b.table) {
    return moveColumnBack(state, a.table, a.column, b.column);
  }
  return state;
}

function editType(
  types: MutableTypes,
  id: string,
  change: (state: TypeState) => TypeState,
): void {
  const state = types.get(id);
  if (state !== undefined) types.set(id, change(state));
}

/** Undoes one step on `types` (the types after it become the types before it). */
function undoStep(types: MutableTypes, step: SpecMigrationStep): void {
  switch (step.op) {
    case 'add-field':
      return editType(types, step.type, (s) => dropField(s, step.field));
    case 'remove-field':
      return editType(types, step.type, (s) => putBackField(s, step.field));
    case 'rename-field':
      return editType(types, step.type, (s) => renameBack(s, step.from, step.to));
    case 'rename-type': {
      const renamed = types.get(step.to) ?? PLACEHOLDER_TYPE;
      types.delete(step.to);
      types.set(step.from, renamed);
      return;
    }
    case 'remove-type':
      if (!types.has(step.type)) types.set(step.type, PLACEHOLDER_TYPE);
      return;
    default:
      // `map-values`, `fill-field`, `copy-field` and the role steps change no type.
      return;
  }
}

/** The types before the migration, from the ones after it. */
function undoMigration(after: Types, steps: readonly SpecMigrationStep[]): Types {
  const types: MutableTypes = new Map(after);
  for (const step of [...steps].reverse()) undoStep(types, step);
  return types;
}

/**
 * The types at a version, or `undefined` when no chain of migrations leads from it to the current
 * version. The current version is the file's; the others are rebuilt, each from the migration that
 * starts at it, and kept.
 */
function typesByVersion(
  version: number,
  current: Types,
  migrations: readonly MigrationLike[],
): (at: number) => Types | undefined {
  const byFrom = new Map<number, MigrationLike>();
  for (const migration of migrations) {
    if (!byFrom.has(migration.from) && migration.to > migration.from) {
      byFrom.set(migration.from, migration);
    }
  }
  const known = new Map<number, Types | undefined>();
  const typesAt = (at: number): Types | undefined => {
    if (at === version) return current;
    if (known.has(at)) return known.get(at);
    const migration = byFrom.get(at);
    const after = migration === undefined ? undefined : typesAt(migration.to);
    const before =
      migration === undefined || after === undefined
        ? undefined
        : undoMigration(after, migration.steps);
    known.set(at, before);
    return before;
  };
  return typesAt;
}

// ─── Lookups in the types of a version ────────────────────────────────────────

/** What each step check reads: the types of its migration's `to` and where to report. */
interface StepEnv {
  readonly formatVersion: number;
  /** The types at the migration's `to`. */
  readonly types: Types;
  /** The types of the file (the role steps read these), and its roles by type. */
  readonly current: Types;
  readonly roles: ReadonlyMap<string, ReadonlySet<string>>;
  readonly h: MigrationHelpers;
  readonly add: StepAdd;
  /** A `remove-field` that a later `add-field` of the same field, in the same migration, brings back. */
  readonly readded: boolean;
}

/** The type exists in this version (the step deals with one of its fields). */
function typeHere(env: StepEnv, id: string): TypeState | undefined {
  const state = env.types.get(id);
  if (!state) env.add('type', specMsg('spec.typeNotInVersion', { typeId: id }));
  return state;
}

/** Nothing is known of this field's shape: a placeholder, or a column of a placeholder table or type. */
function shapeUnknown(state: TypeState, key: string): boolean {
  if (state.placeholder || state.placeholders.has(key)) return true;
  const ref = parseFieldRef(key);
  return ref.kind === 'column' && state.placeholders.has(ref.table);
}

/** The column of `ref.table` exists (new side). */
function columnHere(
  state: TypeState,
  typeId: string,
  ref: { table: string; column: string },
  where: string,
  env: StepEnv,
): RawField | undefined {
  const key = `${ref.table}.${ref.column}`;
  const table = state.fields.get(ref.table);
  if (!table) {
    env.add(where, specMsg('spec.notFieldOfType', { key: ref.table, typeId }));
    return undefined;
  }
  if (table.type !== 'table') {
    env.add(where, specMsg('spec.notTableOfType', { key: ref.table, typeId }));
    return undefined;
  }
  const column = env.h.columnOf(table, ref.column);
  if (!column) {
    env.add(where, specMsg('spec.notColumnOfTable', { key, table: ref.table, typeId }));
  }
  return column;
}

/** The field (or the column `table.column`) exists on the type (new side). */
function fieldHere(
  state: TypeState,
  typeId: string,
  key: string,
  where: string,
  env: StepEnv,
): RawField | undefined {
  const ref = parseFieldRef(key);
  if (ref.kind === 'invalid') {
    env.add(where, ref.message);
    return undefined;
  }
  if (state.placeholder) return unknownField(key);
  if (ref.kind === 'column') {
    return state.placeholders.has(ref.table)
      ? unknownField(key)
      : columnHere(state, typeId, ref, where, env);
  }
  const field = state.fields.get(key);
  if (!field) env.add(where, specMsg('spec.notFieldOfType', { key, typeId }));
  return field;
}

/** The old side of a column step: a column that still exists in a table of this version. */
function columnGone(
  state: TypeState,
  typeId: string,
  ref: { table: string; column: string },
  where: string,
  env: StepEnv,
): void {
  // Table that no longer exists: the column went with it, and that is what the step declares.
  const table = state.fields.get(ref.table);
  if (!table || state.placeholders.has(ref.table)) return;
  if (table.type !== 'table') {
    env.add(where, specMsg('spec.notTableOfType', { key: ref.table, typeId }));
  } else if (env.h.columnOf(table, ref.column)) {
    env.add(
      where,
      specMsg('spec.columnStillExists', { column: ref.column, table: ref.table, typeId }),
    );
  }
}

/** The field (or the column `table.column`) no longer exists on the type (old side). */
function fieldGone(
  state: TypeState,
  typeId: string,
  key: string,
  where: string,
  env: StepEnv,
): void {
  const ref = parseFieldRef(key);
  if (ref.kind === 'invalid') {
    env.add(where, ref.message);
  } else if (state.placeholder) {
    return; // nothing is known of this type's fields at this version
  } else if (ref.kind === 'field') {
    if (state.fields.has(key)) {
      env.add(where, specMsg('spec.fieldStillExists', { key, typeId }));
    }
  } else {
    columnGone(state, typeId, ref, where, env);
  }
}

function typeGone(env: StepEnv, id: string, where: string): void {
  if (env.types.has(id)) env.add(where, specMsg('spec.typeStillExists', { typeId: id }));
}

// ─── The checks of each step ──────────────────────────────────────────────────

type StepOf<Op extends SpecMigrationStep['op']> = Extract<SpecMigrationStep, { op: Op }>;
type TypeStep = StepOf<'rename-type' | 'remove-type'>;
type FieldStep = StepOf<'rename-field' | 'remove-field' | 'add-field'>;
type ValueStep = StepOf<'map-values' | 'fill-field'>;
type RoleStep = StepOf<'rename-role' | 'remove-role' | 'set-role'>;
type CopyFieldStep = StepOf<'copy-field'>;

function checkTypeStep(step: TypeStep, env: StepEnv): void {
  if (step.op === 'remove-type') return typeGone(env, step.type, 'type');
  if (!env.types.has(step.to)) {
    env.add('to', specMsg('spec.typeNotInVersion', { typeId: step.to }));
  }
  typeGone(env, step.from, 'from');
}

/** `rename-field`, `remove-field` and `add-field`; the last one needs `formatVersion` 24. */
function checkFieldStep(step: FieldStep, env: StepEnv): void {
  if (step.op === 'add-field' && env.formatVersion < ADD_FIELD_VERSION) {
    env.add('op', onlyFormat(ADD_FIELD_VERSION));
    return;
  }
  const state = typeHere(env, step.type);
  if (!state) return;
  if (step.op === 'rename-field') {
    fieldHere(state, step.type, step.to, 'to', env);
    if (!env.readded) fieldGone(state, step.type, step.from, 'from', env);
  } else if (step.op === 'add-field') {
    fieldHere(state, step.type, step.field, 'field', env);
  } else if (!env.readded) {
    fieldGone(state, step.type, step.field, 'field', env);
  }
}

/** `map-values`: the field is an enum and every target is one of its options. */
function checkMapValues(
  step: Extract<SpecMigrationStep, { op: 'map-values' }>,
  field: RawField,
  env: StepEnv,
): void {
  if (field.type !== 'enum') {
    env.add(
      'field',
      specMsg(
        step.field.includes('.')
          ? 'spec.migrationColumnNotEnum'
          : 'spec.codeFieldNotEnum',
        { key: step.field },
      ),
    );
    return;
  }
  for (const [from, to] of Object.entries(step.values)) {
    if (!(field.options ?? []).includes(to)) {
      env.add(['values', from], specMsg('spec.notInOptions', { value: to }));
    }
  }
}

/** `map-values` (the target is an enum with these options) and `fill-field` (the default fits the field). */
function checkValueStep(step: ValueStep, env: StepEnv): void {
  const state = typeHere(env, step.type);
  if (!state) return;
  const field = fieldHere(state, step.type, step.field, 'field', env);
  if (!field || shapeUnknown(state, step.field)) return;
  if (step.op === 'fill-field') {
    const problem = env.h.valueProblem(field.type, field.options, step.default);
    if (problem !== undefined) env.add('default', problem);
    return;
  }
  checkMapValues(step, field, env);
}

/** The role exists on the type (new side). */
function roleHere(
  roles: ReadonlySet<string>,
  typeId: string,
  role: string,
  where: string,
  env: StepEnv,
): void {
  if (!roles.has(role)) env.add(where, specMsg('spec.roleNotOfType', { role, typeId }));
}

/** The role no longer exists on the type (old side). */
function roleGone(
  roles: ReadonlySet<string> | undefined,
  typeId: string,
  role: string,
  where: string,
  env: StepEnv,
): void {
  if (roles?.has(role)) {
    env.add(where, specMsg('spec.roleStillExists', { role, typeId }));
  }
}

/**
 * The role steps (formatVersion 12): `rename-role` and `set-role` require a type of this version
 * with `childRoles`; `remove-role` requires only the type (it may have no roles left). The
 * `childType` of `set-role` only has its format checked by zod, the type need not exist. The
 * roles and the types are those of the file: a role step does not rebuild them backwards.
 */
function checkRoleStep(step: RoleStep, env: StepEnv): void {
  if (env.formatVersion < ROLE_STEPS_VERSION) {
    env.add('op', onlyFormat(ROLE_STEPS_VERSION));
    return;
  }
  if (!env.current.has(step.type)) {
    env.add('type', specMsg('spec.typeNotInVersion', { typeId: step.type }));
    return;
  }
  const roles = env.roles.get(step.type);
  if (step.op === 'remove-role') {
    roleGone(roles, step.type, step.role, 'role', env);
    return;
  }
  if (roles === undefined) {
    env.add('type', specMsg('spec.typeNoRoles', { typeId: step.type }));
    return;
  }
  if (step.op === 'set-role') {
    roleHere(roles, step.type, step.role, 'role', env);
    return;
  }
  roleHere(roles, step.type, step.to, 'to', env);
  roleGone(roles, step.type, step.from, 'from', env);
}

/** The keys of `when` are top-level fields of the type and, in an `enum`, each value is an option. */
function checkCopyWhen(step: CopyFieldStep, state: TypeState, env: StepEnv): void {
  for (const [key, value] of Object.entries(step.when ?? {})) {
    const field = state.fields.get(key);
    if (!field) {
      env.add(['when', key], specMsg('spec.notFieldOfType', { key, typeId: step.type }));
    } else if (field.type === 'table' || field.type === 'ref') {
      env.add(['when', key], specMsg('spec.copyFieldWhenKind'));
    } else if (field.type === 'enum') {
      const list = typeof value === 'object' ? value : [value];
      list.forEach((item, index) => {
        if ((field.options ?? []).includes(String(item))) return;
        const path = typeof value === 'object' ? ['when', key, index] : ['when', key];
        env.add(path, specMsg('spec.notInOptions', { value: String(item) }));
      });
    }
  }
}

/** The shape of `from` and `to` (decision 10 of #2164); `toField` is the field that `to` names. */
function copyShapeProblem(
  step: CopyFieldStep,
  state: TypeState,
  toField: RawField,
): { key: 'from' | 'to'; message: SpecMsg } | undefined {
  const from = parseFieldRef(step.from);
  const to = parseFieldRef(step.to);
  if (step.from === step.to) {
    return { key: 'to', message: specMsg('spec.copyFieldSame') };
  }
  if (from.kind === 'field' && state.fields.get(step.from)?.type === 'table') {
    return { key: 'from', message: specMsg('spec.copyFieldTable') };
  }
  if (toField.type === 'table') {
    return { key: 'to', message: specMsg('spec.copyFieldTable') };
  }
  const sameShape =
    from.kind === to.kind &&
    (from.kind !== 'column' || from.table === (to as typeof from).table);
  return sameShape ? undefined : { key: 'to', message: specMsg('spec.copyFieldMixed') };
}

/**
 * The `copy-field` step (formatVersion 19): `type` and `to` exist in this version; `from` may not
 * (copy, then `remove-field`); both are fields or both are columns of the same table, never a
 * `table` field, never the same; `when` keys are fields of the type.
 */
function checkCopyFieldStep(step: CopyFieldStep, env: StepEnv): void {
  if (env.formatVersion < COPY_FIELD_VERSION) {
    env.add('op', onlyFormat(COPY_FIELD_VERSION));
    return;
  }
  const state = typeHere(env, step.type);
  if (!state) return;
  if (!state.placeholder) checkCopyWhen(step, state, env);
  const toField = fieldHere(state, step.type, step.to, 'to', env);
  const from = parseFieldRef(step.from);
  if (from.kind === 'invalid') env.add('from', from.message);
  if (!toField || from.kind === 'invalid') return;
  const problem = copyShapeProblem(step, state, toField);
  if (problem) env.add(problem.key, problem.message);
}

const isRoleStep = (step: SpecMigrationStep): step is RoleStep =>
  step.op === 'rename-role' || step.op === 'remove-role' || step.op === 'set-role';
const isTypeStep = (step: SpecMigrationStep): step is TypeStep =>
  step.op === 'rename-type' || step.op === 'remove-type';
const isValueStep = (step: SpecMigrationStep): step is ValueStep =>
  step.op === 'map-values' || step.op === 'fill-field';

function checkStep(step: SpecMigrationStep, env: StepEnv): void {
  if (isRoleStep(step)) return checkRoleStep(step, env);
  if (isTypeStep(step)) return checkTypeStep(step, env);
  if (isValueStep(step)) return checkValueStep(step, env);
  if (step.op === 'copy-field') return checkCopyFieldStep(step, env);
  checkFieldStep(step, env);
}

// ─── The migrations ───────────────────────────────────────────────────────────

/** type id → role ids (`childRoles`); a type without `childRoles` is left out. */
function rolesByType(spec: MigrationSpec): Map<string, Set<string>> {
  const roles = new Map<string, Set<string>>();
  for (const layer of spec.layers) {
    for (const type of layer.annotationTypes) {
      if (type.childRoles !== undefined) {
        roles.set(type.id, new Set(type.childRoles.map((r) => r.id)));
      }
    }
  }
  return roles;
}

/** The versions of a migration: unique `from`, `to` greater than `from` and not beyond the `version`. */
function checkVersions(
  migration: MigrationLike,
  version: number,
  fromSeen: Set<number>,
  add: (sub: Path, message: SpecMsg) => void,
): void {
  if (fromSeen.has(migration.from)) {
    add(['from'], specMsg('spec.migrationFromRepeated', { from: migration.from }));
  }
  fromSeen.add(migration.from);
  if (migration.to <= migration.from) {
    add(['to'], specMsg('spec.migrationToGreater', { from: migration.from }));
  }
  if (migration.to > version) {
    add(['to'], specMsg('spec.migrationToMax', { version }));
  }
}

/**
 * A `remove-field` (or the `from` of a `rename-field`) that a later step of the same migration
 * declares back with an `add-field` of the same field: the name is cleared and added again.
 */
function isReadded(steps: readonly SpecMigrationStep[], index: number): boolean {
  const step = steps[index];
  if (step?.op !== 'remove-field' && step?.op !== 'rename-field') return false;
  const field = step.op === 'rename-field' ? step.from : step.field;
  return steps
    .slice(index + 1)
    .some((s) => s.op === 'add-field' && s.type === step.type && s.field === field);
}

/** Checks `migrations` (see the top of the file); the errors go to `ctx` at the exact paths. */
export function checkMigrations(
  spec: MigrationSpec,
  migrations: readonly MigrationLike[],
  ctx: z.RefinementCtx,
  h: MigrationHelpers,
): void {
  const current = currentTypes(spec, h);
  const typesAt = typesByVersion(spec.version, current, migrations);
  const roles = rolesByType(spec);
  const fromSeen = new Set<number>();
  migrations.forEach((migration, mi) => {
    const add = (sub: Path, message: string | SpecMsg) =>
      addSpecIssue(ctx, ['migrations', mi, ...sub], message);
    checkVersions(migration, spec.version, fromSeen, add);
    // Before `add-field` (24) there is no way to bring a removed field back: the checks keep reading the file's types.
    const types =
      (spec.formatVersion >= ADD_FIELD_VERSION ? typesAt(migration.to) : undefined) ??
      current;
    migration.steps.forEach((step, si) => {
      const stepAdd: StepAdd = (key, message) =>
        add(['steps', si, ...(typeof key === 'string' ? [key] : key)], message);
      checkStep(step, {
        formatVersion: spec.formatVersion,
        types,
        current,
        roles,
        h,
        add: stepAdd,
        readded: isReadded(migration.steps, si),
      });
    });
  });
}
