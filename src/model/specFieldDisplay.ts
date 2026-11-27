import { z } from 'zod';
import { addSpecIssue, specMsg, type SpecMsg } from './specIssueCode';

// `formatVersion` 26 (stage #2918, FG2): field groups and conditional display in Details. `fieldGroups` on
// the type, `group` and `visibleWhen` on a top-level field. The shapes, the cross checks and the pure
// resolver (`fieldDisplay`) live here; the keys change only what Details shows, so they are outside
// the version contract and nothing else reads them (issues, MCP reads, code hints and the drawing).
// No browser APIs: reusable by the MCP server.

/** First `formatVersion` of `fieldGroups`, `group` and `visibleWhen`. */
export const FIELD_DISPLAY_VERSION = 26;

/** Format of a field group id. */
const GROUP_ID_RE = /^[a-z0-9-]+$/;

/** A value of a condition: the stored value of the controlling field, or any of a list of them. */
export type SpecVisibleWhenValue = string | number;

/** `{ "<key>": <value> | [<values>] }`: a list means any of its values, several keys mean all of them. */
export type SpecVisibleWhen = Readonly<
  Record<string, SpecVisibleWhenValue | readonly SpecVisibleWhenValue[]>
>;

/** A group of fields of a type (`fieldGroups`): a collapsible subheading in Details. */
export interface SpecFieldGroup {
  /** `[a-z0-9-]+`, unique in the type. */
  id: string;
  name: string;
  description?: string;
  /** The group shows only while the condition holds (and the field's own, if it has one). */
  visibleWhen?: SpecVisibleWhen;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const requiredText = z
  .string({
    error: (issue) => (issue.input === undefined ? 'required' : 'must be text'),
  })
  .min(1, 'cannot be empty');

/** `visibleWhen`: an object, not empty; the keys and the values are checked by `checkFieldDisplay`. */
export const visibleWhenShape = z
  .custom<SpecVisibleWhen>()
  .superRefine((value: unknown, ctx) => {
    if (!isRecord(value)) {
      ctx.addIssue({ code: 'custom', message: 'must be an object' });
    } else if (Object.keys(value).length === 0) {
      ctx.addIssue({ code: 'custom', message: 'cannot be empty' });
    }
  });

/** An item of a type's `fieldGroups`. */
export const fieldGroupShape = z
  .object({
    // The pattern already refuses the empty text, so no `.min(1)` (one error, not two).
    id: z
      .string({
        error: (issue) => (issue.input === undefined ? 'required' : 'must be text'),
      })
      .regex(GROUP_ID_RE, 'invalid field group id; use [a-z0-9-]+'),
    name: requiredText,
    description: z.string().optional(),
    visibleWhen: visibleWhenShape.optional(),
  })
  .strict();

/** The part of a field that the checks read. */
interface CheckField {
  key: string;
  type: string;
  options?: readonly string[] | undefined;
  required?: boolean | undefined;
  group?: string | undefined;
  visibleWhen?: unknown;
}

interface CheckType {
  fields: readonly CheckField[];
  fieldGroups?: readonly { id: string; visibleWhen?: unknown }[] | undefined;
}

type Path = (string | number)[];

const onlyFormat = (): SpecMsg =>
  specMsg('spec.onlyFormat', { version: String(FIELD_DISPLAY_VERSION) });

/** Types of field that a condition can cite. */
const CITABLE = new Set(['enum', 'string', 'number']);

/** Before 26, each of the keys is an error at its exact path. */
function checkNoFieldDisplay(type: CheckType, path: Path, ctx: z.RefinementCtx): void {
  if (type.fieldGroups !== undefined) {
    addSpecIssue(ctx, [...path, 'fieldGroups'], onlyFormat());
  }
  type.fields.forEach((field, fi) => {
    for (const key of ['group', 'visibleWhen'] as const) {
      if (field[key] !== undefined) {
        addSpecIssue(ctx, [...path, 'fields', fi, key], onlyFormat());
      }
    }
  });
}

/** One value of a condition against the field it reads. */
function checkValue(
  target: CheckField,
  value: unknown,
  path: Path,
  ctx: z.RefinementCtx,
): void {
  if (target.type === 'string') {
    if (typeof value !== 'string') addSpecIssue(ctx, path, specMsg('spec.mustBeText'));
  } else if (target.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      addSpecIssue(ctx, path, specMsg('spec.valueMustBeNumber'));
    }
  } else if (typeof value !== 'string' || !(target.options ?? []).includes(value)) {
    addSpecIssue(ctx, path, specMsg('spec.notInOptions', { value: String(value) }));
  }
}

/** What a condition may not cite, besides the fields that do not exist. */
interface Citing {
  /** The key of the field that holds the condition (a field condition only). */
  self?: string;
  /** Keys of the fields of the group that holds the condition (a group condition only). */
  own?: ReadonlySet<string>;
}

