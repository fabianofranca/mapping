import type {
  Spec,
  SpecAnnotationType,
  SpecChildRole,
  SpecField,
  SpecFont,
  SpecMigration,
  SpecMigrationStep,
} from './spec';
import { templateMessage, type ModelMessageTemplateCode } from './messages';

// Version contract of a library package (formatVersion 4): classifies the difference between
// two versions of the same specialization as additive or breaking, and says which breaks the
// declared `migrations` cover. See docs/SPEC-FORMAT.md. Pure and with no browser APIs (reused by the MCP).
//
// What is a break (and only this): removing or renaming a type, field or `enum` option; making a
// field required (including a new field that is born required); changing a field's `type`;
// removing a role (`id`) from a type's `childRoles`, including the type that loses all of them
// (`removed-role`); and a type with no `childRoles` that gets some (`roles-required`, only that:
// the roles of the already existing link must be assigned). A new role on a type that already had
// roles is additive (`added-role`). Everything else is additive. Left OUT of the contract, on
// purpose: layers, `labelField`, `allowedChildren` (ids and clauses), `groups`, `name`/`description`
// and the order of the roles, `childRolesLabel`, `docRepos` and the `doc` object (v11),
// `requiresOwner`, `description`, `tags`, `code`, `platforms`, `sources`, `notices` (and a type's
// layer change; `appliesTo` only yields the additive notice `changed-applies-to`), plus removing a
// `component`/`doc`/example/font: none of that generates a `SpecChange`. The roles of a renamed
// type are not compared: the type is the `id`, and the old owner and the new type are different
// types (`removed-type` and `added-type`). A rename is indistinguishable from remove + add; whoever
// renames declares it in a `rename-*` step, and that is what sets it apart from a removal.
//
// Identity, never position: the type is the `id` (unique across the whole specialization, in any
// layer), the field is the `key` within the type, the option is the text within the `enum` field,
// the example is the `name` within the type and the font is the `family` + `weight` + `style` pair.
//
// `table` columns count as fields of the type: a removed column, one with a changed `type`, one
// that became required or a new one already required is a break, with the same code as fields. The
// `path` points to the column (`layers[0].annotationTypes[1].fields[2].columns[0]`) and the
// `fieldKey` has the format `table.column`; a migration step covers the column by citing the same
// `table.column` in `field`/`from`.
//
// Order of the `diffSpecs` list (fixed, the tests depend on it):
//   1. what exists in the NEW version, in the order of the new file (layers and types in order):
//      in each already existing type, first the fields (per field: type changed, became required
//      and then the new options or the columns, recursively), then `component`
//      (`added-component` or `changed-component`), `changed-applies-to`, `doc` and the new
//      examples and, last, the roles (`roles-required` or the `added-role`s, in the order of the
//      new file); a new type yields only `added-type`; finally the new fonts;
//   2. what DISAPPEARED, in the order of the PREVIOUS file: removed types and, in the types that
//      remain, removed fields (and columns) and options, in the order they appeared, and then the
//      removed roles (`removed-role`).
// The `path` is for the new version and, in the `removed-*`, for the previous one.

export type SpecChangeKind = 'additive' | 'breaking';

export type SpecChangeCode =
  | 'added-type'
  | 'added-field'
  | 'added-option'
  | 'added-component'
  | 'added-doc'
  | 'added-example'
  | 'added-font'
  | 'changed-component'
  | 'changed-applies-to'
  | 'removed-type'
  | 'removed-field'
  | 'removed-option'
  | 'removed-role'
  | 'roles-required'
  | 'added-role'
  | 'field-required'
  | 'field-type';

