import { z } from 'zod';
import { addSpecIssue, specMsg, type SpecMsg } from './specIssueCode';

// `formatVersion` 18 (stage #1126): `accessibility` at the root (`touchTarget`) and on the type (`role`,
// `label`, `touchTarget`, `parts`). The shapes and the cross checks (the version, the roles, the
// label fields, the parts) live here; the audit that reads them is `accessibility.ts`. The keys are
// outside the version contract (`diffSpecs` ignores them). Platform-neutral: sizes are in "units".

/** First `formatVersion` of `accessibility`. */
export const ACCESSIBILITY_VERSION = 18;

/** First `formatVersion` of `accessibility.variants` (role and label per case of an enum field). */
export const ACCESSIBILITY_VARIANTS_VERSION = 21;

export const ACCESSIBILITY_ROLES = [
  'button',
  'link',
  'checkbox',
  'radio',
  'switch',
  'slider',
  'textbox',
  'searchbox',
  'tab',
  'menuitem',
  'option',
  'image',
  'heading',
  'dialog',
  'navigation',
  'progressbar',
  'none',
] as const;
export type AccessibilityRole = (typeof ACCESSIBILITY_ROLES)[number];

/** Roles of something the person touches: the ones whose touch area and label are audited. */
export const INTERACTIVE_ROLES = [
  'button',
  'link',
  'checkbox',
  'radio',
  'switch',
  'slider',
  'textbox',
  'searchbox',
  'tab',
  'menuitem',
  'option',
] as const;

export type TouchTargetMode = 'visual' | 'expanded';

/** Minimum touch area, in component units; `visual` (default) audits the marked rectangle. */
export interface SpecTouchTarget {
  width: number;
  height: number;
  mode?: TouchTargetMode;
}

/** The first of the fields with a value gives the accessible name. */
export interface SpecAccessibilityLabel {
  fields: string[];
  required?: boolean;
}

export interface SpecAccessibilityPart {
  id: string;
  name?: string;
  when: string;
  label?: SpecAccessibilityLabel;
  role?: AccessibilityRole;
}

/** What a case of `accessibility.variants` replaces: the role and/or the whole label of the base. */
export interface SpecAccessibilityCase {
  role?: AccessibilityRole;
  label?: SpecAccessibilityLabel;
}

/** Role and label per case of an enum field of the type (`formatVersion` 21); the shape of `code.variants`. */
export interface SpecAccessibilityVariants {
  field: string;
  cases: Record<string, SpecAccessibilityCase>;
}

export interface SpecTypeAccessibility {
  role?: AccessibilityRole;
  label?: SpecAccessibilityLabel;
  touchTarget?: SpecTouchTarget | false;
  parts?: SpecAccessibilityPart[];
  variants?: SpecAccessibilityVariants;
}

/** `accessibility` at the root of the specialization. */
export interface SpecAccessibility {
  touchTarget?: SpecTouchTarget;
}

const nonEmpty = z.string().min(1, 'cannot be empty');
const size = z
  .number({ error: 'must be a number' })
  .refine((n) => n > 0, 'must be greater than 0');

const touchTargetShape = z
  .object({
    width: size,
    height: size,
    mode: z
      .enum(['visual', 'expanded'], { error: 'must be "visual" or "expanded"' })
      .optional(),
  })
  .strict();

const labelShape = z
  .object({
    fields: z
      .array(nonEmpty)
      .refine((a) => a.length > 0, 'cannot be empty; list at least one field'),
    required: z.boolean({ error: 'must be true or false' }).optional(),
  })
  .strict();

// The role list is checked by `checkAccessibilityKeys` (the code and the list in the message).
const roleShape = z.string({ error: 'must be text' });

const partShape = z
  .object({
    id: nonEmpty,
    name: nonEmpty.optional(),
    when: nonEmpty,
    label: labelShape.optional(),
    role: roleShape.optional(),
    // Accepted as `unknown` so the error (`a part has no touch target`) sits at the exact path.
    touchTarget: z.unknown().optional(),
  })
  .strict();

