import type { ComponentDrawings } from './componentDrawings';
import { effectiveDensity } from './density';
import type { AnnotationIssue } from './issues';
import { projectIndex } from './projectIndex';
import { tableRows } from './refs';
import {
  type Spec,
  type SpecAccessibilityLabel,
  type SpecAccessibilityPart,
  type SpecAnnotationType,
  type SpecTouchTarget,
  type SpecTypeAccessibility,
} from './spec';
import { isInteractive } from './specAccessibility';
import { typeOfAnnotation } from './specLookup';
import { isEmptyValue } from './typed';
import type { Annotation, JsonValue, Project, Rect } from './types';

// Accessibility audit (stage #1126, A1; decisions 5 and 7 of #1081): from the `accessibility` of the
// specialization (`formatVersion` 18) it derives, per annotation, the `accessible-label-missing`
// pending items and the `touch-target-small` warnings. Pure, computed and never stored. The audit is
// not part of `projectIssues`: whoever shows it (the panel, the list, the MCP) joins both.

/** A size in component units or in image pixels. */
export interface AuditSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Warning (not an issue: it does not count as incomplete) of a marking whose rectangle is below the
 * minimum touch area. `actual` and `min` are in component units, `minPx` in image pixels.
 */
export interface AuditFinding {
  readonly code: 'touch-target-small';
  readonly annotationId: string;
  readonly markingId: string;
  readonly actual: AuditSize;
  readonly min: AuditSize;
  readonly minPx: AuditSize;
  /** Image pixels per component unit of the marking's space. */
  readonly density: number;
}

export interface AnnotationAudit {
  readonly issues: readonly AnnotationIssue[];
  readonly findings: readonly AuditFinding[];
}

/** Only the annotations that have something to say. */
export type AccessibilityAudit = ReadonlyMap<string, AnnotationAudit>;

export interface AuditContext {
  /**
   * Component drawings (`createDrawingCache`): a part whose field is inactive (a child fills its
   * slot) is skipped. Without it, or without the marking's drawing, no part is skipped.
   */
  readonly drawings?: ComponentDrawings;
}

/** A density as text: up to 3 decimals, no trailing zeros (`2.625`, `3`). */
export function densityText(density: number): string {
  return String(Number(density.toFixed(3)));
}

// --- The resolved accessibility of a specialization (memoized per `Spec`) ---

interface ResolvedLabel {
  /** Field keys (a part of a table: the columns of the table). */
  readonly fields: readonly string[];
  readonly required: boolean;
}

interface ResolvedPart {
  readonly id: string;
  readonly name: string;
  /** The part's role; `button` when the specialization does not say. */
  readonly role: string;
  /** The `when` as written (a field, a table or `<table>.<column>`). */
  readonly when: string;
  /** The table of a table part; `null` for a field part. */
  readonly table: string | null;
  /** `<table>.<column>`: the column that has to have a value for the row to have the part. */
  readonly whenColumn: string | null;
  readonly label: ResolvedLabel | null;
}

interface ResolvedType {
  /** The type's role; `undefined` when it has none. */
  readonly role: string | undefined;
  /** Label of the type; `null` when the type is not audited by itself. */
  readonly label: ResolvedLabel | null;
  /** The touch area to audit (`visual` mode only); `null` when there is none to audit. */
  readonly touch: SpecTouchTarget | null;
  readonly parts: readonly ResolvedPart[];
}

type ResolvedSpec = ReadonlyMap<string, ResolvedType>;

const isAudited = (role: string | undefined): boolean =>
  role !== undefined && role !== 'none';

function resolveLabel(
  label: SpecAccessibilityLabel | undefined,
  role: string,
  columnsOf: string | null,
): ResolvedLabel | null {
  if (label === undefined) return null;
  const prefix = columnsOf === null ? '' : `${columnsOf}.`;
  return {
    fields: label.fields.map((f) => (f.startsWith(prefix) ? f.slice(prefix.length) : f)),
    required: label.required ?? isInteractive(role),
  };
}

function resolvePart(
  part: SpecAccessibilityPart,
  tables: ReadonlySet<string>,
): ResolvedPart {
  const dot = part.when.indexOf('.');
  const head = dot < 0 ? part.when : part.when.slice(0, dot);
  const table = tables.has(head) ? head : null;
  return {
    id: part.id,
    name: part.name ?? part.id,
    role: part.role ?? 'button',
    when: part.when,
    table,
    whenColumn: table !== null && dot >= 0 ? part.when.slice(dot + 1) : null,
    label: resolveLabel(part.label, part.role ?? 'button', table),
  };
}