export interface SpecChange {
  readonly kind: SpecChangeKind;
  readonly code: SpecChangeCode;
  /** Path in the new version; in the previous version when the thing ceased to exist. */
  readonly path: string;
  readonly typeId?: string;
  /** The field's key; `table.column` when the change is in a `table` column. */
  readonly fieldKey?: string;
  /** The `enum` option (in `added-option` and `removed-option`). */
  readonly option?: string;
  /** The role's `id` (in `added-role` and `removed-role`). */
  readonly role?: string;
  readonly message: string;
  /** Message code in the `versions` catalog (the interface translates it); `message` is the catalog `en` text. */
  readonly messageCode?: ModelMessageTemplateCode;
  /** The `{parameters}` of the `messageCode`. */
  readonly messageParams?: Readonly<Record<string, string | number>>;
}

type Params = Readonly<Record<string, string | number>>;

/** `message`, `messageCode` and `messageParams` of a catalog message. */
function said(
  code: ModelMessageTemplateCode,
  params: Params,
): Pick<SpecChange, 'message' | 'messageCode' | 'messageParams'> {
  const m = templateMessage(code, params);
  return { message: m.text, messageCode: code, messageParams: params };
}

/** Where we are: the type and, inside a `table`, the table's field. */
interface Where {
  readonly typeId: string;
  /** Path of the field list (`...annotationTypes[1].fields`) or of the columns (`...columns`). */
  readonly listPath: string;
  /** Key of the `table` when the list is the columns one. */
  readonly tableKey?: string;
}

const fieldKeyOf = (w: Where, key: string): string =>
  w.tableKey === undefined ? key : `${w.tableKey}.${key}`;

/** Parameters of the phrase for a field or column; `ref` is the `table.column` that the step cites. */
function subjectParams(w: Where, key: string): Params {
  return w.tableKey === undefined
    ? { key, typeId: w.typeId }
    : { key, typeId: w.typeId, table: w.tableKey, ref: fieldKeyOf(w, key) };
}

/** The field's code or the column's, depending on where we are (one code per variant). */
const variant = (
  w: Where,
  field: ModelMessageTemplateCode,
  column: ModelMessageTemplateCode,
): ModelMessageTemplateCode => (w.tableKey === undefined ? field : column);

function forwardFields(
  previous: readonly SpecField[],
  next: readonly SpecField[],
  w: Where,
  out: SpecChange[],
): void {
  const before = new Map(previous.map((f) => [f.key, f]));
  next.forEach((field, i) => {
    const path = `${w.listPath}[${i}]`;
    const base = { path, typeId: w.typeId, fieldKey: fieldKeyOf(w, field.key) };
    const params = subjectParams(w, field.key);
    const old = before.get(field.key);

    if (old === undefined) {
      if (field.required === true) {
        out.push({
          kind: 'breaking',
          code: 'field-required',
          ...base,
          ...said(
            variant(w, 'versions.fieldNewRequired', 'versions.columnNewRequired'),
            params,
          ),
        });
      } else {
        out.push({
          kind: 'additive',
          code: 'added-field',
          ...base,
          ...said(variant(w, 'versions.fieldNew', 'versions.columnNew'), params),
        });
      }
      return;
    }

    if (old.type !== field.type) {
      out.push({
        kind: 'breaking',
        code: 'field-type',
        ...base,
        ...said(variant(w, 'versions.fieldTypeChanged', 'versions.columnTypeChanged'), {
          ...params,
          from: old.type,
          to: field.type,
        }),
      });
    }
    if (field.required === true && old.required !== true) {
      out.push({
        kind: 'breaking',
        code: 'field-required',
        ...base,
        ...said(
          variant(w, 'versions.fieldBecameRequired', 'versions.columnBecameRequired'),
          params,
        ),
      });
    }
    if (old.type !== field.type) return;

    if (old.type === 'enum' && field.type === 'enum') {
      const had = new Set(old.options);
      field.options.forEach((option, j) => {
        if (had.has(option)) return;
        out.push({
          kind: 'additive',
          code: 'added-option',
          path: `${path}.options[${j}]`,
          typeId: w.typeId,
          fieldKey: base.fieldKey,
          option,
          ...said(variant(w, 'versions.fieldOptionAdded', 'versions.columnOptionAdded'), {
            ...params,
            option,
          }),
        });
      });
    } else if (old.type === 'table' && field.type === 'table') {
      forwardFields(
        old.columns,
        field.columns,
        { typeId: w.typeId, listPath: `${path}.columns`, tableKey: field.key },
        out,
      );
    }
  });
}

