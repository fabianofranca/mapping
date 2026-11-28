import { chosenCase } from './codeVariants';
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
  type SpecField,
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
export interface TouchTargetSmallFinding {
  readonly code: 'touch-target-small';
  readonly annotationId: string;
  readonly markingId: string;
  readonly actual: AuditSize;
  readonly min: AuditSize;
  readonly minPx: AuditSize;
  /** Image pixels per component unit of the marking's space. */
  readonly density: number;
  /**
   * Only with `touchTarget.spacing` (WCAG 2.5.8, stage #1998): the circle of the minimum, centered on the
   * rectangle, is blocked by `other`. Absent without the opt-in, so the finding is the same as before.
   */
  readonly spacing?: { readonly other: AuditNeighbor };
}

/** The annotation and marking of the other side of an overlap (or of a blocked circle). */
export interface AuditNeighbor {
  readonly annotationId: string;
  readonly markingId: string;
}

/**
 * Warning (stage #1998) of a touch area that overlaps a neighbor's: two interactive annotations of different
 * markings in the same space, neither inside the other, at least one of them `expanded`. There is one finding per
 * annotation of the pair, each naming the other. `overlap` is the intersection in component units, `overlapPx` in
 * image pixels.
 */
export interface TouchTargetOverlapFinding {
  readonly code: 'touch-target-overlap';
  readonly annotationId: string;
  readonly markingId: string;
  readonly other: AuditNeighbor;
  readonly overlap: AuditSize;
  readonly overlapPx: AuditSize;
  /** Image pixels per component unit of the marking's space. */
  readonly density: number;
}

export type AuditFinding = TouchTargetSmallFinding | TouchTargetOverlapFinding;

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

/** What a `variants` case (or the base) decides: the role and what the audit reads from it. */
interface ResolvedRole {
  /** The role; `undefined` when there is none. */
  readonly role: string | undefined;
  /** Label of the role; `null` when it is not audited by itself. */
  readonly label: ResolvedLabel | null;
  /** The touch area the size check reads (`visual` mode only); `null` when there is none to check. */
  readonly touch: SpecTouchTarget | null;
  /** The touch area the overlap check reads (`visual` or `expanded`); `null` when the type declares none. */
  readonly area: SpecTouchTarget | null;
}

/** The `accessibility.variants` of a type, each case resolved once (the chosen one overlays the base per annotation). */
interface ResolvedVariants {
  readonly field: string;
  /** The type's fields: the enum `default` of the field chooses the case when the annotation has no value. */
  readonly fields: readonly SpecField[];
  readonly cases: Readonly<Record<string, ResolvedRole>>;
}

interface ResolvedType extends ResolvedRole {
  readonly parts: readonly ResolvedPart[];
  readonly variants?: ResolvedVariants;
}

type ResolvedSpec = ReadonlyMap<string, ResolvedType>;

/** A role the audit reads: one is declared and it is not `none`. A `label` on any other type has no effect. */
export const isAudited = (role: string | undefined): boolean =>
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

/** The touch target that applies to the type (its own, else the root's); `null` when there is none or it opted out. */
function resolveArea(
  type: SpecAnnotationType,
  root: SpecTouchTarget | undefined,
): SpecTouchTarget | null {
  const own = type.accessibility?.touchTarget;
  const touch = own === undefined ? root : own;
  return touch === undefined || touch === false ? null : touch;
}

/** Role, label and touch area for a role (the base's or a case's) with its label: the defaults follow the role. */
function resolveRole(
  type: SpecAnnotationType,
  root: SpecTouchTarget | undefined,
  role: string | undefined,
  label: SpecAccessibilityLabel | undefined,
): ResolvedRole {
  const area = isInteractive(role) ? resolveArea(type, root) : null;
  return {
    role,
    label: isAudited(role) ? resolveLabel(label, role ?? '', null) : null,
    touch: area?.mode === 'expanded' ? null : area,
    area,
  };
}