const caseShape = z
  .object({ role: roleShape.optional(), label: labelShape.optional() })
  .strict();

const variantsShape = z
  .object({
    field: z
      .string({
        error: (issue) => (issue.input === undefined ? 'required' : 'must be text'),
      })
      .min(1, 'cannot be empty'),
    cases: z.record(z.string(), caseShape, {
      error: (issue) => (issue.input === undefined ? 'required' : 'must be an object'),
    }),
  })
  .strict();

/** `accessibility` of the root: the shape; the version is in `checkAccessibilityKeys`. */
export const accessibilityShape = z
  .object({ touchTarget: touchTargetShape.optional() })
  .strict();

/** `accessibility` of the type: the shape; the version and the cross checks are in `checkAccessibilityKeys`. */
export const typeAccessibilityShape = z
  .object({
    role: roleShape.optional(),
    label: labelShape.optional(),
    touchTarget: z.union([touchTargetShape, z.literal(false)]).optional(),
    parts: z.array(partShape).optional(),
    variants: variantsShape.optional(),
  })
  .strict();

type Path = (string | number)[];
type Add = (path: Path, message: SpecMsg) => void;

interface RawField {
  readonly key: string;
  readonly type: string;
  readonly columns?: readonly unknown[] | undefined;
  readonly options?: readonly string[] | undefined;
}

interface RawLabel {
  readonly fields: readonly string[];
}

interface RawPart {
  readonly id: string;
  readonly when: string;
  readonly label?: RawLabel | undefined;
  readonly role?: string | undefined;
  readonly touchTarget?: unknown;
}

interface RawCase {
  readonly role?: string | undefined;
  readonly label?: RawLabel | undefined;
}

interface RawVariants {
  readonly field: string;
  readonly cases: Readonly<Record<string, RawCase>>;
}

interface RawTypeAccessibility {
  readonly role?: string | undefined;
  readonly label?: RawLabel | undefined;
  readonly touchTarget?: unknown;
  readonly parts?: readonly RawPart[] | undefined;
  readonly variants?: RawVariants | undefined;
}

interface RawType {
  readonly fields: readonly RawField[];
  readonly accessibility?: RawTypeAccessibility | undefined;
}

interface RawSpec {
  readonly formatVersion: number;
  readonly accessibility?: unknown;
  readonly layers: readonly { readonly annotationTypes: readonly RawType[] }[];
}

/** What a field or a column has to be to give a label. */
const isText = (type: unknown): boolean => type === 'string' || type === 'enum';

const isRole = (role: string): boolean =>
  (ACCESSIBILITY_ROLES as readonly string[]).includes(role);

export const isInteractive = (role: string | undefined): boolean =>
  role !== undefined && (INTERACTIVE_ROLES as readonly string[]).includes(role);

function checkRole(role: string | undefined, path: Path, add: Add): void {
  if (role === undefined || isRole(role)) return;
  add(
    path,
    specMsg('spec.accessibilityRoleInvalid', {
      value: role,
      roles: ACCESSIBILITY_ROLES.join(', '),
    }),
  );
}

/** Each key of a label has to be a `string` or `enum` among `candidates` (field or column). */
function checkLabelKeys(
  keys: readonly string[],
  candidates: ReadonlyMap<string, string>,
  path: Path,
  add: Add,
): void {
  keys.forEach((key, i) => {
    const type = candidates.get(key);
    if (type === undefined) {
      add([...path, i], specMsg('spec.accessibilityLabelFieldMissing', { key }));
    } else if (!isText(type)) {
      add([...path, i], specMsg('spec.accessibilityLabelFieldType', { key }));
    }
  });
}