function resolveTouch(
  type: SpecAnnotationType,
  root: SpecTouchTarget | undefined,
): SpecTouchTarget | null {
  const own = type.accessibility?.touchTarget;
  const touch = own === undefined ? root : own;
  return touch === undefined || touch === false || touch.mode === 'expanded'
    ? null
    : touch;
}

function resolveType(
  type: SpecAnnotationType,
  root: SpecTouchTarget | undefined,
): ResolvedType | null {
  if (type.accessibility === undefined) return null;
  const a: SpecTypeAccessibility = type.accessibility;
  const tables = new Set(type.fields.filter((f) => f.type === 'table').map((f) => f.key));
  return {
    role: a.role,
    label: isAudited(a.role) ? resolveLabel(a.label, a.role ?? '', null) : null,
    touch: isInteractive(a.role) ? resolveTouch(type, root) : null,
    parts: (a.parts ?? []).map((part) => resolvePart(part, tables)),
  };
}

const resolvedSpecs = new WeakMap<Spec, ResolvedSpec>();

function resolveSpec(spec: Spec): ResolvedSpec {
  const cached = resolvedSpecs.get(spec);
  if (cached) return cached;
  const root = spec.accessibility?.touchTarget;
  const out = new Map<string, ResolvedType>();
  for (const layer of spec.layers) {
    for (const type of layer.annotationTypes) {
      const resolved = resolveType(type, root);
      if (resolved !== null) out.set(type.id, resolved);
    }
  }
  resolvedSpecs.set(spec, out);
  return out;
}

// --- The audit ---

type Values = Readonly<Record<string, JsonValue>>;

const hasValue = (values: Values, key: string): boolean => !isEmptyValue(values[key]);

/** The label is empty: none of its fields has a value. */
const labelEmpty = (label: ResolvedLabel, values: Values): boolean =>
  label.required && !label.fields.some((key) => hasValue(values, key));

function typeIssues(label: ResolvedLabel | null, values: Values): AnnotationIssue[] {
  if (label === null || !labelEmpty(label, values)) return [];
  return [{ code: 'accessible-label-missing', key: label.fields[0] ?? '' }];
}

function partOf(part: ResolvedPart): { id: string; name: string } {
  return { id: part.id, name: part.name };
}

function fieldPartIssues(part: ResolvedPart, values: Values): AnnotationIssue[] {
  if (part.label === null || !hasValue(values, part.when)) return [];
  if (!labelEmpty(part.label, values)) return [];
  return [
    {
      code: 'accessible-label-missing',
      key: part.label.fields[0] ?? '',
      part: partOf(part),
    },
  ];
}

function tablePartIssues(
  part: ResolvedPart,
  table: string,
  values: Values,
): AnnotationIssue[] {
  const label = part.label;
  if (label === null || !label.required) return [];
  const issues: AnnotationIssue[] = [];
  for (const row of tableRows(values[table])) {
    if (part.whenColumn !== null && isEmptyValue(row[part.whenColumn])) continue;
    if (label.fields.some((column) => !isEmptyValue(row[column]))) continue;
    issues.push({
      code: 'accessible-label-missing',
      key: table,
      column: label.fields[0] ?? '',
      rowId: row._id,
      part: partOf(part),
    });
  }
  return issues;
}

/** The fields that a child's slot takes over (`ComponentDrawing.inactiveFields`): only the keys are read. */
type FieldSet = { has(key: string): boolean };

/** The part is not drawn: a child fills the slot that its field is the default content of. */
function isInactive(part: ResolvedPart, inactive: FieldSet | undefined) {
  if (inactive === undefined) return false;
  return inactive.has(part.when) || (part.table !== null && inactive.has(part.table));
}

function partsIssues(
  parts: readonly ResolvedPart[],
  values: Values,
  inactive: FieldSet | undefined,
): AnnotationIssue[] {
  const issues: AnnotationIssue[] = [];
  for (const part of parts) {
    if (isInactive(part, inactive)) continue;
    issues.push(
      ...(part.table === null
        ? fieldPartIssues(part, values)
        : tablePartIssues(part, part.table, values)),
    );
  }
  return issues;
}

/** Pixels (image) a component size is worth; absorbs the floating point noise before `ceil`. */
const toPixels = (units: number, density: number): number =>
  Math.ceil(Number((units * density).toFixed(6)));