/** The problem with citing `target` from this condition; `undefined` if it can be cited. */
function citeProblem(
  key: string,
  target: CheckField | undefined,
  citing: Citing,
): SpecMsg | undefined {
  if (target === undefined) return specMsg('spec.visibleWhenUnknownField', { key });
  if (citing.self === key) return specMsg('spec.visibleWhenSelf');
  if (citing.own?.has(key)) return specMsg('spec.visibleWhenOwnGroup', { key });
  if (!CITABLE.has(target.type)) {
    return specMsg('spec.visibleWhenFieldType', { key, type: target.type });
  }
  return undefined;
}

/** A `visibleWhen` (of a field or of a group): the keys it cites and each value. */
function checkCondition(
  when: unknown,
  path: Path,
  fields: ReadonlyMap<string, CheckField>,
  citing: Citing,
  ctx: z.RefinementCtx,
): void {
  if (!isRecord(when)) return;
  for (const [key, wanted] of Object.entries(when)) {
    const target = fields.get(key);
    const problem = citeProblem(key, target, citing);
    if (problem !== undefined) {
      addSpecIssue(ctx, [...path, key], problem);
    } else if (target !== undefined && Array.isArray(wanted)) {
      if (wanted.length === 0) addSpecIssue(ctx, [...path, key], 'cannot be empty');
      wanted.forEach((item, i) => checkValue(target, item, [...path, key, i], ctx));
    } else if (target !== undefined) {
      checkValue(target, wanted, [...path, key], ctx);
    }
  }
}

/** Group ids: unique in the type. Returns the index of each. */
function checkGroupIds(
  type: CheckType,
  path: Path,
  ctx: z.RefinementCtx,
): Map<string, number> {
  const indexOf = new Map<string, number>();
  (type.fieldGroups ?? []).forEach((group, gi) => {
    if (indexOf.has(group.id)) {
      addSpecIssue(
        ctx,
        [...path, 'fieldGroups', gi, 'id'],
        specMsg('spec.idRepeated', { id: group.id }),
      );
    } else {
      indexOf.set(group.id, gi);
    }
  });
  return indexOf;
}

/** A field's `group`, `visibleWhen` and `required` (decisions 3 to 5). */
function checkFieldEntry(
  field: CheckField,
  fi: number,
  groupConditions: ReadonlyMap<string, unknown>,
  fields: ReadonlyMap<string, CheckField>,
  path: Path,
  ctx: z.RefinementCtx,
): void {
  const at: Path = [...path, 'fields', fi];
  if (field.group !== undefined && !groupConditions.has(field.group)) {
    addSpecIssue(
      ctx,
      [...at, 'group'],
      specMsg('spec.fieldGroupUnknown', { group: field.group }),
    );
  }
  if (field.visibleWhen !== undefined) {
    checkCondition(
      field.visibleWhen,
      [...at, 'visibleWhen'],
      fields,
      { self: field.key },
      ctx,
    );
  }
  const hidden =
    field.visibleWhen !== undefined ||
    (field.group !== undefined && groupConditions.get(field.group) !== undefined);
  if (field.required === true && hidden) {
    addSpecIssue(ctx, [...at, 'required'], specMsg('spec.visibleWhenRequired'));
  }
}

/** A group's condition and the "no field" error. */
function checkGroupEntry(
  group: { id: string; visibleWhen?: unknown },
  gi: number,
  fields: ReadonlyMap<string, CheckField>,
  members: ReadonlySet<string>,
  path: Path,
  ctx: z.RefinementCtx,
): void {
  const at: Path = [...path, 'fieldGroups', gi];
  if (members.size === 0) {
    addSpecIssue(
      ctx,
      [...at, 'id'],
      specMsg('spec.fieldGroupEmpty', { group: group.id }),
    );
  }
  if (group.visibleWhen !== undefined) {
    checkCondition(
      group.visibleWhen,
      [...at, 'visibleWhen'],
      fields,
      { own: members },
      ctx,
    );
  }
}

/** From 26: the groups, the fields' `group` and the conditions of a type. */
function checkTypeDisplay(type: CheckType, path: Path, ctx: z.RefinementCtx): void {
  const indexOf = checkGroupIds(type, path, ctx);
  const fields = new Map<string, CheckField>();
  for (const field of type.fields) {
    if (!fields.has(field.key)) fields.set(field.key, field);
  }
  const groupConditions = new Map<string, unknown>();
  for (const group of type.fieldGroups ?? []) {
    if (!groupConditions.has(group.id)) groupConditions.set(group.id, group.visibleWhen);
  }
  type.fields.forEach((field, fi) =>
    checkFieldEntry(field, fi, groupConditions, fields, path, ctx),
  );
  (type.fieldGroups ?? []).forEach((group, gi) => {
    if (indexOf.get(group.id) !== gi) return;
    const members = new Set(
      type.fields.filter((f) => f.group === group.id).map((f) => f.key),
    );
    checkGroupEntry(group, gi, fields, members, path, ctx);
  });
}

/**
 * `fieldGroups`, `group` and `visibleWhen` (v26): before it, an error at the exact path of each key;
 * from it, the rules of decisions 3 to 5 (unknown and empty groups, what a condition may cite,
 * the value of each key, and `required` with a condition). The keys on a table column have their own
 * error (`spec.topLevelOnly`, in the field check).
 */