function resolveVariants(
  type: SpecAnnotationType,
  root: SpecTouchTarget | undefined,
  a: SpecTypeAccessibility,
): ResolvedVariants | undefined {
  const variants = a.variants;
  if (variants === undefined) return undefined;
  const cases = Object.entries(variants.cases).map(
    ([value, kase]) =>
      [
        value,
        resolveRole(type, root, kase.role ?? a.role, kase.label ?? a.label),
      ] as const,
  );
  return { field: variants.field, fields: type.fields, cases: Object.fromEntries(cases) };
}

function resolveType(
  type: SpecAnnotationType,
  root: SpecTouchTarget | undefined,
): ResolvedType | null {
  if (type.accessibility === undefined) return null;
  const a: SpecTypeAccessibility = type.accessibility;
  const tables = new Set(type.fields.filter((f) => f.type === 'table').map((f) => f.key));
  const variants = resolveVariants(type, root, a);
  return {
    ...resolveRole(type, root, a.role, a.label),
    parts: (a.parts ?? []).map((part) => resolvePart(part, tables)),
    ...(variants === undefined ? {} : { variants }),
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

/** The text of a label value: a string or a number; any other kind (object, boolean) is not a name. */
const textOfValue = (value: JsonValue | undefined): string | undefined =>
  typeof value === 'string'
    ? value
    : typeof value === 'number'
      ? String(value)
      : undefined;

/** A label field names the element: its value is text (non-empty) or a number. The audit and the code hints share it. */
const hasLabelText = (values: Values, key: string): boolean =>
  !isEmptyValue(values[key]) && textOfValue(values[key]) !== undefined;

/** The label is empty: none of its fields names the element. */
const labelEmpty = (label: ResolvedLabel, values: Values): boolean =>
  label.required && !label.fields.some((key) => hasLabelText(values, key));

function typeIssues(label: ResolvedLabel | null, values: Values): AnnotationIssue[] {
  if (label === null || !labelEmpty(label, values)) return [];
  return [{ code: 'accessible-label-missing', key: label.fields[0] ?? '' }];
}

function partOf(part: ResolvedPart): { id: string; name: string } {
  return { id: part.id, name: part.name };
}

/**
 * One instance of a part of an annotation: a field part once (`values` are the annotation's), a table part once per
 * row (`values` are the row's, with its `row` index from 0 and its `rowId`).
 */
interface PartInstance {
  readonly part: ResolvedPart;
  readonly values: Values;
  readonly row?: number;
  readonly rowId?: string;
}

/**
 * The single enumeration of the parts the audit and the code view both read (stage #1998, decision 9). A field part
 * comes once when its `when` field has a value; a table part, once per row whose `whenColumn` (if any) has a value.
 * A part that `isInactive` reports (a child fills the slot its field is the default content of) is skipped. Each
 * reader keeps only its own label filter.
 */
function* partInstances(
  parts: readonly ResolvedPart[],
  values: Values,
  inactive: FieldSet | undefined,
): Generator<PartInstance> {
  for (const part of parts) {
    if (isInactive(part, inactive)) continue;
    if (part.table === null) {
      if (hasValue(values, part.when)) yield { part, values };
      continue;
    }
    const rows = tableRows(values[part.table]);
    for (let row = 0; row < rows.length; row++) {
      const cells = rows[row]!;
      if (part.whenColumn !== null && isEmptyValue(cells[part.whenColumn])) continue;
      yield { part, values: cells, row, rowId: cells._id };
    }
  }
}

/** The pending item of an instance whose required label is empty; `null` when it has none or it is filled. */
function partIssue({ part, values, rowId }: PartInstance): AnnotationIssue | null {
  const label = part.label;
  if (label === null || !labelEmpty(label, values)) return null;
  const first = label.fields[0] ?? '';
  return part.table === null
    ? { code: 'accessible-label-missing', key: first, part: partOf(part) }
    : {
        code: 'accessible-label-missing',
        key: part.table,
        column: first,
        rowId,
        part: partOf(part),
      };
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
  for (const instance of partInstances(parts, values, inactive)) {
    const issue = partIssue(instance);
    if (issue !== null) issues.push(issue);
  }
  return issues;
}

/** Pixels (image) a component size is worth; absorbs the floating point noise before `ceil`. */
const toPixels = (units: number, density: number): number =>
  Math.ceil(Number((units * density).toFixed(6)));

/** The minimum touch area in image pixels. */
const minPixels = (touch: SpecTouchTarget, density: number): AuditSize => ({
  width: toPixels(touch.width, density),
  height: toPixels(touch.height, density),
});

/** The rectangle is below the minimum on an axis, with 1 px of tolerance per axis (like the slots' `SLOT_TOLERANCE`). */
const isUndersized = (r: Rect, minPx: AuditSize): boolean =>
  r.width < minPx.width - 1 || r.height < minPx.height - 1;

/**
 * The size finding of `a`. With `touchTarget.spacing` an undersized target passes when its circle is clear
 * (`blockers` has no entry); when it is blocked the finding names the neighbor.
 */
function touchFindings(
  p: Project,
  a: Annotation,
  touch: SpecTouchTarget | null,
  blockers: ReadonlyMap<string, AuditNeighbor>,
): TouchTargetSmallFinding[] {
  if (touch === null) return [];
  const marking = projectIndex(p).markings.get(a.markingId);
  if (marking === undefined) return [];
  const density = effectiveDensity(p, marking.containerId);
  const minPx = minPixels(touch, density);
  const r: Rect = marking.rect;
  if (!isUndersized(r, minPx)) return [];
  const finding: TouchTargetSmallFinding = {
    code: 'touch-target-small',
    annotationId: a.id,
    markingId: marking.id,
    actual: { width: r.width / density, height: r.height / density },
    min: { width: touch.width, height: touch.height },
    minPx,
    density,
  };
  if (touch.spacing !== true) return [finding];
  const other = blockers.get(a.id);
  return other === undefined ? [] : [{ ...finding, spacing: { other } }];
}

function auditAnnotation(
  p: Project,
  a: Annotation,
  resolved: ResolvedType,
  ctx: AuditContext,
  overlaps: readonly TouchTargetOverlapFinding[],
  blockers: ReadonlyMap<string, AuditNeighbor>,
): AnnotationAudit | null {
  const values = a.values ?? {};
  const drawing = ctx.drawings?.get(a.markingId);
  const inactive = drawing?.annotationId === a.id ? drawing.inactiveFields : undefined;
  const issues = [
    ...typeIssues(resolved.label, values),
    ...partsIssues(resolved.parts, values, inactive),
  ];
  // `touch-target-small` first, then the overlaps (decision 5 of #1998).
  const findings: AuditFinding[] = [
    ...touchFindings(p, a, resolved.touch, blockers),
    ...overlaps,
  ];
  return issues.length === 0 && findings.length === 0 ? null : { issues, findings };
}

/**
 * The resolved accessibility of a typed annotation, with the `variants` case its value chooses laid over the base
 * (the role, the label and the touch area; the parts stay); `null` for a free annotation or a type that declares none.
 */
function resolvedOf(p: Project, a: Annotation): ResolvedType | null {
  const type = a.type && a.values ? typeOfAnnotation(p, a) : null;
  const resolved = (type && resolveSpec(type.spec).get(type.type.id)) ?? null;
  if (resolved?.variants === undefined) return resolved;
  const kase = chosenCase(resolved.variants, a.values, resolved.variants.fields);
  return kase === undefined ? resolved : { ...resolved, ...kase };
}

// --- The overlap of touch areas (stage #1998) ---

/** The intersection of two areas counts only when it is more than this many pixels on each axis. */
const OVERLAP_TOLERANCE = 1;

/** One touch area in the sweep: the space it lives in, its box in image pixels and its kind. */
export interface TouchBox {
  /** The space the box is in (see `spaceOf`): a container or a page of the canvas. Boxes of different spaces never meet. */
  readonly space: string | null;
  readonly kind: 'visual' | 'expanded';
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Moves the boxes of `active` that end before `left` (plus the tolerance) out of it, in place. */
function dropEnded(boxes: readonly TouchBox[], active: number[], left: number): void {
  let kept = 0;
  for (const j of active) {
    if (boxes[j]!.right - left > OVERLAP_TOLERANCE) active[kept++] = j;
  }
  active.length = kept;
}

/** The box with its axes swapped (x becomes y): the sweep along the other axis reads it as it reads any box. */
const transposed = (b: TouchBox): TouchBox => ({
  ...b,
  left: b.top,
  right: b.bottom,
  top: b.left,
  bottom: b.right,
});

/** Whether the boxes of `order` spread over more of the y axis than of the x axis (a column more than a row). */
function spreadsMoreInY(boxes: readonly TouchBox[], order: readonly number[]): boolean {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const i of order) {
    const b = boxes[i]!;
    minX = Math.min(minX, b.left);
    maxX = Math.max(maxX, b.right);
    minY = Math.min(minY, b.top);
    maxY = Math.max(maxY, b.bottom);
  }
  return maxY - minY > maxX - minX;
}

/**
 * The sweep over the boxes of one space (`order`: their indices), calling `visit` for each pair that meets. It runs
 * along the axis the boxes spread over the most (x for a row of controls, y for a column), so the active list holds
 * the boxes that share that stretch of the axis and not a whole column.
 */
function sweepSpace(
  boxes: readonly TouchBox[],
  order: readonly number[],
  visit: (i: number, j: number) => void,
): void {
  if (spreadsMoreInY(boxes, order)) {
    const swapped: TouchBox[] = [];
    for (const i of order) swapped[i] = transposed(boxes[i]!);
    sweepAlongX(swapped, order, visit);
    return;
  }
  sweepAlongX(boxes, order, visit);
}

function sweepAlongX(
  boxes: readonly TouchBox[],
  order: readonly number[],
  visit: (i: number, j: number) => void,
): void {
  const active: number[] = [];
  for (const i of [...order].sort((x, y) => boxes[x]!.left - boxes[y]!.left)) {
    const box = boxes[i]!;
    dropEnded(boxes, active, box.left);
    for (const j of active) {
      const other = boxes[j]!;
      const height = Math.min(other.bottom, box.bottom) - Math.max(other.top, box.top);
      const width = Math.min(other.right, box.right) - box.left;
      if (height > OVERLAP_TOLERANCE && width > OVERLAP_TOLERANCE) visit(j, i);
    }
    active.push(i);
  }
}

/**
 * Calls `visit(i, j)` once for every pair of boxes of the same space whose intersection is more than 1 px on each
 * axis (the audit's tolerance). A sweep per space (sort along the axis the boxes spread over the most, then an active list), never a loop over every pair,
 * so the cost follows the boxes that meet. Reused by the other audits that compare touch areas (decision 6 of #1998).
 */
export function sweepTouchBoxes(
  boxes: readonly TouchBox[],
  visit: (i: number, j: number) => void,
): void {
  const bySpace = new Map<string | null, number[]>();
  boxes.forEach((box, i) => {
    const list = bySpace.get(box.space);
    if (list) list.push(i);
    else bySpace.set(box.space, [i]);
  });
  for (const order of bySpace.values()) sweepSpace(boxes, order, visit);
}

/** An annotation with the resolved accessibility the audit reads from it. */
interface Audited {
  readonly annotation: Annotation;
  readonly resolved: ResolvedType;
}

/** A participant of the overlap check: an interactive annotation of a marking with a touch area. */
interface TouchParticipant extends TouchBox {
  readonly annotationId: string;
  readonly markingId: string;
  /** Image pixels per component unit of the space. */
  readonly density: number;
  /** The WCAG 2.5.8 circle of an undersized `visual` area (it blocks the circles of its neighbors); else `null`. */
  readonly circle: Circle | null;
  /** The circle is audited: the area switched `spacing` on and is undersized. */
  readonly spacing: boolean;
}

/** A circle in image pixels of its space. */
interface Circle {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

/** A side of an area grown to `minPx` around its center (never shrunk). */
function grownSide(start: number, size: number, minPx: number): [number, number] {
  const side = Math.max(size, minPx);
  const center = start + size / 2;
  return [center - side / 2, center + side / 2];
}

/** The space of a marking: its container, or its page on the canvas (every page has its own canvas). */
const spaceOf = (m: {
  readonly containerId: string | null;
  readonly pageId: string | null;
}): string => m.containerId ?? `page:${m.pageId}`;

/** The box of a touch area: the rectangle for `visual`, the rectangle grown to the minimum for `expanded`. */
function touchBox(
  marking: {
    readonly containerId: string | null;
    readonly pageId: string | null;
    readonly rect: Rect;
  },
  area: SpecTouchTarget,
  density: number,
): TouchBox {
  const r = marking.rect;
  const kind = area.mode === 'expanded' ? 'expanded' : 'visual';
  const [left, right] =
    kind === 'expanded'
      ? grownSide(r.x, r.width, toPixels(area.width, density))
      : [r.x, r.x + r.width];
  const [top, bottom] =
    kind === 'expanded'
      ? grownSide(r.y, r.height, toPixels(area.height, density))
      : [r.y, r.y + r.height];
  return { space: spaceOf(marking), kind, left, top, right, bottom };
}

/**
 * The circle of an undersized `visual` area (WCAG 2.5.8): centered on the rectangle, with the diameter of the
 * minimum's side (the smaller one when it is not square) in whole pixels, `ceil(side x density)`.
 */
function circleOf(r: Rect, area: SpecTouchTarget, density: number): Circle | null {
  if (area.mode === 'expanded' || !isUndersized(r, minPixels(area, density))) return null;
  const diameter = toPixels(Math.min(area.width, area.height), density);
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, r: diameter / 2 };
}

function touchParticipants(p: Project, audited: readonly Audited[]): TouchParticipant[] {
  const markings = projectIndex(p).markings;
  const out: TouchParticipant[] = [];
  for (const { annotation, resolved } of audited) {
    // An arrow is not in `markings`: it has no rectangle.
    const marking = markings.get(annotation.markingId);
    if (resolved.area === null || marking === undefined) continue;
    const density = effectiveDensity(p, marking.containerId);
    const circle = circleOf(marking.rect, resolved.area, density);
    out.push({
      ...touchBox(marking, resolved.area, density),
      annotationId: annotation.id,
      markingId: marking.id,
      density,
      circle,
      spacing: circle !== null && resolved.area.spacing === true,
    });
  }
  return out;
}

/** `ancestor` is above `id` in the `parentId` chain. */
function isAncestor(
  markings: ReadonlyMap<string, { readonly parentId: string | null }>,
  ancestor: string,
  id: string,
): boolean {
  for (let at = markings.get(id)?.parentId; at != null; at = markings.get(at)?.parentId) {
    if (at === ancestor) return true;
  }
  return false;
}

/** One marking is inside the other: neither a pair for the overlap nor a neighbor for the circle. */
const isRelated = (
  markings: ReadonlyMap<string, { readonly parentId: string | null }>,
  a: string,
  b: string,
): boolean => a === b || isAncestor(markings, a, b) || isAncestor(markings, b, a);

const roundPx = (n: number): number => Number(n.toFixed(6));

/** The finding of `a` for its overlap with `b`; the intersection in image pixels and in component units. */
function overlapFinding(
  a: TouchParticipant,
  b: TouchParticipant,
): TouchTargetOverlapFinding {
  const overlapPx = {
    width: roundPx(Math.min(a.right, b.right) - Math.max(a.left, b.left)),
    height: roundPx(Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)),
  };
  return {
    code: 'touch-target-overlap',
    annotationId: a.annotationId,
    markingId: a.markingId,
    other: { annotationId: b.annotationId, markingId: b.markingId },
    overlap: {
      width: roundPx(overlapPx.width / a.density),
      height: roundPx(overlapPx.height / a.density),
    },
    overlapPx,
    density: a.density,
  };
}

/**
 * The overlap findings by annotation: for each pair of participants on different markings in the same space,
 * neither inside the other, with at least one `expanded`, one finding for each side. In an annotation they come in
 * the project order of the other marking, then of the other annotation.
 */
function touchOverlaps(
  p: Project,
  participants: readonly TouchParticipant[],
): Map<string, TouchTargetOverlapFinding[]> {
  const markings = projectIndex(p).markings;
  const order = new Map(p.markings.map((m, i) => [m.id, i] as const));
  const found = new Map<
    string,
    { at: [number, number]; finding: TouchTargetOverlapFinding }[]
  >();
  const add = (side: number, other: number) => {
    const a = participants[side]!;
    const b = participants[other]!;
    const entry = {
      at: [order.get(b.markingId) ?? 0, other] as [number, number],
      finding: overlapFinding(a, b),
    };
    const list = found.get(a.annotationId);
    if (list) list.push(entry);
    else found.set(a.annotationId, [entry]);
  };
  sweepTouchBoxes(participants, (i, j) => {
    const a = participants[i]!;
    const b = participants[j]!;
    if (a.kind === 'visual' && b.kind === 'visual') return;
    if (isRelated(markings, a.markingId, b.markingId)) return;
    add(i, j);
    add(j, i);
  });
  return new Map(
    [...found].map(([id, list]) => [
      id,
      list.sort((x, y) => x.at[0] - y.at[0] || x.at[1] - y.at[1]).map((e) => e.finding),
    ]),
  );
}

// --- The WCAG 2.5.8 spacing (stage #1998, decisions 17 to 20) ---

/** The box a participant takes in the circle sweep: its area, widened to its circle's bounding square. */
function circleBox(x: TouchParticipant): TouchBox {
  const c = x.circle;
  if (c === null) return x;
  return {
    ...x,
    left: Math.min(x.left, c.x - c.r),
    top: Math.min(x.top, c.y - c.r),
    right: Math.max(x.right, c.x + c.r),
    bottom: Math.max(x.bottom, c.y + c.r),
  };
}

/** How deep the circle goes into the area's rectangle (negative when it is clear). */
function depthIntoArea(c: Circle, area: TouchBox): number {
  const dx = Math.max(area.left - c.x, 0, c.x - area.right);
  const dy = Math.max(area.top - c.y, 0, c.y - area.bottom);
  return c.r - Math.hypot(dx, dy);
}

/** The neighbor is in the way of the circle: its area or its own circle goes in more than the tolerance. */
function blocksCircle(c: Circle, other: TouchParticipant): boolean {
  if (roundPx(depthIntoArea(c, other)) > OVERLAP_TOLERANCE) return true;
  const o = other.circle;
  return (
    o !== null &&
    roundPx(c.r + o.r - Math.hypot(c.x - o.x, c.y - o.y)) > OVERLAP_TOLERANCE
  );
}

/**
 * For each annotation whose circle is audited (`spacing: true`, undersized), the first neighbor that blocks it, in
 * the project order of the other marking and then of the annotation. A neighbor is any participant of the same space,
 * on a marking that is not it nor inside it nor above it. The circle sweep only runs in the spaces that have a circle
 * to audit, and only the pairs it finds are tested: no loop over every pair.
 */
function spacingBlockers(
  p: Project,
  participants: readonly TouchParticipant[],
): Map<string, AuditNeighbor> {
  const subjectSpaces = new Set(
    participants.filter((x) => x.spacing).map((x) => x.space),
  );
  const found = new Map<string, AuditNeighbor>();
  if (subjectSpaces.size === 0) return found;
  const scoped = participants.filter((x) => subjectSpaces.has(x.space));
  const markings = projectIndex(p).markings;
  const order = new Map(p.markings.map((m, i) => [m.id, i] as const));
  const best = new Map<string, [number, number]>();
  const consider = (subject: TouchParticipant, at: number) => {
    const other = scoped[at]!;
    if (!subject.spacing || subject.circle === null) return;
    if (isRelated(markings, subject.markingId, other.markingId)) return;
    if (!blocksCircle(subject.circle, other)) return;
    const rank: [number, number] = [order.get(other.markingId) ?? 0, at];
    const first = best.get(subject.annotationId);
    if (
      first !== undefined &&
      (first[0] < rank[0] || (first[0] === rank[0] && first[1] < rank[1]))
    )
      return;
    best.set(subject.annotationId, rank);
    found.set(subject.annotationId, {
      annotationId: other.annotationId,
      markingId: other.markingId,
    });
  };
  sweepTouchBoxes(scoped.map(circleBox), (i, j) => {
    consider(scoped[i]!, j);
    consider(scoped[j]!, i);
  });
  return found;
}

function computeAudit(p: Project, ctx: AuditContext): AccessibilityAudit {
  const out = new Map<string, AnnotationAudit>();
  const arrows = projectIndex(p).arrows;
  const audited: Audited[] = [];
  for (const annotation of p.annotations) {
    const resolved = resolvedOf(p, annotation);
    if (!resolved) continue;
    // An arrow has no rectangle: only the label is audited, never the touch.
    audited.push({
      annotation,
      resolved: arrows.has(annotation.markingId)
        ? { ...resolved, touch: null, area: null }
        : resolved,
    });
  }
  const participants = touchParticipants(p, audited);
  const overlaps = touchOverlaps(p, participants);
  const blockers = spacingBlockers(p, participants);
  for (const { annotation, resolved } of audited) {
    const entry = auditAnnotation(
      p,
      annotation,
      resolved,
      ctx,
      overlaps.get(annotation.id) ?? [],
      blockers,
    );
    if (entry) out.set(annotation.id, entry);
  }
  return out;
}

/**
 * An actual size in component units, rounded down to one decimal: a finding is raised below the minimum (with a
 * 1 px tolerance), so the rounded size never reads as meeting it (`43.96` is `43.9`, not `44`). The app and the MCP
 * show it the same way.
 */
export const actualUnitsOf = (n: number): number => Math.floor(n * 10 + 1e-6) / 10;

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
  /** The part's name as the specialization declares it (the `id` when it has none). */
  readonly name: string;
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

/** The label of a role: the first field with a value, else `null` (`missing` when it is required). */
function labelOf(
  label: ResolvedLabel | null,
  values: Values,
  interactive: boolean,
): { label?: string | null; missing?: true } {
  if (label === null) return interactive ? { label: null } : {};
  const key = label.fields.find((field) => hasLabelText(values, field));
  if (key !== undefined) return { label: textOfValue(values[key]) as string };
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

/** An instance as the code sees it: the part with its label (the value, or `null`), `row` from 0 for a table part. */
function partOfInstance({ part, values, row }: PartInstance): PartAccessibility {
  return {
    id: part.id,
    name: part.name,
    role: part.role,
    ...partLabel(part, values),
    ...(row === undefined ? {} : { row }),
  };
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
  const resolved = resolvedOf(p, a);
  if (!resolved) return null;
  const values = a.values ?? {};
  const parts = [...partInstances(resolved.parts, values, inactive)].map(partOfInstance);
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
  /** The role and label per case of an enum field, each case resolved (the effective role, the label with `required` filled). */
  readonly variants?: TypeAccessibilityVariants;
}

/** A `variants` case resolved: only the keys that apply (the touch area is there when the resolved role is interactive). */
export type TypeAccessibilityCase = Pick<
  TypeAccessibility,
  'role' | 'label' | 'touchTarget'
>;

export interface TypeAccessibilityVariants {
  readonly field: string;
  /** In the declaration order. */
  readonly cases: Readonly<Record<string, TypeAccessibilityCase>>;
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

/** The role, the label and the touch area of a role (the base's or a case's), with the defaults filled in. */
function declaredRole(
  spec: Spec,
  type: SpecAnnotationType,
  role: string | undefined,
  label: SpecAccessibilityLabel | undefined,
): TypeAccessibilityCase {
  return {
    ...(role === undefined ? {} : { role }),
    ...(isAudited(role) ? declaredLabel(label, role ?? '') : {}),
    ...(isInteractive(role) ? declaredTouch(type, spec.accessibility?.touchTarget) : {}),
  };
}

function declaredVariants(
  spec: Spec,
  type: SpecAnnotationType,
  a: SpecTypeAccessibility,
): Pick<TypeAccessibility, 'variants'> {
  if (a.variants === undefined) return {};
  const cases = Object.entries(a.variants.cases).map(
    ([value, kase]) =>
      [
        value,
        declaredRole(spec, type, kase.role ?? a.role, kase.label ?? a.label),
      ] as const,
  );
  return { variants: { field: a.variants.field, cases: Object.fromEntries(cases) } };
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
  const resolved: TypeAccessibility = {
    ...declaredRole(spec, type, a.role, a.label),
    ...(parts.length === 0 ? {} : { parts }),
    ...declaredVariants(spec, type, a),
  };
  // `accessibility: {}` declares nothing: it reads as no accessibility, not as an empty declaration.
  return Object.keys(resolved).length === 0 ? null : resolved;
}