function touchFindings(
  p: Project,
  a: Annotation,
  touch: SpecTouchTarget | null,
): AuditFinding[] {
  if (touch === null) return [];
  const marking = projectIndex(p).markings.get(a.markingId);
  if (marking === undefined) return [];
  const density = effectiveDensity(p, marking.containerId);
  const minPx = {
    width: toPixels(touch.width, density),
    height: toPixels(touch.height, density),
  };
  const r: Rect = marking.rect;
  // 1 px of tolerance per axis (like the slots' `SLOT_TOLERANCE`).
  if (r.width >= minPx.width - 1 && r.height >= minPx.height - 1) return [];
  return [
    {
      code: 'touch-target-small',
      annotationId: a.id,
      markingId: marking.id,
      actual: { width: r.width / density, height: r.height / density },
      min: { width: touch.width, height: touch.height },
      minPx,
      density,
    },
  ];
}

function auditAnnotation(
  p: Project,
  a: Annotation,
  resolved: ResolvedType,
  ctx: AuditContext,
): AnnotationAudit | null {
  const values = a.values ?? {};
  const drawing = ctx.drawings?.get(a.markingId);
  const inactive = drawing?.annotationId === a.id ? drawing.inactiveFields : undefined;
  const issues = [
    ...typeIssues(resolved.label, values),
    ...partsIssues(resolved.parts, values, inactive),
  ];
  const findings = touchFindings(p, a, resolved.touch);
  return issues.length === 0 && findings.length === 0 ? null : { issues, findings };
}

function computeAudit(p: Project, ctx: AuditContext): AccessibilityAudit {
  const out = new Map<string, AnnotationAudit>();
  const arrows = projectIndex(p).arrows;
  for (const a of p.annotations) {
    const type = a.type && a.values ? typeOfAnnotation(p, a) : null;
    const resolved = type && resolveSpec(type.spec).get(type.type.id);
    if (!resolved) continue;
    // An arrow has no rectangle: only the label is audited, never the touch.
    const own = arrows.has(a.markingId) ? { ...resolved, touch: null } : resolved;
    const entry = auditAnnotation(p, a, own, ctx);
    if (entry) out.set(a.id, entry);
  }
  return out;
}

const NO_DRAWINGS_KEY: object = {};
const audits = new WeakMap<Project, WeakMap<object, AccessibilityAudit>>();

/**
 * The accessibility audit of the project: `accessible-label-missing` (issues) and
 * `touch-target-small` (warnings) per annotation, only for the ones that have something. The result
 * is the same object for the same project and `ctx.drawings`.
 */
export function accessibilityAudit(
  p: Project,
  ctx: AuditContext = {},
): AccessibilityAudit {
  const key = ctx.drawings ?? NO_DRAWINGS_KEY;
  let byDrawings = audits.get(p);
  if (!byDrawings) {
    byDrawings = new WeakMap();
    audits.set(p, byDrawings);
  }
  let audit = byDrawings.get(key);
  if (!audit) {
    audit = computeAudit(p, ctx);
    byDrawings.set(key, audit);
  }
  return audit;
}

// --- What the code needs (stage #1128, decision 9 of #1081): role, label and parts of an annotation ---

/** One part of an annotation as the code sees it: a field part once, a table part once per row. */
export interface PartAccessibility {
  readonly id: string;
  readonly role: string;
  /** The first label field with a value; `null` when none has. */
  readonly label: string | null;
  /** The part has a required label and it is empty: the mapping lacks it. */
  readonly missing?: true;
  /** The row (from 0) of a part of a table. */
  readonly row?: number;
}

/**
 * The accessibility an annotation hands to the code. `label: null` with `missing` is a required label that is
 * empty (the mapping lacks it); `label: null` alone is an interactive role that declares no label (the name comes
 * from the code). Only what exists is there: a type with no `accessibility` gives `null`.
 */
export interface AnnotationAccessibility {
  readonly role?: string;
  readonly label?: string | null;
  readonly missing?: true;
  readonly parts?: readonly PartAccessibility[];
}

const textOfValue = (value: JsonValue | undefined): string =>
  typeof value === 'string' ? value : String(value);

/** The label of a role: the first field with a value, else `null` (`missing` when it is required). */
function labelOf(
  label: ResolvedLabel | null,
  values: Values,
  interactive: boolean,
): { label?: string | null; missing?: true } {
  if (label === null) return interactive ? { label: null } : {};
  const key = label.fields.find((field) => hasValue(values, field));
  if (key !== undefined) return { label: textOfValue(values[key]) };
  return label.required ? { label: null, missing: true } : { label: null };
}