export function checkFieldDisplay(
  spec: {
    formatVersion: number;
    layers: readonly { annotationTypes: readonly CheckType[] }[];
  },
  ctx: z.RefinementCtx,
): void {
  spec.layers.forEach((layer, li) => {
    layer.annotationTypes.forEach((type, ti) => {
      const path: Path = ['layers', li, 'annotationTypes', ti];
      if (spec.formatVersion < FIELD_DISPLAY_VERSION) {
        checkNoFieldDisplay(type, path, ctx);
      } else {
        checkTypeDisplay(type, path, ctx);
      }
    });
  });
}

// ---- The resolver ----

/** The part of a field that `fieldDisplay` reads. */
export interface DisplayFieldLike {
  key: string;
  default?: unknown;
  group?: string | undefined;
  visibleWhen?: SpecVisibleWhen | undefined;
}

/** A field shown on its own, or a group with the fields of it that are shown. */
export type DisplayItem<F extends DisplayFieldLike = DisplayFieldLike> =
  { kind: 'field'; field: F } | { kind: 'group'; group: SpecFieldGroup; fields: F[] };

export interface FieldDisplay<F extends DisplayFieldLike = DisplayFieldLike> {
  items: DisplayItem<F>[];
  /** Keys of the fields not shown, in the type's order. */
  hidden: string[];
}

/**
 * Whether a condition holds. It reads the stored value; absent or `null` reads the `default` of the
 * cited field, and with none it matches nothing. A list means any of its values; several keys, all.
 */
function holds(
  when: SpecVisibleWhen | undefined,
  values: Readonly<Record<string, unknown>>,
  byKey: ReadonlyMap<string, DisplayFieldLike>,
): boolean {
  if (when === undefined) return true;
  return Object.entries(when).every(([key, wanted]) => {
    const stored = values[key] ?? byKey.get(key)?.default;
    if (stored === undefined || stored === null) return false;
    const list: readonly unknown[] = Array.isArray(wanted) ? wanted : [wanted];
    return list.includes(stored);
  });
}

/** Index of the first field of each key. */
function firstByKey<T extends { key: string }>(fields: readonly T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const field of fields) if (!out.has(field.key)) out.set(field.key, field);
  return out;
}

/** Whether a field shows: kept, or its own condition and its (declared) group's both hold. */
function shownPredicate<F extends DisplayFieldLike>(
  type: { fields: readonly F[]; fieldGroups?: readonly SpecFieldGroup[] | undefined },
  values: Readonly<Record<string, unknown>>,
  keep: ReadonlySet<string>,
  groups: ReadonlyMap<string, SpecFieldGroup>,
): (field: F) => boolean {
  const byKey = firstByKey(type.fields);
  const groupOk = new Map<string, boolean>();
  const holdsFor = (group: SpecFieldGroup): boolean => {
    let ok = groupOk.get(group.id);
    if (ok === undefined) {
      ok = holds(group.visibleWhen, values, byKey);
      groupOk.set(group.id, ok);
    }
    return ok;
  };
  return (field) => {
    if (keep.has(field.key)) return true;
    if (!holds(field.visibleWhen, values, byKey)) return false;
    const group = field.group === undefined ? undefined : groups.get(field.group);
    return group === undefined || holdsFor(group);
  };
}

/**
 * What Details shows of a type (decisions 4, 7 and 8): the fields in the declared order, each group at
 * the position of its first field with its fields together, a field only while its condition and its
 * group's hold, a group only with a field to show. `keep` lists keys shown even if hidden (a pending
 * item, a review mark) and takes their group along. Pure: no browser API.
 */
export function fieldDisplay<F extends DisplayFieldLike>(
  type: {
    fields: readonly F[];
    fieldGroups?: readonly SpecFieldGroup[] | undefined;
  },
  values: Readonly<Record<string, unknown>>,
  keep: ReadonlySet<string>,
): FieldDisplay<F> {
  const groups = firstById(type.fieldGroups ?? []);
  const shown = shownPredicate(type, values, keep, groups);
  const items: DisplayItem<F>[] = [];
  const placed = new Set<string>();
  for (const field of type.fields) {
    const group = field.group === undefined ? undefined : groups.get(field.group);
    if (group === undefined) {
      if (shown(field)) items.push({ kind: 'field', field });
    } else if (!placed.has(group.id)) {
      placed.add(group.id);
      const inside = type.fields.filter((f) => f.group === group.id && shown(f));
      if (inside.length > 0) items.push({ kind: 'group', group, fields: inside });
    }
  }
  const hidden = type.fields.filter((f) => !shown(f)).map((f) => f.key);
  return { items, hidden };
}

function firstById(groups: readonly SpecFieldGroup[]): Map<string, SpecFieldGroup> {
  const out = new Map<string, SpecFieldGroup>();
  for (const group of groups) if (!out.has(group.id)) out.set(group.id, group);
  return out;
}