function goneFields(
  previous: readonly SpecField[],
  next: readonly SpecField[],
  w: Where,
  out: SpecChange[],
): void {
  const after = new Map(next.map((f) => [f.key, f]));
  previous.forEach((old, i) => {
    const path = `${w.listPath}[${i}]`;
    const fieldKey = fieldKeyOf(w, old.key);
    const params = subjectParams(w, old.key);
    const field = after.get(old.key);

    if (field === undefined) {
      out.push({
        kind: 'breaking',
        code: 'removed-field',
        path,
        typeId: w.typeId,
        fieldKey,
        ...said(variant(w, 'versions.fieldRemoved', 'versions.columnRemoved'), params),
      });
      return;
    }
    if (field.type !== old.type) return;

    if (old.type === 'enum' && field.type === 'enum') {
      const kept = new Set(field.options);
      old.options.forEach((option, j) => {
        if (kept.has(option)) return;
        out.push({
          kind: 'breaking',
          code: 'removed-option',
          path: `${path}.options[${j}]`,
          typeId: w.typeId,
          fieldKey,
          option,
          ...said(
            variant(w, 'versions.fieldOptionRemoved', 'versions.columnOptionRemoved'),
            { ...params, option },
          ),
        });
      });
    } else if (old.type === 'table' && field.type === 'table') {
      goneFields(
        old.columns,
        field.columns,
        { typeId: w.typeId, listPath: `${path}.columns`, tableKey: old.key },
        out,
      );
    }
  });
}

/** New roles (`added-role`) or, in a type that had none, `roles-required`. */
function forwardRoles(
  previous: readonly SpecChildRole[] | undefined,
  next: readonly SpecChildRole[] | undefined,
  typeId: string,
  path: string,
  out: SpecChange[],
): void {
  if (next === undefined || next.length === 0) return;
  if (previous === undefined || previous.length === 0) {
    out.push({
      kind: 'breaking',
      code: 'roles-required',
      path: `${path}.childRoles`,
      typeId,
      ...said('versions.rolesRequired', { typeId }),
    });
    return;
  }
  const had = new Set(previous.map((r) => r.id));
  next.forEach((role, i) => {
    if (had.has(role.id)) return;
    out.push({
      kind: 'additive',
      code: 'added-role',
      path: `${path}.childRoles[${i}]`,
      typeId,
      role: role.id,
      ...said('versions.roleAdded', { typeId, role: role.id }),
    });
  });
}

/** Roles that existed and no longer do (`removed-role`), on the previous version's path. */
function goneRoles(
  previous: readonly SpecChildRole[] | undefined,
  next: readonly SpecChildRole[] | undefined,
  typeId: string,
  path: string,
  out: SpecChange[],
): void {
  const kept = new Set((next ?? []).map((r) => r.id));
  (previous ?? []).forEach((old, i) => {
    if (kept.has(old.id)) return;
    out.push({
      kind: 'breaking',
      code: 'removed-role',
      path: `${path}.childRoles[${i}]`,
      typeId,
      role: old.id,
      ...said('versions.roleRemoved', { typeId, role: old.id }),
    });
  });
}

interface TypeEntry {
  readonly type: SpecAnnotationType;
  readonly path: string;
}

/** The types by `id`, in file order (layers and types); the `id` is unique in the specialization. */
function typesOf(spec: Spec): Map<string, TypeEntry> {
  const types = new Map<string, TypeEntry>();
  spec.layers.forEach((layer, li) => {
    layer.annotationTypes.forEach((type, ti) => {
      if (!types.has(type.id)) {
        types.set(type.id, { type, path: `layers[${li}].annotationTypes[${ti}]` });
      }
    });
  });
  return types;
}

const fontId = (f: SpecFont): string =>
  JSON.stringify([f.family, f.weight ?? null, f.style ?? 'normal']);