/** A part always carries its label: the value, or `null` (with `missing` when it is required). */
function partLabel(
  part: ResolvedPart,
  values: Values,
): { label: string | null; missing?: true } {
  const { label, missing } = labelOf(part.label, values, true);
  return { label: label ?? null, ...(missing ? { missing } : {}) };
}

function fieldPart(part: ResolvedPart, values: Values): PartAccessibility[] {
  if (!hasValue(values, part.when)) return [];
  return [{ id: part.id, role: part.role, ...partLabel(part, values) }];
}

function tableParts(
  part: ResolvedPart,
  table: string,
  values: Values,
): PartAccessibility[] {
  const found: PartAccessibility[] = [];
  tableRows(values[table]).forEach((row, index) => {
    if (part.whenColumn !== null && isEmptyValue(row[part.whenColumn])) return;
    found.push({
      id: part.id,
      role: part.role,
      ...partLabel(part, row),
      row: index,
    });
  });
  return found;
}

/**
 * The accessibility of annotation `a` for the code, from the specialization's `accessibility`, or `null` when the
 * type has none (or nothing to say). `inactive` is the drawing's `inactiveFields`: a part whose field is the
 * default content of a full slot is not drawn, so it is not there (the child answers by its own type).
 */
export function annotationAccessibility(
  p: Project,
  a: Annotation,
  inactive?: FieldSet,
): AnnotationAccessibility | null {
  const type = a.type && a.values ? typeOfAnnotation(p, a) : null;
  const resolved = type && resolveSpec(type.spec).get(type.type.id);
  if (!resolved) return null;
  const values = a.values ?? {};
  const parts = resolved.parts.flatMap((part) =>
    isInactive(part, inactive)
      ? []
      : part.table === null
        ? fieldPart(part, values)
        : tableParts(part, part.table, values),
  );
  const out: AnnotationAccessibility = {
    ...(resolved.role === undefined ? {} : { role: resolved.role }),
    ...labelOf(resolved.label, values, isInteractive(resolved.role)),
    ...(parts.length === 0 ? {} : { parts }),
  };
  return Object.keys(out).length === 0 ? null : out;
}

// --- The accessibility of a type, resolved (what the specialization says once the defaults are applied) ---

/** A label as the type declares it: the fields (as written) and whether it is required (the default of the role). */
export interface TypeAccessibilityLabel {
  readonly fields: readonly string[];
  readonly required: boolean;
}

export interface TypeAccessibilityPart {
  readonly id: string;
  readonly name: string;
  readonly when: string;
  readonly role: string;
  readonly label?: TypeAccessibilityLabel;
}

/** The `accessibility` of a type with the defaults filled in; `touchTarget` is what applies to it (own, else the root's). */
export interface TypeAccessibility {
  readonly role?: string;
  readonly label?: TypeAccessibilityLabel;
  /** The touch area of an interactive type; `false` when the type opts out. */
  readonly touchTarget?: (SpecTouchTarget & { readonly mode: string }) | false;
  readonly parts?: readonly TypeAccessibilityPart[];
}

function declaredLabel(
  label: SpecAccessibilityLabel | undefined,
  role: string,
): { label?: TypeAccessibilityLabel } {
  return label === undefined
    ? {}
    : {
        label: {
          fields: [...label.fields],
          required: label.required ?? isInteractive(role),
        },
      };
}

function declaredTouch(
  type: SpecAnnotationType,
  root: SpecTouchTarget | undefined,
): Pick<TypeAccessibility, 'touchTarget'> {
  const own = type.accessibility?.touchTarget;
  const touch = own === undefined ? root : own;
  if (touch === undefined) return {};
  return {
    touchTarget: touch === false ? false : { ...touch, mode: touch.mode ?? 'visual' },
  };
}

/** The type's accessibility resolved (`get_component` and the type views); `null` when it has none. */
export function typeAccessibility(
  spec: Spec,
  type: SpecAnnotationType,
): TypeAccessibility | null {
  const a = type.accessibility;
  if (a === undefined) return null;
  const parts = (a.parts ?? []).map((part): TypeAccessibilityPart => ({
    id: part.id,
    name: part.name ?? part.id,
    when: part.when,
    role: part.role ?? 'button',
    ...declaredLabel(part.label, part.role ?? 'button'),
  }));
  return {
    ...(a.role === undefined ? {} : { role: a.role }),
    ...declaredLabel(a.label, a.role ?? ''),
    ...(isInteractive(a.role)
      ? declaredTouch(type, spec.accessibility?.touchTarget)
      : {}),
    ...(parts.length === 0 ? {} : { parts }),
  };
}
