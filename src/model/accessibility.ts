import type { ComponentDrawings } from './componentDrawings';
import { effectiveDensity } from './density';
import type { AnnotationIssue } from './issues';
import { projectIndex } from './projectIndex';
import { tableRows } from './refs';
import {
  INTERACTIVE_ROLES,
  type Spec,
  type SpecAccessibilityLabel,
  type SpecAccessibilityPart,
  type SpecAnnotationType,
  type SpecTouchTarget,
  type SpecTypeAccessibility,
} from './spec';
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
export function formatDensity(density: number): string {
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
  /** The `when` as written (a field, a table or `<table>.<column>`). */
  readonly when: string;
  /** The table of a table part; `null` for a field part. */
  readonly table: string | null;
  /** `<table>.<column>`: the column that has to have a value for the row to have the part. */
  readonly whenColumn: string | null;
  readonly label: ResolvedLabel | null;
}

interface ResolvedType {
  /** Label of the type; `null` when the type is not audited by itself. */
  readonly label: ResolvedLabel | null;
  /** The touch area to audit (`visual` mode only); `null` when there is none to audit. */
  readonly touch: SpecTouchTarget | null;
  readonly parts: readonly ResolvedPart[];
}

type ResolvedSpec = ReadonlyMap<string, ResolvedType>;

const isInteractive = (role: string | undefined): boolean =>
  role !== undefined && (INTERACTIVE_ROLES as readonly string[]).includes(role);

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
  if (type.accessibility === undefined && root === undefined) return null;
  const a: SpecTypeAccessibility = type.accessibility ?? {};
  const tables = new Set(type.fields.filter((f) => f.type === 'table').map((f) => f.key));
  return {
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

/** The part is not drawn: a child fills the slot that its field is the default content of. */
function isInactive(
  part: ResolvedPart,
  inactive: ReadonlyMap<string, string> | undefined,
) {
  if (inactive === undefined) return false;
  return inactive.has(part.when) || (part.table !== null && inactive.has(part.table));
}

function partsIssues(
  parts: readonly ResolvedPart[],
  values: Values,
  inactive: ReadonlyMap<string, string> | undefined,
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