/** All the content differences between two versions of the same package (order in the header). */
export function diffSpecs(previous: Spec, next: Spec): SpecChange[] {
  const before = typesOf(previous);
  const after = typesOf(next);
  const out: SpecChange[] = [];

  // 1. What exists in the new version.
  for (const [id, { type, path }] of after) {
    const old = before.get(id);
    if (old === undefined) {
      out.push({
        kind: 'additive',
        code: 'added-type',
        path,
        typeId: id,
        ...said('versions.typeNew', { typeId: id }),
      });
      continue;
    }
    forwardFields(
      old.type.fields,
      type.fields,
      { typeId: id, listPath: `${path}.fields` },
      out,
    );
    if (type.component !== undefined) {
      if (old.type.component === undefined) {
        out.push({
          kind: 'additive',
          code: 'added-component',
          path: `${path}.component`,
          typeId: id,
          ...said('versions.componentAdded', { typeId: id, component: type.component }),
        });
      } else if (old.type.component !== type.component) {
        out.push({
          kind: 'additive',
          code: 'changed-component',
          path: `${path}.component`,
          typeId: id,
          ...said('versions.componentChanged', {
            typeId: id,
            from: old.type.component,
            to: type.component,
          }),
        });
      }
    }
    const oldApplies = [...(old.type.appliesTo ?? ['marking'])].sort().join(', ');
    const newApplies = [...(type.appliesTo ?? ['marking'])].sort().join(', ');
    if (oldApplies !== newApplies) {
      out.push({
        kind: 'additive',
        code: 'changed-applies-to',
        path: `${path}.appliesTo`,
        typeId: id,
        ...said('versions.appliesToChanged', {
          typeId: id,
          now: newApplies,
          before: oldApplies,
        }),
      });
    }
    // The `doc` object (external repository, v11) is outside the contract, as is switching between the forms.
    if (typeof type.doc === 'string' && old.type.doc === undefined) {
      out.push({
        kind: 'additive',
        code: 'added-doc',
        path: `${path}.doc`,
        typeId: id,
        ...said('versions.docAdded', { typeId: id, doc: type.doc }),
      });
    }
    const hadExamples = new Set((old.type.examples ?? []).map((e) => e.name));
    (type.examples ?? []).forEach((example, ei) => {
      if (hadExamples.has(example.name)) return;
      out.push({
        kind: 'additive',
        code: 'added-example',
        path: `${path}.examples[${ei}]`,
        typeId: id,
        ...said('versions.exampleAdded', { typeId: id, name: example.name }),
      });
    });
    forwardRoles(old.type.childRoles, type.childRoles, id, path, out);
  }
  const hadFonts = new Set((previous.fonts ?? []).map(fontId));
  (next.fonts ?? []).forEach((font, i) => {
    if (hadFonts.has(fontId(font))) return;
    out.push({
      kind: 'additive',
      code: 'added-font',
      path: `fonts[${i}]`,
      ...said('versions.fontNew', { family: font.family }),
    });
  });

  // 2. What disappeared, in the order of the previous file.
  for (const [id, { type, path }] of before) {
    const now = after.get(id);
    if (now === undefined) {
      out.push({
        kind: 'breaking',
        code: 'removed-type',
        path,
        typeId: id,
        ...said('versions.typeRemoved', { typeId: id }),
      });
      continue;
    }
    goneFields(
      type.fields,
      now.type.fields,
      { typeId: id, listPath: `${path}.fields` },
      out,
    );
    goneRoles(type.childRoles, now.type.childRoles, id, path, out);
  }
  return out;
}

/**
 * The migration chain from `from` to `next.version`: the entries linked by `from → to`, in
 * order. `[]` when `from` is already the new version; `undefined` if the chain is broken (an
 * entry for a version is missing, or the last goes past `next.version`) or there are no `migrations`.
 * It does not trust that `to > from`: an entry that does not advance breaks the chain, instead of looping.
 */