/** Column key → column type of a `table` field. */
function columnsOf(field: RawField): Map<string, string> {
  const out = new Map<string, string>();
  for (const column of field.columns ?? []) {
    if (typeof column !== 'object' || column === null) continue;
    const { key, type } = column as { key?: unknown; type?: unknown };
    if (typeof key === 'string' && typeof type === 'string') out.set(key, type);
  }
  return out;
}

/** The part of a table (`when` is the table or `<table>.<column>`): the table the rows come from. */
interface TableWhen {
  readonly table: string;
  readonly columns: Map<string, string>;
}

type WhenKind = { kind: 'field' } | { kind: 'table'; table: TableWhen } | null;

function resolveWhen(
  when: string,
  fields: ReadonlyMap<string, RawField>,
  path: Path,
  add: Add,
): WhenKind {
  const dot = when.indexOf('.');
  const tableKey = dot < 0 ? when : when.slice(0, dot);
  const field = fields.get(tableKey);
  if (field === undefined || (dot >= 0 && field.type !== 'table')) {
    add(path, specMsg('spec.accessibilityPartWhenInvalid', { when }));
    return null;
  }
  if (field.type !== 'table') return { kind: 'field' };
  const columns = columnsOf(field);
  if (dot >= 0 && !columns.has(when.slice(dot + 1))) {
    add(
      path,
      specMsg('spec.accessibilityPartColumnMissing', {
        table: tableKey,
        column: when.slice(dot + 1),
      }),
    );
    return null;
  }
  return { kind: 'table', table: { table: tableKey, columns } };
}

/** The fields of a table part's label are `<table>.<column>` of the same table. */
function checkTableLabel(
  keys: readonly string[],
  table: TableWhen,
  path: Path,
  add: Add,
): void {
  keys.forEach((key, i) => {
    const dot = key.indexOf('.');
    const owner = dot < 0 ? key : key.slice(0, dot);
    const column = dot < 0 ? '' : key.slice(dot + 1);
    if (dot < 0 || owner !== table.table) {
      add(
        [...path, i],
        specMsg('spec.accessibilityLabelOtherTable', { key, table: table.table }),
      );
      return;
    }
    const type = table.columns.get(column);
    if (type === undefined) {
      add([...path, i], specMsg('spec.accessibilityLabelFieldMissing', { key }));
    } else if (!isText(type)) {
      add([...path, i], specMsg('spec.accessibilityLabelFieldType', { key }));
    }
  });
}

function checkPart(
  part: RawPart,
  path: Path,
  fields: ReadonlyMap<string, RawField>,
  add: Add,
): void {
  checkRole(part.role, [...path, 'role'], add);
  if (part.touchTarget !== undefined) {
    add([...path, 'touchTarget'], specMsg('spec.accessibilityPartNoTouch'));
  }
  const when = resolveWhen(part.when, fields, [...path, 'when'], add);
  if (when === null || part.label === undefined) return;
  const labelPath = [...path, 'label', 'fields'];
  if (when.kind === 'table')
    checkTableLabel(part.label.fields, when.table, labelPath, add);
  else checkLabelKeys(part.label.fields, fieldTypes(fields), labelPath, add);
}

const fieldTypes = (fields: ReadonlyMap<string, RawField>): Map<string, string> =>
  new Map([...fields].map(([key, field]) => [key, field.type]));

function checkParts(
  parts: readonly RawPart[],
  path: Path,
  fields: ReadonlyMap<string, RawField>,
  add: Add,
): void {
  const seen = new Set<string>();
  parts.forEach((part, i) => {
    if (seen.has(part.id)) {
      add([...path, i, 'id'], specMsg('spec.idRepeated', { id: part.id }));
    }
    seen.add(part.id);
    checkPart(part, [...path, i], fields, add);
  });
}

/** The options of the `variants` field; `undefined` (with the error at `field`) when it is not an enum of the type. */
function variantsOptions(
  variants: RawVariants,
  fields: ReadonlyMap<string, RawField>,
  path: Path,
  add: Add,
): readonly string[] | undefined {
  const field = fields.get(variants.field);
  if (field === undefined) {
    add([...path, 'field'], specMsg('spec.notTypeField', { key: variants.field }));
  } else if (field.type !== 'enum') {
    add([...path, 'field'], specMsg('spec.codeFieldNotEnum', { key: variants.field }));
  } else {
    return field.options ?? [];
  }
  return undefined;
}

function checkCase(
  kase: RawCase,
  path: Path,
  fields: ReadonlyMap<string, RawField>,
  add: Add,
): void {
  if (kase.role === undefined && kase.label === undefined) {
    add(path, specMsg('spec.accessibilityVariantEmptyCase'));
    return;
  }
  checkRole(kase.role, [...path, 'role'], add);
  if (kase.label !== undefined) {
    checkLabelKeys(
      kase.label.fields,
      fieldTypes(fields),
      [...path, 'label', 'fields'],
      add,
    );
  }
}

/** `variants`: the field is an `enum` of the type, the cases use its options, each case changes the role or the label. */
function checkVariants(
  variants: RawVariants,
  fields: ReadonlyMap<string, RawField>,
  path: Path,
  add: Add,
): void {
  const options = variantsOptions(variants, fields, path, add);
  const entries = Object.entries(variants.cases);
  if (entries.length === 0) add([...path, 'cases'], specMsg('spec.variantsNoCases'));
  for (const [value, kase] of entries) {
    const casePath = [...path, 'cases', value];
    if (options !== undefined && !options.includes(value)) {
      add(casePath, specMsg('spec.notInOptionsOf', { value, field: variants.field }));
    }
    checkCase(kase, casePath, fields, add);
  }
}

function checkTypeAccessibility(
  a: RawTypeAccessibility,
  type: RawType,
  spec: RawSpec,
  path: Path,
  add: Add,
): void {
  const fields = new Map(type.fields.map((f) => [f.key, f] as const));
  checkRole(a.role, [...path, 'role'], add);
  const roleKnown = a.role === undefined || isRole(a.role);
  if (a.touchTarget !== undefined && roleKnown && !isInteractive(a.role)) {
    add([...path, 'touchTarget'], specMsg('spec.accessibilityTouchNeedsRole'));
  }
  if (a.label !== undefined) {
    checkLabelKeys(a.label.fields, fieldTypes(fields), [...path, 'label', 'fields'], add);
  }
  checkParts(a.parts ?? [], [...path, 'parts'], fields, add);
  if (a.variants === undefined) return;
  if (spec.formatVersion < ACCESSIBILITY_VARIANTS_VERSION) {
    const only = specMsg('spec.onlyFormat', {
      version: String(ACCESSIBILITY_VARIANTS_VERSION),
    });
    add([...path, 'variants'], only);
  } else checkVariants(a.variants, fields, [...path, 'variants'], add);
}

/**
 * `accessibility` (v18): before it, the key at the root and on the type is an error at the exact
 * path; from it, the role is on the list, the touch target only goes with an interactive role, the
 * label fields exist and are `string` or `enum`, and each part has a unique id and a `when` that is
 * a field, a table or `<table>.<column>`.
 */
export function checkAccessibilityKeys(spec: RawSpec, ctx: z.RefinementCtx): void {
  const add: Add = (path, message) => addSpecIssue(ctx, path, message);
  const current = spec.formatVersion >= ACCESSIBILITY_VERSION;
  const only = specMsg('spec.onlyFormat', { version: String(ACCESSIBILITY_VERSION) });
  if (spec.accessibility !== undefined && !current) add(['accessibility'], only);
  spec.layers.forEach((layer, li) => {
    layer.annotationTypes.forEach((type, ti) => {
      if (type.accessibility === undefined) return;
      const path: Path = ['layers', li, 'annotationTypes', ti, 'accessibility'];
      if (!current) add(path, only);
      else checkTypeAccessibility(type.accessibility, type, spec, path, add);
    });
  });
}