export function migrationChain(next: Spec, from: number): SpecMigration[] | undefined {
  if (from === next.version) return [];
  if (from > next.version) return undefined;
  const byFrom = new Map<number, SpecMigration>();
  for (const migration of next.migrations ?? []) {
    if (!byFrom.has(migration.from)) byFrom.set(migration.from, migration);
  }
  const chain: SpecMigration[] = [];
  let at = from;
  while (at < next.version) {
    const migration = byFrom.get(at);
    if (migration === undefined || migration.to <= at || migration.to > next.version) {
      return undefined;
    }
    chain.push(migration);
    at = migration.to;
  }
  return chain;
}

/** `true` if `step` covers the break `change` (the table in `migrationFor`). */
function covers(step: SpecMigrationStep, change: SpecChange): boolean {
  const { typeId, fieldKey, option } = change;
  switch (change.code) {
    case 'removed-type':
      return (
        (step.op === 'remove-type' && step.type === typeId) ||
        (step.op === 'rename-type' && step.from === typeId)
      );
    case 'removed-field':
      return (
        (step.op === 'remove-field' && step.type === typeId && step.field === fieldKey) ||
        (step.op === 'rename-field' && step.type === typeId && step.from === fieldKey)
      );
    case 'removed-option':
      return (
        step.op === 'map-values' &&
        step.type === typeId &&
        step.field === fieldKey &&
        option !== undefined &&
        Object.hasOwn(step.values, option)
      );
    case 'field-required':
    case 'field-type':
      return step.op === 'fill-field' && step.type === typeId && step.field === fieldKey;
    default:
      return coversRole(step, change);
  }
}

/** `removed-role` and `roles-required` (the other codes have no role step). */
function coversRole(step: SpecMigrationStep, change: SpecChange): boolean {
  const { typeId, role } = change;
  if (change.code === 'removed-role') {
    return (
      (step.op === 'rename-role' && step.type === typeId && step.from === role) ||
      (step.op === 'remove-role' && step.type === typeId && step.role === role)
    );
  }
  return (
    change.code === 'roles-required' && step.op === 'set-role' && step.type === typeId
  );
}

/**
 * The declared step (in the chain from `from` to `next.version`) that covers the break, if any.
 *
 * | break                        | step that covers it                                            |
 * | ---------------------------- | -------------------------------------------------------------- |
 * | `removed-type`               | `remove-type{type}` ou `rename-type{from: type}`               |
 * | `removed-field`              | `remove-field{type, field}` ou `rename-field{type, from: field}` |
 * | `removed-option`             | `map-values{type, field}` with the option among the `values` keys |
 * | `field-required`, `field-type` | `fill-field{type, field}`                                    |
 * | `removed-role`               | `rename-role{type, from: role}` ou `remove-role{type, role}`   |
 * | `roles-required`             | any `set-role{type}`                                           |
 *
 * Additive change or broken chain: `undefined`.
 */
export function migrationFor(
  next: Spec,
  from: number,
  change: SpecChange,
): SpecMigrationStep | undefined {
  if (change.kind !== 'breaking') return undefined;
  return stepIn(migrationChain(next, from) ?? [], change);
}

/** The first step in the chain that covers the break `change`. */
function stepIn(
  chain: readonly SpecMigration[],
  change: SpecChange,
): SpecMigrationStep | undefined {
  for (const migration of chain) {
    const step = migration.steps.find((s) => covers(s, change));
    if (step !== undefined) return step;
  }
  return undefined;
}

/**
 * The breaks of `diffSpecs(previous, next)` with no step covering them in the chain from
 * `previous.version` to `next.version` (empty list = the contract is fulfilled). Broken chain:
 * all the breaks are missing.

 */
export function missingMigrations(previous: Spec, next: Spec): SpecChange[] {
  const chain = migrationChain(next, previous.version) ?? [];
  return diffSpecs(previous, next).filter(
    (c) => c.kind === 'breaking' && stepIn(chain, c) === undefined,
  );
}
